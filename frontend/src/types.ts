export type UserRole = 'admin' | 'customer';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  customerId?: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: 'Knitwear' | 'Shirts' | 'Outerwear' | 'Accessories';
  priceInr: number;
  description: string;
  fabric: string;
  sizes: string[];
  imageUrl: string;
  inStock: boolean;
}

export interface OrderItem {
  productId: string;
  name: string;
  size: string;
  quantity: number;
  priceInr: number;
}

export type OrderStatus =
  | 'Payment Pending'
  | 'Confirmed'
  | 'Packed · Ships Today'
  | 'Shipped'
  | 'Delivered'
  | 'Exchange Initiated'
  | 'Return Label Sent'
  | 'Warranty Replacement'
  | 'Cancelled'
  | 'Refunded';

export interface OrderRecord {
  id: string; // e.g. #VN-2841
  customerId: string;
  customerEmail: string;
  customerName: string;
  items: OrderItem[];
  totalInr: number;
  paymentStatus: 'Paid' | 'Duplicate Charge' | 'Payment Deducted (Pending Sync)' | 'Refunded';
  orderStatus: OrderStatus;
  trackingCode?: string;
  placedAt: string;
  refundedInr?: number;
  refundReason?: string;
}

export type TicketStatus =
  | 'Open'
  | 'AI Handled'
  | 'Human Requested'
  | 'Pending Approval'
  | 'Resolved';

export type TicketPriority = 'P1' | 'P2' | 'P3';

export type MessageAuthorRole = 'customer' | 'gemini_agent' | 'admin';

export interface ToolSummaryChip {
  toolName: string;
  label: string;
}

export interface TicketMessage {
  id: string;
  role: MessageAuthorRole;
  authorName: string;
  body: string;
  createdAt: string;
  toolChips?: ToolSummaryChip[];
}

export interface AgentTraceStep {
  id: string;
  stepNumber: number;
  toolName: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
  status: 'completed' | 'blocked' | 'failed';
  durationMs: number;
  timestamp: string;
}

export interface PendingApproval {
  id: string;
  actionType: 'refund' | 'exchange' | 'return_label';
  orderId: string;
  customerId: string;
  amountInr?: number;
  reason: string;
  proposedAt: string;
}

export type SentimentLabel = 'Critical' | 'Frustrated' | 'Neutral' | 'Satisfied';

export interface Ticket {
  id: string; // e.g. VN-3842
  subject: string;
  topic: string;
  orderId?: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  priority: TicketPriority;
  priorityLabel: 'Urgent' | 'High' | 'Normal';
  status: TicketStatus;
  slaDueLabel: string;
  assignedTo: string;
  sentimentScore: number | null; // 0-100 where lower indicates more urgent emotional distress
  sentimentLabel: SentimentLabel | null;
  sentimentReason: string | null;
  humanRequested: boolean;
  humanRequestedReason: string | null;
  aiPausedForHuman: boolean;
  aiSuggestedReply: string | null;
  aiSuggestedConfidence: number | null;
  aiGroundedSources: number;
  pendingApproval: PendingApproval | null;
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
  agentTrace: AgentTraceStep[];
}

export interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  segment: 'Returning' | 'VIP' | 'New';
  ordersCount: number;
  lifetimeValueInr: number;
  lastOrderLabel: string;
  address: string;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  category:
    | 'Orders & Shipping'
    | 'Returns & Exchanges'
    | 'Payments & Refunds'
    | 'Escalation'
    | 'General Policy';
  summary: string;
  content: string;
  sourceType?: 'manual' | 'pdf';
  pdfFileName?: string;
  pdfStoredFile?: string;
  pdfSizeBytes?: number;
  updatedAt: string;
}

export interface CompanyPolicy {
  id: string;
  title: string;
  summary: string;
  content: string;
  enabledForAutomation: boolean;
  updatedAt: string;
}

export type NotificationSeverity = 'critical' | 'urgent';

export interface AdminNotification {
  id: string;
  ticketId: string;
  customerName: string;
  severity: NotificationSeverity;
  title: string;
  reason: string;
  sentimentScore: number | null;
  read: boolean;
  createdAt: string;
}

export interface AgentPolicyConfig {
  autoDeployEnabled: boolean; // true = AI automatically sends replies; false = AI prepares Suggested Reply for Approve & send
  autoRefundLimitInr: number;
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  brandVoice: string;
  escalationRules: string;
}

export interface DeskState {
  products: Product[];
  customers: CustomerProfile[];
  orders: OrderRecord[];
  tickets: Ticket[];
  knowledgeBase: KnowledgeArticle[];
  companyPolicies: CompanyPolicy[];
  notifications: AdminNotification[];
  policy: AgentPolicyConfig;
}
