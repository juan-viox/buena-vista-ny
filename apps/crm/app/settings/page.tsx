import * as React from 'react';
import { DEMO_TODAY, getRepository } from '@viox/db';
import { Badge, Card, Kicker, PageHeader, fmtDate } from '@viox/ui';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  gm: 'General Manager',
  chef: 'Executive Chef',
  events: 'Events',
  marketing: 'Marketing',
  staff: 'Staff',
};

export default async function SettingsPage() {
  const repo = getRepository();
  const [tenant, locations, users] = await Promise.all([
    repo.getTenant(),
    repo.getLocations(),
    repo.getUsers(),
  ]);

  return (
    <>
      <PageHeader
        kicker="System"
        title="Settings"
        subtitle="Tenant, workspace and data-source configuration for this VioX CRM instance."
      />

      {/* DEMO_MODE banner */}
      <div className="flex items-start gap-3 rounded-xl border border-[rgba(212,164,55,.4)] bg-[rgba(212,164,55,.07)] px-5 py-4">
        <span className="mt-0.5 shrink-0 text-[var(--accent2)]">
          <FlaskIcon />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--accent2)]">DEMO_MODE — fixture dataset active</div>
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
            Every page is served from the deterministic Buena Vista dataset anchored to{' '}
            <span className="tabular-nums text-[var(--text)]">{fmtDate(DEMO_TODAY, true)}</span> (90 days of history).
            Nothing is written to external systems. Set <code className="text-[var(--text)]">NEXT_PUBLIC_SUPABASE_URL</code>{' '}
            to switch every app to the live Supabase driver.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Tenant */}
        <Card kicker="Tenant" title={tenant.name}>
          <dl className="space-y-3 text-sm">
            <SettingRow label="Wordmark" value={tenant.theme.logoText} />
            <SettingRow label="Slug" value={<code className="text-[var(--text)]">{tenant.slug}</code>} />
            <SettingRow
              label="Theme"
              value={
                <span className="inline-flex items-center gap-3">
                  <Swatch hex={tenant.theme.accent} label="Accent" />
                  <Swatch hex={tenant.theme.primary} label="Primary" />
                </span>
              }
            />
            <SettingRow label="Created" value={fmtDate(tenant.createdAt, true)} />
            <SettingRow label="Plan" value={<Badge tone="accent">Restaurant OS — full suite</Badge>} />
          </dl>
        </Card>

        {/* Data source */}
        <Card kicker="Data source" title="Where Guests come from">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-3">
              <div>
                <div className="text-sm font-medium text-[var(--text)]">Demo fixtures (in-memory)</div>
                <div className="text-xs text-[var(--muted)]">48 guests · 30 reservations · 7 campaigns · 6 segments</div>
              </div>
              <Badge status="connected_demo" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-3">
              <div>
                <div className="text-sm font-medium text-[var(--text)]">Supabase (multi-tenant)</div>
                <div className="text-xs text-[var(--muted)]">packages/db/schema.sql ready to push</div>
              </div>
              <Badge status="awaiting_credentials" />
            </div>
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              The newsletter signup form on{' '}
              <a
                href="https://buena-vista-ny.vercel.app"
                className="text-[var(--accent2)] underline decoration-[rgba(212,164,55,.4)] underline-offset-2 transition-colors hover:decoration-[var(--accent2)]"
              >
                buena-vista-ny.vercel.app
              </a>{' '}
              feeds Guests directly (source: <code className="text-[var(--text)]">newsletter</code>, opted in) once
              Supabase is wired — no code changes in this app, just the two environment variables.
            </p>
          </div>
        </Card>

        {/* Locations */}
        <Card kicker="Workspace" title="Locations">
          <ul className="divide-y divide-[var(--border)]">
            {locations.map((loc) => (
              <li key={loc.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--text)]">{loc.name}</div>
                  <div className="text-xs text-[var(--muted)]">{loc.address}</div>
                  <div className="text-xs tabular-nums text-[var(--muted)]">{loc.phone}</div>
                </div>
                <Badge tone="muted">{loc.timezone.replace('America/', '').replace('_', ' ')}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        {/* Team */}
        <Card kicker="Workspace" title="Team access">
          <ul className="divide-y divide-[var(--border)]">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--text)]">{u.name}</div>
                  <div className="truncate text-xs text-[var(--muted)]">{u.email}</div>
                </div>
                <Badge tone={u.role === 'owner' ? 'accent' : 'muted'}>{ROLE_LABEL[u.role] ?? u.role}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
            Roles scope what each persona sees across VioX OS and VioX CRM. Manage invitations from the OS app.
          </p>
        </Card>
      </div>

      <div className="pt-1">
        <Kicker>VioX CRM · tenant #{1} · {tenant.slug}</Kicker>
      </div>
    </>
  );
}

/* ---------- bits ---------- */

function SettingRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-3 last:border-0 last:pb-0">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-right text-[var(--text)]">{value}</dd>
    </div>
  );
}

function Swatch({ hex, label }: { hex: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
      <span className="h-4 w-4 rounded border border-[var(--border)]" style={{ backgroundColor: hex }} />
      {label} <code className="text-[var(--text)]">{hex}</code>
    </span>
  );
}

function FlaskIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.5 3.5h5M10.5 3.5v5.2L5.2 17.6A2 2 0 0 0 7 20.5h10a2 2 0 0 0 1.8-2.9L13.5 8.7V3.5" />
      <path d="M7.5 14.5h9" />
    </svg>
  );
}
