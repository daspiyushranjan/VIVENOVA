import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  AdminNotification,
  AgentPolicyConfig,
  AuthUser,
  CompanyPolicy,
  CustomerProfile,
  DeskState,
  KnowledgeArticle,
  OrderRecord,
  Product,
  Ticket,
} from '../src/types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const KB_PDF_DIR = path.join(DATA_DIR, 'kb-pdfs');
const DATA_FILE = path.join(DATA_DIR, 'verve-desk-state.json');
const USERS_FILE = path.join(DATA_DIR, 'verve-users.json');

export interface StoredUserRecord extends AuthUser {
  password: string;
}

const TOKEN_SECRET = process.env.SESSION_SECRET || 'verve-loom-deskpilot-session-key';

export function signAuthToken(user: AuthUser): string {
  const payload = Buffer.from(JSON.stringify(user), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAuthToken(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payload)
    .digest('base64url');
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as AuthUser;
  } catch {
    return null;
  }
}

function createInitialUsers(): StoredUserRecord[] {
  return [
    {
      id: 'USR-ADMIN-1',
      name: 'Priya S.',
      email: 'priya.s@threadora.in',
      password: 'admin123',
      role: 'admin',
    },
    {
      id: 'USR-CUS-101',
      name: 'Rohan Mehta',
      email: 'rohan.m@example.com',
      password: 'customer123',
      role: 'customer',
      customerId: 'CUS-101',
    },
    {
      id: 'USR-CUS-102',
      name: 'Ava Kapoor',
      email: 'ava.k@example.com',
      password: 'customer123',
      role: 'customer',
      customerId: 'CUS-102',
    },
    {
      id: 'USR-CUS-103',
      name: 'Meera Patel',
      email: 'meera.p@example.com',
      password: 'customer123',
      role: 'customer',
      customerId: 'CUS-103',
    },
    {
      id: 'USR-CUS-104',
      name: 'Vikram Singh',
      email: 'vikram.s@example.com',
      password: 'customer123',
      role: 'customer',
      customerId: 'CUS-104',
    },
  ];
}

function createInitialState(): DeskState {
  const products: Product[] = [
    {
      id: 'PRD-101',
      sku: 'VL-MKN-01',
      name: 'Charcoal Merino Crewneck',
      category: 'Knitwear',
      priceInr: 3450,
      description:
        'Mid-weight 100% Australian extra-fine merino wool knit with saddle shoulders and ribbed cuffs.',
      fabric: '19.5-micron Extra-Fine Merino Wool',
      sizes: ['S', 'M', 'L', 'XL'],
      imageUrl: '/src/assets/images/product_merino_knit_1794726533103.jpg',
      inStock: true,
    },
    {
      id: 'PRD-102',
      sku: 'VL-LOV-02',
      name: 'Sand Belgian Linen Overshirt',
      category: 'Shirts',
      priceInr: 2850,
      description:
        'Relaxed boxy overshirt woven from breathable Normandy flax linen with natural horn buttons.',
      fabric: '210gsm Washed Belgian Linen',
      sizes: ['S', 'M', 'L', 'XL'],
      imageUrl: '/src/assets/images/product_linen_overshirt_1794726534003.jpg',
      inStock: true,
    },
    {
      id: 'PRD-103',
      sku: 'VL-ICJ-03',
      name: 'Indigo Selvedge Chore Jacket',
      category: 'Outerwear',
      priceInr: 4950,
      description:
        'Three-pocket workwear chore coat cut from rope-dyed Japanese cotton canvas with triple-needle seams.',
      fabric: '12oz Japanese Cotton Canvas',
      sizes: ['S', 'M', 'L', 'XL'],
      imageUrl: '/src/assets/images/product_chore_jacket_1794726534700.jpg',
      inStock: true,
    },
    {
      id: 'PRD-104',
      sku: 'VL-ECT-04',
      name: 'Everyday Canvas Market Tote',
      category: 'Accessories',
      priceInr: 1850,
      description:
        'Structured 18oz unbleached organic cotton tote reinforced with vegetable-tanned bridle leather straps.',
      fabric: '18oz Organic Cotton & Bridle Leather',
      sizes: ['One Size'],
      imageUrl: '/src/assets/images/product_canvas_tote_1794726534461.jpg',
      inStock: true,
    },
  ];

  const customers: CustomerProfile[] = [
    {
      id: 'CUS-101',
      name: 'Rohan Mehta',
      email: 'rohan.m@example.com',
      segment: 'Returning',
      ordersCount: 4,
      lifetimeValueInr: 8450,
      lastOrderLabel: 'Yesterday',
      address: '42 Indiranagar 100ft Rd, Bengaluru 560038',
    },
    {
      id: 'CUS-102',
      name: 'Ava Kapoor',
      email: 'ava.k@example.com',
      segment: 'VIP',
      ordersCount: 6,
      lifetimeValueInr: 19200,
      lastOrderLabel: '2 days ago',
      address: '14 Pali Hill, Bandra West, Mumbai 400050',
    },
    {
      id: 'CUS-103',
      name: 'Meera Patel',
      email: 'meera.p@example.com',
      segment: 'Returning',
      ordersCount: 3,
      lifetimeValueInr: 6900,
      lastOrderLabel: '5 days ago',
      address: '88 Koregaon Park Lane 6, Pune 411001',
    },
    {
      id: 'CUS-104',
      name: 'Vikram Singh',
      email: 'vikram.s@example.com',
      segment: 'Returning',
      ordersCount: 2,
      lifetimeValueInr: 6300,
      lastOrderLabel: '4 days ago',
      address: '19 Golf Links, New Delhi 110003',
    },
    {
      id: 'CUS-105',
      name: 'Kabir Joshi',
      email: 'kabir.j@example.com',
      segment: 'New',
      ordersCount: 1,
      lifetimeValueInr: 4950,
      lastOrderLabel: '6 days ago',
      address: '7 Jubilee Hills Rd 36, Hyderabad 500033',
    },
  ];

  const orders: OrderRecord[] = [
    {
      id: '#VN-2841',
      customerId: 'CUS-101',
      customerEmail: 'rohan.m@example.com',
      customerName: 'Rohan Mehta',
      items: [
        {
          productId: 'PRD-101',
          name: 'Charcoal Merino Crewneck',
          size: 'M',
          quantity: 1,
          priceInr: 3450,
        },
      ],
      totalInr: 3450,
      paymentStatus: 'Paid',
      orderStatus: 'Packed · Ships Today',
      trackingCode: 'BD-8829104-IN',
      placedAt: '2026-11-13T15:20:00Z',
    },
    {
      id: '#VN-2846',
      customerId: 'CUS-101',
      customerEmail: 'rohan.m@example.com',
      customerName: 'Rohan Mehta',
      items: [
        {
          productId: 'PRD-104',
          name: 'Everyday Canvas Market Tote',
          size: 'One Size',
          quantity: 1,
          priceInr: 1850,
        },
      ],
      totalInr: 1850,
      paymentStatus: 'Payment Deducted (Pending Sync)',
      orderStatus: 'Payment Pending',
      placedAt: '2026-11-14T21:10:00Z',
    },
    {
      id: '#VN-2845',
      customerId: 'CUS-102',
      customerEmail: 'ava.k@example.com',
      customerName: 'Ava Kapoor',
      items: [
        {
          productId: 'PRD-103',
          name: 'Indigo Selvedge Chore Jacket',
          size: 'S',
          quantity: 1,
          priceInr: 4950,
        },
      ],
      totalInr: 4950,
      paymentStatus: 'Duplicate Charge',
      orderStatus: 'Confirmed',
      placedAt: '2026-11-14T18:30:00Z',
    },
    {
      id: '#VN-2844',
      customerId: 'CUS-102',
      customerEmail: 'ava.k@example.com',
      customerName: 'Ava Kapoor',
      items: [
        {
          productId: 'PRD-103',
          name: 'Indigo Selvedge Chore Jacket',
          size: 'S',
          quantity: 1,
          priceInr: 4950,
        },
      ],
      totalInr: 4950,
      paymentStatus: 'Paid',
      orderStatus: 'Packed · Ships Today',
      trackingCode: 'BD-8829140-IN',
      placedAt: '2026-11-14T18:29:00Z',
    },
    {
      id: '#VN-2839',
      customerId: 'CUS-104',
      customerEmail: 'vikram.s@example.com',
      customerName: 'Vikram Singh',
      items: [
        {
          productId: 'PRD-102',
          name: 'Sand Belgian Linen Overshirt',
          size: 'M',
          quantity: 1,
          priceInr: 2850,
        },
      ],
      totalInr: 2850,
      paymentStatus: 'Paid',
      orderStatus: 'Delivered',
      trackingCode: 'BD-8821004-IN',
      placedAt: '2026-11-10T10:15:00Z',
    },
    {
      id: '#VN-2834',
      customerId: 'CUS-103',
      customerEmail: 'meera.p@example.com',
      customerName: 'Meera Patel',
      items: [
        {
          productId: 'PRD-102',
          name: 'Sand Belgian Linen Overshirt',
          size: 'S',
          quantity: 1,
          priceInr: 2850,
        },
      ],
      totalInr: 2850,
      paymentStatus: 'Refunded',
      orderStatus: 'Refunded',
      refundedInr: 2850,
      refundReason: 'Returned unworn within 14-day window',
      placedAt: '2026-11-05T11:45:00Z',
    },
    {
      id: '#VN-2830',
      customerId: 'CUS-105',
      customerEmail: 'kabir.j@example.com',
      customerName: 'Kabir Joshi',
      items: [
        {
          productId: 'PRD-103',
          name: 'Indigo Selvedge Chore Jacket',
          size: 'L',
          quantity: 1,
          priceInr: 4950,
        },
      ],
      totalInr: 4950,
      paymentStatus: 'Paid',
      orderStatus: 'Return Label Sent',
      trackingCode: 'RL-44109-IN',
      placedAt: '2026-11-08T09:00:00Z',
    },
  ];

  const knowledgeBase: KnowledgeArticle[] = [
    {
      id: 'KB-01',
      title: 'Order Confirmation & Gateway Payment Sync',
      category: 'Orders & Shipping',
      summary: 'Handling UPI/card payment deductions where order status remains Payment Pending.',
      content:
        'If a customer paid via UPI or card and their order still shows "Payment Deducted (Pending Sync)", inspect the order with lookup_order and run sync_pending_payment immediately to confirm the order and dispatch it to fulfillment.',
      updatedAt: '2026-11-01T10:00:00Z',
    },
    {
      id: 'KB-02',
      title: 'Duplicate Card Charge Auto-Refund Policy',
      category: 'Payments & Refunds',
      summary: 'Verifying double settlements and issuing immediate refunds.',
      content:
        'When a customer reports a double charge, inspect their orders via lookup_order. If an order has paymentStatus "Duplicate Charge", call issue_order_refund for the duplicate invoice. Refunds at or below the auto-refund cap execute instantly; higher amounts queue for Priya S. approval.',
      updatedAt: '2026-11-02T12:00:00Z',
    },
    {
      id: 'KB-03',
      title: '14-Day Size Exchange & Return Label Policy',
      category: 'Returns & Exchanges',
      summary: 'Free size exchanges and prepaid return labels on delivered orders.',
      content:
        'Delivered garments within 14 days qualify for a free size exchange or return label. Use initiate_exchange_or_return with action "exchange" (and targetSize) or "return_label" and share the pickup confirmation with the customer. Refunds settle in 3-5 business days after pickup.',
      updatedAt: '2026-11-03T09:30:00Z',
    },
    {
      id: 'KB-04',
      title: 'Customer Dissatisfaction & Human Specialist Handoff',
      category: 'Escalation',
      summary: 'When to immediately escalate to a human support specialist.',
      content:
        'If a customer says they are not satisfied with the automated answer, asks to speak to a human/manager, or disputes a refund timeline past 5 business days, immediately call request_human_assistance so Priya S. takes over the thread.',
      updatedAt: '2026-11-05T14:00:00Z',
    },
  ];

  const tickets: Ticket[] = [
    {
      id: 'VN-3842',
      subject: 'Payment deducted, order pending confirmation',
      topic: 'Order status',
      orderId: '#VN-2841',
      customerId: 'CUS-101',
      customerName: 'Rohan Mehta',
      customerEmail: 'rohan.m@example.com',
      priority: 'P2',
      priorityLabel: 'Normal',
      status: 'Open',
      slaDueLabel: 'in 2h 14m',
      assignedTo: 'Priya S.',
      sentimentScore: 62,
      sentimentLabel: 'Neutral',
      sentimentReason: 'Polite order confirmation inquiry; already located #VN-2841.',
      humanRequested: false,
      humanRequestedReason: null,
      aiPausedForHuman: false,
      aiSuggestedReply:
        "Hi Rohan! Your order #VN-2841 is packed and will ship today. I'll send your tracking link as soon as it's on its way. Anything else I can help with?",
      aiSuggestedConfidence: 98,
      aiGroundedSources: 1,
      pendingApproval: null,
      createdAt: '2026-11-14T10:42:00Z',
      updatedAt: '2026-11-14T10:43:00Z',
      messages: [
        {
          id: 'MSG-3842-1',
          role: 'customer',
          authorName: 'Rohan',
          body: 'Hi, I paid for my order yesterday but never got a confirmation. Can you check where it is?',
          createdAt: '2026-11-14T10:42:00Z',
        },
        {
          id: 'MSG-3842-2',
          role: 'gemini_agent',
          authorName: 'DeskPilot AI',
          body: 'I can look into that for you! Could you share your order number? It usually starts with #VN.',
          createdAt: '2026-11-14T10:42:30Z',
        },
        {
          id: 'MSG-3842-3',
          role: 'customer',
          authorName: 'Rohan',
          body: '#VN-2841',
          createdAt: '2026-11-14T10:43:00Z',
        },
        {
          id: 'MSG-3842-4',
          role: 'gemini_agent',
          authorName: 'DeskPilot AI',
          body: "Thanks! I found order #VN-2841. It's packed and scheduled to ship today. You'll get a tracking link by email once the courier picks it up.",
          createdAt: '2026-11-14T10:43:20Z',
          toolChips: [{ toolName: 'lookup_order', label: 'Order lookup · #VN-2841' }],
        },
      ],
      agentTrace: [
        {
          id: 'TRC-3842-1',
          stepNumber: 1,
          toolName: 'lookup_order',
          arguments: { orderId: '#VN-2841' },
          result: {
            found: true,
            orderId: '#VN-2841',
            orderStatus: 'Packed · Ships Today',
            paymentStatus: 'Paid',
            trackingCode: 'BD-8829104-IN',
          },
          status: 'completed',
          durationMs: 14,
          timestamp: '2026-11-14T10:43:18Z',
        },
      ],
    },
    {
      id: 'VN-3844',
      subject: 'Card charged twice on Indigo Chore Jacket',
      topic: 'Billing & Refunds',
      orderId: '#VN-2845',
      customerId: 'CUS-102',
      customerName: 'Ava Kapoor',
      customerEmail: 'ava.k@example.com',
      priority: 'P1',
      priorityLabel: 'Urgent',
      status: 'Open',
      slaDueLabel: 'in 45m',
      assignedTo: 'Priya S.',
      sentimentScore: 24,
      sentimentLabel: 'Critical',
      sentimentReason: 'Double card charge of ₹4,950 requires urgent billing resolution.',
      humanRequested: false,
      humanRequestedReason: null,
      aiPausedForHuman: false,
      aiSuggestedReply: null,
      aiSuggestedConfidence: null,
      aiGroundedSources: 0,
      pendingApproval: null,
      createdAt: '2026-11-14T22:45:00Z',
      updatedAt: '2026-11-14T22:45:00Z',
      messages: [
        {
          id: 'MSG-3844-1',
          role: 'customer',
          authorName: 'Ava Kapoor',
          body: 'My card was charged ₹4,950 twice when ordering the Indigo Selvedge Chore Jacket (#VN-2844 and #VN-2845). Can you verify and refund the duplicate charge?',
          createdAt: '2026-11-14T22:45:00Z',
        },
      ],
      agentTrace: [],
    },
    {
      id: 'VN-3841',
      subject: 'Exchange for larger size (M to L)',
      topic: 'Returns & Exchanges',
      orderId: '#VN-2839',
      customerId: 'CUS-104',
      customerName: 'Vikram Singh',
      customerEmail: 'vikram.s@example.com',
      priority: 'P3',
      priorityLabel: 'Normal',
      status: 'Open',
      slaDueLabel: 'in 3h 20m',
      assignedTo: 'Priya S.',
      sentimentScore: 74,
      sentimentLabel: 'Neutral',
      sentimentReason: 'Routine, calm size exchange request within return window.',
      humanRequested: false,
      humanRequestedReason: null,
      aiPausedForHuman: false,
      aiSuggestedReply: null,
      aiSuggestedConfidence: null,
      aiGroundedSources: 0,
      pendingApproval: null,
      createdAt: '2026-11-14T22:20:00Z',
      updatedAt: '2026-11-14T22:20:00Z',
      messages: [
        {
          id: 'MSG-3841-1',
          role: 'customer',
          authorName: 'Vikram Singh',
          body: 'Hi! My Sand Belgian Linen Overshirt (#VN-2839) arrived yesterday in size M, and I need to exchange it for size L. Can you start the exchange?',
          createdAt: '2026-11-14T22:20:00Z',
        },
      ],
      agentTrace: [],
    },
    {
      id: 'VN-3840',
      subject: 'Refund timeline for returned overshirt',
      topic: 'Returns & Exchanges',
      orderId: '#VN-2834',
      customerId: 'CUS-103',
      customerName: 'Meera Patel',
      customerEmail: 'meera.p@example.com',
      priority: 'P1',
      priorityLabel: 'High',
      status: 'Human Requested',
      slaDueLabel: 'in 28m',
      assignedTo: 'Priya S.',
      sentimentScore: 16,
      sentimentLabel: 'Critical',
      sentimentReason: 'Customer frustrated by missing UTR reference and requested human billing specialist.',
      humanRequested: true,
      humanRequestedReason:
        'Customer is unsatisfied with standard 3-5 day bank settlement timeline and requested a human specialist to confirm UTR reference.',
      aiPausedForHuman: true,
      aiSuggestedReply: null,
      aiSuggestedConfidence: null,
      aiGroundedSources: 1,
      pendingApproval: null,
      createdAt: '2026-11-14T21:55:00Z',
      updatedAt: '2026-11-14T22:02:00Z',
      messages: [
        {
          id: 'MSG-3840-1',
          role: 'customer',
          authorName: 'Meera Patel',
          body: 'My return for #VN-2834 was marked refunded 2 days ago, when will the ₹2,850 actually hit my bank?',
          createdAt: '2026-11-14T21:55:00Z',
        },
        {
          id: 'MSG-3840-2',
          role: 'gemini_agent',
          authorName: 'DeskPilot AI',
          body: 'Hi Meera, I verified that #VN-2834 (₹2,850) was refunded on our end. Bank settlements take 3–5 business days to reflect on your statement.',
          createdAt: '2026-11-14T21:56:00Z',
          toolChips: [{ toolName: 'lookup_order', label: 'Order lookup · #VN-2834' }],
        },
        {
          id: 'MSG-3840-3',
          role: 'customer',
          authorName: 'Meera Patel',
          body: "That doesn't answer where the transaction reference is—I need human assistance from your billing team please.",
          createdAt: '2026-11-14T22:02:00Z',
        },
      ],
      agentTrace: [
        {
          id: 'TRC-3840-1',
          stepNumber: 1,
          toolName: 'lookup_order',
          arguments: { orderId: '#VN-2834' },
          result: { found: true, orderId: '#VN-2834', paymentStatus: 'Refunded', refundedInr: 2850 },
          status: 'completed',
          durationMs: 11,
          timestamp: '2026-11-14T21:55:50Z',
        },
        {
          id: 'TRC-3840-2',
          stepNumber: 2,
          toolName: 'request_human_assistance',
          arguments: { reason: 'Customer unsatisfied with generic timeline; requested UTR reference from human specialist.' },
          result: { escalated: true, assignedTo: 'Priya S.', aiPausedForHuman: true },
          status: 'completed',
          durationMs: 9,
          timestamp: '2026-11-14T22:02:01Z',
        },
      ],
    },
    {
      id: 'VN-3835',
      subject: 'Return label requested for Chore Jacket',
      topic: 'Returns & Exchanges',
      orderId: '#VN-2830',
      customerId: 'CUS-105',
      customerName: 'Kabir Joshi',
      customerEmail: 'kabir.j@example.com',
      priority: 'P3',
      priorityLabel: 'Normal',
      status: 'Resolved',
      slaDueLabel: 'Closed',
      assignedTo: 'DeskPilot AI',
      sentimentScore: 86,
      sentimentLabel: 'Satisfied',
      sentimentReason: 'Return label generated promptly without friction.',
      humanRequested: false,
      humanRequestedReason: null,
      aiPausedForHuman: false,
      aiSuggestedReply: null,
      aiSuggestedConfidence: 97,
      aiGroundedSources: 2,
      pendingApproval: null,
      createdAt: '2026-11-13T14:10:00Z',
      updatedAt: '2026-11-13T14:12:00Z',
      messages: [
        {
          id: 'MSG-3835-1',
          role: 'customer',
          authorName: 'Kabir Joshi',
          body: 'Can I get a prepaid return label for #VN-2830? I want to return the jacket.',
          createdAt: '2026-11-13T14:10:00Z',
        },
        {
          id: 'MSG-3835-2',
          role: 'gemini_agent',
          authorName: 'DeskPilot AI',
          body: 'Done! I have generated prepaid return label RL-44109-IN for order #VN-2830 and scheduled pickup. Your ₹4,950 refund will settle within 3–5 business days once picked up.',
          createdAt: '2026-11-13T14:12:00Z',
          toolChips: [
            { toolName: 'initiate_exchange_or_return', label: 'Return label · RL-44109-IN' },
          ],
        },
      ],
      agentTrace: [
        {
          id: 'TRC-3835-1',
          stepNumber: 1,
          toolName: 'initiate_exchange_or_return',
          arguments: { orderId: '#VN-2830', action: 'return_label' },
          result: { executed: true, trackingCode: 'RL-44109-IN', orderStatus: 'Return Label Sent' },
          status: 'completed',
          durationMs: 15,
          timestamp: '2026-11-13T14:11:55Z',
        },
      ],
    },
  ];

  const companyPolicies: CompanyPolicy[] = createDefaultCompanyPolicies();
  const notifications: AdminNotification[] = createDefaultNotifications();

  const policy: AgentPolicyConfig = {
    autoDeployEnabled: true,
    autoRefundLimitInr: 5000,
    thinkingLevel: 'LOW',
    brandVoice:
      'Warm, concise, transparent D2C concierge tone. Always cite exact #VN order IDs and concrete next steps.',
    escalationRules:
      'Operate autonomously by default without waiting for admin approval on standard orders, cancellations, exchanges, warranties, and refunds up to cap. Notify admin immediately when urgent/critical conditions are met (sentiment <= 30, P1 urgency, explicit human escalation, or refund above cap).',
  };

  return {
    products,
    customers,
    orders,
    tickets,
    knowledgeBase,
    companyPolicies,
    notifications,
    policy,
  };
}

function createDefaultCompanyPolicies(): CompanyPolicy[] {
  const now = '2026-11-15T00:00:00Z';
  return [
    {
      id: 'POL-01',
      title: 'Terms and Conditions',
      summary: 'Storefront usage, pricing in INR, authentic product guarantees, and dispute resolution.',
      content:
        'All prices on Threadora are listed in Indian Rupees (INR) inclusive of GST. Orders are confirmed upon payment authorization. Promotional discounts cannot be stacked unless stated. Any billing discrepancies or duplicate settlements are resolved immediately via DeskPilot automated verification or finance audit.',
      enabledForAutomation: true,
      updatedAt: now,
    },
    {
      id: 'POL-02',
      title: 'Privacy Policy',
      summary: 'Customer data protection, payment security, and account deletion rights.',
      content:
        'We collect only essential order details (name, email, shipping address, and order history) required to fulfill deliveries and provide support. Card and UPI details are processed over PCI-DSS compliant gateways and never stored in plain text. Customers may request address updates or data export/deletion anytime through support.',
      enabledForAutomation: true,
      updatedAt: now,
    },
    {
      id: 'POL-03',
      title: 'Customer support policy',
      summary: 'Autonomous instant resolution targets and immediate escalation for urgent/critical cases.',
      content:
        'DeskPilot AI handles routine inquiries, order tracking, payment syncs, exchanges, and eligible refunds autonomously 24/7 in English and Hinglish with zero wait time. Urgent or critical cases (sentiment score <= 30, P1 billing/fraud disputes, or explicit requests for human assistance) trigger immediate escalation and live admin notification.',
      enabledForAutomation: true,
      updatedAt: now,
    },
    {
      id: 'POL-04',
      title: 'ORDER CANCELLATION POLICY',
      summary: 'Instant cancellation before courier dispatch with automatic 100% refund.',
      content:
        'Orders in "Payment Pending", "Confirmed", or "Packed · Ships Today" status can be cancelled immediately at zero fee—the automated system should cancel the order and trigger a full refund back to the original payment method (3-5 business days). Once an order reaches "Shipped" or "Delivered", cancellation is unavailable and customers should be offered a free 14-day return label upon delivery.',
      enabledForAutomation: true,
      updatedAt: now,
    },
    {
      id: 'POL-05',
      title: 'WARRANTY POLICY',
      summary: '6-month craftsmanship warranty covering seam defects, buttons, and fabric faults.',
      content:
        'All Threadora garments and accessories carry a 6-month craftsmanship warranty against stitching unraveling, horn/metal hardware failure, or premature seam defects. Normal wear-and-tear or improper washing (such as machine-drying merino wool) is excluded. Valid defect claims on delivered orders qualify for a free instant warranty replacement.',
      enabledForAutomation: true,
      updatedAt: now,
    },
    {
      id: 'POL-06',
      title: 'SHIPPING & DELIVERY POLICY',
      summary: 'Free pan-India dispatch within 24 hours; 2-4 days metro and 4-7 days nationwide.',
      content:
        'In-stock orders ship free across India within 24 business hours via BlueDart or Delhivery. Estimated delivery is 2-4 business days for metro cities (Bengaluru, Mumbai, Delhi NCR, Pune, Hyderabad) and 4-7 business days for other PIN codes. Tracking codes (BD-XXXX-IN) activate within 4 hours of courier pickup.',
      enabledForAutomation: true,
      updatedAt: now,
    },
  ];
}

function createDefaultNotifications(): AdminNotification[] {
  return [
    {
      id: 'NTF-1001',
      ticketId: 'VN-3840',
      customerName: 'Meera Patel',
      severity: 'critical',
      title: 'Human escalation requested',
      reason:
        'Customer unsatisfied with generic timeline and asked for human billing specialist (Sentiment: 16/100 Critical).',
      sentimentScore: 16,
      read: false,
      createdAt: '2026-11-14T22:02:00Z',
    },
    {
      id: 'NTF-1002',
      ticketId: 'VN-3844',
      customerName: 'Ava Kapoor',
      severity: 'critical',
      title: 'Critical billing alert (P1)',
      reason:
        'Duplicate card charge of ₹4,950 reported on #VN-2845 (Sentiment: 24/100 Critical).',
      sentimentScore: 24,
      read: false,
      createdAt: '2026-11-14T22:45:00Z',
    },
  ];
}

let users: StoredUserRecord[] = createInitialUsers();
let state: DeskState = createInitialState();

function loadUsers(): StoredUserRecord[] {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as StoredUserRecord[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        let usersMigrated = false;
        const updated = parsed.map((u) => {
          if (u.email === 'priya.s@verveloom.in') {
            usersMigrated = true;
            return { ...u, email: 'priya.s@threadora.in' };
          }
          return u;
        });
        if (usersMigrated) {
          saveUsers(updated);
        }
        return updated;
      }
    }
  } catch (err) {
    console.warn('Could not load users file, using defaults:', err);
  }
  const initial = createInitialUsers();
  saveUsers(initial);
  return initial;
}

export function saveUsers(nextUsers: StoredUserRecord[] = users): void {
  users = nextUsers;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist users:', err);
  }
}

users = loadUsers();

export function getUsers(): StoredUserRecord[] {
  return users;
}

function loadState(): DeskState {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as DeskState;
      if (parsed && Array.isArray(parsed.tickets) && Array.isArray(parsed.products)) {
        parsed.tickets = parsed.tickets.map((t) => ({
          ...t,
          sentimentScore:
            typeof t.sentimentScore === 'number'
              ? t.sentimentScore
              : t.humanRequested || t.priority === 'P1'
              ? 22
              : t.status === 'Resolved'
              ? 82
              : 60,
          sentimentLabel:
            t.sentimentLabel ??
            (t.humanRequested || t.priority === 'P1'
              ? 'Critical'
              : t.status === 'Resolved'
              ? 'Satisfied'
              : 'Neutral'),
          sentimentReason: t.sentimentReason ?? null,
        }));
        let migrated = false;
        if (!Array.isArray(parsed.companyPolicies) || parsed.companyPolicies.length === 0) {
          parsed.companyPolicies = createDefaultCompanyPolicies();
          if (parsed.policy) {
            parsed.policy.thinkingLevel = 'LOW';
            parsed.policy.autoDeployEnabled = true;
            parsed.policy.autoRefundLimitInr = Math.max(
              parsed.policy.autoRefundLimitInr || 0,
              5000
            );
          }
          migrated = true;
        }
        if (!Array.isArray(parsed.notifications)) {
          parsed.notifications = createDefaultNotifications();
          migrated = true;
        }
        if (Array.isArray(parsed.companyPolicies)) {
          parsed.companyPolicies = parsed.companyPolicies.map((cp) => {
            if (/verve\s*&?\s*loom/i.test(cp.content) || /verve\s*&?\s*loom/i.test(cp.summary)) {
              migrated = true;
              return {
                ...cp,
                summary: cp.summary.replace(/Verve\s*(?:&|and)\s*Loom/gi, 'Threadora'),
                content: cp.content.replace(/Verve\s*(?:&|and)\s*Loom/gi, 'Threadora'),
              };
            }
            return cp;
          });
        }
        if (Array.isArray(parsed.knowledgeBase)) {
          parsed.knowledgeBase = parsed.knowledgeBase.map((kb) => {
            if (/verve\s*(?:&|and)\s*loom/i.test(kb.content) || /verve\s*(?:&|and)\s*loom/i.test(kb.title)) {
              migrated = true;
              return {
                ...kb,
                title: kb.title.replace(/Verve\s*(?:&|and)\s*Loom/gi, 'Threadora'),
                summary: kb.summary.replace(/Verve\s*(?:&|and)\s*Loom/gi, 'Threadora'),
                content: kb.content.replace(/Verve\s*(?:&|and)\s*Loom/gi, 'Threadora'),
              };
            }
            return kb;
          });
        }
        if (migrated) {
          try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
          } catch {
            // ignore write error during migration
          }
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Could not load persisted desk state, initializing defaults:', err);
  }
  const initial = createInitialState();
  saveState(initial);
  return initial;
}

export function saveState(nextState: DeskState = state): void {
  state = nextState;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist desk state to disk:', err);
  }
}

state = loadState();

export function getState(): DeskState {
  return state;
}

export function resetDemoState(): DeskState {
  const fresh = createInitialState();
  saveState(fresh);
  return fresh;
}

export function generateId(prefix: string): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${rand}`;
}

export function evaluateAndNotifyUrgentTicket(
  ticket: Ticket,
  customReason?: string
): AdminNotification | null {
  if (ticket.status === 'Resolved') return null;

  const isCriticalSentiment =
    (ticket.sentimentScore !== null && ticket.sentimentScore <= 30) ||
    ticket.sentimentLabel === 'Critical';
  const isHumanRequested = ticket.humanRequested;
  const isPendingApproval = ticket.pendingApproval !== null;
  const isUrgentP1 = ticket.priority === 'P1';

  if (!isCriticalSentiment && !isHumanRequested && !isPendingApproval && !isUrgentP1) {
    return null;
  }

  let severity: 'critical' | 'urgent' = 'urgent';
  let title = 'Urgent P1 ticket requires attention';
  let reason =
    customReason ||
    ticket.humanRequestedReason ||
    ticket.sentimentReason ||
    ticket.subject;

  if (isHumanRequested) {
    severity = 'critical';
    title = 'Human assistance requested';
    reason =
      ticket.humanRequestedReason ||
      'Customer asked for a human specialist to take over.';
  } else if (isCriticalSentiment) {
    severity = 'critical';
    title = `Critical sentiment (${ticket.sentimentScore ?? 20}/100)`;
    reason =
      ticket.sentimentReason ||
      `Critical emotional distress detected on "${ticket.subject}".`;
  } else if (isPendingApproval && ticket.pendingApproval) {
    severity = 'urgent';
    title = 'Refund approval cap exceeded';
    reason = `₹${(ticket.pendingApproval.amountInr ?? 0).toLocaleString('en-IN')} refund queued for ${ticket.pendingApproval.orderId}.`;
  } else if (isUrgentP1) {
    severity = 'urgent';
    title = 'Urgent P1 ticket flagged';
  }

  const now = new Date().toISOString();
  const existingUnread = state.notifications.find(
    (n) => !n.read && n.ticketId === ticket.id && n.title === title
  );

  if (existingUnread) {
    existingUnread.reason = reason;
    existingUnread.sentimentScore = ticket.sentimentScore;
    existingUnread.createdAt = now;
    saveState();
    return existingUnread;
  }

  const notification: AdminNotification = {
    id: generateId('NTF'),
    ticketId: ticket.id,
    customerName: ticket.customerName,
    severity,
    title,
    reason,
    sentimentScore: ticket.sentimentScore,
    read: false,
    createdAt: now,
  };
  state.notifications.unshift(notification);
  if (state.notifications.length > 50) {
    state.notifications = state.notifications.slice(0, 50);
  }
  saveState();
  return notification;
}

export function saveKbPdfFile(articleId: string, base64Data: string): {
  storedFile: string;
  sizeBytes: number;
} {
  if (!fs.existsSync(KB_PDF_DIR)) {
    fs.mkdirSync(KB_PDF_DIR, { recursive: true });
  }
  const safeId = path.basename(articleId).replace(/[^a-zA-Z0-9_-]/g, '');
  const storedFile = `${safeId}.pdf`;
  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(path.join(KB_PDF_DIR, storedFile), buffer);
  return { storedFile, sizeBytes: buffer.byteLength };
}

export function readKbPdfBuffer(storedFile: string): Buffer | null {
  try {
    const safeName = path.basename(storedFile);
    const fullPath = path.join(KB_PDF_DIR, safeName);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath);
  } catch {
    return null;
  }
}

export function readKbPdfBase64(storedFile: string): string | null {
  const buf = readKbPdfBuffer(storedFile);
  return buf ? buf.toString('base64') : null;
}

export function deleteKbPdfFile(storedFile: string | undefined): void {
  if (!storedFile) return;
  try {
    const safeName = path.basename(storedFile);
    const fullPath = path.join(KB_PDF_DIR, safeName);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch {
    // ignore cleanup failure
  }
}
