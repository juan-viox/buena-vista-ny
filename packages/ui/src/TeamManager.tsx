'use client';

import * as React from 'react';
import { Badge, type BadgeTone } from './Badge';
import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { fmtDateTime } from './format';

// ============================================================
// TeamManager — roster table + invite card over /api/team.
// Permission-aware: `canManage` (owner/gm) unlocks the inline
// role select, invite form and (de)activate actions; everyone
// else (staff roles, demo sessions) gets a read-only roster.
// Optimistic updates with rollback + inline toasts.
// ============================================================

export type TeamMemberStatus = 'active' | 'invited' | 'deactivated' | 'demo-fixture';

export interface TeamMemberView {
  id: string;
  email: string;
  name: string;
  role: string;
  status: TeamMemberStatus;
  lastSignIn: string | null;
  apps: 'both';
}

export interface TeamManagerProps {
  /** Server-fetched roster (revalidated client-side after writes). */
  initialTeam: TeamMemberView[];
  /** Caller may invite / change roles / deactivate (owner or gm). */
  canManage: boolean;
  /** Demo-bypass session — writes always 403 server-side. */
  isDemo?: boolean;
  /** Role options, e.g. ['owner','gm','chef','events','marketing','staff']. */
  roles: string[];
  /** Route prefix; both apps mount the same wrapper at /api/team. */
  apiPath?: string;
  className?: string;
}

const STATUS_TONE: Record<TeamMemberStatus, BadgeTone> = {
  active: 'good',
  invited: 'info',
  deactivated: 'bad',
  'demo-fixture': 'muted',
};

const STATUS_LABEL: Record<TeamMemberStatus, string> = {
  active: 'Active',
  invited: 'Invited',
  deactivated: 'Deactivated',
  'demo-fixture': 'Demo fixture',
};

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  gm: 'General Manager',
  chef: 'Executive Chef',
  events: 'Events Director',
  marketing: 'Marketing',
  staff: 'Staff',
};

const ROLE_TONE: Record<string, BadgeTone> = {
  owner: 'accent',
  gm: 'info',
  chef: 'warn',
  events: 'good',
  marketing: 'info',
  staff: 'muted',
};

interface Toast {
  id: number;
  tone: 'good' | 'bad';
  text: string;
}

interface ApiEnvelope {
  ok?: boolean;
  error?: string;
  readOnly?: boolean;
  team?: TeamMemberView[];
  invited?: { id: string; email: string; name: string; role: string; status: 'invited' };
}

async function callApi(url: string, method: string, body?: unknown): Promise<ApiEnvelope> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as ApiEnvelope;
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        readOnly: data.readOnly,
        error: data.error ?? (data.readOnly ? 'Demo sessions are read-only.' : `Request failed (${res.status}).`),
      };
    }
    return { ...data, ok: true };
  } catch {
    return { ok: false, error: 'Network error — please try again.' };
  }
}

export function TeamManager({
  initialTeam,
  canManage,
  isDemo = false,
  roles,
  apiPath = '/api/team',
  className = '',
}: TeamManagerProps) {
  const [team, setTeam] = React.useState<TeamMemberView[]>(initialTeam);
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [busyRow, setBusyRow] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  // invite form
  const [invEmail, setInvEmail] = React.useState('');
  const [invName, setInvName] = React.useState('');
  const [invRole, setInvRole] = React.useState(roles.includes('staff') ? 'staff' : roles[0] ?? 'staff');
  const [inviting, setInviting] = React.useState(false);
  const emailRef = React.useRef<HTMLInputElement>(null);

  const toastSeq = React.useRef(0);
  const pushToast = React.useCallback((tone: Toast['tone'], text: string) => {
    const id = ++toastSeq.current;
    setToasts((ts) => [...ts, { id, tone, text }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 4500);
  }, []);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    const res = await callApi(apiPath, 'GET');
    setRefreshing(false);
    if (res.ok && Array.isArray(res.team)) setTeam(res.team);
  }, [apiPath]);

  // ---------- actions ----------

  const changeRole = async (member: TeamMemberView, role: string) => {
    if (role === member.role) return;
    const prev = team;
    setTeam((ts) => ts.map((m) => (m.id === member.id ? { ...m, role } : m)));
    setBusyRow(member.id);
    const res = await callApi(apiPath, 'PATCH', { userId: member.id, email: member.email, role });
    setBusyRow(null);
    if (!res.ok) {
      setTeam(prev);
      pushToast('bad', res.error ?? 'Role change failed.');
      return;
    }
    pushToast('good', `${member.name} is now ${ROLE_LABEL[role] ?? role}.`);
  };

  const toggleActive = async (member: TeamMemberView) => {
    const deactivating = member.status !== 'deactivated';
    const nextStatus: TeamMemberStatus = deactivating ? 'deactivated' : 'active';
    const prev = team;
    setTeam((ts) => ts.map((m) => (m.id === member.id ? { ...m, status: nextStatus } : m)));
    setBusyRow(member.id);
    const res = await callApi(apiPath, 'POST', {
      action: deactivating ? 'deactivate' : 'reactivate',
      userId: member.id,
    });
    setBusyRow(null);
    if (!res.ok) {
      setTeam(prev);
      pushToast('bad', res.error ?? 'Update failed.');
      return;
    }
    pushToast('good', deactivating ? `${member.name} deactivated.` : `${member.name} reactivated.`);
    void refresh();
  };

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inviting) return;
    setInviting(true);
    const res = await callApi(apiPath, 'POST', {
      action: 'invite',
      email: invEmail.trim(),
      name: invName.trim(),
      role: invRole,
    });
    setInviting(false);
    if (!res.ok || !res.invited) {
      pushToast('bad', res.error ?? 'Invite failed.');
      return;
    }
    const inv = res.invited;
    setTeam((ts) => [
      ...ts.filter((m) => m.email.toLowerCase() !== inv.email.toLowerCase()),
      { id: inv.id, email: inv.email, name: inv.name, role: inv.role, status: 'invited', lastSignIn: null, apps: 'both' },
    ]);
    setInvEmail('');
    setInvName('');
    pushToast('good', `Invite sent to ${inv.email}.`);
    void refresh();
  };

  const prefillFromFixture = (member: TeamMemberView) => {
    setInvEmail(member.email);
    setInvName(member.name);
    if (roles.includes(member.role)) setInvRole(member.role);
    emailRef.current?.focus();
  };

  // ---------- render ----------

  const inputCls =
    'w-full rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)]';

  return (
    <div className={`grid grid-cols-1 gap-4 xl:grid-cols-3 ${className}`}>
      {/* ---------- roster ---------- */}
      <Card
        kicker="Roster"
        title="Team members"
        className="xl:col-span-2"
        flush
        action={
          <span className="flex items-center gap-2">
            <span>{team.length} people</span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] transition-colors hover:text-[var(--text)]"
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </span>
        }
      >
        {team.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              title="No team members yet"
              message={
                canManage
                  ? 'Send the first invite — one login covers both OS and CRM.'
                  : 'Team members will appear here once invited.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Name', 'Email', 'Role', 'Status', 'Last sign-in', ...(canManage ? ['Actions'] : [])].map(
                    (h) => (
                      <th
                        key={h}
                        className={`whitespace-nowrap px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[.12em] text-[var(--muted)] ${
                          h === 'Actions' ? 'text-right' : ''
                        }`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {team.map((m, i) => {
                  const isFixture = m.status === 'demo-fixture';
                  const busy = busyRow === m.id;
                  return (
                    <tr
                      key={m.id}
                      className={`border-b border-[var(--border)] last:border-0 ${i % 2 === 1 ? 'bg-[var(--panel2)]' : ''} ${
                        busy ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-[var(--text)]">{m.name}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-[var(--muted)]">{m.email}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {canManage && !isFixture ? (
                          <select
                            aria-label={`Role for ${m.name}`}
                            value={m.role}
                            disabled={busy}
                            onChange={(e) => void changeRole(m, e.target.value)}
                            className="rounded-md border border-[var(--border)] bg-[var(--panel2)] px-2 py-1 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
                          >
                            {roles.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r] ?? r}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge tone={ROLE_TONE[m.role] ?? 'muted'}>{ROLE_LABEL[m.role] ?? m.role}</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--muted)]">
                        {m.lastSignIn ? fmtDateTime(m.lastSignIn) : '—'}
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {isFixture ? (
                            <button
                              type="button"
                              onClick={() => prefillFromFixture(m)}
                              className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--accent)] transition-colors hover:border-[rgba(201,153,92,.4)]"
                            >
                              Invite for real
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void toggleActive(m)}
                              className={`rounded-md border border-[var(--border)] px-2.5 py-1 text-xs transition-colors ${
                                m.status === 'deactivated'
                                  ? 'text-[var(--good)] hover:border-[rgba(52,211,153,.35)]'
                                  : 'text-[var(--bad)] hover:border-[rgba(248,113,113,.35)]'
                              }`}
                            >
                              {m.status === 'deactivated' ? 'Reactivate' : 'Deactivate'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---------- invite card ---------- */}
      <Card kicker="Invite" title="Add a team member">
        {canManage ? (
          <form onSubmit={(e) => void submitInvite(e)} className="space-y-3">
            <label className="block text-xs text-[var(--muted)]">
              Email
              <input
                ref={emailRef}
                type="email"
                required
                value={invEmail}
                onChange={(e) => setInvEmail(e.target.value)}
                placeholder="name@buenavistany.com"
                className={`mt-1 ${inputCls}`}
              />
            </label>
            <label className="block text-xs text-[var(--muted)]">
              Name
              <input
                type="text"
                value={invName}
                onChange={(e) => setInvName(e.target.value)}
                placeholder="Full name"
                className={`mt-1 ${inputCls}`}
              />
            </label>
            <label className="block text-xs text-[var(--muted)]">
              Role
              <select value={invRole} onChange={(e) => setInvRole(e.target.value)} className={`mt-1 ${inputCls}`}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r] ?? r}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={inviting || !invEmail.trim()}
              className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[#14100a] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {inviting ? 'Sending invite…' : 'Send invite'}
            </button>
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              Access covers both OS &amp; CRM — one email invite, one login for the whole workspace.
            </p>
          </form>
        ) : (
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            {isDemo
              ? 'Demo sessions are read-only — sign in as an owner or GM to manage the team.'
              : 'Only owners and general managers can invite people or change roles. Ask a manager if you need access changed.'}
          </p>
        )}
      </Card>

      {/* ---------- toasts ---------- */}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-72 flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto rounded-lg border px-3 py-2 text-xs shadow-lg backdrop-blur ${
                t.tone === 'good'
                  ? 'border-[rgba(52,211,153,.35)] bg-[rgba(52,211,153,.12)] text-[var(--good)]'
                  : 'border-[rgba(248,113,113,.35)] bg-[rgba(248,113,113,.12)] text-[var(--bad)]'
              }`}
            >
              {t.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
