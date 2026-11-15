import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  analyzeTicketSentiment,
  extractStorePolicyFromPdf,
  runDeskPilotAgent,
} from './server/agent.js';
import {
  deleteKbPdfFile,
  evaluateAndNotifyUrgentTicket,
  generateId,
  getState,
  getUsers,
  readKbPdfBuffer,
  resetDemoState,
  saveKbPdfFile,
  saveState,
  saveUsers,
  signAuthToken,
  verifyAuthToken,
} from './server/store.js';
import type {
  AgentPolicyConfig,
  AuthUser,
  CompanyPolicy,
  CustomerProfile,
  KnowledgeArticle,
  OrderItem,
  OrderRecord,
  Ticket,
  TicketPriority,
  TicketStatus,
} from './src/types.js';

const PORT = 3000;

interface AuthedRequest extends Request {
  authUser?: AuthUser | null;
}

function attachUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  req.authUser = verifyAuthToken(token);
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Admin credentials required.' });
    return;
  }
  next();
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('API_KEY_INVALID') ||
    raw.includes('GEMINI_API_KEY')
  ) {
    return {
      status: 400,
      message:
        'Gemini API authentication failed. Verify your GEMINI_API_KEY in the Settings > Secrets panel.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message:
        'Gemini API quota exceeded (429). Retry shortly or select a billing-enabled key in Settings > Secrets.',
    };
  }
  return {
    status: 500,
    message: raw || 'Failed to execute DeskPilot Gemini agent.',
  };
}

function buildScopedState(user: AuthUser | null) {
  const full = getState();
  if (user?.role === 'admin') {
    return full;
  }
  if (user?.role === 'customer') {
    const emailLower = user.email.toLowerCase();
    return {
      products: full.products,
      customers: full.customers.filter(
        (c) => c.id === user.customerId || c.email.toLowerCase() === emailLower
      ),
      orders: full.orders.filter(
        (o) => o.customerId === user.customerId || o.customerEmail.toLowerCase() === emailLower
      ),
      tickets: full.tickets.filter(
        (t) => t.customerId === user.customerId || t.customerEmail.toLowerCase() === emailLower
      ),
      knowledgeBase: full.knowledgeBase,
      companyPolicies: full.companyPolicies,
      notifications: [],
      policy: full.policy,
    };
  }
  return {
    products: full.products,
    customers: [],
    orders: [],
    tickets: [],
    knowledgeBase: full.knowledgeBase,
    companyPolicies: full.companyPolicies,
    notifications: [],
    policy: full.policy,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use(attachUser);

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, model: 'gemini-4-hydrogen' });
  });

  // Authentication endpoints
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass = password || '';

    const matched = getUsers().find(
      (u) => u.email.toLowerCase() === cleanEmail && u.password === cleanPass
    );
    if (!matched) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const user: AuthUser = {
      id: matched.id,
      name: matched.name,
      email: matched.email,
      role: matched.role,
      customerId: matched.customerId,
    };
    const token = signAuthToken(user);
    res.json({ token, user, state: buildScopedState(user) });
  });

  app.post('/api/auth/register', (req: Request, res: Response) => {
    const { name, email, password, address } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      address?: string;
    };
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();
    const cleanPass = (password || '').trim();

    if (!cleanName || !cleanEmail || cleanPass.length < 4) {
      res.status(400).json({
        error: 'Name, valid email, and password (at least 4 characters) are required.',
      });
      return;
    }

    const existing = getUsers().find((u) => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const state = getState();
    const customerId = generateId('CUS');
    const profile: CustomerProfile = {
      id: customerId,
      name: cleanName,
      email: cleanEmail,
      segment: 'New',
      ordersCount: 0,
      lifetimeValueInr: 0,
      lastOrderLabel: 'No orders yet',
      address: address?.trim() || 'Bengaluru, India',
    };
    state.customers.unshift(profile);
    saveState();

    const newUserRecord = {
      id: generateId('USR'),
      name: cleanName,
      email: cleanEmail,
      password: cleanPass,
      role: 'customer' as const,
      customerId,
    };
    const allUsers = getUsers();
    allUsers.push(newUserRecord);
    saveUsers(allUsers);

    const user: AuthUser = {
      id: newUserRecord.id,
      name: newUserRecord.name,
      email: newUserRecord.email,
      role: 'customer',
      customerId,
    };
    const token = signAuthToken(user);
    res.status(201).json({ token, user, state: buildScopedState(user) });
  });

  app.get('/api/auth/me', (req: AuthedRequest, res: Response) => {
    res.json({
      user: req.authUser ?? null,
      state: buildScopedState(req.authUser ?? null),
    });
  });

  app.get('/api/state', (req: AuthedRequest, res: Response) => {
    res.json({
      user: req.authUser ?? null,
      state: buildScopedState(req.authUser ?? null),
    });
  });

  // Customer places a real D2C order on the website
  app.post('/api/orders', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    const { items } = req.body as {
      items?: Array<{ productId: string; size: string; quantity: number }>;
    };
    if (!items || items.length === 0) {
      res.status(400).json({ error: 'Your shopping bag is empty.' });
      return;
    }

    const state = getState();
    const orderItems: OrderItem[] = [];
    let totalInr = 0;

    for (const line of items) {
      const product = state.products.find((p) => p.id === line.productId);
      if (!product) continue;
      const qty = Math.max(1, Number(line.quantity || 1));
      orderItems.push({
        productId: product.id,
        name: product.name,
        size: line.size || product.sizes[0],
        quantity: qty,
        priceInr: product.priceInr,
      });
      totalInr += product.priceInr * qty;
    }

    if (orderItems.length === 0) {
      res.status(400).json({ error: 'No valid products found in bag.' });
      return;
    }

    let customer = state.customers.find(
      (c) => c.id === user.customerId || c.email.toLowerCase() === user.email.toLowerCase()
    );
    if (!customer) {
      customer = {
        id: user.customerId || generateId('CUS'),
        name: user.name,
        email: user.email,
        segment: 'New',
        ordersCount: 0,
        lifetimeValueInr: 0,
        lastOrderLabel: 'Today',
        address: 'Bengaluru, India',
      };
      state.customers.unshift(customer);
    }

    customer.ordersCount += 1;
    customer.lifetimeValueInr += totalInr;
    customer.lastOrderLabel = 'Just now';

    const orderNum = Math.floor(2850 + Math.random() * 7000);
    const order: OrderRecord = {
      id: `#VN-${orderNum}`,
      customerId: customer.id,
      customerEmail: customer.email,
      customerName: customer.name,
      items: orderItems,
      totalInr,
      paymentStatus: 'Paid',
      orderStatus: 'Confirmed',
      trackingCode: `BD-${Math.floor(8830000 + Math.random() * 90000)}-IN`,
      placedAt: new Date().toISOString(),
    };

    state.orders.unshift(order);
    saveState();

    res.status(201).json({ order, state: buildScopedState(user) });
  });

  // Create a support ticket (from Customer Website Support Widget or Admin)
  app.post('/api/tickets', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const { subject, message, orderId, topic } = req.body as {
        subject?: string;
        message?: string;
        orderId?: string;
        topic?: string;
      };

      if (!message?.trim()) {
        res.status(400).json({ error: 'Message cannot be empty.' });
        return;
      }

      const state = getState();
      const customer = state.customers.find(
        (c) => c.id === user.customerId || c.email.toLowerCase() === user.email.toLowerCase()
      );

      const now = new Date().toISOString();
      const ticketId = `VN-${Math.floor(3850 + Math.random() * 6000)}`;
      const newTicket: Ticket = {
        id: ticketId,
        subject: subject?.trim() || message.trim().slice(0, 60),
        topic: topic?.trim() || 'Order status',
        orderId: orderId?.trim() || undefined,
        customerId: customer?.id || user.customerId || 'CUS-NEW',
        customerName: customer?.name || user.name,
        customerEmail: customer?.email || user.email,
        priority: 'P2',
        priorityLabel: 'Normal',
        status: 'Open',
        slaDueLabel: 'in 2h 00m',
        assignedTo: 'Priya S.',
        sentimentScore: null,
        sentimentLabel: null,
        sentimentReason: null,
        humanRequested: false,
        humanRequestedReason: null,
        aiPausedForHuman: false,
        aiSuggestedReply: null,
        aiSuggestedConfidence: null,
        aiGroundedSources: 0,
        pendingApproval: null,
        createdAt: now,
        updatedAt: now,
        messages: [
          {
            id: generateId('MSG'),
            role: 'customer',
            authorName: customer?.name || user.name,
            body: message.trim(),
            createdAt: now,
          },
        ],
        agentTrace: [],
      };

      state.tickets.unshift(newTicket);
      saveState();

      // Run Gemini DeskPilot AI & sentiment analysis concurrently for fast replies
      const [agentResult] = await Promise.allSettled([
        runDeskPilotAgent(newTicket.id),
        analyzeTicketSentiment(newTicket.id),
      ]);
      evaluateAndNotifyUrgentTicket(newTicket);

      if (agentResult.status === 'fulfilled') {
        res.status(201).json({ ticket: agentResult.value, state: buildScopedState(user) });
        return;
      }
      const formatted = formatGeminiError(agentResult.reason);
      res.status(201).json({
        ticket: newTicket,
        state: buildScopedState(user),
        agentWarning: formatted.message,
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Reply to a ticket (Customer or Admin)
  app.post('/api/tickets/:id/reply', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const user = req.authUser!;
      const ticketId = String(req.params.id);
      const { body } = req.body as { body?: string };

      const state = getState();
      const ticket = state.tickets.find((t) => t.id === ticketId);
      if (!ticket) {
        res.status(404).json({ error: 'Conversation not found.' });
        return;
      }

      if (
        user.role === 'customer' &&
        ticket.customerEmail.toLowerCase() !== user.email.toLowerCase()
      ) {
        res.status(403).json({ error: 'Access denied to this conversation.' });
        return;
      }

      if (!body?.trim()) {
        res.status(400).json({ error: 'Message body cannot be empty.' });
        return;
      }

      const now = new Date().toISOString();
      const msgRole = user.role === 'admin' ? 'admin' : 'customer';

      ticket.messages.push({
        id: generateId('MSG'),
        role: msgRole,
        authorName: user.role === 'admin' ? `${user.name} (Specialist)` : user.name,
        body: body.trim(),
        createdAt: now,
      });
      ticket.updatedAt = now;

      if (user.role === 'admin') {
        ticket.aiSuggestedReply = null;
        if (ticket.status === 'Human Requested') {
          ticket.status = 'Open';
        }
        saveState();
        res.json({ ticket, state: buildScopedState(user) });
        return;
      }

      // Customer replied: always refresh Gemini sentiment score
      if (ticket.status === 'Resolved') {
        ticket.status = 'Open';
      }
      saveState();

      // Customer replied: if AI is paused for human specialist, still refresh sentiment & notify
      if (ticket.aiPausedForHuman) {
        await Promise.allSettled([analyzeTicketSentiment(ticket.id)]);
        evaluateAndNotifyUrgentTicket(ticket);
        res.json({ ticket, state: buildScopedState(user) });
        return;
      }

      // Run autonomous Gemini reply & sentiment scoring in parallel for lowest latency
      const [agentResult] = await Promise.allSettled([
        runDeskPilotAgent(ticket.id),
        analyzeTicketSentiment(ticket.id),
      ]);
      evaluateAndNotifyUrgentTicket(ticket);

      if (agentResult.status === 'fulfilled') {
        res.json({ ticket: agentResult.value, state: buildScopedState(user) });
        return;
      }
      const formatted = formatGeminiError(agentResult.reason);
      res.json({
        ticket,
        state: buildScopedState(user),
        agentWarning: formatted.message,
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Admin triggers Gemini sentiment scoring on a ticket
  app.post(
    '/api/tickets/:id/analyze-sentiment',
    requireAdmin,
    async (req: AuthedRequest, res: Response) => {
      try {
        const ticketId = String(req.params.id);
        const updated = await analyzeTicketSentiment(ticketId);
        res.json({ ticket: updated, state: buildScopedState(req.authUser!) });
      } catch (err) {
        const formatted = formatGeminiError(err);
        res.status(formatted.status).json({ error: formatted.message });
      }
    }
  );

  // Customer explicitly asks for human assistance when unsatisfied with AI
  app.post(
    '/api/tickets/:id/request-human',
    requireAuth,
    (req: AuthedRequest, res: Response) => {
      const user = req.authUser!;
      const ticketId = String(req.params.id);
      const { reason } = req.body as { reason?: string };

      const state = getState();
      const ticket = state.tickets.find((t) => t.id === ticketId);
      if (!ticket) {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
      }
      if (
        user.role === 'customer' &&
        ticket.customerEmail.toLowerCase() !== user.email.toLowerCase()
      ) {
        res.status(403).json({ error: 'Access denied.' });
        return;
      }

      const now = new Date().toISOString();
      const escalationText =
        reason?.trim() ||
        'Customer indicated they were not satisfied with automated responses and requested human assistance.';

      ticket.humanRequested = true;
      ticket.humanRequestedReason = escalationText;
      ticket.aiPausedForHuman = true;
      ticket.status = 'Human Requested';
      ticket.priority = 'P1';
      ticket.priorityLabel = 'Urgent';
      ticket.sentimentScore = Math.min(ticket.sentimentScore ?? 20, 20);
      ticket.sentimentLabel = 'Critical';
      ticket.sentimentReason = escalationText;
      ticket.updatedAt = now;

      ticket.agentTrace.push({
        id: generateId('TRC'),
        stepNumber: ticket.agentTrace.length + 1,
        toolName: 'customer_requested_human',
        arguments: { reason: escalationText },
        result: { escalated: true, assignedTo: ticket.assignedTo, aiPausedForHuman: true },
        status: 'completed',
        durationMs: 5,
        timestamp: now,
      });

      ticket.messages.push({
        id: generateId('MSG'),
        role: 'gemini_agent',
        authorName: 'DeskPilot AI',
        body: `I understand you'd like to speak with a person. I've escalated your conversation (${ticket.id}) with urgent priority to our human support specialist, ${ticket.assignedTo}, and paused automated replies. Someone from our team will respond directly here shortly.`,
        createdAt: now,
        toolChips: [{ toolName: 'request_human_assistance', label: `Assigned · ${ticket.assignedTo}` }],
      });

      saveState();
      evaluateAndNotifyUrgentTicket(ticket, escalationText);
      res.json({ ticket, state: buildScopedState(user) });
    }
  );

  // Admin triggers Gemini on a ticket (either draft suggested reply or force send)
  app.post(
    '/api/tickets/:id/run-ai',
    requireAdmin,
    async (req: AuthedRequest, res: Response) => {
      try {
        const ticketId = String(req.params.id);
        const { mode } = req.body as { mode?: 'auto' | 'draft' | 'send' };
        await Promise.allSettled([analyzeTicketSentiment(ticketId)]);
        const updated = await runDeskPilotAgent(ticketId, {
          forceSend: mode === 'send',
          draftOnly: mode === 'draft',
        });
        res.json({ ticket: updated, state: buildScopedState(req.authUser!) });
      } catch (err) {
        const formatted = formatGeminiError(err);
        res.status(formatted.status).json({ error: formatted.message });
      }
    }
  );

  // Admin clicks "Approve & send" on AI Suggested Reply
  app.post(
    '/api/tickets/:id/approve-suggested',
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const ticketId = String(req.params.id);
      const { editedBody } = req.body as { editedBody?: string };
      const state = getState();
      const ticket = state.tickets.find((t) => t.id === ticketId);
      if (!ticket) {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
      }

      const bodyToSend = (editedBody ?? ticket.aiSuggestedReply ?? '').trim();
      if (!bodyToSend) {
        res.status(400).json({ error: 'No reply text to send.' });
        return;
      }

      const now = new Date().toISOString();
      ticket.messages.push({
        id: generateId('MSG'),
        role: 'gemini_agent',
        authorName: 'DeskPilot AI (Approved)',
        body: bodyToSend,
        createdAt: now,
      });
      ticket.aiSuggestedReply = null;
      ticket.updatedAt = now;
      if (ticket.status === 'Open') {
        ticket.status = 'AI Handled';
      }
      saveState();
      res.json({ ticket, state: buildScopedState(req.authUser!) });
    }
  );

  // Admin approves or declines pending high-value refund
  app.post(
    '/api/tickets/:id/approval',
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const ticketId = String(req.params.id);
      const { decision } = req.body as { decision: 'approve' | 'decline' };
      const state = getState();
      const ticket = state.tickets.find((t) => t.id === ticketId);
      if (!ticket || !ticket.pendingApproval) {
        res.status(404).json({ error: 'No pending approval found.' });
        return;
      }

      const approval = ticket.pendingApproval;
      const now = new Date().toISOString();

      if (decision === 'approve') {
        const order = state.orders.find((o) => o.id === approval.orderId);
        if (order) {
          order.paymentStatus = 'Refunded';
          order.orderStatus = 'Refunded';
          order.refundedInr = approval.amountInr ?? order.totalInr;
          order.refundReason = approval.reason;
        }
        ticket.messages.push({
          id: generateId('MSG'),
          role: 'admin',
          authorName: `${req.authUser!.name} (Approved)`,
          body: `Approved your ₹${(approval.amountInr ?? 0).toLocaleString()} refund for ${approval.orderId}. It will reflect in your account within 3–5 business days.`,
          createdAt: now,
        });
        ticket.pendingApproval = null;
        ticket.status = 'Resolved';
      } else {
        ticket.messages.push({
          id: generateId('MSG'),
          role: 'admin',
          authorName: `${req.authUser!.name} (Specialist)`,
          body: `We reviewed your refund request for ${approval.orderId} and cannot approve a direct payout under our current return window, though we can offer an instant store exchange.`,
          createdAt: now,
        });
        ticket.pendingApproval = null;
        ticket.status = 'Open';
      }
      ticket.updatedAt = now;
      saveState();
      res.json({ ticket, state: buildScopedState(req.authUser!) });
    }
  );

  // Admin batch auto-triage
  app.post('/api/tickets/auto-triage', requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const state = getState();
      const targets = state.tickets.filter(
        (t) => t.status === 'Open' && !t.aiPausedForHuman
      );
      let processedCount = 0;
      const errors: Array<{ ticketId: string; error: string }> = [];

      for (const t of targets) {
        try {
          await runDeskPilotAgent(t.id);
          processedCount += 1;
        } catch (err) {
          const formatted = formatGeminiError(err);
          errors.push({ ticketId: t.id, error: formatted.message });
          if (formatted.status === 400 || formatted.status === 429) break;
        }
      }

      res.json({
        processedCount,
        errors,
        state: buildScopedState(req.authUser!),
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Admin edits ticket metadata / resolves / resumes AI
  app.patch('/api/tickets/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    const ticketId = String(req.params.id);
    const { status, priority, topic, aiPausedForHuman } = req.body as {
      status?: TicketStatus;
      priority?: TicketPriority;
      topic?: string;
      aiPausedForHuman?: boolean;
    };

    const state = getState();
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found.' });
      return;
    }

    if (status) {
      ticket.status = status;
      if (status === 'Resolved') {
        ticket.slaDueLabel = 'Closed';
        ticket.humanRequested = false;
      }
    }
    if (priority) {
      ticket.priority = priority;
      ticket.priorityLabel =
        priority === 'P1' ? 'Urgent' : priority === 'P2' ? 'High' : 'Normal';
    }
    if (topic !== undefined) ticket.topic = topic.trim();
    if (typeof aiPausedForHuman === 'boolean') {
      ticket.aiPausedForHuman = aiPausedForHuman;
      if (!aiPausedForHuman) ticket.humanRequested = false;
    }
    ticket.updatedAt = new Date().toISOString();
    saveState();
    res.json({ ticket, state: buildScopedState(req.authUser!) });
  });

  // Admin Policy & Deployment Toggle
  app.put('/api/policy', requireAdmin, (req: AuthedRequest, res: Response) => {
    const patch = req.body as Partial<AgentPolicyConfig>;
    const state = getState();
    state.policy = {
      ...state.policy,
      ...patch,
      autoRefundLimitInr: Number(
        patch.autoRefundLimitInr ?? state.policy.autoRefundLimitInr
      ),
    };
    saveState();
    res.json({ policy: state.policy, state: buildScopedState(req.authUser!) });
  });

  // Knowledge Base CRUD (Admin)
  app.post('/api/kb', requireAdmin, (req: AuthedRequest, res: Response) => {
    const { title, category, summary, content } = req.body as Partial<KnowledgeArticle>;
    if (!title?.trim() || !content?.trim()) {
      res.status(400).json({ error: 'Title and content are required.' });
      return;
    }
    const state = getState();
    const article: KnowledgeArticle = {
      id: generateId('KB'),
      title: title.trim(),
      category: category || 'Orders & Shipping',
      summary: summary?.trim() || title.trim(),
      content: content.trim(),
      sourceType: 'manual',
      updatedAt: new Date().toISOString(),
    };
    state.knowledgeBase.unshift(article);
    saveState();
    res.status(201).json({ article, state: buildScopedState(req.authUser!) });
  });

  app.post('/api/kb/upload-pdf', requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const { fileName, pdfBase64, title, category } = req.body as {
        fileName?: string;
        pdfBase64?: string;
        title?: string;
        category?: KnowledgeArticle['category'];
      };

      const cleanName = (fileName || 'store-policy.pdf').trim();
      const rawBase64 = (pdfBase64 || '').replace(/^data:application\/pdf;base64,/i, '').trim();

      if (!rawBase64) {
        res.status(400).json({ error: 'Please select a valid PDF file.' });
        return;
      }

      const byteLen = Buffer.from(rawBase64, 'base64').byteLength;
      if (byteLen === 0 || byteLen > 10 * 1024 * 1024) {
        res.status(400).json({ error: 'PDF must be between 1 byte and 10 MB.' });
        return;
      }

      const extracted = await extractStorePolicyFromPdf({
        pdfBase64: rawBase64,
        fileName: cleanName,
        titleHint: title,
        categoryHint: category,
      });

      const articleId = generateId('KB');
      const { storedFile, sizeBytes } = saveKbPdfFile(articleId, rawBase64);

      const article: KnowledgeArticle = {
        id: articleId,
        title: extracted.title,
        category: extracted.category,
        summary: extracted.summary,
        content: extracted.content,
        sourceType: 'pdf',
        pdfFileName: cleanName,
        pdfStoredFile: storedFile,
        pdfSizeBytes: sizeBytes,
        updatedAt: new Date().toISOString(),
      };

      const state = getState();
      state.knowledgeBase.unshift(article);
      saveState();

      res.status(201).json({ article, state: buildScopedState(req.authUser!) });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.get('/api/kb/:id/pdf', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    const state = getState();
    const article = state.knowledgeBase.find((a) => a.id === id);
    if (!article || !article.pdfStoredFile) {
      res.status(404).json({ error: 'PDF file not found for this article.' });
      return;
    }
    const buf = readKbPdfBuffer(article.pdfStoredFile);
    if (!buf) {
      res.status(404).json({ error: 'Stored PDF file missing on server.' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${(article.pdfFileName || 'policy.pdf').replace(/"/g, '')}"`
    );
    res.send(buf);
  });

  app.put('/api/kb/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    const { title, category, summary, content } = req.body as Partial<KnowledgeArticle>;
    const state = getState();
    const article = state.knowledgeBase.find((a) => a.id === id);
    if (!article) {
      res.status(404).json({ error: 'Article not found.' });
      return;
    }
    if (title !== undefined) article.title = title.trim();
    if (category !== undefined) article.category = category;
    if (summary !== undefined) article.summary = summary.trim();
    if (content !== undefined) article.content = content.trim();
    article.updatedAt = new Date().toISOString();
    saveState();
    res.json({ article, state: buildScopedState(req.authUser!) });
  });

  app.delete('/api/kb/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    const state = getState();
    const target = state.knowledgeBase.find((a) => a.id === id);
    if (target?.pdfStoredFile) {
      deleteKbPdfFile(target.pdfStoredFile);
    }
    state.knowledgeBase = state.knowledgeBase.filter((a) => a.id !== id);
    saveState();
    res.json({ state: buildScopedState(req.authUser!) });
  });

  // Company Policies CRUD (Admin)
  app.post('/api/company-policies', requireAdmin, (req: AuthedRequest, res: Response) => {
    const { title, summary, content, enabledForAutomation } =
      req.body as Partial<CompanyPolicy>;
    if (!title?.trim() || !content?.trim()) {
      res.status(400).json({ error: 'Policy title and details are required.' });
      return;
    }
    const state = getState();
    const policyDoc: CompanyPolicy = {
      id: generateId('POL'),
      title: title.trim(),
      summary: summary?.trim() || title.trim(),
      content: content.trim(),
      enabledForAutomation: enabledForAutomation !== false,
      updatedAt: new Date().toISOString(),
    };
    state.companyPolicies.push(policyDoc);
    saveState();
    res.status(201).json({ companyPolicy: policyDoc, state: buildScopedState(req.authUser!) });
  });

  app.put('/api/company-policies/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    const { title, summary, content, enabledForAutomation } =
      req.body as Partial<CompanyPolicy>;
    const state = getState();
    const policyDoc = state.companyPolicies.find((p) => p.id === id);
    if (!policyDoc) {
      res.status(404).json({ error: 'Company policy not found.' });
      return;
    }
    if (title !== undefined && title.trim()) policyDoc.title = title.trim();
    if (summary !== undefined) policyDoc.summary = summary.trim();
    if (content !== undefined && content.trim()) policyDoc.content = content.trim();
    if (typeof enabledForAutomation === 'boolean') {
      policyDoc.enabledForAutomation = enabledForAutomation;
    }
    policyDoc.updatedAt = new Date().toISOString();
    saveState();
    res.json({ companyPolicy: policyDoc, state: buildScopedState(req.authUser!) });
  });

  app.delete('/api/company-policies/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    const state = getState();
    state.companyPolicies = state.companyPolicies.filter((p) => p.id !== id);
    saveState();
    res.json({ state: buildScopedState(req.authUser!) });
  });

  // Admin Notifications (Urgent & Critical Conditions)
  app.post('/api/notifications/:id/read', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    const state = getState();
    const n = state.notifications.find((item) => item.id === id);
    if (n) {
      n.read = true;
      saveState();
    }
    res.json({ state: buildScopedState(req.authUser!) });
  });

  app.post('/api/notifications/read-all', requireAdmin, (req: AuthedRequest, res: Response) => {
    const state = getState();
    state.notifications.forEach((n) => {
      n.read = true;
    });
    saveState();
    res.json({ state: buildScopedState(req.authUser!) });
  });

  app.post('/api/reset-demo', requireAdmin, (req: AuthedRequest, res: Response) => {
    resetDemoState();
    res.json({ state: buildScopedState(req.authUser!) });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Threadora + DeskPilot server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
