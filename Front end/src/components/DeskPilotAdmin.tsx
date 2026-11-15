import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  LogOut,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AgentPolicyConfig,
  AuthUser,
  CompanyPolicy,
  DeskState,
  KnowledgeArticle,
  TicketPriority,
  TicketStatus,
} from '../types';

type AdminTab = 'inbox' | 'policies' | 'automation' | 'orders' | 'kb';

interface DeskPilotAdminProps {
  user: AuthUser;
  state: DeskState;
  onViewWebsite: () => void;
  onSwitchAccount: () => void;
  onRefreshState: () => Promise<void>;
  onResetDemo: () => Promise<void>;
  onUpdatePolicy: (patch: Partial<AgentPolicyConfig>) => Promise<void>;
  onRunAiOnTicket: (
    ticketId: string,
    mode: 'auto' | 'draft' | 'send'
  ) => Promise<void>;
  onApproveSuggested: (ticketId: string, editedBody?: string) => Promise<void>;
  onApprovalDecision: (
    ticketId: string,
    decision: 'approve' | 'decline'
  ) => Promise<void>;
  onSendAdminReply: (ticketId: string, body: string) => Promise<void>;
  onUpdateTicket: (
    ticketId: string,
    patch: {
      status?: TicketStatus;
      priority?: TicketPriority;
      topic?: string;
      aiPausedForHuman?: boolean;
    }
  ) => Promise<void>;
  onAutoTriageOpen: () => Promise<number>;
  onAnalyzeSentiment: (ticketId: string) => Promise<void>;
  onCreateKb: (
    article: Omit<KnowledgeArticle, 'id' | 'updatedAt'>
  ) => Promise<void>;
  onUpdateKb: (
    id: string,
    patch: Partial<Omit<KnowledgeArticle, 'id' | 'updatedAt'>>
  ) => Promise<void>;
  onDeleteKb: (id: string) => Promise<void>;
  onUploadKbPdf: (payload: {
    fileName: string;
    pdfBase64: string;
    title?: string;
    category?: KnowledgeArticle['category'];
  }) => Promise<KnowledgeArticle>;
  onDownloadKbPdf: (id: string, fileName?: string) => Promise<void>;
  onCreateCompanyPolicy: (
    policyDoc: Omit<CompanyPolicy, 'id' | 'updatedAt'>
  ) => Promise<void>;
  onUpdateCompanyPolicy: (
    id: string,
    patch: Partial<Omit<CompanyPolicy, 'id' | 'updatedAt'>>
  ) => Promise<void>;
  onDeleteCompanyPolicy: (id: string) => Promise<void>;
  onMarkNotificationRead: (id: string) => Promise<void>;
  onMarkAllNotificationsRead: () => Promise<void>;
}

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

function formatTimeOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function shortCustomerName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]} ${parts[1][0]}.`;
  return name;
}

export const DeskPilotAdmin: React.FC<DeskPilotAdminProps> = ({
  user,
  state,
  onViewWebsite,
  onSwitchAccount,
  onResetDemo,
  onUpdatePolicy,
  onRunAiOnTicket,
  onApproveSuggested,
  onApprovalDecision,
  onSendAdminReply,
  onUpdateTicket,
  onAutoTriageOpen,
  onAnalyzeSentiment,
  onCreateKb,
  onDeleteKb,
  onUploadKbPdf,
  onDownloadKbPdf,
  onCreateCompanyPolicy,
  onUpdateCompanyPolicy,
  onDeleteCompanyPolicy,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<'sentiment' | 'recent'>('sentiment');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(
    state.tickets[0]?.id ?? null
  );
  const [adminReply, setAdminReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [runningAiId, setRunningAiId] = useState<string | null>(null);
  const [scoringSentimentId, setScoringSentimentId] = useState<string | null>(null);
  const [triagingAll, setTriagingAll] = useState(false);
  const [editingSuggested, setEditingSuggested] = useState(false);
  const [suggestedDraft, setSuggestedDraft] = useState('');
  const [editingTicketMeta, setEditingTicketMeta] = useState(false);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [traceExpanded, setTraceExpanded] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Urgent & critical notifications UI state
  const [alertsOpen, setAlertsOpen] = useState(false);
  const seenNotificationIdsRef = useRef<Set<string>>(
    new Set(state.notifications.map((n) => n.id))
  );

  // Automation form local state
  const [policyForm, setPolicyForm] = useState<AgentPolicyConfig>(state.policy);
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Company policies local state
  const [newPolicyTitle, setNewPolicyTitle] = useState('');
  const [newPolicySummary, setNewPolicySummary] = useState('');
  const [newPolicyContent, setNewPolicyContent] = useState('');
  const [newPolicyEnabled, setNewPolicyEnabled] = useState(true);
  const [savingCompanyPolicy, setSavingCompanyPolicy] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [editPolicyTitle, setEditPolicyTitle] = useState('');
  const [editPolicySummary, setEditPolicySummary] = useState('');
  const [editPolicyContent, setEditPolicyContent] = useState('');

  // KB local state
  const [kbTitle, setKbTitle] = useState('');
  const [kbCategory, setKbCategory] =
    useState<KnowledgeArticle['category']>('Orders & Shipping');
  const [kbContent, setKbContent] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfTitleHint, setPdfTitleHint] = useState('');
  const [pdfCategoryHint, setPdfCategoryHint] = useState<
    '' | KnowledgeArticle['category']
  >('');
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfUploadError, setPdfUploadError] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPolicyForm(state.policy);
  }, [state.policy]);

  const unreadNotifications = useMemo(
    () => state.notifications.filter((n) => !n.read),
    [state.notifications]
  );

  useEffect(() => {
    for (const n of unreadNotifications) {
      if (!seenNotificationIdsRef.current.has(n.id)) {
        seenNotificationIdsRef.current.add(n.id);
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          window.Notification.permission === 'granted'
        ) {
          new window.Notification(`DeskPilot ${n.severity.toUpperCase()}: ${n.title}`, {
            body: `${n.customerName} (${n.ticketId}) — ${n.reason}`,
          });
        }
      }
    }
  }, [unreadNotifications]);

  const filteredTickets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return state.tickets;
    return state.tickets.filter(
      (t) =>
        t.id.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.topic.toLowerCase().includes(q)
    );
  }, [state.tickets, searchQuery]);

  const openTickets = useMemo(() => {
    const list = filteredTickets.filter((t) => t.status !== 'Resolved');
    if (sortMode === 'sentiment') {
      return [...list].sort(
        (a, b) => (a.sentimentScore ?? 50) - (b.sentimentScore ?? 50)
      );
    }
    return [...list].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [filteredTickets, sortMode]);

  const resolvedTickets = filteredTickets.filter((t) => t.status === 'Resolved');

  const activeTicket =
    state.tickets.find((t) => t.id === selectedTicketId) ??
    openTickets[0] ??
    state.tickets[0] ??
    null;

  const activeCustomer = activeTicket
    ? state.customers.find((c) => c.id === activeTicket.customerId)
    : undefined;

  useEffect(() => {
    setEditingSuggested(false);
    setSuggestedDraft(activeTicket?.aiSuggestedReply ?? '');
    setEditingTicketMeta(false);
    setShowProfileDrawer(false);
  }, [activeTicket?.id, activeTicket?.aiSuggestedReply]);

  const handleToggleAutoDeploy = async () => {
    const next = !state.policy.autoDeployEnabled;
    await onUpdatePolicy({ autoDeployEnabled: next });
    setNotice(
      next
        ? 'Automated Gemini responses deployed live to customer storefront.'
        : 'Switched to Review Mode — Gemini will draft suggested replies for approval.'
    );
    setTimeout(() => setNotice(null), 4000);
  };

  const handleRunAi = async (
    ticketId: string,
    mode: 'auto' | 'draft' | 'send'
  ) => {
    setRunningAiId(ticketId);
    setAdminError(null);
    try {
      await onRunAiOnTicket(ticketId, mode);
    } catch (err) {
      setAdminError(
        err instanceof Error ? err.message : 'Failed to run Gemini agent.'
      );
    } finally {
      setRunningAiId(null);
    }
  };

  const handleApproveAndSend = async () => {
    if (!activeTicket) return;
    setSendingReply(true);
    setAdminError(null);
    try {
      await onApproveSuggested(
        activeTicket.id,
        editingSuggested ? suggestedDraft : undefined
      );
      setEditingSuggested(false);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Send failed.');
    } finally {
      setSendingReply(false);
    }
  };

  const handleSendHumanReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !adminReply.trim()) return;
    setSendingReply(true);
    try {
      await onSendAdminReply(activeTicket.id, adminReply.trim());
      setAdminReply('');
    } finally {
      setSendingReply(false);
    }
  };

  const handleAutoTriageAll = async () => {
    setTriagingAll(true);
    setAdminError(null);
    try {
      const count = await onAutoTriageOpen();
      setNotice(`DeskPilot AI processed ${count} open ticket(s).`);
      setTimeout(() => setNotice(null), 4000);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Auto-triage failed.');
    } finally {
      setTriagingAll(false);
    }
  };

  const handleAnalyzeSentiment = async (ticketId: string) => {
    setScoringSentimentId(ticketId);
    setAdminError(null);
    try {
      await onAnalyzeSentiment(ticketId);
    } catch (err) {
      setAdminError(
        err instanceof Error ? err.message : 'Sentiment scoring failed.'
      );
    } finally {
      setScoringSentimentId(null);
    }
  };

  const handleSavePolicyForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPolicy(true);
    try {
      await onUpdatePolicy(policyForm);
      setNotice('Automation rules saved.');
      setTimeout(() => setNotice(null), 3000);
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleCreateKbSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kbTitle.trim() || !kbContent.trim()) return;
    await onCreateKb({
      title: kbTitle,
      category: kbCategory,
      summary: kbTitle,
      content: kbContent,
    });
    setKbTitle('');
    setKbContent('');
  };

  const handleUploadPdfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfFile) {
      setPdfUploadError('Select a PDF file first.');
      return;
    }
    if (pdfFile.size > 10 * 1024 * 1024) {
      setPdfUploadError('PDF exceeds the 10 MB size limit.');
      return;
    }
    setUploadingPdf(true);
    setPdfUploadError(null);
    setAdminError(null);
    try {
      const pdfBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          const commaIndex = result.indexOf(',');
          const raw = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
          if (!raw) {
            reject(new Error('Could not read PDF file contents.'));
            return;
          }
          resolve(raw);
        };
        reader.onerror = () =>
          reject(new Error('Failed to read selected PDF file.'));
        reader.readAsDataURL(pdfFile);
      });

      const uploaded = await onUploadKbPdf({
        fileName: pdfFile.name,
        pdfBase64,
        title: pdfTitleHint.trim() || undefined,
        category: pdfCategoryHint || undefined,
      });

      setPdfFile(null);
      setPdfTitleHint('');
      setPdfCategoryHint('');
      if (pdfInputRef.current) {
        pdfInputRef.current.value = '';
      }
      setNotice(
        `Gemini read "${uploaded.pdfFileName || uploaded.title}" and activated it in the Store Policy Knowledge Base.`
      );
      setTimeout(() => setNotice(null), 5000);
    } catch (err) {
      setPdfUploadError(
        err instanceof Error ? err.message : 'Failed to upload and read PDF.'
      );
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleDownloadPdf = async (id: string, fileName?: string) => {
    setPdfUploadError(null);
    try {
      await onDownloadKbPdf(id, fileName);
    } catch (err) {
      setPdfUploadError(
        err instanceof Error ? err.message : 'Failed to download stored PDF.'
      );
    }
  };

  const handleCreateCompanyPolicySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPolicyTitle.trim() || !newPolicyContent.trim()) return;
    setSavingCompanyPolicy(true);
    setAdminError(null);
    try {
      await onCreateCompanyPolicy({
        title: newPolicyTitle.trim(),
        summary: newPolicySummary.trim() || newPolicyTitle.trim(),
        content: newPolicyContent.trim(),
        enabledForAutomation: newPolicyEnabled,
      });
      setNewPolicyTitle('');
      setNewPolicySummary('');
      setNewPolicyContent('');
      setNewPolicyEnabled(true);
      setNotice('Company policy added to the automated DeskPilot system.');
      setTimeout(() => setNotice(null), 3500);
    } catch (err) {
      setAdminError(
        err instanceof Error ? err.message : 'Failed to create company policy.'
      );
    } finally {
      setSavingCompanyPolicy(false);
    }
  };

  const handleStartEditPolicy = (policyDoc: CompanyPolicy) => {
    setEditingPolicyId(policyDoc.id);
    setEditPolicyTitle(policyDoc.title);
    setEditPolicySummary(policyDoc.summary);
    setEditPolicyContent(policyDoc.content);
  };

  const handleSaveEditPolicy = async (id: string) => {
    if (!editPolicyTitle.trim() || !editPolicyContent.trim()) return;
    await onUpdateCompanyPolicy(id, {
      title: editPolicyTitle.trim(),
      summary: editPolicySummary.trim() || editPolicyTitle.trim(),
      content: editPolicyContent.trim(),
    });
    setEditingPolicyId(null);
    setNotice('Company policy updated for autonomous AI agents.');
    setTimeout(() => setNotice(null), 3000);
  };

  const handleJumpToAlertTicket = async (
    notificationId: string,
    ticketId: string
  ) => {
    setSelectedTicketId(ticketId);
    setActiveTab('inbox');
    setAlertsOpen(false);
    await onMarkNotificationRead(notificationId);
  };

  const handleEnableDesktopAlerts = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await window.Notification.requestPermission();
      if (permission === 'granted') {
        setNotice('Desktop alerts enabled for urgent and critical events.');
        setTimeout(() => setNotice(null), 3000);
      }
    }
  };

  return (
    <div className="h-screen flex overflow-hidden bg-[#111214] text-zinc-100">
      {/* Left Icon Rail */}
      <aside className="w-14 shrink-0 border-r border-white/[0.08] bg-[#141518] flex flex-col items-center justify-between py-3.5">
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('inbox')}
            title="DeskPilot AI Support Desk"
            className="w-9 h-9 rounded-lg bg-[#F5B74B] text-[#141518] flex items-center justify-center font-serif italic font-bold text-lg"
          >
            d
          </button>

          <nav className="flex flex-col items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => setActiveTab('inbox')}
              title="Inbox"
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                activeTab === 'inbox'
                  ? 'bg-white/[0.1] text-white'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('policies')}
              title="Company Policies"
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                activeTab === 'policies'
                  ? 'bg-white/[0.1] text-white'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('automation')}
              title="Automation & Deployment"
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                activeTab === 'automation'
                  ? 'bg-white/[0.1] text-white'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
            >
              <Sliders className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              title="Orders & Customers"
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                activeTab === 'orders'
                  ? 'bg-white/[0.1] text-white'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
            >
              <Package className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('kb')}
              title="Knowledge Base"
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                activeTab === 'kb'
                  ? 'bg-white/[0.1] text-white'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
            >
              <BookOpen className="h-4 w-4" />
            </button>
          </nav>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onResetDemo}
            title="Reset Demo Data"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onSwitchAccount}
            title="Switch Account / Sign Out"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:text-amber-400 hover:bg-white/[0.04] transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      {activeTab === 'inbox' ? (
        <div className="flex-1 flex min-w-0 min-h-0">
          {/* Conversation List Column */}
          <div className="w-[290px] shrink-0 border-r border-white/[0.08] bg-[#141518] flex flex-col min-h-0">
            <div className="px-4 pt-4 pb-3">
              <div className="font-serif italic text-xl text-[#F5B74B] leading-none">
                DeskPilot
              </div>
              <div className="mt-1 text-[10px] tracking-[0.14em] text-zinc-500 font-medium">
                AI SUPPORT DESK
              </div>

              <div className="mt-3.5 relative">
                <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversations"
                  className="w-full pl-8 pr-3 py-2 text-xs bg-[#1C1E22] border border-white/[0.08] rounded-lg text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-[#F5B74B]/60"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
              <div className="flex items-center justify-between px-1 text-[11px] font-medium text-zinc-500">
                <span>INBOX</span>
                <span className="font-mono tabular-nums">{state.tickets.length}</span>
              </div>

              {/* OPEN Section */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1 text-[11px] font-medium text-zinc-500">
                  <span>OPEN</span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-[#1C1E22] border border-white/[0.06] rounded p-0.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setSortMode('sentiment')}
                        className={`px-1.5 py-0.5 rounded transition-colors ${
                          sortMode === 'sentiment'
                            ? 'bg-white/[0.1] text-zinc-100'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        Urgency
                      </button>
                      <button
                        type="button"
                        onClick={() => setSortMode('recent')}
                        className={`px-1.5 py-0.5 rounded transition-colors ${
                          sortMode === 'recent'
                            ? 'bg-white/[0.1] text-zinc-100'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        Recent
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleAutoTriageAll}
                      disabled={triagingAll}
                      title="Auto-triage all open tickets with Gemini"
                      className="text-zinc-400 hover:text-[#F5B74B] transition-colors disabled:opacity-50"
                    >
                      {triagingAll ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {openTickets.map((t) => {
                  const selected = activeTicket?.id === t.id;
                  const priorityColor =
                    t.priority === 'P1'
                      ? 'text-red-400 bg-red-500/15'
                      : t.priority === 'P2'
                      ? 'text-[#F5B74B] bg-[#F5B74B]/15'
                      : 'text-emerald-400 bg-emerald-500/15';
                  const score = t.sentimentScore;
                  const sentimentClass =
                    score === null
                      ? 'text-zinc-500'
                      : score <= 30
                      ? 'text-red-400'
                      : score <= 55
                      ? 'text-amber-300'
                      : score <= 79
                      ? 'text-zinc-400'
                      : 'text-emerald-400';

                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTicketId(t.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selected
                          ? 'bg-[#1D1F24] border-white/[0.12]'
                          : 'bg-transparent border-transparent hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-100 truncate">
                          {shortCustomerName(t.customerName)}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {score !== null && (
                            <span
                              className={`font-mono text-[10px] font-medium tabular-nums ${sentimentClass}`}
                              title={t.sentimentReason || 'Gemini Sentiment Score'}
                            >
                              {score}/100 {t.sentimentLabel ?? ''}
                            </span>
                          )}
                          <span
                            className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded ${priorityColor}`}
                          >
                            {t.priority}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-zinc-300 line-clamp-1">
                        {t.subject}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500 truncate">
                        <span>{t.topic}</span>
                        {t.humanRequested && (
                          <>
                            <span>·</span>
                            <span className="text-red-400 font-medium">
                              Human Req
                            </span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* RESOLVED Section */}
              <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
                <div className="flex items-center justify-between px-1 text-[11px] font-medium text-zinc-500">
                  <span>RESOLVED</span>
                  <span className="font-mono tabular-nums">
                    {resolvedTickets.length}
                  </span>
                </div>
                {resolvedTickets.map((t) => {
                  const selected = activeTicket?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTicketId(t.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selected
                          ? 'bg-[#1D1F24] border-white/[0.12]'
                          : 'bg-transparent border-transparent hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-zinc-300 truncate">
                          {shortCustomerName(t.customerName)}
                        </span>
                        <div className="flex items-center gap-2 shrink-0 text-[11px]">
                          {t.sentimentScore !== null && (
                            <span className="font-mono tabular-nums text-emerald-400">
                              {t.sentimentScore}/100
                            </span>
                          )}
                          <span className="text-zinc-500">Closed</span>
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-zinc-400 line-clamp-1">
                        {t.subject}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Center Conversation Column */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#111214]">
            {/* Top Workspace Header */}
            <header className="h-14 shrink-0 px-6 border-b border-white/[0.08] flex items-center justify-between gap-4">
              <div className="text-xs font-medium tracking-wider text-zinc-500 whitespace-nowrap">
                WORKSPACE <span className="mx-1.5 text-zinc-700">/</span>{' '}
                <span className="text-zinc-200">INBOX</span>
              </div>

              <div className="flex items-center gap-3 shrink-0 relative">
                <button
                  type="button"
                  onClick={handleToggleAutoDeploy}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    state.policy.autoDeployEnabled
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15'
                  }`}
                >
                  {state.policy.autoDeployEnabled
                    ? 'Autonomous Mode: Fast & Live'
                    : 'Mode: Review Before Send'}
                </button>

                {/* Urgent & Critical Notifications Bell */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAlertsOpen((v) => !v)}
                    title="Urgent & Critical Alerts"
                    className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                      unreadNotifications.length > 0
                        ? 'border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/20'
                        : 'border-white/[0.1] text-zinc-300 hover:text-white'
                    }`}
                  >
                    <Bell className="h-3.5 w-3.5" />
                    <span className="font-mono tabular-nums">
                      {unreadNotifications.length}
                    </span>
                  </button>

                  {alertsOpen && (
                    <div className="absolute right-0 mt-2 w-96 bg-[#191B1F] border border-white/[0.12] rounded-xl shadow-2xl z-40 overflow-hidden">
                      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-white">
                          Urgent &amp; Critical Alerts ({unreadNotifications.length} unread)
                        </div>
                        <div className="flex items-center gap-3 text-[11px]">
                          {typeof window !== 'undefined' &&
                            'Notification' in window &&
                            window.Notification.permission !== 'granted' && (
                              <button
                                type="button"
                                onClick={handleEnableDesktopAlerts}
                                className="text-[#F5B74B] hover:underline"
                              >
                                Desktop alerts
                              </button>
                            )}
                          {unreadNotifications.length > 0 && (
                            <button
                              type="button"
                              onClick={() => void onMarkAllNotificationsRead()}
                              className="text-zinc-400 hover:text-white"
                            >
                              Mark all read
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="max-h-80 overflow-y-auto divide-y divide-white/[0.06]">
                        {state.notifications.length === 0 ? (
                          <div className="p-5 text-xs text-zinc-500 text-center">
                            No urgent or critical notifications right now.
                          </div>
                        ) : (
                          state.notifications.map((n) => (
                            <div
                              key={n.id}
                              className={`p-3.5 space-y-1.5 ${
                                n.read ? 'opacity-60' : 'bg-red-500/[0.04]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span
                                  className={`font-mono font-semibold uppercase ${
                                    n.severity === 'critical'
                                      ? 'text-red-400'
                                      : 'text-amber-300'
                                  }`}
                                >
                                  {n.severity} · {n.ticketId}
                                </span>
                                <span className="font-mono text-zinc-500 tabular-nums">
                                  {formatTimeOnly(n.createdAt)}
                                </span>
                              </div>
                              <div className="text-xs font-semibold text-zinc-100">
                                {n.customerName} — {n.title}
                              </div>
                              <p className="text-[11px] text-zinc-400 leading-relaxed">
                                {n.reason}
                              </p>
                              <div className="pt-1 flex items-center justify-between">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleJumpToAlertTicket(n.id, n.ticketId)
                                  }
                                  className="text-[11px] font-medium text-[#F5B74B] hover:underline"
                                >
                                  Open ticket →
                                </button>
                                {!n.read && (
                                  <button
                                    type="button"
                                    onClick={() => void onMarkNotificationRead(n.id)}
                                    className="text-[11px] text-zinc-500 hover:text-zinc-200"
                                  >
                                    Dismiss
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('policies')}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white border border-white/[0.1] rounded-lg transition-colors whitespace-nowrap"
                >
                  Policies ({state.companyPolicies.filter((p) => p.enabledForAutomation).length})
                </button>

                <button
                  type="button"
                  onClick={onViewWebsite}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white border border-white/[0.1] rounded-lg transition-colors whitespace-nowrap"
                >
                  <span>Storefront</span>
                  <ExternalLink className="h-3 w-3" />
                </button>

                <button
                  type="button"
                  onClick={onSwitchAccount}
                  title={`Signed in as ${user.name} — Click to switch account`}
                  className="w-8 h-8 rounded-full bg-[#D99B72] text-[#141518] text-xs font-semibold flex items-center justify-center shrink-0"
                >
                  {getInitials(user.name)}
                </button>
              </div>
            </header>

            {unreadNotifications.length > 0 && (
              <div className="px-6 py-2 bg-red-500/10 border-b border-red-500/25 flex flex-wrap items-center justify-between gap-3 text-xs text-red-200">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                  <span className="truncate">
                    <span className="font-semibold text-red-300 uppercase">
                      {unreadNotifications[0].severity}:
                    </span>{' '}
                    {unreadNotifications[0].customerName} ({unreadNotifications[0].ticketId}) —{' '}
                    {unreadNotifications[0].title}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      void handleJumpToAlertTicket(
                        unreadNotifications[0].id,
                        unreadNotifications[0].ticketId
                      )
                    }
                    className="font-semibold text-[#F5B74B] hover:underline whitespace-nowrap"
                  >
                    Inspect Case →
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void onMarkNotificationRead(unreadNotifications[0].id)
                    }
                    className="text-zinc-400 hover:text-white whitespace-nowrap"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {notice && (
              <div className="px-6 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-xs text-emerald-300">
                {notice}
              </div>
            )}
            {adminError && (
              <div className="px-6 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-300 flex items-center justify-between">
                <span>{adminError}</span>
                <button
                  type="button"
                  onClick={() => setAdminError(null)}
                  className="underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {!activeTicket ? (
              <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">
                Select a conversation from the inbox.
              </div>
            ) : (
              <>
                {/* Conversation Subject Header */}
                <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#D99B72] text-[#141518] text-xs font-semibold flex items-center justify-center shrink-0">
                      {getInitials(activeTicket.customerName)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-100 truncate">
                        {activeTicket.customerName}
                      </div>
                      <div className="text-xs text-zinc-400 truncate">
                        Customer · Online store
                        {activeTicket.orderId ? ` · ${activeTicket.orderId}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateTicket(activeTicket.id, {
                          status:
                            activeTicket.status === 'Resolved'
                              ? 'Open'
                              : 'Resolved',
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-zinc-200 bg-[#1D1F24] hover:bg-[#252830] border border-white/[0.1] rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>
                        {activeTicket.status === 'Resolved'
                          ? 'Reopen'
                          : 'Resolve'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Human Assistance Banner */}
                {activeTicket.humanRequested && (
                  <div className="px-6 py-2.5 bg-red-500/10 border-b border-red-500/20 flex flex-wrap items-center justify-between gap-3 text-xs text-red-200">
                    <span>
                      Customer requested human assistance:{' '}
                      <span className="text-red-100 font-medium">
                        {activeTicket.humanRequestedReason}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateTicket(activeTicket.id, {
                          aiPausedForHuman: false,
                          status: 'Open',
                        })
                      }
                      className="text-xs font-medium text-amber-300 hover:underline whitespace-nowrap"
                    >
                      Resume AI Auto-Reply
                    </button>
                  </div>
                )}

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                  {activeTicket.messages.map((msg) => {
                    const isCustomer = msg.role === 'customer';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${
                          isCustomer ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div className="text-[11px] text-zinc-500 mb-1.5">
                          {msg.authorName} · {formatTimeOnly(msg.createdAt)}
                        </div>

                        <div
                          className={`flex items-end gap-2.5 max-w-[82%] ${
                            isCustomer ? 'flex-row-reverse' : 'flex-row'
                          }`}
                        >
                          {!isCustomer && (
                            <div
                              className={`w-7 h-7 rounded-md flex items-center justify-center text-xs shrink-0 ${
                                msg.role === 'admin'
                                  ? 'bg-[#D99B72] text-[#141518] font-semibold'
                                  : 'bg-[#1E2025] border border-white/[0.08] font-serif italic text-[#F5B74B]'
                              }`}
                            >
                              {msg.role === 'admin' ? 'PS' : 'd'}
                            </div>
                          )}

                          <div
                            className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                              isCustomer
                                ? 'bg-[#F2EDE4] text-[#18181B]'
                                : 'bg-[#1E2025] border border-white/[0.07] text-zinc-100'
                            }`}
                          >
                            <div>{msg.body}</div>

                            {msg.toolChips && msg.toolChips.length > 0 && (
                              <div className="mt-2.5 flex flex-wrap gap-1.5">
                                {msg.toolChips.map((chip, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono text-[#F5B74B] bg-[#F5B74B]/10 border border-[#F5B74B]/30 rounded"
                                  >
                                    {chip.label}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div
                              className={`mt-1.5 text-[10px] font-mono tabular-nums ${
                                isCustomer ? 'text-zinc-500' : 'text-zinc-500'
                              }`}
                            >
                              {formatTimeOnly(msg.createdAt)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Human Admin Reply Bar */}
                <form
                  onSubmit={handleSendHumanReply}
                  className="px-6 py-4 border-t border-white/[0.08] bg-[#141518] flex items-center gap-3"
                >
                  <input
                    type="text"
                    value={adminReply}
                    onChange={(e) => setAdminReply(e.target.value)}
                    placeholder={`Reply to ${activeTicket.customerName} as ${user.name}...`}
                    className="flex-1 px-3.5 py-2.5 text-sm bg-[#1C1E22] border border-white/[0.08] rounded-lg text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-[#F5B74B]/60"
                  />
                  <button
                    type="button"
                    disabled={runningAiId === activeTicket.id}
                    onClick={() => handleRunAi(activeTicket.id, 'draft')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-zinc-200 bg-[#1D1F24] hover:bg-[#252830] border border-white/[0.1] rounded-lg whitespace-nowrap disabled:opacity-50"
                  >
                    {runningAiId === activeTicket.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-[#F5B74B]" />
                    )}
                    <span>Draft AI</span>
                  </button>
                  <button
                    type="submit"
                    disabled={sendingReply || !adminReply.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-[#141518] bg-[#F5B74B] hover:bg-amber-300 rounded-lg whitespace-nowrap disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Send Human Reply</span>
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Right Ticket Details Inspector */}
          {activeTicket && (
            <aside className="hidden xl:flex w-[328px] shrink-0 border-l border-white/[0.08] bg-[#141518] flex-col overflow-y-auto p-4 space-y-3.5">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-zinc-100">
                  Ticket details
                </h2>
              </div>

              {/* CUSTOMER CARD */}
              <div className="bg-[#191B1F] border border-white/[0.08] rounded-xl p-4 space-y-3.5">
                <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500">
                  <span>CUSTOMER</span>
                  <button
                    type="button"
                    onClick={() => setShowProfileDrawer((v) => !v)}
                    className="text-zinc-300 hover:text-white"
                  >
                    {showProfileDrawer ? 'HIDE PROFILE' : 'VIEW PROFILE ↗'}
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#D99B72] text-[#141518] text-xs font-semibold flex items-center justify-center shrink-0">
                    {getInitials(activeTicket.customerName)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-100 truncate">
                      {activeTicket.customerName}
                    </div>
                    <div className="text-xs text-zinc-400 truncate">
                      {activeTicket.customerEmail}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
                  <div>
                    <div className="text-[10px] text-zinc-500">ORDERS</div>
                    <div className="mt-0.5 font-medium text-zinc-100 tabular-nums">
                      {activeCustomer?.ordersCount ?? 1} orders
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500">LIFETIME VALUE</div>
                    <div className="mt-0.5 font-mono font-medium text-zinc-100 tabular-nums">
                      {formatInr(activeCustomer?.lifetimeValueInr ?? 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500">SEGMENT</div>
                    <div className="mt-0.5 font-medium text-zinc-100">
                      {activeCustomer?.segment ?? 'Returning'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500">LAST ORDER</div>
                    <div className="mt-0.5 font-medium text-zinc-100">
                      {activeCustomer?.lastOrderLabel ?? 'Recent'}
                    </div>
                  </div>
                </div>

                {showProfileDrawer && activeCustomer && (
                  <div className="pt-3 border-t border-white/[0.08] text-xs text-zinc-400 space-y-1">
                    <div className="text-zinc-500 text-[10px]">SHIPPING ADDRESS</div>
                    <div className="text-zinc-300">{activeCustomer.address}</div>
                  </div>
                )}
              </div>

              {/* TICKET CARD */}
              <div className="bg-[#191B1F] border border-white/[0.08] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500">
                  <span>TICKET</span>
                  <button
                    type="button"
                    onClick={() => setEditingTicketMeta((v) => !v)}
                    className="text-zinc-300 hover:text-white"
                  >
                    {editingTicketMeta ? 'DONE' : 'EDIT'}
                  </button>
                </div>

                {editingTicketMeta ? (
                  <div className="space-y-2.5 text-xs">
                    <div>
                      <label className="text-[10px] text-zinc-500 block mb-1">
                        STATUS
                      </label>
                      <select
                        value={activeTicket.status}
                        onChange={(e) =>
                          onUpdateTicket(activeTicket.id, {
                            status: e.target.value as TicketStatus,
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-[#111214] border border-white/[0.1] rounded text-zinc-100"
                      >
                        <option value="Open">Open</option>
                        <option value="AI Handled">AI Handled</option>
                        <option value="Human Requested">Human Requested</option>
                        <option value="Pending Approval">Pending Approval</option>
                        <option value="Resolved">Resolved</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 block mb-1">
                        PRIORITY
                      </label>
                      <select
                        value={activeTicket.priority}
                        onChange={(e) =>
                          onUpdateTicket(activeTicket.id, {
                            priority: e.target.value as TicketPriority,
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-[#111214] border border-white/[0.1] rounded text-zinc-100"
                      >
                        <option value="P1">P1 · Urgent</option>
                        <option value="P2">P2 · High</option>
                        <option value="P3">P3 · Normal</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-[10px] text-zinc-500">ID</div>
                      <div className="mt-0.5 font-mono text-zinc-100">
                        {activeTicket.id}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500">STATUS</div>
                      <div
                        className={`mt-0.5 font-medium ${
                          activeTicket.status === 'Human Requested'
                            ? 'text-red-400'
                            : activeTicket.status === 'Resolved'
                            ? 'text-emerald-400'
                            : 'text-[#F5B74B]'
                        }`}
                      >
                        {activeTicket.status}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500">PRIORITY</div>
                      <div
                        className={`mt-0.5 font-medium ${
                          activeTicket.priority === 'P1'
                            ? 'text-red-400'
                            : activeTicket.priority === 'P2'
                            ? 'text-amber-300'
                            : 'text-rose-300'
                        }`}
                      >
                        {activeTicket.priorityLabel}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500">SLA DUE</div>
                      <div className="mt-0.5 font-medium text-[#F5B74B] tabular-nums">
                        {activeTicket.slaDueLabel}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500">ASSIGNED TO</div>
                      <div className="mt-0.5 font-medium text-zinc-100">
                        {activeTicket.assignedTo}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500">TOPIC</div>
                      <div className="mt-0.5 font-medium text-zinc-100">
                        {activeTicket.topic}
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-white/[0.08] space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-500 font-medium">
                      SENTIMENT (GEMINI)
                    </span>
                    <button
                      type="button"
                      disabled={scoringSentimentId === activeTicket.id}
                      onClick={() => handleAnalyzeSentiment(activeTicket.id)}
                      className="text-[#F5B74B] hover:underline disabled:opacity-50"
                    >
                      {scoringSentimentId === activeTicket.id
                        ? 'Scoring...'
                        : 'Re-score'}
                    </button>
                  </div>

                  {activeTicket.sentimentScore !== null ? (
                    <>
                      <div className="flex items-baseline justify-between">
                        <span
                          className={`text-xs font-semibold ${
                            activeTicket.sentimentScore <= 30
                              ? 'text-red-400'
                              : activeTicket.sentimentScore <= 55
                              ? 'text-amber-300'
                              : activeTicket.sentimentScore <= 79
                              ? 'text-zinc-200'
                              : 'text-emerald-400'
                          }`}
                        >
                          {activeTicket.sentimentLabel}
                        </span>
                        <span className="font-mono text-xs font-semibold tabular-nums text-zinc-100">
                          {activeTicket.sentimentScore}/100
                        </span>
                      </div>
                      {activeTicket.sentimentReason && (
                        <p className="text-[11px] text-zinc-400 leading-relaxed">
                          {activeTicket.sentimentReason}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="text-[11px] text-zinc-500">
                      Not scored yet. Click Re-score to analyze with Gemini.
                    </div>
                  )}
                </div>
              </div>

              {/* Pending Approval Box (when refund > cap) */}
              {activeTicket.pendingApproval && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
                  <div className="text-[11px] font-semibold text-[#F5B74B]">
                    REFUND APPROVAL REQUIRED
                  </div>
                  <div className="text-xs text-zinc-200 leading-relaxed">
                    Gemini queued a{' '}
                    <span className="font-mono font-semibold">
                      {formatInr(activeTicket.pendingApproval.amountInr ?? 0)}
                    </span>{' '}
                    refund for {activeTicket.pendingApproval.orderId}:{' '}
                    {activeTicket.pendingApproval.reason}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onApprovalDecision(activeTicket.id, 'approve')
                      }
                      className="py-2 text-xs font-semibold text-[#141518] bg-[#F5B74B] hover:bg-amber-300 rounded-lg"
                    >
                      Approve refund
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onApprovalDecision(activeTicket.id, 'decline')
                      }
                      className="py-2 text-xs font-medium text-zinc-200 bg-[#1E2025] border border-white/[0.1] hover:bg-white/[0.05] rounded-lg"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}

              {/* AI SUGGESTED REPLY CARD */}
              <div className="bg-[#191B1F] border border-white/[0.08] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-[11px] font-medium">
                  <span className="text-zinc-400">✦ AI SUGGESTED REPLY</span>
                  <span className="text-emerald-400">
                    {activeTicket.aiSuggestedReply ? 'READY' : 'STANDBY'}
                  </span>
                </div>

                {activeTicket.aiSuggestedReply ? (
                  <>
                    {editingSuggested ? (
                      <textarea
                        rows={5}
                        value={suggestedDraft}
                        onChange={(e) => setSuggestedDraft(e.target.value)}
                        className="w-full p-2.5 text-xs bg-[#111214] border border-white/[0.12] rounded-lg text-zinc-100 leading-relaxed focus:outline-none focus:border-[#F5B74B]"
                      />
                    ) : (
                      <p className="text-xs text-zinc-200 leading-relaxed">
                        {activeTicket.aiSuggestedReply}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span>
                        Grounded in {activeTicket.aiGroundedSources || 1} source
                      </span>
                      <span className="tabular-nums">
                        {activeTicket.aiSuggestedConfidence ?? 98}% confidence
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={sendingReply}
                        onClick={handleApproveAndSend}
                        className="py-2 px-3 text-xs font-semibold text-[#141518] bg-[#F5B74B] hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                      >
                        Approve &amp; send
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingSuggested((v) => !v)}
                        className="py-2 px-3 text-xs font-medium text-zinc-200 bg-[#1E2025] hover:bg-[#272A30] border border-white/[0.1] rounded-lg transition-colors whitespace-nowrap"
                      >
                        {editingSuggested ? 'Preview' : 'Edit'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {state.policy.autoDeployEnabled
                        ? 'Auto-Response is deployed. Click below to run Gemini immediately on this thread.'
                        : 'Generate a grounded Gemini draft for review before sending.'}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={runningAiId === activeTicket.id}
                        onClick={() => handleRunAi(activeTicket.id, 'send')}
                        className="py-2 px-3 text-xs font-semibold text-[#141518] bg-[#F5B74B] hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                      >
                        {runningAiId === activeTicket.id
                          ? 'Running...'
                          : 'Auto-respond'}
                      </button>
                      <button
                        type="button"
                        disabled={runningAiId === activeTicket.id}
                        onClick={() => handleRunAi(activeTicket.id, 'draft')}
                        className="py-2 px-3 text-xs font-medium text-zinc-200 bg-[#1E2025] hover:bg-[#272A30] border border-white/[0.1] rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                      >
                        Draft reply
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Gemini Tool Trace */}
              <div className="bg-[#191B1F] border border-white/[0.08] rounded-xl p-4">
                <button
                  type="button"
                  onClick={() => setTraceExpanded((v) => !v)}
                  className="w-full flex items-center justify-between text-xs font-medium text-zinc-300"
                >
                  <span>
                    Gemini Tool Trace ({activeTicket.agentTrace.length})
                  </span>
                  {traceExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
                  )}
                </button>
                {traceExpanded && (
                  <div className="mt-3 space-y-2">
                    {activeTicket.agentTrace.length === 0 ? (
                      <div className="text-[11px] text-zinc-500">
                        No tool calls recorded yet.
                      </div>
                    ) : (
                      activeTicket.agentTrace.map((step) => (
                        <div
                          key={step.id}
                          className="p-2.5 bg-[#111214] border border-white/[0.06] rounded-lg space-y-1 text-[11px]"
                        >
                          <div className="flex items-center justify-between font-mono">
                            <span className="text-[#F5B74B]">{step.toolName}</span>
                            <span className="text-zinc-500 tabular-nums">
                              {step.durationMs}ms
                            </span>
                          </div>
                          <pre className="font-mono text-[10px] text-zinc-400 whitespace-pre-wrap break-all">
                            {JSON.stringify(step.result)}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      ) : activeTab === 'policies' ? (
        <div className="flex-1 overflow-y-auto p-8 max-w-6xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-xl font-semibold text-white">
                Company Policies for Autonomous System
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                DeskPilot AI and the customer chatbot automatically enforce all active policies below without waiting for manual admin intervention.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('inbox')}
                className="px-3.5 py-2 text-xs font-medium text-zinc-200 border border-white/[0.1] rounded-lg hover:bg-white/[0.05]"
              >
                Back to Inbox
              </button>
              <button
                type="button"
                onClick={onViewWebsite}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#141518] bg-[#F5B74B] hover:bg-amber-300 rounded-lg"
              >
                <span>View on Storefront</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {notice && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300">
              {notice}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Existing Company Policies List */}
            <div className="lg:col-span-7 space-y-3">
              {state.companyPolicies.map((pol) => {
                const isEditing = editingPolicyId === pol.id;
                return (
                  <div
                    key={pol.id}
                    className="bg-[#191B1F] border border-white/[0.08] rounded-xl p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 text-xs">
                        <span className="font-mono text-[#F5B74B]">{pol.id}</span>
                        <span className="text-zinc-600">·</span>
                        <button
                          type="button"
                          onClick={() =>
                            void onUpdateCompanyPolicy(pol.id, {
                              enabledForAutomation: !pol.enabledForAutomation,
                            })
                          }
                          className={`font-medium transition-colors ${
                            pol.enabledForAutomation
                              ? 'text-emerald-400 hover:text-emerald-300'
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {pol.enabledForAutomation
                            ? 'Active in Autonomous AI'
                            : 'Paused from AI'}
                        </button>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() =>
                            isEditing
                              ? setEditingPolicyId(null)
                              : handleStartEditPolicy(pol)
                          }
                          className="inline-flex items-center gap-1 text-zinc-400 hover:text-white"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>{isEditing ? 'Cancel' : 'Edit'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteCompanyPolicy(pol.id)}
                          className="text-zinc-500 hover:text-red-400"
                          title="Delete policy"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2.5 pt-1">
                        <input
                          type="text"
                          value={editPolicyTitle}
                          onChange={(e) => setEditPolicyTitle(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-semibold bg-[#111214] border border-white/[0.12] rounded-lg text-white"
                        />
                        <input
                          type="text"
                          value={editPolicySummary}
                          onChange={(e) => setEditPolicySummary(e.target.value)}
                          placeholder="Short summary"
                          className="w-full px-3 py-1.5 text-xs bg-[#111214] border border-white/[0.12] rounded-lg text-zinc-300"
                        />
                        <textarea
                          rows={4}
                          value={editPolicyContent}
                          onChange={(e) => setEditPolicyContent(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-[#111214] border border-white/[0.12] rounded-lg text-zinc-200 leading-relaxed"
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => void handleSaveEditPolicy(pol.id)}
                            className="px-4 py-1.5 text-xs font-semibold text-[#141518] bg-[#F5B74B] hover:bg-amber-300 rounded-lg"
                          >
                            Save Policy
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <h2 className="text-sm font-semibold text-white">
                            {pol.title}
                          </h2>
                          <div className="text-xs text-zinc-400 mt-0.5">
                            {pol.summary}
                          </div>
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed">
                          {pol.content}
                        </p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add New Company Policy Form */}
            <form
              onSubmit={handleCreateCompanyPolicySubmit}
              className="lg:col-span-5 bg-[#191B1F] border border-white/[0.08] rounded-xl p-5 space-y-4"
            >
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Add Company Policy
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  New policies take effect immediately for all autonomous Gemini chatbot &amp; agent replies.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Policy Title
                </label>
                <input
                  type="text"
                  required
                  value={newPolicyTitle}
                  onChange={(e) => setNewPolicyTitle(e.target.value)}
                  placeholder="e.g. GIFT CARD POLICY or EXCHANGE SLA"
                  className="w-full px-3 py-2 text-xs bg-[#111214] border border-white/[0.1] rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Short Summary
                </label>
                <input
                  type="text"
                  value={newPolicySummary}
                  onChange={(e) => setNewPolicySummary(e.target.value)}
                  placeholder="1-line overview for storefront & admin"
                  className="w-full px-3 py-2 text-xs bg-[#111214] border border-white/[0.1] rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Policy Details &amp; Automated Rules
                </label>
                <textarea
                  rows={5}
                  required
                  value={newPolicyContent}
                  onChange={(e) => setNewPolicyContent(e.target.value)}
                  placeholder="Write exact eligibility windows, refund rules, and instructions for the automated AI system..."
                  className="w-full px-3 py-2 text-xs bg-[#111214] border border-white/[0.1] rounded-lg text-white leading-relaxed"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newPolicyEnabled}
                  onChange={(e) => setNewPolicyEnabled(e.target.checked)}
                  className="rounded border-white/20 bg-[#111214]"
                />
                <span>Enable immediately for automated Gemini responses</span>
              </label>

              <button
                type="submit"
                disabled={savingCompanyPolicy}
                className="w-full py-2.5 text-xs font-semibold text-[#141518] bg-[#F5B74B] hover:bg-amber-300 rounded-lg disabled:opacity-50"
              >
                {savingCompanyPolicy ? 'Adding Policy...' : 'Add Company Policy'}
              </button>
            </form>
          </div>
        </div>
      ) : activeTab === 'automation' ? (
        <div className="flex-1 overflow-y-auto p-8 max-w-4xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-xl font-semibold text-white">
                Deploy &amp; Automate Gemini Responses
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                Run DeskPilot AI autonomously at maximum speed—no admin waiting required except when urgent or critical conditions occur.
              </p>
            </div>
            <button
              type="button"
              onClick={onViewWebsite}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-200 border border-white/[0.1] rounded-lg hover:bg-white/[0.05]"
            >
              <span>Test on Storefront</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>

          {notice && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300">
              {notice}
            </div>
          )}

          <form
            onSubmit={handleSavePolicyForm}
            className="bg-[#191B1F] border border-white/[0.08] rounded-xl p-6 space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() =>
                  setPolicyForm({ ...policyForm, autoDeployEnabled: true })
                }
                className={`text-left p-4 rounded-xl border transition-colors ${
                  policyForm.autoDeployEnabled
                    ? 'border-[#F5B74B] bg-[#F5B74B]/10'
                    : 'border-white/[0.08] hover:border-white/[0.2]'
                }`}
              >
                <div className="text-sm font-semibold text-white">
                  Deploy Automated Responses
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  Gemini inspects orders, executes safe actions, and replies directly to customers on the storefront in real time.
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  setPolicyForm({ ...policyForm, autoDeployEnabled: false })
                }
                className={`text-left p-4 rounded-xl border transition-colors ${
                  !policyForm.autoDeployEnabled
                    ? 'border-[#F5B74B] bg-[#F5B74B]/10'
                    : 'border-white/[0.08] hover:border-white/[0.2]'
                }`}
              >
                <div className="text-sm font-semibold text-white">
                  Draft &amp; Approve Mode
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  Gemini prepares an AI Suggested Reply in the right inspector for Priya S. to Approve &amp; send.
                </p>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Auto-Refund Cap (INR)
                </label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={policyForm.autoRefundLimitInr}
                  onChange={(e) =>
                    setPolicyForm({
                      ...policyForm,
                      autoRefundLimitInr: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#111214] border border-white/[0.1] rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Gemini Reasoning Depth
                </label>
                <select
                  value={policyForm.thinkingLevel}
                  onChange={(e) =>
                    setPolicyForm({
                      ...policyForm,
                      thinkingLevel: e.target.value as AgentPolicyConfig['thinkingLevel'],
                    })
                  }
                  className="w-full px-3 py-2 text-sm bg-[#111214] border border-white/[0.1] rounded-lg text-white"
                >
                  <option value="LOW">Low (Fastest)</option>
                  <option value="MEDIUM">Medium (Balanced)</option>
                  <option value="HIGH">High (Deep Verification)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Brand Voice
              </label>
              <textarea
                rows={2}
                value={policyForm.brandVoice}
                onChange={(e) =>
                  setPolicyForm({ ...policyForm, brandVoice: e.target.value })
                }
                className="w-full px-3 py-2 text-sm bg-[#111214] border border-white/[0.1] rounded-lg text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Human Escalation Policy
              </label>
              <textarea
                rows={2}
                value={policyForm.escalationRules}
                onChange={(e) =>
                  setPolicyForm({
                    ...policyForm,
                    escalationRules: e.target.value,
                  })
                }
                className="w-full px-3 py-2 text-sm bg-[#111214] border border-white/[0.1] rounded-lg text-white"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingPolicy}
                className="px-5 py-2 text-xs font-semibold text-[#141518] bg-[#F5B74B] hover:bg-amber-300 rounded-lg"
              >
                {savingPolicy ? 'Saving...' : 'Save & Deploy Configuration'}
              </button>
            </div>
          </form>
        </div>
      ) : activeTab === 'orders' ? (
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          <div>
            <h1 className="font-display text-xl font-semibold text-white">
              D2C Orders &amp; Payment Ledger
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Live storefront orders updated automatically by Gemini tools.
            </p>
          </div>
          <div className="bg-[#191B1F] border border-white/[0.08] rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs text-zinc-400">
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Items</th>
                  <th className="py-3 px-4">Payment Status</th>
                  <th className="py-3 px-4">Order Status</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-xs">
                {state.orders.map((o) => (
                  <tr key={o.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4 font-mono font-medium text-[#F5B74B]">
                      {o.id}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-zinc-100 font-medium">{o.customerName}</div>
                      <div className="text-zinc-500">{o.customerEmail}</div>
                    </td>
                    <td className="py-3 px-4 text-zinc-300">
                      {o.items
                        .map((i) => `${i.name} (${i.size}) × ${i.quantity}`)
                        .join(', ')}
                    </td>
                    <td
                      className={`py-3 px-4 font-medium ${
                        o.paymentStatus === 'Duplicate Charge' ||
                        o.paymentStatus.includes('Pending')
                          ? 'text-amber-400'
                          : o.paymentStatus === 'Refunded'
                          ? 'text-sky-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {o.paymentStatus}
                    </td>
                    <td className="py-3 px-4 text-zinc-300">{o.orderStatus}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-100">
                      {formatInr(o.totalInr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-8 max-w-6xl space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-xl font-semibold text-white">
                Store Policy Knowledge Base
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                Upload PDF store policies or write rules manually. Gemini reads uploaded PDFs and uses them autonomously for refunds, exchanges, cancellations, and customer replies.
              </p>
            </div>
            {notice && (
              <div className="px-3.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                {notice}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 space-y-3">
              {state.knowledgeBase.map((a) => (
                <div
                  key={a.id}
                  className="bg-[#191B1F] border border-white/[0.08] rounded-xl p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xs font-mono text-[#F5B74B] shrink-0">
                        {a.id} · {a.category}
                      </span>
                      {a.sourceType === 'pdf' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-sky-300 truncate">
                          <FileText className="h-3 w-3 shrink-0" />
                          PDF · {a.pdfFileName || 'policy.pdf'} (
                          {Math.max(1, Math.round((a.pdfSizeBytes || 1024) / 1024))}{' '}
                          KB)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      {a.sourceType === 'pdf' && a.pdfStoredFile && (
                        <button
                          type="button"
                          onClick={() => void handleDownloadPdf(a.id, a.pdfFileName)}
                          className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-[#F5B74B] transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download PDF
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteKb(a.id)}
                        title="Delete policy"
                        className="text-zinc-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-white">{a.title}</div>
                  {a.summary && a.summary !== a.title && (
                    <div className="text-xs text-zinc-400">{a.summary}</div>
                  )}
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
                    {a.content}
                  </p>
                </div>
              ))}
            </div>

            <div className="lg:col-span-5 space-y-5">
              <form
                onSubmit={handleUploadPdfSubmit}
                className="bg-[#191B1F] border border-[#F5B74B]/30 rounded-xl p-5 space-y-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Upload className="h-4 w-4 text-[#F5B74B]" />
                    <span>Upload Store Policy PDF</span>
                  </div>
                  <span className="text-[11px] font-mono text-[#F5B74B]">
                    Gemini AI Reader
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Gemini reads your PDF document, extracts actionable rules into the Knowledge Base, and inspects the original PDF whenever detailed clauses are needed.
                </p>

                <label className="block cursor-pointer rounded-lg border border-dashed border-white/[0.16] hover:border-[#F5B74B]/60 bg-[#111214] p-3.5 transition-colors">
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(e) => {
                      const nextFile = e.target.files?.[0] ?? null;
                      setPdfFile(nextFile);
                      setPdfUploadError(null);
                    }}
                    className="sr-only"
                  />
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#F5B74B]/10 text-[#F5B74B] flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-zinc-200 truncate">
                        {pdfFile
                          ? pdfFile.name
                          : 'Choose a store policy PDF file'}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {pdfFile
                          ? `${Math.max(1, Math.round(pdfFile.size / 1024))} KB · Ready for Gemini ingestion`
                          : 'PDF format up to 10 MB'}
                      </div>
                    </div>
                  </div>
                </label>

                <input
                  type="text"
                  value={pdfTitleHint}
                  onChange={(e) => setPdfTitleHint(e.target.value)}
                  placeholder="Optional title override (auto-detected if blank)"
                  className="w-full px-3 py-2 text-xs bg-[#111214] border border-white/[0.1] rounded-lg text-white placeholder:text-zinc-500"
                />

                <select
                  value={pdfCategoryHint}
                  onChange={(e) =>
                    setPdfCategoryHint(
                      e.target.value as '' | KnowledgeArticle['category']
                    )
                  }
                  className="w-full px-3 py-2 text-xs bg-[#111214] border border-white/[0.1] rounded-lg text-white"
                >
                  <option value="">Category: Auto-detect by Gemini</option>
                  <option value="Orders & Shipping">Orders &amp; Shipping</option>
                  <option value="Returns & Exchanges">Returns &amp; Exchanges</option>
                  <option value="Payments & Refunds">Payments &amp; Refunds</option>
                  <option value="Escalation">Escalation</option>
                  <option value="General Policy">General Policy</option>
                </select>

                {pdfUploadError && (
                  <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                    {pdfUploadError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={uploadingPdf || !pdfFile}
                  className="w-full py-2.5 text-xs font-semibold text-[#141518] bg-[#F5B74B] hover:bg-amber-300 disabled:opacity-50 rounded-lg inline-flex items-center justify-center gap-2 transition-colors"
                >
                  {uploadingPdf ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Gemini AI is reading PDF...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Upload &amp; Read PDF with Gemini
                    </>
                  )}
                </button>
              </form>

              <form
                onSubmit={handleCreateKbSubmit}
                className="bg-[#191B1F] border border-white/[0.08] rounded-xl p-5 space-y-3.5"
              >
                <div className="text-sm font-semibold text-white">
                  Add Manual Policy Rule
                </div>
                <input
                  type="text"
                  required
                  value={kbTitle}
                  onChange={(e) => setKbTitle(e.target.value)}
                  placeholder="Policy title"
                  className="w-full px-3 py-2 text-xs bg-[#111214] border border-white/[0.1] rounded-lg text-white placeholder:text-zinc-500"
                />
                <select
                  value={kbCategory}
                  onChange={(e) =>
                    setKbCategory(e.target.value as KnowledgeArticle['category'])
                  }
                  className="w-full px-3 py-2 text-xs bg-[#111214] border border-white/[0.1] rounded-lg text-white"
                >
                  <option value="Orders & Shipping">Orders &amp; Shipping</option>
                  <option value="Returns & Exchanges">Returns &amp; Exchanges</option>
                  <option value="Payments & Refunds">Payments &amp; Refunds</option>
                  <option value="Escalation">Escalation</option>
                  <option value="General Policy">General Policy</option>
                </select>
                <textarea
                  rows={4}
                  required
                  value={kbContent}
                  onChange={(e) => setKbContent(e.target.value)}
                  placeholder="Exact instructions for DeskPilot AI..."
                  className="w-full px-3 py-2 text-xs bg-[#111214] border border-white/[0.1] rounded-lg text-white placeholder:text-zinc-500"
                />
                <button
                  type="submit"
                  className="w-full py-2 text-xs font-semibold text-zinc-100 bg-white/[0.08] hover:bg-white/[0.14] rounded-lg transition-colors"
                >
                  Add Manual Rule
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
