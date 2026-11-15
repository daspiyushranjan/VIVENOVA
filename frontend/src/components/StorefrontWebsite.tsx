import React, { useEffect, useRef, useState } from 'react';
import {
  Headphones,
  Loader2,
  MessageSquare,
  Minus,
  Package,
  Plus,
  Send,
  ShoppingBag,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  AuthUser,
  DeskState,
  OrderRecord,
  Product,
  Ticket,
} from '../types';

interface BagItem {
  product: Product;
  size: string;
  quantity: number;
}

interface StorefrontWebsiteProps {
  user: AuthUser | null;
  state: DeskState;
  onOpenLogin: () => void;
  onLogout: () => void;
  onOpenAdminDesk?: () => void;
  onPlaceOrder: (
    items: Array<{ productId: string; size: string; quantity: number }>
  ) => Promise<OrderRecord>;
  onCreateTicket: (payload: {
    subject: string;
    message: string;
    orderId?: string;
    topic?: string;
  }) => Promise<{ ticket: Ticket; agentWarning?: string }>;
  onSendTicketReply: (
    ticketId: string,
    body: string
  ) => Promise<{ ticket: Ticket; agentWarning?: string }>;
  onRequestHumanAssistance: (ticketId: string, reason?: string) => Promise<Ticket>;
}

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const StorefrontWebsite: React.FC<StorefrontWebsiteProps> = ({
  user,
  state,
  onOpenLogin,
  onLogout,
  onOpenAdminDesk,
  onPlaceOrder,
  onCreateTicket,
  onSendTicketReply,
  onRequestHumanAssistance,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});
  const [bag, setBag] = useState<BagItem[]>([]);
  const [bagOpen, setBagOpen] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderPlacedNotice, setOrderPlacedNotice] = useState<string | null>(null);

  // Support panel state
  const [activeTicketId, setActiveTicketId] = useState<string | null>(
    state.tickets[0]?.id ?? null
  );
  const [newSupportOrder, setNewSupportOrder] = useState<string>('');
  const [newSupportSubject, setNewSupportSubject] = useState<string>('');
  const [newSupportMessage, setNewSupportMessage] = useState<string>('');
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [escalatingId, setEscalatingId] = useState<string | null>(null);
  const [supportWarning, setSupportWarning] = useState<string | null>(null);
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);
  const [activePolicyId, setActivePolicyId] = useState<string | null>(
    state.companyPolicies[0]?.id ?? null
  );

  const categories = ['All', 'Knitwear', 'Shirts', 'Outerwear', 'Accessories'];
  const filteredProducts =
    selectedCategory === 'All'
      ? state.products
      : state.products.filter((p) => p.category === selectedCategory);

  const bagCount = bag.reduce((acc, item) => acc + item.quantity, 0);
  const bagSubtotal = bag.reduce(
    (acc, item) => acc + item.product.priceInr * item.quantity,
    0
  );

  const activeTicket =
    state.tickets.find((t) => t.id === activeTicketId) ??
    state.tickets[0] ??
    null;

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [activeTicket?.id, activeTicket?.messages.length]);

  const handleAddToBag = (product: Product) => {
    const chosenSize = selectedSizes[product.id] || product.sizes[0];
    setBag((prev) => {
      const idx = prev.findIndex(
        (i) => i.product.id === product.id && i.size === chosenSize
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [...prev, { product, size: chosenSize, quantity: 1 }];
    });
    setBagOpen(true);
  };

  const updateBagQty = (productId: string, size: string, delta: number) => {
    setBag((prev) =>
      prev
        .map((item) =>
          item.product.id === productId && item.size === size
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleCheckout = async () => {
    if (!user) {
      setBagOpen(false);
      onOpenLogin();
      return;
    }
    setPlacingOrder(true);
    setOrderPlacedNotice(null);
    try {
      const order = await onPlaceOrder(
        bag.map((b) => ({
          productId: b.product.id,
          size: b.size,
          quantity: b.quantity,
        }))
      );
      setBag([]);
      setBagOpen(false);
      setOrderPlacedNotice(
        `Order ${order.id} confirmed (${formatInr(order.totalInr)}). Tracking ${order.trackingCode}.`
      );
      const ordersEl = document.getElementById('orders');
      ordersEl?.scrollIntoView({ behavior: 'smooth' });
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleStartOrderSupport = (order: OrderRecord) => {
    setNewSupportOrder(order.id);
    setNewSupportSubject(`Question about order ${order.id}`);
    setShowNewTicketForm(true);
    const el = document.getElementById('support');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCreateSupportTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenLogin();
      return;
    }
    if (!newSupportMessage.trim()) return;
    setCreatingTicket(true);
    setSupportWarning(null);
    try {
      const res = await onCreateTicket({
        subject:
          newSupportSubject.trim() || newSupportMessage.trim().slice(0, 56),
        message: newSupportMessage.trim(),
        orderId: newSupportOrder || undefined,
      });
      setActiveTicketId(res.ticket.id);
      setNewSupportMessage('');
      setNewSupportSubject('');
      setNewSupportOrder('');
      setShowNewTicketForm(false);
      if (res.agentWarning) setSupportWarning(res.agentWarning);
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleSendCustomerReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !replyText.trim()) return;
    setSendingReply(true);
    setSupportWarning(null);
    try {
      const res = await onSendTicketReply(activeTicket.id, replyText.trim());
      setReplyText('');
      if (res.agentWarning) setSupportWarning(res.agentWarning);
    } finally {
      setSendingReply(false);
    }
  };

  const handleEscalateToHuman = async (ticketId: string) => {
    setEscalatingId(ticketId);
    try {
      await onRequestHumanAssistance(
        ticketId,
        'Customer clicked "Not satisfied? Request human assistance" on website.'
      );
    } finally {
      setEscalatingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900">
      {/* Top Bar Contract: Brand wordmark — 4 concise links — Primary Action */}
      <header className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-sm border-b border-stone-200">
        <div className="max-w-7xl mx-auto h-16 px-6 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-serif text-xl font-semibold tracking-tight text-stone-900 whitespace-nowrap shrink-0"
          >
            Threadora
          </a>

          <nav
            aria-label="Store navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-600"
          >
            <a
              href="#collection"
              className="hover:text-stone-900 transition-colors whitespace-nowrap shrink-0"
            >
              Collection
            </a>
            <a
              href="#orders"
              className="hover:text-stone-900 transition-colors whitespace-nowrap shrink-0"
            >
              Orders
            </a>
            <a
              href="#support"
              className="hover:text-stone-900 transition-colors whitespace-nowrap shrink-0"
            >
              Support
            </a>
            <a
              href="#policies"
              className="hover:text-stone-900 transition-colors whitespace-nowrap shrink-0"
            >
              Policies
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setBagOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-stone-700 hover:text-stone-900 border border-stone-300 bg-white rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span className="tabular-nums">Bag ({bagCount})</span>
            </button>

            {user ? (
              <div className="flex items-center gap-2">
                {user.role === 'admin' && onOpenAdminDesk && (
                  <button
                    type="button"
                    onClick={onOpenAdminDesk}
                    className="px-3.5 py-2 text-xs font-medium text-stone-900 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Open DeskPilot Admin
                  </button>
                )}
                <button
                  type="button"
                  onClick={onLogout}
                  className="px-3.5 py-2 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {user.name} · Switch
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenLogin}
                className="px-4 py-2 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="top" className="max-w-7xl mx-auto px-6 pt-8 pb-12">
        <div className="relative rounded-2xl overflow-hidden border border-stone-200 bg-stone-900">
          <img
            src="/src/assets/images/hero_verve_loom_1794726533322.jpg"
            alt="Threadora autumn essentials styled on travertine bench"
            referrerPolicy="no-referrer"
            className="w-full h-[420px] md:h-[500px] object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-stone-950/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-8 md:p-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-xl">
              <div className="text-xs font-medium text-amber-300 tracking-wide">
                Autumn Essentials · Direct-to-Consumer
              </div>
              <h1 className="mt-2 font-serif text-3xl md:text-5xl font-medium text-white leading-tight text-balance">
                Everyday garments, crafted to last.
              </h1>
              <p className="mt-3 text-sm md:text-base text-stone-200 leading-relaxed">
                Small-batch knitwear, washed Belgian linen, and Japanese canvas goods—backed by instant AI order care and real human specialists.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <a
                href="#collection"
                className="px-5 py-2.5 text-sm font-medium text-stone-950 bg-[#F5B74B] hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap"
              >
                Shop Collection
              </a>
              <a
                href="#support"
                className="px-5 py-2.5 text-sm font-medium text-white bg-white/15 hover:bg-white/25 border border-white/25 rounded-lg transition-colors whitespace-nowrap"
              >
                Customer Support
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Collection */}
      <section id="collection" className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-stone-200">
          <div>
            <h2 className="font-display text-2xl font-semibold text-stone-900">
              Core Collection
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Free shipping across India · 14-day instant size exchanges and returns.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredProducts.map((product) => {
            const activeSize = selectedSizes[product.id] || product.sizes[0];
            return (
              <div
                key={product.id}
                className="bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col justify-between transition-transform duration-200 hover:-translate-y-0.5"
              >
                <div>
                  <div className="aspect-[4/3] bg-stone-100 overflow-hidden">
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span>{product.category}</span>
                      <span className="font-mono">{product.sku}</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-display text-base font-semibold text-stone-900">
                        {product.name}
                      </h3>
                      <span className="font-mono text-sm font-semibold text-stone-900 tabular-nums shrink-0">
                        {formatInr(product.priceInr)}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      {product.description}
                    </p>
                  </div>
                </div>

                <div className="p-4 pt-0 space-y-3">
                  <div className="flex items-center gap-1.5">
                    {product.sizes.map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() =>
                          setSelectedSizes((prev) => ({
                            ...prev,
                            [product.id]: size,
                          }))
                        }
                        className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                          activeSize === size
                            ? 'border-stone-900 bg-stone-900 text-white'
                            : 'border-stone-200 text-stone-700 hover:border-stone-400'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddToBag(product)}
                    className="w-full py-2 px-4 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Add to Bag
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Orders & Two-Way Live Customer Support */}
      <section
        id="orders"
        className="max-w-7xl mx-auto px-6 py-10 border-t border-stone-200 space-y-10"
      >
        {orderPlacedNotice && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 font-medium">
            {orderPlacedNotice}
          </div>
        )}

        {/* My Orders */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="font-display text-xl font-semibold text-stone-900">
                Your Orders
              </h2>
              <p className="text-sm text-stone-600 mt-0.5">
                {user
                  ? `Signed in as ${user.name} (${user.email})`
                  : 'Sign in with your customer credentials to view orders and start live support.'}
              </p>
            </div>
            {!user && (
              <button
                type="button"
                onClick={onOpenLogin}
                className="px-4 py-2 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg whitespace-nowrap"
              >
                Sign In to View Orders
              </button>
            )}
          </div>

          {user && state.orders.length > 0 ? (
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50 text-xs font-medium text-stone-500">
                      <th className="py-3 px-4">Order ID</th>
                      <th className="py-3 px-4">Items</th>
                      <th className="py-3 px-4">Payment</th>
                      <th className="py-3 px-4">Fulfillment</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4 text-right">Support</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 text-sm">
                    {state.orders.map((order) => (
                      <tr key={order.id} className="hover:bg-stone-50/70">
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-stone-900 whitespace-nowrap">
                          {order.id}
                        </td>
                        <td className="py-3 px-4 text-stone-700">
                          {order.items
                            .map((i) => `${i.name} (${i.size}) × ${i.quantity}`)
                            .join(', ')}
                        </td>
                        <td
                          className={`py-3 px-4 text-xs font-medium whitespace-nowrap ${
                            order.paymentStatus === 'Duplicate Charge' ||
                            order.paymentStatus.includes('Pending')
                              ? 'text-amber-700'
                              : order.paymentStatus === 'Refunded'
                              ? 'text-blue-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {order.paymentStatus}
                        </td>
                        <td className="py-3 px-4 text-xs text-stone-700 whitespace-nowrap">
                          {order.orderStatus}
                          {order.trackingCode ? ` · ${order.trackingCode}` : ''}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs font-medium tabular-nums text-stone-900">
                          {formatInr(order.totalInr)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleStartOrderSupport(order)}
                            className="text-xs font-medium text-amber-700 hover:text-amber-800 underline"
                          >
                            Get help
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : user ? (
            <div className="bg-white border border-stone-200 rounded-xl p-6 text-sm text-stone-500">
              No orders yet. Add an item from the collection above to place your first order.
            </div>
          ) : null}
        </div>

        {/* Two-Way Live Customer Support Section */}
        <div id="support" className="pt-4">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="font-display text-xl font-semibold text-stone-900">
                Customer Support · DeskPilot Concierge
              </h2>
              <p className="text-sm text-stone-600 mt-0.5">
                Chat in English or Hinglish for instant help with orders, exchanges, or refunds—or ask for a human specialist anytime.
              </p>
            </div>
            {user && (
              <button
                type="button"
                onClick={() => setShowNewTicketForm((v) => !v)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg whitespace-nowrap"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>{showNewTicketForm ? 'View Conversations' : 'Start New Conversation'}</span>
              </button>
            )}
          </div>

          {!user ? (
            <div className="bg-white border border-stone-200 rounded-xl p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-base font-semibold text-stone-900">
                  Sign in to chat with Threadora Support
                </h3>
                <p className="text-sm text-stone-600 mt-1">
                  Log in as Rohan, Ava, Meera, or register a new customer account to test live AI responses and human escalation.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenLogin}
                className="px-5 py-2.5 text-xs font-medium text-stone-950 bg-[#F5B74B] hover:bg-amber-300 rounded-lg whitespace-nowrap shrink-0"
              >
                Sign In / Switch Account
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left list of customer's tickets */}
              <div className="lg:col-span-4 bg-white border border-stone-200 rounded-xl divide-y divide-stone-200">
                <div className="px-4 py-3 text-xs font-medium text-stone-500">
                  Your Support Threads ({state.tickets.length})
                </div>
                {state.tickets.length === 0 ? (
                  <div className="p-6 text-xs text-stone-500">
                    No support conversations yet. Start one on the right.
                  </div>
                ) : (
                  state.tickets.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setShowNewTicketForm(false);
                        setActiveTicketId(t.id);
                      }}
                      className={`w-full text-left p-4 transition-colors ${
                        !showNewTicketForm && activeTicket?.id === t.id
                          ? 'bg-amber-50/60'
                          : 'hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-stone-500">{t.id}</span>
                        <span
                          className={`font-medium ${
                            t.status === 'Human Requested'
                              ? 'text-red-700'
                              : t.status === 'Resolved'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-stone-900 line-clamp-1">
                        {t.subject}
                      </div>
                      <div className="mt-0.5 text-xs text-stone-500">
                        {t.topic}
                        {t.orderId ? ` · ${t.orderId}` : ''}
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Right Active Conversation or New Form */}
              <div className="lg:col-span-8 bg-white border border-stone-200 rounded-xl overflow-hidden">
                {showNewTicketForm || !activeTicket ? (
                  <form
                    onSubmit={handleCreateSupportTicket}
                    className="p-6 space-y-4"
                  >
                    <h3 className="font-display text-base font-semibold text-stone-900">
                      New Support Inquiry
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">
                          Related Order (Optional)
                        </label>
                        <select
                          value={newSupportOrder}
                          onChange={(e) => setNewSupportOrder(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg bg-white"
                        >
                          <option value="">General question</option>
                          {state.orders.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.id} · {o.items[0]?.name} ({formatInr(o.totalInr)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">
                          Subject
                        </label>
                        <input
                          type="text"
                          value={newSupportSubject}
                          onChange={(e) => setNewSupportSubject(e.target.value)}
                          placeholder="e.g. Mera order kahan hai? / Order status"
                          className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-700 mb-1">
                        How can we help? (English or Hinglish)
                      </label>
                      <textarea
                        required
                        rows={4}
                        value={newSupportMessage}
                        onChange={(e) => setNewSupportMessage(e.target.value)}
                        placeholder="Write in English or Hinglish, e.g. 'Paise kat gaye par order pending dikha raha hai, jaldi check karo'..."
                        className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-medium text-stone-500 mr-1">
                          Try Hinglish:
                        </span>
                        {[
                          {
                            subject: 'Order tracking check',
                            text: 'Bhai mera order abhi tak kahan pahuncha hai? Status batao please.',
                          },
                          {
                            subject: 'Payment kat gaya par pending hai',
                            text: 'Mera payment kat gaya hai UPI se par order abhi bhi pending dikha raha hai, please sync kar do.',
                          },
                          {
                            subject: 'Size exchange chahiye',
                            text: 'Size thoda tight hai, please isko size L me exchange kar do.',
                          },
                        ].map((sample) => (
                          <button
                            key={sample.subject}
                            type="button"
                            onClick={() => {
                              if (!newSupportSubject.trim()) {
                                setNewSupportSubject(sample.subject);
                              }
                              setNewSupportMessage(sample.text);
                            }}
                            className="px-2.5 py-1 text-[11px] text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-md transition-colors"
                          >
                            {sample.subject}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      {state.tickets.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowNewTicketForm(false)}
                          className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={creatingTicket}
                        className="inline-flex items-center gap-2 px-5 py-2 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg disabled:opacity-50"
                      >
                        {creatingTicket && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        <span>
                          {creatingTicket ? 'Sending...' : 'Send Message'}
                        </span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col">
                    <div className="px-6 py-4 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-stone-500">
                          <span className="font-mono font-medium text-stone-700">
                            {activeTicket.id}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{activeTicket.status}</span>
                          {activeTicket.orderId && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">{activeTicket.orderId}</span>
                            </>
                          )}
                        </div>
                        <h3 className="font-display text-base font-semibold text-stone-900 mt-0.5">
                          {activeTicket.subject}
                        </h3>
                      </div>

                      {!activeTicket.humanRequested &&
                        activeTicket.status !== 'Resolved' && (
                          <button
                            type="button"
                            disabled={escalatingId === activeTicket.id}
                            onClick={() => handleEscalateToHuman(activeTicket.id)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-stone-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <Headphones className="h-3.5 w-3.5" />
                            <span>
                              {escalatingId === activeTicket.id
                                ? 'Connecting Human...'
                                : 'Not satisfied? Ask for human assistance'}
                            </span>
                          </button>
                        )}
                    </div>

                    {activeTicket.humanRequested && (
                      <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-900">
                        <UserCheck className="h-4 w-4 shrink-0" />
                        <span>
                          Human specialist requested — {activeTicket.assignedTo} has been notified and automated AI replies are paused on this conversation.
                        </span>
                      </div>
                    )}

                    {supportWarning && (
                      <div className="px-6 py-2.5 bg-red-50 border-b border-red-200 text-xs text-red-700">
                        {supportWarning}
                      </div>
                    )}

                    <div
                      ref={chatScrollRef}
                      className="p-6 space-y-4 max-h-[400px] overflow-y-auto bg-[#FAF9F6]"
                    >
                      {activeTicket.messages.map((m) => {
                        const isCustomer = m.role === 'customer';
                        return (
                          <div
                            key={m.id}
                            className={`flex flex-col ${
                              isCustomer ? 'items-end' : 'items-start'
                            }`}
                          >
                            <div className="text-[11px] text-stone-500 mb-1">
                              {m.authorName} · {formatTime(m.createdAt)}
                            </div>
                            <div
                              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                                isCustomer
                                  ? 'bg-stone-900 text-white'
                                  : m.role === 'admin'
                                  ? 'bg-amber-50 border border-amber-300 text-stone-900'
                                  : 'bg-white border border-stone-200 text-stone-800'
                              }`}
                            >
                              {m.body}
                            </div>
                            {m.toolChips && m.toolChips.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] font-mono text-stone-500">
                                {m.toolChips.map((chip, idx) => (
                                  <span key={idx}>✓ {chip.label}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {!activeTicket.humanRequested &&
                      activeTicket.status !== 'Resolved' && (
                        <div className="px-4 pt-2.5 pb-1 bg-white border-t border-stone-200 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-stone-500 mr-1">
                            Quick Hinglish:
                          </span>
                          {[
                            'Mera order kab tak aayega?',
                            'Order cancel kar do please',
                            'Warranty claim chahiye',
                            'Payment kat gaya par pending hai',
                            'Mujhe human specialist se baat karni hai',
                          ].map((phrase) => (
                            <button
                              key={phrase}
                              type="button"
                              onClick={() => setReplyText(phrase)}
                              className="px-2 py-0.5 text-[11px] text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded transition-colors"
                            >
                              {phrase}
                            </button>
                          ))}
                        </div>
                      )}

                    <form
                      onSubmit={handleSendCustomerReply}
                      className="p-4 border-t border-stone-200 bg-white flex items-center gap-3"
                    >
                      <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={
                          activeTicket.humanRequested
                            ? 'Send a follow-up note in English or Hinglish...'
                            : "Type in English or Hinglish (e.g. 'Mera order kahan hai?')..."
                        }
                        className="flex-1 px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
                      />
                      <button
                        type="submit"
                        disabled={sendingReply || !replyText.trim()}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg whitespace-nowrap disabled:opacity-50"
                      >
                        {sendingReply ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        <span>Send</span>
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Company Policies Feature Section */}
      <section
        id="policies"
        className="max-w-7xl mx-auto px-6 py-10 border-t border-stone-200"
      >
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-xl font-semibold text-stone-900">
              Company Policies &amp; Automated Guarantees
            </h2>
            <p className="text-sm text-stone-600 mt-0.5">
              Every policy below is enforced automatically 24/7 by DeskPilot AI—zero manual wait times.
            </p>
          </div>
          {user?.role === 'admin' && onOpenAdminDesk && (
            <button
              type="button"
              onClick={onOpenAdminDesk}
              className="px-3.5 py-2 text-xs font-medium text-stone-900 bg-amber-300 hover:bg-amber-200 rounded-lg transition-colors whitespace-nowrap"
            >
              Manage Policies in Admin
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {(() => {
            const unifiedPolicies = [
              ...state.companyPolicies.map((pol) => ({
                id: pol.id,
                title: pol.title,
                summary: pol.summary,
                content: pol.content,
                statusText: pol.enabledForAutomation
                  ? 'Enforced automatically by DeskPilot AI'
                  : 'Reference policy',
              })),
              ...state.knowledgeBase
                .filter((kb) => kb.sourceType === 'pdf')
                .map((kb) => ({
                  id: kb.id,
                  title: kb.title,
                  summary: kb.summary,
                  content: kb.content,
                  statusText: `Uploaded PDF Policy (${kb.pdfFileName || 'PDF'}) · Enforced by DeskPilot AI`,
                })),
            ];
            const current =
              unifiedPolicies.find((p) => p.id === activePolicyId) ??
              unifiedPolicies[0];
            return (
              <>
                <div className="lg:col-span-5 bg-white border border-stone-200 rounded-xl divide-y divide-stone-200 overflow-hidden">
                  {unifiedPolicies.map((pol) => {
                    const selected = current?.id === pol.id;
                    return (
                      <button
                        key={pol.id}
                        type="button"
                        onClick={() => setActivePolicyId(pol.id)}
                        className={`w-full text-left px-4 py-3.5 transition-colors ${
                          selected ? 'bg-amber-50/70' : 'hover:bg-stone-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-stone-900">
                            {pol.title}
                          </span>
                          <span className="font-mono text-[11px] text-stone-500">
                            {pol.id}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-stone-600 line-clamp-1">
                          {pol.summary}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl p-6 space-y-3">
                  {current ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                        <span className="font-mono">{current.id}</span>
                        <span>{current.statusText}</span>
                      </div>
                      <h3 className="font-display text-lg font-semibold text-stone-900">
                        {current.title}
                      </h3>
                      <p className="text-xs font-medium text-stone-600">
                        {current.summary}
                      </p>
                      <div className="pt-2 border-t border-stone-200 text-sm text-stone-700 leading-relaxed whitespace-pre-line">
                        {current.content}
                      </div>
                    </>
                  ) : null}
                </div>
              </>
            );
          })()}
        </div>
      </section>

      {/* Craft & Policy Footer */}
      <footer
        id="craft"
        className="border-t border-stone-200 bg-white mt-8 py-10 px-6"
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="font-serif text-lg font-semibold text-stone-900">
              Threadora
            </div>
            <p className="text-xs text-stone-500 mt-1 max-w-md">
              Direct-to-consumer everyday apparel. Instant AI order resolutions powered by DeskPilot with 1-click escalation to our Bengaluru care team.
            </p>
          </div>
          <div className="flex items-center gap-6 text-xs text-stone-600">
            <span className="inline-flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Free 14-day exchanges
            </span>
            <button
              type="button"
              onClick={onOpenLogin}
              className="font-medium text-stone-900 hover:underline"
            >
              Switch Admin / Customer Login
            </button>
          </div>
        </div>
      </footer>

      {/* Shopping Bag Drawer */}
      {bagOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-stone-950/40">
          <div className="w-full max-w-md bg-white h-full flex flex-col justify-between shadow-2xl">
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-stone-900">
                Your Shopping Bag ({bagCount})
              </h2>
              <button
                type="button"
                onClick={() => setBagOpen(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {bag.length === 0 ? (
                <div className="py-12 text-center text-sm text-stone-500">
                  Your bag is empty. Add garments from the collection.
                </div>
              ) : (
                bag.map((item) => (
                  <div
                    key={`${item.product.id}-${item.size}`}
                    className="flex gap-4 pb-4 border-b border-stone-200"
                  >
                    <img
                      src={item.product.imageUrl}
                      alt={item.product.name}
                      referrerPolicy="no-referrer"
                      className="w-20 h-20 object-cover rounded-lg bg-stone-100 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-stone-900 truncate">
                        {item.product.name}
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5">
                        Size: {item.size} · {formatInr(item.product.priceInr)}
                      </div>
                      <div className="mt-2.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateBagQty(item.product.id, item.size, -1)
                          }
                          className="p-1 border border-stone-300 rounded hover:bg-stone-100"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="font-mono text-xs tabular-nums w-6 text-center">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateBagQty(item.product.id, item.size, 1)
                          }
                          className="p-1 border border-stone-300 rounded hover:bg-stone-100"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-6 border-t border-stone-200 bg-stone-50 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-stone-600">Subtotal</span>
                <span className="font-mono font-semibold tabular-nums text-stone-900">
                  {formatInr(bagSubtotal)}
                </span>
              </div>
              <button
                type="button"
                disabled={bag.length === 0 || placingOrder}
                onClick={handleCheckout}
                className="w-full py-2.5 px-4 text-sm font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-50"
              >
                {placingOrder
                  ? 'Confirming Order...'
                  : user
                  ? `Place Order · ${formatInr(bagSubtotal)}`
                  : 'Sign In to Checkout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
