// ============================================================
// /team — workspace access (CRM). Server component: roster +
// caller role resolved server-side via the service-role helpers,
// then hydrated into the client TeamManager (writes go through
// /api/team, owner/gm only; demo sessions read-only).
// ============================================================

import * as React from 'react';
import { cookies } from 'next/headers';
import {
  TEAM_ROLES,
  callerRoleFromCookieHeader,
  canManageTeam,
  listTeam,
} from '@viox/integrations/src/team';
import { Badge, PageHeader, TeamManager, type TeamMemberView } from '@viox/ui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');

  const [role, roster] = await Promise.all([
    callerRoleFromCookieHeader(cookieHeader || null),
    listTeam(),
  ]);

  const team: TeamMemberView[] = (roster.data ?? []).map((m) => ({ ...m }));
  const canManage = canManageTeam(role);
  const isDemo = role === 'demo';

  return (
    <>
      <PageHeader
        kicker="System"
        title="Team"
        subtitle="Invite people, set roles, and manage who can sign in to the Buena Vista workspace."
        actions={
          isDemo ? (
            <Badge tone="info">Demo — read-only</Badge>
          ) : canManage ? (
            <Badge tone="accent">Manager access</Badge>
          ) : (
            <Badge tone="muted">View only</Badge>
          )
        }
      />

      {/* ---------- how access works ---------- */}
      <div className="flex items-start gap-3 rounded-xl border border-[rgba(126,178,245,.3)] bg-[rgba(126,178,245,.06)] px-5 py-4">
        <span className="mt-0.5 shrink-0 text-[var(--info)]">
          <InfoIcon />
        </span>
        <div>
          <div className="text-sm font-semibold text-[var(--text)]">One login, both apps</div>
          <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
            OS and CRM share the same workspace identity — a single invite gives access to both, with the
            same email and password everywhere. People marked <span className="text-[var(--text)]">Demo fixture</span>{' '}
            are seeded display-only personas from the demo dataset: they appear across the dashboards but
            cannot sign in until an owner or GM invites them for real.
          </p>
        </div>
      </div>

      {!roster.ok && (
        <div className="rounded-xl border border-[rgba(251,191,36,.35)] bg-[rgba(251,191,36,.06)] px-5 py-4 text-sm text-[var(--warn)]">
          {roster.error ?? 'Team service is not configured.'}
        </div>
      )}

      <TeamManager
        initialTeam={team}
        canManage={canManage}
        isDemo={isDemo}
        roles={[...TEAM_ROLES]}
      />
    </>
  );
}

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 7.75v.5" />
    </svg>
  );
}
