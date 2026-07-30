import * as React from 'react';
import { DEMO_TODAY, getRepository } from '@viox/db';
import type { Campaign, CateringEvent, Guest, Reservation, Segment } from '@viox/db';
import {
  Badge,
  Card,
  DataTable,
  PageHeader,
  Stat,
  StatRow,
  fmtDate,
  fmtDateTime,
  fmtNumber,
  fmtPct,
  fmtUSD,
  fmtUSDk,
  type Column,
} from '@viox/ui';
import { VisitsChart, type VisitPoint } from './components/VisitsChart';

export const dynamic = 'force-dynamic';

/* ---------- date helpers (lexical ISO math, demo-anchored) ---------- */

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const OPEN_PIPELINE = new Set<CateringEvent['stage']>(['lead', 'proposal', 'tasting']);

export default async function DashboardPage() {
  const repo = getRepository();
  const [guests, reservations, campaigns, events, segments, activity, dailySales, locations] =
    await Promise.all([
      repo.getGuests(),
      repo.getReservations(),
      repo.getCampaigns(),
      repo.getCateringEvents(),
      repo.getSegments(),
      repo.getActivity(30),
      repo.getDailySales({ from: addDays(DEMO_TODAY, -89), to: DEMO_TODAY }),
      repo.getLocations(),
    ]);

  /* ---------- KPI row ---------- */

  const vips = guests.filter((g) => g.tags.includes('vip'));
  const optIns = guests.filter((g) => g.marketingOptIn);
  const newThisMonth = guests.filter((g) => g.tags.includes('new')).length;

  const horizon = addDays(DEMO_TODAY, 14);
  const upcomingRes = reservations.filter(
    (r) =>
      (r.status === 'upcoming' || r.status === 'seated') &&
      r.date.slice(0, 10) >= DEMO_TODAY &&
      r.date.slice(0, 10) <= horizon,
  );
  const upcomingCovers = upcomingRes.reduce((sum, r) => sum + r.partySize, 0);

  const sentCampaigns = campaigns.filter((c) => c.status === 'sent' && c.stats);
  const attributedBookings = sentCampaigns.reduce((sum, c) => sum + (c.stats?.reservations ?? 0), 0);
  const completed = reservations.filter((r) => r.status === 'completed');
  const avgParty =
    completed.length > 0 ? completed.reduce((sum, r) => sum + r.partySize, 0) / completed.length : 2;
  const attributedCovers = Math.round(attributedBookings * avgParty);

  const openLeads = events.filter((e) => OPEN_PIPELINE.has(e.stage));
  const leadValue = openLeads.reduce((sum, e) => sum + e.budget, 0);

  /* ---------- visits chart (daily covers, both rooms, 90 days) ---------- */

  const hkId = locations.find((l) => l.name.includes('Hell'))?.id;
  const byDate = new Map<string, VisitPoint>();
  for (const day of dailySales) {
    const point =
      byDate.get(day.date) ??
      ({ date: day.date, label: fmtDate(day.date), hk: 0, ev: 0, total: 0 } satisfies VisitPoint);
    if (day.locationId === hkId) point.hk += day.guestCount;
    else point.ev += day.guestCount;
    point.total = point.hk + point.ev;
    byDate.set(day.date, point);
  }
  const visitPoints = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

  /* ---------- top guests / birthdays / campaigns / activity ---------- */

  const topGuests = [...guests].sort((a, b) => b.lifetimeSpend - a.lifetimeSpend).slice(0, 8);

  const augustBirthdays = guests
    .filter((g) => (g.birthday ?? '').startsWith('08-'))
    .sort((a, b) => ((a.birthday ?? '') < (b.birthday ?? '') ? -1 : 1));

  const campaignOrder: Record<Campaign['status'], number> = { sent: 0, scheduled: 1, draft: 2 };
  const recentCampaigns = [...campaigns].sort((a, b) => {
    if (campaignOrder[a.status] !== campaignOrder[b.status]) {
      return campaignOrder[a.status] - campaignOrder[b.status];
    }
    const ka = a.sentAt ?? a.scheduledFor ?? '';
    const kb = b.sentAt ?? b.scheduledFor ?? '';
    return ka < kb ? 1 : -1;
  });
  const segmentName = (id: string) => segments.find((s) => s.id === id)?.name ?? id;

  const crmActivity = activity.filter((a) => a.module === 'crm').slice(0, 6);

  return (
    <>
      <PageHeader
        kicker="Guest & Growth"
        title="CRM Dashboard"
        subtitle="Guests, reservations and campaigns across Hell's Kitchen and East Village — live from the operating data."
        actions={<Badge tone="info">Demo data · today = {fmtDate(DEMO_TODAY, true)}</Badge>}
      />

      <StatRow cols={6}>
        <Stat label="Total guests" value={fmtNumber(guests.length)} hint={`${newThisMonth} new in the last 30 days`} />
        <Stat label="VIPs" value={fmtNumber(vips.length)} hint={`Top: ${topGuests[0]?.name ?? '—'}`} />
        <Stat
          label="Marketing opt-ins"
          value={fmtNumber(optIns.length)}
          hint={`${fmtPct((optIns.length / Math.max(1, guests.length)) * 100, 0)} of guest book`}
        />
        <Stat
          label="Reservations · next 14d"
          value={fmtNumber(upcomingRes.length)}
          hint={`${fmtNumber(upcomingCovers)} covers on the books`}
        />
        <Stat
          label="Campaign covers"
          value={fmtNumber(attributedCovers)}
          hint={`${attributedBookings} bookings from ${sentCampaigns.length} sent campaigns`}
        />
        <Stat
          label="Event-lead value"
          value={fmtUSDk(leadValue)}
          highlight
          hint={`${openLeads.length} open leads in pipeline`}
        />
      </StatRow>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          kicker="Both locations · last 90 days"
          title="Guest visits"
          action={<span className="tabular-nums">{fmtNumber(visitPoints.reduce((s, p) => s + p.total, 0))} covers total</span>}
        >
          <VisitsChart data={visitPoints} />
        </Card>

        <Card
          kicker="Birthday this month"
          title="August birthdays"
          action={<a href="/segments" className="transition-colors hover:text-[var(--accent2)]">Segment →</a>}
        >
          <ul className="divide-y divide-[var(--border)]">
            {augustBirthdays.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--text)]">{g.name}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {g.visits} visits · {fmtUSD(g.lifetimeSpend)} lifetime
                  </div>
                </div>
                <span className="shrink-0 rounded-lg border border-[rgba(212,164,55,.4)] bg-[rgba(212,164,55,.08)] px-2 py-1 text-xs font-medium tabular-nums text-[var(--accent2)]">
                  Aug {Number((g.birthday ?? '').slice(3))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
            “Flan on Us” campaign scheduled Aug 1 · {augustBirthdays.length} guests
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          flush
          kicker="By lifetime spend"
          title="Top guests"
          action={<a href="/guests" className="transition-colors hover:text-[var(--accent2)]">All guests →</a>}
        >
          <DataTable columns={guestColumns} rows={topGuests} onRowHref={() => '/guests'} />
        </Card>

        <Card kicker="CRM module" title="Recent activity" action={<span>{crmActivity.length} events</span>}>
          <ul className="space-y-4">
            {crmActivity.map((a) => (
              <li key={a.id} className="relative pl-4">
                <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent2)]" aria-hidden />
                <div className="text-xs leading-relaxed text-[var(--text)]">{a.message}</div>
                <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                  {a.actor} · {fmtDateTime(a.at)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        flush
        kicker="Email · SMS · WhatsApp"
        title="Recent campaigns"
        action={<a href="/campaigns" className="transition-colors hover:text-[var(--accent2)]">All campaigns →</a>}
      >
        <DataTable columns={campaignColumns(segmentName)} rows={recentCampaigns} onRowHref={() => '/campaigns'} />
      </Card>
    </>
  );
}

/* ---------- table columns ---------- */

const guestColumns: Column<Guest>[] = [
  {
    key: 'name',
    header: 'Guest',
    render: (g) => (
      <div className="min-w-0">
        <div className="font-medium text-[var(--text)]">{g.name}</div>
        <div className="text-xs text-[var(--muted)]">{g.email}</div>
      </div>
    ),
  },
  {
    key: 'tags',
    header: 'Tags',
    render: (g) => (
      <span className="inline-flex flex-wrap items-center gap-1">
        {g.tags.slice(0, 2).map((t) => (
          <Badge key={t} status={t} />
        ))}
        {g.tags.length > 2 && <span className="text-[11px] text-[var(--muted)]">+{g.tags.length - 2}</span>}
      </span>
    ),
  },
  { key: 'visits', header: 'Visits', numeric: true, render: (g) => fmtNumber(g.visits) },
  { key: 'avgSpend', header: 'Avg spend', numeric: true, render: (g) => fmtUSD(g.avgSpend) },
  {
    key: 'lifetimeSpend',
    header: 'Lifetime',
    numeric: true,
    render: (g) => <span className="font-medium text-[var(--accent2)]">{fmtUSD(g.lifetimeSpend)}</span>,
  },
  {
    key: 'lastVisit',
    header: 'Last visit',
    numeric: true,
    cellClassName: 'text-[var(--muted)]',
    render: (g) => fmtDate(g.lastVisit),
  },
];

const CHANNEL_LABEL: Record<Campaign['channel'], string> = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

function campaignColumns(segmentName: (id: string) => string): Column<Campaign>[] {
  const rate = (part?: number, total?: number) =>
    part !== undefined && total ? fmtPct((part / total) * 100, 0) : '—';

  return [
    {
      key: 'name',
      header: 'Campaign',
      render: (c) => (
        <div className="min-w-0 max-w-[320px]">
          <div className="truncate font-medium text-[var(--text)]">{c.name}</div>
          <div className="truncate text-xs text-[var(--muted)]">{segmentName(c.segmentId)}</div>
        </div>
      ),
    },
    { key: 'channel', header: 'Channel', render: (c) => <Badge tone="muted">{CHANNEL_LABEL[c.channel]}</Badge> },
    { key: 'status', header: 'Status', render: (c) => <Badge status={c.status} /> },
    {
      key: 'when',
      header: 'Sent / scheduled',
      cellClassName: 'text-[var(--muted)]',
      render: (c) => {
        const at = c.sentAt ?? c.scheduledFor;
        return at ? fmtDateTime(at) : '—';
      },
    },
    { key: 'sent', header: 'Sent', numeric: true, render: (c) => (c.stats ? fmtNumber(c.stats.sent) : '—') },
    { key: 'opened', header: 'Open', numeric: true, render: (c) => rate(c.stats?.opened, c.stats?.sent) },
    { key: 'clicked', header: 'Click', numeric: true, render: (c) => rate(c.stats?.clicked, c.stats?.sent) },
    {
      key: 'reservations',
      header: 'Res.',
      numeric: true,
      render: (c) =>
        c.stats ? (
          <span className="font-medium text-[var(--accent2)]">{fmtNumber(c.stats.reservations)}</span>
        ) : (
          '—'
        ),
    },
  ];
}
