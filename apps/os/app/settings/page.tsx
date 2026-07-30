import * as React from 'react';
import { getRepository } from '@viox/db';
import type { Location, User } from '@viox/db';
import {
  Badge,
  Card,
  DataTable,
  Kicker,
  PageHeader,
  fmtDate,
  type BadgeTone,
  type Column,
} from '@viox/ui';

const ROLE_TONES: Record<User['role'], BadgeTone> = {
  owner: 'accent',
  gm: 'info',
  chef: 'warn',
  events: 'good',
  marketing: 'info',
  staff: 'muted',
};

const ROLE_LABELS: Record<User['role'], string> = {
  owner: 'Owner',
  gm: 'General Manager',
  chef: 'Executive Chef',
  events: 'Events Director',
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

  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? id;

  const userColumns: Column<User>[] = [
    { key: 'name', header: 'Name', render: (u) => <span className="font-medium">{u.name}</span> },
    { key: 'email', header: 'Email', cellClassName: 'text-[var(--muted)]' },
    {
      key: 'role',
      header: 'Role',
      render: (u) => <Badge tone={ROLE_TONES[u.role]}>{ROLE_LABELS[u.role]}</Badge>,
    },
    {
      key: 'locations',
      header: 'Access',
      render: (u) =>
        u.locationIds.length === 0 ? (
          <span className="text-[var(--muted)]">All locations</span>
        ) : (
          u.locationIds.map(locName).join(', ')
        ),
    },
  ];

  return (
    <>
      <PageHeader
        kicker="System"
        title="Settings"
        subtitle="Tenant identity, locations, and team access for the Buena Vista workspace."
        actions={<Badge tone="info">Demo mode</Badge>}
      />

      {/* ---------- DEMO_MODE banner ---------- */}
      <div className="flex items-start gap-3 rounded-xl border border-[rgba(126,178,245,.3)] bg-[rgba(126,178,245,.06)] px-5 py-4">
        <span className="mt-0.5 shrink-0 text-[#7EB2F5]">
          <InfoIcon />
        </span>
        <div>
          <div className="text-sm font-semibold text-[var(--text)]">
            Running in DEMO_MODE — Supabase-ready schema underneath
          </div>
          <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
            Every screen reads through the same <code className="text-[var(--text)]">DataRepository</code> contract,
            currently served by the deterministic Buena Vista fixture driver (90 days of operating data anchored to
            Jul 29, 2026). The production schema ships in <code className="text-[var(--text)]">packages/db/schema.sql</code>{' '}
            and mirrors the domain model 1:1 — set <code className="text-[var(--text)]">NEXT_PUBLIC_SUPABASE_URL</code>{' '}
            and <code className="text-[var(--text)]">SUPABASE_SERVICE_ROLE_KEY</code> to flip the driver to a live
            Supabase project with zero app-layer changes.
          </p>
        </div>
      </div>

      {/* ---------- tenant card ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card kicker="Tenant" title={tenant.name}>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--muted)]">Slug</span>
              <code className="text-[var(--text)]">{tenant.slug}</code>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--muted)]">Onboarded</span>
              <span className="tabular-nums text-[var(--text)]">{fmtDate(tenant.createdAt, true)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--muted)]">Wordmark</span>
              <span className="font-semibold tracking-[.14em] text-[var(--accent)]">{tenant.theme.logoText}</span>
            </div>
            <div>
              <Kicker className="mb-2">Theme</Kicker>
              <div className="flex gap-3">
                <Swatch hex={tenant.theme.accent} label="Accent" />
                <Swatch hex={tenant.theme.primary} label="Primary" />
                <Swatch hex="#D4A437" label="Accent 2" />
              </div>
            </div>
          </div>
        </Card>

        {locations.map((l: Location) => (
          <Card key={l.id} kicker="Location" title={l.name} action={<Badge tone="good">Open</Badge>}>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="shrink-0 text-[var(--muted)]">Address</dt>
                <dd className="text-right text-[var(--text)]">{l.address}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-[var(--muted)]">Phone</dt>
                <dd className="tabular-nums text-[var(--text)]">{l.phone}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-[var(--muted)]">Timezone</dt>
                <dd className="text-[var(--text)]">{l.timezone}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-[var(--muted)]">Service notes</dt>
                <dd className="text-right text-[var(--text)]">
                  {l.name === "Hell's Kitchen" ? 'Lunch + pre-theater engine' : 'Late night Fri/Sat to 2 AM'}
                </dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>

      {/* ---------- team ---------- */}
      <Card kicker="Team" title="Users & roles" action={<span>{users.length} seats</span>} flush>
        <DataTable columns={userColumns} rows={users} />
      </Card>
    </>
  );
}

function Swatch({ hex, label }: { hex: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-8 w-8 rounded-lg border border-[var(--border)]"
        style={{ backgroundColor: hex }}
        aria-hidden
      />
      <span className="text-xs leading-tight">
        <span className="block text-[var(--text)]">{label}</span>
        <span className="block tabular-nums text-[var(--muted)]">{hex.toUpperCase()}</span>
      </span>
    </div>
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
