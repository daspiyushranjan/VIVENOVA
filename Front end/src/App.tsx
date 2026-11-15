import React, { useCallback, useEffect, useState } from 'react';
import { DeskPilotAdmin } from './components/DeskPilotAdmin';
import { LoginModal } from './components/LoginModal';
import { StorefrontWebsite } from './components/StorefrontWebsite';
import type {
  AgentPolicyConfig,
  AuthUser,
  CompanyPolicy,
  DeskState,
  KnowledgeArticle,
  OrderRecord,
  Ticket,
  TicketPriority,
  TicketStatus,
} from './types';

const TOKEN_STORAGE_KEY = 'threadora_deskpilot_token';

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_STORAGE_KEY)
  );
  const [user, setUser] = useState<AuthUser | null>(null);
  const [state, setState] = useState<DeskState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'website' | 'admin'>('website');
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const authHeaders = useCallback(
    (extra?: Record<string, string>): Record<string, string> => {
      const headers: Record<string, string> = { ...(extra ?? {}) };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      return headers;
    },
    [token]
  );

  const fetchState = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await fetch('/api/state', {
        headers: authHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const data = (await res.json()) as {
        user: AuthUser | null;
        state: DeskState;
      };
      setUser(data.user);
      setState(data.state);
      if (data.user?.role === 'admin') {
        setViewMode('admin');
      } else {
        setViewMode('website');
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load application.'
      );
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const refreshStateQuietly = useCallback(async () => {
    try {
      const res = await fetch('/api/state', {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        user: AuthUser | null;
        state: DeskState;
      };
      setState(data.state);
    } catch {
      // ignore transient background poll errors
    }
  }, [authHeaders]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    const timer = window.setInterval(() => {
      void refreshStateQuietly();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [user?.role, refreshStateQuietly]);

  const handleLoginSuccess = (
    nextToken: string,
    nextUser: AuthUser,
    nextState: DeskState
  ) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setState(nextState);
    setViewMode(nextUser.role === 'admin' ? 'admin' : 'website');
  };

  const handleLogoutAndSwitch = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setViewMode('website');
    setLoginModalOpen(true);
  };

  const handlePlaceOrder = async (
    items: Array<{ productId: string; size: string; quantity: number }>
  ): Promise<OrderRecord> => {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ items }),
    });
    const data = (await res.json()) as {
      order?: OrderRecord;
      state?: DeskState;
      error?: string;
    };
    if (!res.ok || !data.order || !data.state) {
      throw new Error(data.error || 'Failed to place order.');
    }
    setState(data.state);
    return data.order;
  };

  const handleCreateTicket = async (payload: {
    subject: string;
    message: string;
    orderId?: string;
    topic?: string;
  }): Promise<{ ticket: Ticket; agentWarning?: string }> => {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      ticket?: Ticket;
      state?: DeskState;
      agentWarning?: string;
      error?: string;
    };
    if (!res.ok || !data.ticket || !data.state) {
      throw new Error(data.error || 'Failed to submit support message.');
    }
    setState(data.state);
    return { ticket: data.ticket, agentWarning: data.agentWarning };
  };

  const handleSendCustomerReply = async (
    ticketId: string,
    body: string
  ): Promise<{ ticket: Ticket; agentWarning?: string }> => {
    const res = await fetch(`/api/tickets/${ticketId}/reply`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ body }),
    });
    const data = (await res.json()) as {
      ticket?: Ticket;
      state?: DeskState;
      agentWarning?: string;
      error?: string;
    };
    if (!res.ok || !data.ticket || !data.state) {
      throw new Error(data.error || 'Failed to send reply.');
    }
    setState(data.state);
    return { ticket: data.ticket, agentWarning: data.agentWarning };
  };

  const handleRequestHumanAssistance = async (
    ticketId: string,
    reason?: string
  ): Promise<Ticket> => {
    const res = await fetch(`/api/tickets/${ticketId}/request-human`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ reason }),
    });
    const data = (await res.json()) as {
      ticket?: Ticket;
      state?: DeskState;
      error?: string;
    };
    if (!res.ok || !data.ticket || !data.state) {
      throw new Error(data.error || 'Failed to request human assistance.');
    }
    setState(data.state);
    return data.ticket;
  };

  // Admin handlers
  const handleUpdatePolicy = async (patch: Partial<AgentPolicyConfig>) => {
    const res = await fetch('/api/policy', {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { state?: DeskState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to update automation policy.');
    }
    setState(data.state);
  };

  const handleRunAiOnTicket = async (
    ticketId: string,
    mode: 'auto' | 'draft' | 'send'
  ) => {
    const res = await fetch(`/api/tickets/${ticketId}/run-ai`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ mode }),
    });
    const data = (await res.json()) as { state?: DeskState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Gemini agent failed.');
    }
    setState(data.state);
  };

  const handleApproveSuggested = async (
    ticketId: string,
    editedBody?: string
  ) => {
    const res = await fetch(`/api/tickets/${ticketId}/approve-suggested`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ editedBody }),
    });
    const data = (await res.json()) as { state?: DeskState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to send reply.');
    }
    setState(data.state);
  };

  const handleApprovalDecision = async (
    ticketId: string,
    decision: 'approve' | 'decline'
  ) => {
    const res = await fetch(`/api/tickets/${ticketId}/approval`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ decision }),
    });
    const data = (await res.json()) as { state?: DeskState; error?: string };
    if (res.ok && data.state) {
      setState(data.state);
    }
  };

  const handleSendAdminReply = async (ticketId: string, body: string) => {
    const res = await fetch(`/api/tickets/${ticketId}/reply`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ body }),
    });
    const data = (await res.json()) as { state?: DeskState; error?: string };
    if (res.ok && data.state) {
      setState(data.state);
    }
  };

  const handleUpdateTicket = async (
    ticketId: string,
    patch: {
      status?: TicketStatus;
      priority?: TicketPriority;
      topic?: string;
      aiPausedForHuman?: boolean;
    }
  ) => {
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { state?: DeskState };
    if (res.ok && data.state) {
      setState(data.state);
    }
  };

  const handleAutoTriageOpen = async (): Promise<number> => {
    const res = await fetch('/api/tickets/auto-triage', {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = (await res.json()) as {
      processedCount?: number;
      state?: DeskState;
      error?: string;
    };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Auto-triage failed.');
    }
    setState(data.state);
    return data.processedCount ?? 0;
  };

  const handleAnalyzeSentiment = async (ticketId: string) => {
    const res = await fetch(`/api/tickets/${ticketId}/analyze-sentiment`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = (await res.json()) as { state?: DeskState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Sentiment analysis failed.');
    }
    setState(data.state);
  };

  const handleCreateKb = async (
    article: Omit<KnowledgeArticle, 'id' | 'updatedAt'>
  ) => {
    const res = await fetch('/api/kb', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(article),
    });
    const data = (await res.json()) as { state?: DeskState };
    if (res.ok && data.state) setState(data.state);
  };

  const handleUpdateKb = async (
    id: string,
    patch: Partial<Omit<KnowledgeArticle, 'id' | 'updatedAt'>>
  ) => {
    const res = await fetch(`/api/kb/${id}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { state?: DeskState };
    if (res.ok && data.state) setState(data.state);
  };

  const handleDeleteKb = async (id: string) => {
    const res = await fetch(`/api/kb/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = (await res.json()) as { state?: DeskState };
    if (res.ok && data.state) setState(data.state);
  };

  const handleUploadKbPdf = async (payload: {
    fileName: string;
    pdfBase64: string;
    title?: string;
    category?: KnowledgeArticle['category'];
  }): Promise<KnowledgeArticle> => {
    const res = await fetch('/api/kb/upload-pdf', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      article?: KnowledgeArticle;
      state?: DeskState;
      error?: string;
    };
    if (!res.ok || !data.article || !data.state) {
      throw new Error(data.error || 'Failed to read PDF policy.');
    }
    setState(data.state);
    return data.article;
  };

  const handleDownloadKbPdf = async (id: string, fileName?: string) => {
    const res = await fetch(`/api/kb/${id}/pdf`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      throw new Error('Could not retrieve PDF file.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'store-policy.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleCreateCompanyPolicy = async (
    policyDoc: Omit<CompanyPolicy, 'id' | 'updatedAt'>
  ) => {
    const res = await fetch('/api/company-policies', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(policyDoc),
    });
    const data = (await res.json()) as { state?: DeskState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to add company policy.');
    }
    setState(data.state);
  };

  const handleUpdateCompanyPolicy = async (
    id: string,
    patch: Partial<Omit<CompanyPolicy, 'id' | 'updatedAt'>>
  ) => {
    const res = await fetch(`/api/company-policies/${id}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { state?: DeskState; error?: string };
    if (!res.ok || !data.state) {
      throw new Error(data.error || 'Failed to update company policy.');
    }
    setState(data.state);
  };

  const handleDeleteCompanyPolicy = async (id: string) => {
    const res = await fetch(`/api/company-policies/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = (await res.json()) as { state?: DeskState };
    if (res.ok && data.state) setState(data.state);
  };

  const handleMarkNotificationRead = async (id: string) => {
    const res = await fetch(`/api/notifications/${id}/read`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = (await res.json()) as { state?: DeskState };
    if (res.ok && data.state) setState(data.state);
  };

  const handleMarkAllNotificationsRead = async () => {
    const res = await fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = (await res.json()) as { state?: DeskState };
    if (res.ok && data.state) setState(data.state);
  };

  const handleResetDemo = async () => {
    const res = await fetch('/api/reset-demo', {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = (await res.json()) as { state?: DeskState };
    if (res.ok && data.state) setState(data.state);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center text-sm text-stone-500">
        Loading Threadora...
      </div>
    );
  }

  if (loadError || !state) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
        <div className="bg-white border border-stone-200 rounded-xl p-6 max-w-md w-full space-y-3">
          <h1 className="font-display text-lg font-semibold text-stone-900">
            Connection Issue
          </h1>
          <p className="text-sm text-stone-600">{loadError}</p>
          <button
            type="button"
            onClick={() => void fetchState()}
            className="px-4 py-2 text-xs font-medium text-white bg-stone-900 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {user?.role === 'admin' && viewMode === 'admin' ? (
        <DeskPilotAdmin
          user={user}
          state={state}
          onViewWebsite={() => setViewMode('website')}
          onSwitchAccount={handleLogoutAndSwitch}
          onRefreshState={fetchState}
          onResetDemo={handleResetDemo}
          onUpdatePolicy={handleUpdatePolicy}
          onRunAiOnTicket={handleRunAiOnTicket}
          onApproveSuggested={handleApproveSuggested}
          onApprovalDecision={handleApprovalDecision}
          onSendAdminReply={handleSendAdminReply}
          onUpdateTicket={handleUpdateTicket}
          onAutoTriageOpen={handleAutoTriageOpen}
          onAnalyzeSentiment={handleAnalyzeSentiment}
          onCreateKb={handleCreateKb}
          onUpdateKb={handleUpdateKb}
          onDeleteKb={handleDeleteKb}
          onUploadKbPdf={handleUploadKbPdf}
          onDownloadKbPdf={handleDownloadKbPdf}
          onCreateCompanyPolicy={handleCreateCompanyPolicy}
          onUpdateCompanyPolicy={handleUpdateCompanyPolicy}
          onDeleteCompanyPolicy={handleDeleteCompanyPolicy}
          onMarkNotificationRead={handleMarkNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        />
      ) : (
        <StorefrontWebsite
          user={user}
          state={state}
          onOpenLogin={() => setLoginModalOpen(true)}
          onLogout={handleLogoutAndSwitch}
          onOpenAdminDesk={
            user?.role === 'admin' ? () => setViewMode('admin') : undefined
          }
          onPlaceOrder={handlePlaceOrder}
          onCreateTicket={handleCreateTicket}
          onSendTicketReply={handleSendCustomerReply}
          onRequestHumanAssistance={handleRequestHumanAssistance}
        />
      )}

      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onSuccess={handleLoginSuccess}
      />
    </>
  );
}
