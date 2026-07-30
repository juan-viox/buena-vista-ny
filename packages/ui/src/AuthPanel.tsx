'use client';

import * as React from 'react';

// ============================================================
// AuthPanel — VioX Command sign-in card (Supabase GoTrue via
// the app's /api/auth/* routes; no SDK). Two modes:
//   password — email + password → POST /api/auth/login
//   magic    — email only      → POST /api/auth/magic
// Plus a "View demo →" path that sets the read-only demo
// cookie via POST /api/auth/demo and enters the app.
// Everything ships flag-off: this panel only matters once the
// operator sets AUTH_REQUIRED=1 (middleware gate).
// ============================================================

export interface AuthPanelProps {
  /** Product wordmark above the form, e.g. "VioX AI OS". */
  productName?: string;
  /** Secondary line, e.g. the tenant name. */
  subtitle?: string;
  className?: string;
}

type Mode = 'password' | 'magic';

/** Sanitized post-login destination from ?next= (same-origin paths only). */
function safeNext(): string {
  try {
    const n = new URLSearchParams(window.location.search).get('next');
    if (n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\')) return n;
  } catch {
    /* no-op */
  }
  return '/';
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || data.ok === false) {
      return { ok: false, error: data.error ?? `Request failed (${res.status})` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Network error — please try again.' };
  }
}

export function AuthPanel({ productName = 'VioX Command', subtitle, className = '' }: AuthPanelProps) {
  const [mode, setMode] = React.useState<Mode>('password');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState<'login' | 'magic' | 'demo' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }
    if (mode === 'password') {
      if (!password) {
        setError('Enter your password.');
        return;
      }
      setBusy('login');
      const res = await postJson('/api/auth/login', { email: email.trim(), password });
      if (res.ok) {
        window.location.assign(safeNext());
        return;
      }
      setBusy(null);
      setError(res.error ?? 'Sign-in failed.');
    } else {
      setBusy('magic');
      const res = await postJson('/api/auth/magic', { email: email.trim() });
      setBusy(null);
      if (res.ok) setNotice('Magic link sent — check your inbox and open it on this device.');
      else setError(res.error ?? 'Could not send the magic link.');
    }
  };

  const onDemo = async () => {
    setError(null);
    setBusy('demo');
    const res = await postJson('/api/auth/demo', {});
    if (res.ok) {
      window.location.assign(safeNext());
      return;
    }
    setBusy(null);
    setError(res.error ?? 'Could not start the demo.');
  };

  const inputCls =
    'h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 text-sm text-[var(--text)] placeholder-[var(--muted)] outline-none transition-colors focus:border-[var(--accent)]';

  return (
    <div className={`w-full max-w-sm ${className}`}>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-[var(--shadow-pop)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgba(201,153,92,.4)] bg-[rgba(201,153,92,.1)] text-[var(--accent)]">
            <BoltIcon />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight text-[var(--text)]">{productName}</div>
            <div className="text-[10px] uppercase tracking-[.12em] text-[var(--muted)]">
              {subtitle ?? 'Operator sign-in'}
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-[.08em] text-[var(--muted)]">
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@buenavistany.com"
              className={inputCls}
            />
          </label>

          {mode === 'password' && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-[.08em] text-[var(--muted)]">
                Password
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputCls}
              />
            </label>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-[rgba(248,113,113,.3)] bg-[rgba(248,113,113,.08)] px-3 py-2 text-xs text-[var(--bad)]">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-lg border border-[rgba(52,211,153,.3)] bg-[rgba(52,211,153,.08)] px-3 py-2 text-xs text-[var(--good)]">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy !== null}
            className="h-10 w-full rounded-lg bg-[var(--accent)] text-sm font-semibold text-[var(--accent-ink)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mode === 'password'
              ? busy === 'login'
                ? 'Signing in…'
                : 'Sign in'
              : busy === 'magic'
                ? 'Sending link…'
                : 'Email me a magic link'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'password' ? 'magic' : 'password');
            setError(null);
            setNotice(null);
          }}
          className="mt-3 w-full text-center text-xs text-[var(--muted)] underline-offset-2 transition-colors hover:text-[var(--text)] hover:underline"
        >
          {mode === 'password' ? 'Email me a magic link instead' : 'Use email & password instead'}
        </button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-[10px] uppercase tracking-[.12em] text-[var(--muted)]">or</span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <button
          type="button"
          onClick={onDemo}
          disabled={busy !== null}
          className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--panel2)] text-sm font-medium text-[var(--text)] transition-colors hover:border-[rgba(201,153,92,.4)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === 'demo' ? 'Opening demo…' : 'View demo →'}
        </button>
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[.12em] text-[var(--muted)]">
        Powered by <span className="font-semibold text-[var(--accent)]">VioX AI</span>
      </p>
    </div>
  );
}

// ============================================================
// UserChip — topbar session chip: name + role, logout action.
// Rendered by app layouts only when a session (or demo) cookie
// exists, so flag-off deployments render nothing new.
// ============================================================

export interface UserChipProps {
  /** Display name — fixture user name, or the authed email. */
  name: string;
  /** Role label, e.g. "owner" | "gm" | "staff" | "read-only". */
  role: string;
  /** Demo session — shows an "Exit" action instead of logout. */
  demo?: boolean;
  className?: string;
}

export function UserChip({ name, role, demo = false, className = '' }: UserChipProps) {
  const [busy, setBusy] = React.useState(false);

  const onLogout = async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* cookies are cleared server-side; fall through to redirect */
    }
    window.location.assign('/login');
  };

  return (
    <div
      className={`flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] pl-2.5 pr-1.5 ${className}`}
    >
      <span className="text-[var(--muted)]">
        <PersonIcon />
      </span>
      <span className="max-w-[140px] truncate text-sm text-[var(--text)]">{name}</span>
      <span className="rounded border border-[rgba(201,153,92,.35)] bg-[rgba(201,153,92,.1)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[.08em] text-[var(--accent)]">
        {role}
      </span>
      <button
        type="button"
        onClick={onLogout}
        disabled={busy}
        title={demo ? 'Exit demo' : 'Sign out'}
        aria-label={demo ? 'Exit demo' : 'Sign out'}
        className="flex h-6 w-6 items-center justify-center rounded text-[var(--muted)] transition-colors hover:bg-[var(--panel2)] hover:text-[var(--text)] disabled:opacity-50"
      >
        <LogoutIcon />
      </button>
    </div>
  );
}

/* ---------- icons ---------- */

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19c.8-3 3.4-4.5 6.5-4.5s5.7 1.5 6.5 4.5" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 4h-7a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 7 20h7" />
      <path d="M10.5 12h9M16.5 8.5 20 12l-3.5 3.5" />
    </svg>
  );
}
