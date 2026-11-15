import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { AuthUser, DeskState } from '../types';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string, user: AuthUser, state: DeskState) => void;
  initialMode?: 'login' | 'register';
}

const DEMO_ACCOUNTS = [
  {
    label: 'Admin · Priya S. (DeskPilot Support Lead)',
    email: 'priya.s@threadora.in',
    pass: 'admin123',
    role: 'Admin',
  },
  {
    label: 'Customer · Rohan Mehta (4 orders)',
    email: 'rohan.m@example.com',
    pass: 'customer123',
    role: 'Customer',
  },
  {
    label: 'Customer · Ava Kapoor (Double charge)',
    email: 'ava.k@example.com',
    pass: 'customer123',
    role: 'Customer',
  },
  {
    label: 'Customer · Meera Patel (Human requested)',
    email: 'meera.p@example.com',
    pass: 'customer123',
    role: 'Customer',
  },
];

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'login',
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const endpoint =
        mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login'
          ? { email, password }
          : { name, email, password, address };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        token?: string;
        user?: AuthUser;
        state?: DeskState;
        error?: string;
      };

      if (!res.ok || !data.token || !data.user || !data.state) {
        throw new Error(data.error || 'Authentication failed.');
      }

      onSuccess(data.token, data.user, data.state);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (demoEmail: string, demoPass: string) => {
    setMode('login');
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white border border-stone-200 rounded-xl shadow-xl overflow-hidden text-stone-900">
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-stone-900">
              {mode === 'login'
                ? 'Sign in to Threadora / DeskPilot'
                : 'Create Customer Account'}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Switch between Admin Support Desk and Customer Storefront using credentials.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg"
            aria-label="Close sign in dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-1 p-1 bg-stone-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === 'login'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === 'register'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              New Customer
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Aarav Sharma"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Delivery City / Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Indiranagar, Bengaluru"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
              </div>
            )}

            {error && (
              <div className="p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>
                {submitting
                  ? 'Signing in...'
                  : mode === 'login'
                  ? 'Sign In'
                  : 'Create Account & Sign In'}
              </span>
            </button>
          </form>

          {mode === 'login' && (
            <div className="pt-3 border-t border-stone-200 space-y-2">
              <div className="text-xs font-medium text-stone-500">
                Quick-fill credentials to test roles:
              </div>
              <div className="space-y-1.5">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => fillDemo(acc.email, acc.pass)}
                    className="w-full text-left px-3 py-2 text-xs border border-stone-200 hover:border-stone-400 hover:bg-stone-50 rounded-lg flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="truncate">
                      <div className="font-medium text-stone-900 truncate">
                        {acc.label}
                      </div>
                      <div className="font-mono text-[11px] text-stone-500 truncate">
                        {acc.email} · {acc.pass}
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-amber-700 shrink-0">
                      Fill
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
