import {
  GoogleGenAI,
  FunctionDeclaration,
  Type,
  ThinkingLevel,
  type Content,
  type Part,
} from '@google/genai';
import type {
  AgentTraceStep,
  KnowledgeArticle,
  SentimentLabel,
  Ticket,
  TicketPriority,
  TicketStatus,
  ToolSummaryChip,
} from '../src/types.js';
import {
  evaluateAndNotifyUrgentTicket,
  generateId,
  getState,
  readKbPdfBase64,
  saveState,
} from './store.js';

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add it in the Settings > Secrets panel.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'lookup_customer_profile',
    description:
      'Retrieve D2C customer profile, segment, lifetime value, shipping address, and list of recent #VN orders.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        email: { type: Type.STRING, description: 'Customer email address' },
        customerId: { type: Type.STRING, description: 'Customer ID such as CUS-101' },
      },
    },
  },
  {
    name: 'lookup_order',
    description:
      'Look up a specific D2C order (#VN-XXXX) or all orders for a customer email to check paymentStatus, orderStatus, items, and trackingCode.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        orderId: { type: Type.STRING, description: 'Order number such as #VN-2841' },
        customerEmail: { type: Type.STRING, description: 'Customer email' },
      },
    },
  },
  {
    name: 'search_store_policy',
    description:
      'Search Threadora store policies and uploaded PDF knowledge base articles for shipping, payment sync, duplicate refunds, size exchanges, return labels, cancellations, warranties, and escalation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Search topic or keywords' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_policy_pdf',
    description:
      'Directly inspect an uploaded PDF store policy document by Knowledge Base article ID (e.g. KB-1234) to answer a specific clause, exception, or edge-case question from the raw PDF.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        articleId: { type: Type.STRING, description: 'Knowledge base article ID e.g. KB-4821' },
        question: { type: Type.STRING, description: 'Specific question or clause to verify from the PDF' },
      },
      required: ['articleId', 'question'],
    },
  },
  {
    name: 'sync_pending_payment',
    description:
      'Resolve a gateway payment sync delay on an order stuck in "Payment Deducted (Pending Sync)" so it moves to Confirmed.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        orderId: { type: Type.STRING, description: 'Order number e.g. #VN-2846' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'issue_order_refund',
    description:
      'Issue a refund on an order in INR. Executes immediately if at or below the autoRefundLimitInr policy cap; otherwise creates a Pending Approval gate for Priya S.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        orderId: { type: Type.STRING, description: 'Order number e.g. #VN-2845' },
        amountInr: { type: Type.NUMBER, description: 'Refund amount in INR' },
        reason: { type: Type.STRING, description: 'Clear refund reason' },
      },
      required: ['orderId', 'amountInr', 'reason'],
    },
  },
  {
    name: 'initiate_exchange_or_return',
    description:
      'Initiate a free 14-day size exchange or generate a prepaid return label for a delivered order.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        orderId: { type: Type.STRING, description: 'Order number e.g. #VN-2839' },
        action: { type: Type.STRING, description: 'Either "exchange" or "return_label"' },
        targetSize: { type: Type.STRING, description: 'New garment size if action is "exchange"' },
      },
      required: ['orderId', 'action'],
    },
  },
  {
    name: 'cancel_order',
    description:
      'Cancel an order under ORDER CANCELLATION POLICY if it is in Payment Pending, Confirmed, or Packed · Ships Today status and trigger a full refund.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        orderId: { type: Type.STRING, description: 'Order number e.g. #VN-2841' },
        reason: { type: Type.STRING, description: 'Cancellation reason' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'process_warranty_claim',
    description:
      'Approve and dispatch a free warranty replacement under WARRANTY POLICY for delivered orders with stitching, button, hardware, or fabric defects.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        orderId: { type: Type.STRING, description: 'Order number e.g. #VN-2839' },
        defectDescription: { type: Type.STRING, description: 'Verified craftsmanship or seam defect description' },
      },
      required: ['orderId', 'defectDescription'],
    },
  },
  {
    name: 'request_human_assistance',
    description:
      'Immediately hand off the conversation to human specialist Priya S. and pause further automated AI replies. Call this whenever the customer is unsatisfied, asks for a human/agent, or has a complex dispute.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: { type: Type.STRING, description: 'Concise reason why human assistance is requested' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'update_ticket_status',
    description:
      'Update ticket topic, priority (P1, P2, P3), and status (Open, AI Handled, Human Requested, Pending Approval, Resolved).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING, description: 'Topic label e.g. Order status, Billing & Refunds, Returns & Exchanges, Warranty, Cancellation' },
        priority: { type: Type.STRING, description: 'P1, P2, or P3' },
        status: { type: Type.STRING, description: 'Ticket status' },
      },
    },
  },
];

async function executeD2CTool(
  ticket: Ticket,
  toolName: string,
  args: Record<string, unknown>
): Promise<{
  result: Record<string, unknown>;
  status: 'completed' | 'blocked' | 'failed';
  chip?: ToolSummaryChip;
}> {
  const state = getState();

  switch (toolName) {
    case 'lookup_customer_profile': {
      const email = typeof args.email === 'string' ? args.email.toLowerCase().trim() : '';
      const customerId = typeof args.customerId === 'string' ? args.customerId.trim() : '';
      const customer = state.customers.find(
        (c) =>
          (customerId && c.id === customerId) ||
          (email && c.email.toLowerCase() === email)
      );
      if (!customer) {
        return {
          status: 'completed',
          result: { found: false },
        };
      }
      const customerOrders = state.orders.filter((o) => o.customerId === customer.id);
      return {
        status: 'completed',
        result: { found: true, customer, recentOrders: customerOrders },
        chip: { toolName, label: `Profile · ${customer.name}` },
      };
    }

    case 'lookup_order': {
      const rawId = typeof args.orderId === 'string' ? args.orderId.trim().toUpperCase() : '';
      const normalizedOrderId = rawId && !rawId.startsWith('#') ? `#${rawId}` : rawId;
      const email =
        typeof args.customerEmail === 'string' ? args.customerEmail.toLowerCase().trim() : '';

      if (normalizedOrderId) {
        const order = state.orders.find((o) => o.id.toUpperCase() === normalizedOrderId);
        if (!order) {
          return {
            status: 'completed',
            result: { found: false, message: `Order ${normalizedOrderId} not found.` },
          };
        }
        const allForCustomer = state.orders.filter((o) => o.customerId === order.customerId);
        return {
          status: 'completed',
          result: { found: true, order, allCustomerOrders: allForCustomer },
          chip: { toolName, label: `Order lookup · ${order.id}` },
        };
      }

      const matches = state.orders.filter(
        (o) => !email || o.customerEmail.toLowerCase() === email
      );
      return {
        status: 'completed',
        result: { found: matches.length > 0, orders: matches },
      };
    }

    case 'search_store_policy': {
      const q = typeof args.query === 'string' ? args.query.toLowerCase().trim() : '';
      const hinglishAliases: Record<string, string[]> = {
        refund: ['paise', 'paisa', 'wapas', 'kat', 'kata', 'double', 'do baar', 'charge'],
        payment: ['payment', 'upi', 'sync', 'pending', 'atak', 'deduct'],
        shipping: ['order', 'kahan', 'kab', 'dispatch', 'ship', 'delivery', 'bheja', 'track', 'courier'],
        exchange: ['size', 'chota', 'bada', 'badalna', 'exchange', 'return', 'wapas'],
        cancel: ['cancel', 'radd', 'band', 'nahi chahiye', 'roko', 'cancellation'],
        warranty: ['warranty', 'kharab', 'fat', 'tut', 'button', 'silai', 'defect', 'damaged'],
        privacy: ['privacy', 'data', 'delete', 'account', 'security'],
        terms: ['terms', 'conditions', 'gst', 'discount', 'price'],
        human: ['insaan', 'human', 'agent', 'manager', 'baat', 'specialist'],
      };
      const expandedTerms = new Set(q.split(/\s+/).filter((t) => t.length > 2));
      for (const [englishKey, aliases] of Object.entries(hinglishAliases)) {
        if (aliases.some((alias) => q.includes(alias))) {
          expandedTerms.add(englishKey);
        }
      }
      const terms = Array.from(expandedTerms);

      const combinedDocs = [
        ...state.companyPolicies
          .filter((p) => p.enabledForAutomation)
          .map((p) => ({
            id: p.id,
            title: p.title,
            category: 'Company Policy',
            summary: p.summary,
            content: p.content,
          })),
        ...state.knowledgeBase.map((a) => ({
          id: a.id,
          title: a.title,
          category: a.category,
          summary: a.summary,
          content: a.content,
        })),
      ];

      const matches = combinedDocs
        .map((a) => {
          const text = `${a.title} ${a.category} ${a.summary} ${a.content}`.toLowerCase();
          const score = terms.reduce((acc, t) => acc + (text.includes(t) ? 1 : 0), 0);
          return { a, score };
        })
        .sort((x, y) => y.score - x.score)
        .slice(0, 4)
        .map((x) => x.a);

      return {
        status: 'completed',
        result: { articles: matches },
      };
    }

    case 'read_policy_pdf': {
      const articleId = String(args.articleId || '').trim().toUpperCase();
      const question = String(args.question || 'Summarize all applicable store policy rules.');
      const article = state.knowledgeBase.find((a) => a.id.toUpperCase() === articleId);
      if (!article) {
        return {
          status: 'failed',
          result: { found: false, error: `Knowledge article ${articleId} not found.` },
        };
      }
      if (!article.pdfStoredFile) {
        return {
          status: 'completed',
          result: {
            found: true,
            articleId: article.id,
            title: article.title,
            content: article.content,
          },
        };
      }
      const pdfBase64 = readKbPdfBase64(article.pdfStoredFile);
      if (!pdfBase64) {
        return {
          status: 'completed',
          result: {
            found: true,
            articleId: article.id,
            title: article.title,
            fallbackExtractedContent: article.content,
          },
        };
      }
      const ai = getGenAIClient();
      const pdfResp = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
            {
              text: `Read this uploaded store policy PDF ("${article.title}") and answer accurately with exact rules, limits, timelines, and exceptions:\n${question}`,
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      return {
        status: 'completed',
        result: {
          found: true,
          articleId: article.id,
          pdfFileName: article.pdfFileName,
          answerFromPdf: (pdfResp.text ?? '').trim() || article.content,
        },
        chip: { toolName, label: `PDF read · ${article.pdfFileName || article.id}` },
      };
    }

    case 'sync_pending_payment': {
      const rawId = String(args.orderId || '').trim().toUpperCase();
      const orderId = rawId.startsWith('#') ? rawId : `#${rawId}`;
      const order = state.orders.find((o) => o.id.toUpperCase() === orderId);
      if (!order) {
        return { status: 'failed', result: { executed: false, error: `Order ${orderId} not found.` } };
      }
      order.paymentStatus = 'Paid';
      if (order.orderStatus === 'Payment Pending') {
        order.orderStatus = 'Confirmed';
      }
      saveState();
      return {
        status: 'completed',
        result: {
          executed: true,
          orderId: order.id,
          paymentStatus: order.paymentStatus,
          orderStatus: order.orderStatus,
        },
        chip: { toolName, label: `Payment synced · ${order.id}` },
      };
    }

    case 'issue_order_refund': {
      const rawId = String(args.orderId || '').trim().toUpperCase();
      const orderId = rawId.startsWith('#') ? rawId : `#${rawId}`;
      const amountInr = Number(args.amountInr || 0);
      const reason = String(args.reason || 'Customer support refund');
      const order = state.orders.find((o) => o.id.toUpperCase() === orderId);

      if (!order) {
        return { status: 'failed', result: { executed: false, error: `Order ${orderId} not found.` } };
      }
      if (order.paymentStatus === 'Refunded') {
        return {
          status: 'blocked',
          result: { executed: false, message: `Order ${order.id} is already refunded.` },
        };
      }

      if (amountInr > state.policy.autoRefundLimitInr) {
        const approvalId = generateId('APR');
        ticket.pendingApproval = {
          id: approvalId,
          actionType: 'refund',
          orderId: order.id,
          customerId: order.customerId,
          amountInr,
          reason,
          proposedAt: new Date().toISOString(),
        };
        ticket.status = 'Pending Approval';
        saveState();
        return {
          status: 'blocked',
          result: {
            executed: false,
            requiresApproval: true,
            approvalId,
            limitInr: state.policy.autoRefundLimitInr,
            message: `₹${amountInr} exceeds auto-refund cap of ₹${state.policy.autoRefundLimitInr}. Queued for Priya S. approval.`,
          },
          chip: { toolName, label: `Approval queued · ${order.id}` },
        };
      }

      order.paymentStatus = 'Refunded';
      order.orderStatus = 'Refunded';
      order.refundedInr = Math.min(amountInr, order.totalInr);
      order.refundReason = reason;
      saveState();
      return {
        status: 'completed',
        result: {
          executed: true,
          orderId: order.id,
          refundedInr: order.refundedInr,
          paymentStatus: order.paymentStatus,
        },
        chip: { toolName, label: `Refunded ₹${order.refundedInr} · ${order.id}` },
      };
    }

    case 'initiate_exchange_or_return': {
      const rawId = String(args.orderId || '').trim().toUpperCase();
      const orderId = rawId.startsWith('#') ? rawId : `#${rawId}`;
      const action = args.action === 'exchange' ? 'exchange' : 'return_label';
      const targetSize = typeof args.targetSize === 'string' ? args.targetSize : undefined;
      const order = state.orders.find((o) => o.id.toUpperCase() === orderId);
      if (!order) {
        return { status: 'failed', result: { executed: false, error: `Order ${orderId} not found.` } };
      }

      const labelCode = `RL-${Math.floor(10000 + Math.random() * 89999)}-IN`;
      order.trackingCode = labelCode;
      if (action === 'exchange') {
        order.orderStatus = 'Exchange Initiated';
        if (targetSize && order.items[0]) {
          order.items[0].size = targetSize;
        }
      } else {
        order.orderStatus = 'Return Label Sent';
      }
      saveState();
      return {
        status: 'completed',
        result: {
          executed: true,
          action,
          orderId: order.id,
          trackingCode: labelCode,
          orderStatus: order.orderStatus,
          targetSize,
        },
        chip: {
          toolName,
          label:
            action === 'exchange'
              ? `Exchange ${targetSize || ''} · ${order.id}`.trim()
              : `Return label · ${labelCode}`,
        },
      };
    }

    case 'cancel_order': {
      const rawId = String(args.orderId || '').trim().toUpperCase();
      const orderId = rawId.startsWith('#') ? rawId : `#${rawId}`;
      const reason = String(args.reason || 'Customer requested order cancellation');
      const order = state.orders.find((o) => o.id.toUpperCase() === orderId);
      if (!order) {
        return { status: 'failed', result: { executed: false, error: `Order ${orderId} not found.` } };
      }
      const cancellable = ['Payment Pending', 'Confirmed', 'Packed · Ships Today'];
      if (!cancellable.includes(order.orderStatus)) {
        return {
          status: 'blocked',
          result: {
            executed: false,
            orderId: order.id,
            currentStatus: order.orderStatus,
            message: `Order ${order.id} is already "${order.orderStatus}" and cannot be cancelled per ORDER CANCELLATION POLICY. Offer a free 14-day return label upon delivery instead.`,
          },
        };
      }
      order.orderStatus = 'Cancelled';
      if (order.paymentStatus === 'Paid' || order.paymentStatus === 'Duplicate Charge') {
        order.paymentStatus = 'Refunded';
        order.refundedInr = order.totalInr;
        order.refundReason = reason;
      }
      saveState();
      return {
        status: 'completed',
        result: {
          executed: true,
          orderId: order.id,
          orderStatus: order.orderStatus,
          paymentStatus: order.paymentStatus,
          refundedInr: order.refundedInr ?? 0,
        },
        chip: { toolName, label: `Cancelled · ${order.id}` },
      };
    }

    case 'process_warranty_claim': {
      const rawId = String(args.orderId || '').trim().toUpperCase();
      const orderId = rawId.startsWith('#') ? rawId : `#${rawId}`;
      const defectDescription = String(args.defectDescription || 'Craftsmanship defect');
      const order = state.orders.find((o) => o.id.toUpperCase() === orderId);
      if (!order) {
        return { status: 'failed', result: { executed: false, error: `Order ${orderId} not found.` } };
      }
      const replacementCode = `WR-${Math.floor(10000 + Math.random() * 89999)}-IN`;
      order.orderStatus = 'Warranty Replacement';
      order.trackingCode = replacementCode;
      saveState();
      return {
        status: 'completed',
        result: {
          executed: true,
          orderId: order.id,
          orderStatus: order.orderStatus,
          replacementTracking: replacementCode,
          defectDescription,
        },
        chip: { toolName, label: `Warranty replacement · ${replacementCode}` },
      };
    }

    case 'request_human_assistance': {
      const reason = String(
        args.reason || 'Customer requested human specialist assistance.'
      );
      ticket.humanRequested = true;
      ticket.humanRequestedReason = reason;
      ticket.aiPausedForHuman = true;
      ticket.status = 'Human Requested';
      ticket.priority = 'P1';
      ticket.priorityLabel = 'Urgent';
      saveState();
      evaluateAndNotifyUrgentTicket(ticket, reason);
      return {
        status: 'completed',
        result: {
          escalated: true,
          status: 'Human Requested',
          assignedTo: ticket.assignedTo,
        },
        chip: { toolName, label: 'Escalated to Priya S.' },
      };
    }

    case 'update_ticket_status': {
      if (typeof args.topic === 'string' && args.topic.trim()) {
        ticket.topic = args.topic.trim();
      }
      if (typeof args.priority === 'string') {
        const p = args.priority as TicketPriority;
        if (p === 'P1' || p === 'P2' || p === 'P3') {
          ticket.priority = p;
          ticket.priorityLabel = p === 'P1' ? 'Urgent' : p === 'P2' ? 'High' : 'Normal';
        }
      }
      if (typeof args.status === 'string' && !ticket.humanRequested && !ticket.pendingApproval) {
        const valid: TicketStatus[] = [
          'Open',
          'AI Handled',
          'Human Requested',
          'Pending Approval',
          'Resolved',
        ];
        if (valid.includes(args.status as TicketStatus)) {
          ticket.status = args.status as TicketStatus;
        }
      }
      saveState();
      return {
        status: 'completed',
        result: { updated: true, status: ticket.status, priority: ticket.priority },
      };
    }

    default:
      return { status: 'failed', result: { error: `Unknown tool: ${toolName}` } };
  }
}

function mapThinkingLevel(level: 'LOW' | 'MEDIUM' | 'HIGH'): ThinkingLevel {
  if (level === 'LOW') return ThinkingLevel.LOW;
  if (level === 'HIGH') return ThinkingLevel.HIGH;
  return ThinkingLevel.MEDIUM;
}

export async function runDeskPilotAgent(
  ticketId: string,
  options?: { forceSend?: boolean; draftOnly?: boolean }
): Promise<Ticket> {
  const state = getState();
  const ticket = state.tickets.find((t) => t.id === ticketId);
  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found.`);
  }

  const ai = getGenAIClient();
  const policy = state.policy;

  const activeCompanyPoliciesBlock = state.companyPolicies
    .filter((p) => p.enabledForAutomation)
    .map((p) => `- ${p.title}: ${p.content}`)
    .join('\n');

  const pdfKnowledgePoliciesBlock = state.knowledgeBase
    .filter((k) => k.sourceType === 'pdf')
    .map(
      (k) =>
        `- [${k.id} · PDF: ${k.pdfFileName || k.title}] ${k.title} (${k.category}): ${k.content}`
    )
    .join('\n');

  const systemInstruction = `You are DeskPilot AI, the fast, fully autonomous D2C customer support concierge for Threadora (an everyday apparel & accessories brand).
Operate independently without relying on the human admin: inspect orders, follow the live Company Policies and Store Policy Knowledge Base (including uploaded PDF policies) below, execute authorized actions immediately, and reply rapidly to the customer.

Active Company Policies (follow strictly):
${activeCompanyPoliciesBlock || 'Standard Threadora store policies apply.'}

${
  pdfKnowledgePoliciesBlock
    ? `Uploaded PDF Store Policies (read by Gemini AI—follow strictly; use read_policy_pdf if you need to double-check raw fine print):\n${pdfKnowledgePoliciesBlock}\n`
    : ''
}
Language & Hinglish Understanding:
- You fluently understand English, Hinglish (Romanized Hindi mixed with English, e.g., "mera order kahan hai", "paise kat gaye par order pending hai", "do baar payment ho gaya refund karo", "size bada chahiye exchange kar do", "order cancel kar do", "kapda fat gaya warranty chahiye", "insaan/agent se baat karni hai"), and Hindi.
- Mirror the customer's language naturally: if the customer writes in Hinglish, reply in warm, polite, natural conversational Hinglish (Roman script) while keeping exact #VN- order IDs, tracking codes, and ₹ amounts crystal clear. If the customer writes in English, reply in English.
- Recognize Hinglish & English action intents accurately:
  * "paise kat gaye / payment deduct ho gaya par order confirm nahi hua / pending hai" -> lookup_order + sync_pending_payment.
  * "double charge / do baar paise kat gaye / refund karo" -> lookup_order + issue_order_refund.
  * "order cancel karna hai / cancel kar do / radd karo" -> lookup_order + cancel_order.
  * "size chota/bada hai / size badalna hai / exchange ya return chahiye" -> lookup_order + initiate_exchange_or_return.
  * "stitching kharab / button tuta / defect / warranty claim" -> lookup_order + process_warranty_claim.
  * "human / insaan / real person / manager se baat karao / satisfied nahi hu / bekaar reply" -> request_human_assistance immediately.

Speed & Autonomy Rules:
1. Be FAST: batch necessary tool calls (e.g., lookup_order + update_ticket_status, or lookup_order + action tool) together in minimal turns. You already have the active Company Policies and uploaded PDF rules above; call search_store_policy or read_policy_pdf when checking extra KB detail or raw PDF fine print.
2. Do NOT wait for or rely on the human admin for routine resolutions—autonomously cancel eligible orders, issue warranty replacements, sync pending payments, create size exchanges/return labels, and issue refunds up to ₹${policy.autoRefundLimitInr} (unless an uploaded PDF specifies stricter rules).
3. Escalate ONLY when urgent/critical conditions apply: customer is dissatisfied or explicitly requests human assistance, or a refund exceeds ₹${policy.autoRefundLimitInr} (which triggers admin approval notification).
4. Brand voice: ${policy.brandVoice}
5. Only state verified facts from tool results, company policies, and PDF knowledge base documents. Keep replies crisp, warm, and concise (2-4 sentences).`;

  const transcript = ticket.messages
    .map((m) => `[${m.createdAt}] ${m.authorName} (${m.role}): ${m.body}`)
    .join('\n\n');

  const prompt = `Ticket ${ticket.id} (Topic: ${ticket.topic}, Order: ${ticket.orderId || 'unspecified'})
Customer: ${ticket.customerName} (${ticket.customerEmail}, ID: ${ticket.customerId})

Conversation:
${transcript}

Investigate using your tools, execute authorized actions, and write the next reply to the customer.`;

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];

  let stepNum = ticket.agentTrace.length;
  let finalReply = '';
  const chipsThisRun: ToolSummaryChip[] = [];
  let sourcesCount = 0;

  for (let turn = 0; turn < 7; turn++) {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: mapThinkingLevel(policy.thinkingLevel) },
        tools: [{ functionDeclarations }],
      },
    });

    const candidateContent = response.candidates?.[0]?.content;
    const functionCalls = response.functionCalls;

    if (functionCalls && functionCalls.length > 0) {
      if (candidateContent) {
        contents.push(candidateContent);
      }

      const responseParts: Part[] = [];
      for (const call of functionCalls) {
        stepNum += 1;
        const callName = call.name ?? 'unknown_tool';
        const callArgs = (call.args ?? {}) as Record<string, unknown>;
        const started = Date.now();
        const { result, status, chip } = await executeD2CTool(
          ticket,
          callName,
          callArgs
        );
        const durationMs = Math.max(1, Date.now() - started);

        if (chip) chipsThisRun.push(chip);
        if (callName === 'search_store_policy' || callName === 'lookup_order') {
          sourcesCount += 1;
        }

        const step: AgentTraceStep = {
          id: generateId('TRC'),
          stepNumber: stepNum,
          toolName: callName,
          arguments: callArgs,
          result,
          status,
          durationMs,
          timestamp: new Date().toISOString(),
        };
        ticket.agentTrace.push(step);

        responseParts.push({
          functionResponse: {
            id: call.id,
            name: callName,
            response: { result },
          },
        });
      }

      contents.push({ role: 'user', parts: responseParts });
      saveState();
      continue;
    }

    finalReply = (response.text ?? '').trim();
    break;
  }

  if (!finalReply) {
    finalReply =
      'I have checked your account and updated your ticket. Let us know if you need anything else or would like to speak with a human specialist.';
  }

  const now = new Date().toISOString();
  ticket.updatedAt = now;

  const shouldAutoSend =
    options?.forceSend === true
      ? true
      : options?.draftOnly === true
      ? false
      : policy.autoDeployEnabled && !ticket.aiPausedForHuman;

  if (!shouldAutoSend) {
    ticket.aiSuggestedReply = finalReply;
    ticket.aiSuggestedConfidence = 96;
    ticket.aiGroundedSources = Math.max(1, sourcesCount);
    saveState();
    return ticket;
  }

  ticket.aiSuggestedReply = null;
  if (!ticket.humanRequested && !ticket.pendingApproval) {
    ticket.status = 'AI Handled';
  }

  ticket.messages.push({
    id: generateId('MSG'),
    role: 'gemini_agent',
    authorName: 'DeskPilot AI',
    body: finalReply,
    createdAt: now,
    toolChips: chipsThisRun.length > 0 ? chipsThisRun : undefined,
  });

  saveState();
  evaluateAndNotifyUrgentTicket(ticket);
  return ticket;
}

export async function analyzeTicketSentiment(ticketId: string): Promise<Ticket> {
  const state = getState();
  const ticket = state.tickets.find((t) => t.id === ticketId);
  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found.`);
  }

  const ai = getGenAIClient();
  const customerMessages = ticket.messages
    .filter((m) => m.role === 'customer')
    .map((m) => `[${m.createdAt}] ${m.body}`)
    .join('\n');

  const prompt = `Analyze the emotional tone and urgency of this customer support ticket. The customer may write in English, Hinglish (Romanized Hindi + English), or Hindi.
Subject: ${ticket.subject}
Topic: ${ticket.topic}
Customer Messages:
${customerMessages || ticket.subject}

Hinglish emotional cues to consider carefully:
- Critical cues (0-30): "paise kat gaye jaldi karo", "double charge ho gaya", "bekaar/ghatiya service", "gussa aa raha hai", "fraud", "abhi insaan se baat karao", "satisfied nahi hu".
- Frustrated cues (31-55): "yaar bahut late ho gaya", "abhi tak nahi aaya", "kab aayega", "koi reply nahi mila".
- Neutral cues (56-79): "mera order kahan hai", "size L me exchange kar do", "status batao".
- Satisfied cues (80-100): "shukriya", "bahut badhiya", "thanks ji/bhai", "mast service".

Score on a 0-100 scale where:
- 0 to 30 = Critical (angry, distressed, double-charged, demanding urgent help or human escalation)
- 31 to 55 = Frustrated (annoyed, impatient, repeated follow-up)
- 56 to 79 = Neutral (calm inquiry, routine exchange or order check)
- 80 to 100 = Satisfied (polite, appreciative, happy)`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'You are a bilingual English & Hinglish support triage sentiment classifier. Output strictly valid JSON matching the schema.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: {
            type: Type.INTEGER,
            description: 'Sentiment score from 0 (extremely distressed/angry) to 100 (very satisfied).',
          },
          label: {
            type: Type.STRING,
            description: 'One of: Critical, Frustrated, Neutral, Satisfied',
          },
          reason: {
            type: Type.STRING,
            description: 'Concise 1-sentence explanation of the emotional tone.',
          },
        },
        required: ['score', 'label', 'reason'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    score?: number;
    label?: string;
    reason?: string;
  };

  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score ?? 55))));
  const validLabels: SentimentLabel[] = [
    'Critical',
    'Frustrated',
    'Neutral',
    'Satisfied',
  ];
  const derivedLabel: SentimentLabel =
    score <= 30
      ? 'Critical'
      : score <= 55
      ? 'Frustrated'
      : score <= 79
      ? 'Neutral'
      : 'Satisfied';
  const label = validLabels.includes(parsed.label as SentimentLabel)
    ? (parsed.label as SentimentLabel)
    : derivedLabel;

  ticket.sentimentScore = score;
  ticket.sentimentLabel = label;
  ticket.sentimentReason =
    parsed.reason?.trim() || 'Scored by Gemini sentiment classifier.';

  if (score <= 30 && ticket.status !== 'Resolved') {
    ticket.priority = 'P1';
    ticket.priorityLabel = 'Urgent';
  }

  saveState();
  evaluateAndNotifyUrgentTicket(ticket);
  return ticket;
}

export async function extractStorePolicyFromPdf(params: {
  pdfBase64: string;
  fileName: string;
  titleHint?: string;
  categoryHint?: KnowledgeArticle['category'];
}): Promise<{
  title: string;
  category: KnowledgeArticle['category'];
  summary: string;
  content: string;
}> {
  const ai = getGenAIClient();
  const prompt = `Read this uploaded PDF store policy document (filename: "${params.fileName}") thoroughly.
Extract ALL operational store policies, rules, eligibility windows, INR limits/fees, exceptions, and exact instructions so an autonomous D2C customer support AI agent can follow and enforce them accurately.
${params.titleHint ? `Preferred title: ${params.titleHint}` : ''}
${params.categoryHint ? `Preferred category: ${params.categoryHint}` : ''}

Output strictly valid JSON matching the schema.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: params.pdfBase64,
          },
        },
        { text: prompt },
      ],
    },
    config: {
      systemInstruction:
        'You are a store policy document parser for an autonomous D2C AI support desk. Read every detail from the attached PDF accurately without inventing policies not present in the PDF.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'Clear policy document title.',
          },
          category: {
            type: Type.STRING,
            description:
              'Best fit from: Orders & Shipping, Returns & Exchanges, Payments & Refunds, Escalation, General Policy',
          },
          summary: {
            type: Type.STRING,
            description: 'Concise 1-sentence summary of the policy PDF.',
          },
          content: {
            type: Type.STRING,
            description:
              'Complete, structured policy rules, timelines, amounts, eligibility criteria, and agent action instructions extracted from the PDF.',
          },
        },
        required: ['title', 'category', 'summary', 'content'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    title?: string;
    category?: string;
    summary?: string;
    content?: string;
  };

  const validCategories: KnowledgeArticle['category'][] = [
    'Orders & Shipping',
    'Returns & Exchanges',
    'Payments & Refunds',
    'Escalation',
    'General Policy',
  ];

  const category: KnowledgeArticle['category'] = params.categoryHint
    ? params.categoryHint
    : validCategories.includes(parsed.category as KnowledgeArticle['category'])
    ? (parsed.category as KnowledgeArticle['category'])
    : 'General Policy';

  const fallbackTitle = params.fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
  return {
    title: (params.titleHint?.trim() || parsed.title?.trim() || fallbackTitle).trim(),
    category,
    summary: parsed.summary?.trim() || `Policy rules extracted from ${params.fileName}`,
    content:
      parsed.content?.trim() ||
      `Policy document uploaded from ${params.fileName}. Use read_policy_pdf to inspect clauses.`,
  };
}

