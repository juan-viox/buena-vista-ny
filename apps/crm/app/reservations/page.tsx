import * as React from 'react';
import { DEMO_TODAY, getRepository } from '@viox/db';
import type { Guest, Reservation } from '@viox/db';
import {
  Badge,
  Card,
  DataTable,
  PageHeader,
  Stat,
  StatRow,
  Tabs,
  fmtDate,
  fmtDateTime,
  fmtNumber,
  fmtPct,
  type Column,
} from '@viox/ui';

export const dynamic = 'force-dynamic';

/* ---------- source breakdown (server-rendered mini-chart) ---------- */

const SOURCE_META: { key: Reservation['source']; label: string; color: string }[] = [
  { key: 'opentable', label: 'OpenTable', color: '#7EB2F5' },
  { key: 'website', label: 'Website', color: '#D4A437' },
  { key: 'phone', label: 'Phone', color: '#34D399' },
  { key: 'walk_in', label: 'Walk-in', color: '#8FA3C0' },
];

function SourceBreakdown({ reservations }: { reservations: Reservation[] }) {
  const total = Math.max(1, reservations.length);
  const counts = SOURCE_META.map((meta) => ({
    ...meta,
    count: reservations.filter((r) => r.source === meta.key).length,
  }));
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[.06]">
        {counts
          .filter((c) => c.count > 0)
          .map((c) => (
            <div
              key={c.key}
              style={{ width: `${(c.count / total) * 100}%`, backgroundColor: c.color }}
              title={`${c.label}: ${c.count}`}
            />
          ))}
      </div>
      <ul className="mt-3 space-y-2">
        {counts.map((c) => (
          <li key={c.key} className="flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 text-[var(--muted)]">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: c.color }} aria-hidden />
              {c.label}
            </span>
            <span className="tabular-nums text-[var(--text)]">
              {fmtNumber(c.count)}
              <span className="ml-1.5 text-[var(--muted)]">{fmtPct((c.count / total) * 100, 0)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- page ---------- */

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab = params.tab === 'past' ? 'past' : 'upcoming';

  const repo = getRepository();
  const [reservations, guests, locations] = await Promise.all([
    repo.getReservations(),
    repo.getGuests(),
    repo.getLocations(),
  ]);

  const guestById = new Map(guests.map((g) => [g.id, g]));
  const locationNames = Object.fromEntries(locations.map((l) => [l.id, l.name]));

  const upcoming = reservations
    .filter((r) => (r.status === 'upcoming' || r.status === 'seated') && r.date.slice(0, 10) >= DEMO_TODAY)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const past = reservations
    .filter((r) => !upcoming.includes(r))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const upcomingCovers = upcoming.reduce((sum, r) => sum + r.partySize, 0);
  const finished = past.filter((r) => r.status === 'completed' || r.status === 'no_show');
  const noShows = past.filter((r) => r.status === 'no_show');
  const noShowRate = finished.length > 0 ? (noShows.length / finished.length) * 100 : 0;
  const completed = past.filter((r) => r.status === 'completed');
  const avgParty =
    completed.length > 0 ? completed.reduce((sum, r) => sum + r.partySize, 0) / completed.length : 0;

  const rows = tab === 'past' ? past : upcoming;

  const columns: Column<Reservation>[] = [
    {
      key: 'guest',
      header: 'Guest',
      render: (r) => {
        const g = guestById.get(r.guestId);
        const vip = g?.tags.includes('vip') ?? false;
        return (
          <div className="flex min-w-0 items-center gap-2">
            {vip && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent2)]" aria-hidden />}
            <div className="min-w-0">
              <div className={`truncate font-medium ${vip ? 'text-[var(--accent2)]' : 'text-[var(--text)]'}`}>
                {g?.name ?? 'Guest'}
              </div>
              <div className="truncate text-xs text-[var(--muted)]">
                {g ? `${fmtNumber(g.visits)} visits` : '—'}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'date',
      header: 'When',
      render: (r) => <span className="tabular-nums">{fmtDateTime(r.date)}</span>,
    },
    {
      key: 'location',
      header: 'Room',
      cellClassName: 'text-[var(--muted)]',
      render: (r) => locationNames[r.locationId] ?? '—',
    },
    { key: 'partySize', header: 'Party', numeric: true, render: (r) => fmtNumber(r.partySize) },
    {
      key: 'occasion',
      header: 'Occasion',
      cellClassName: 'text-[var(--muted)]',
      render: (r) => r.occasion ?? '—',
    },
    {
      key: 'source',
      header: 'Source',
      render: (r) => <Badge tone="muted">{SOURCE_META.find((s) => s.key === r.source)?.label ?? r.source}</Badge>,
    },
    { key: 'status', header: 'Status', render: (r) => <Badge status={r.status} /> },
  ];

  return (
    <>
      <PageHeader
        kicker="Front of house"
        title="Reservations"
        subtitle="The book across Hell's Kitchen and East Village — synced from OpenTable, the website widget and the host stand."
        actions={<Badge tone="info">Demo data · today = {fmtDate(DEMO_TODAY, true)}</Badge>}
      />

      <StatRow cols={4}>
        <Stat
          label="Upcoming reservations"
          value={fmtNumber(upcoming.length)}
          highlight
          hint={`${fmtNumber(upcomingCovers)} covers on the books`}
        />
        <Stat
          label="No-show rate"
          value={fmtPct(noShowRate, 1)}
          hint={`${fmtNumber(noShows.length)} of ${fmtNumber(finished.length)} finished bookings`}
        />
        <Stat label="Avg party size" value={avgParty > 0 ? avgParty.toFixed(1) : '—'} hint="Completed reservations" />
        <Stat
          label="Largest party ahead"
          value={fmtNumber(upcoming.reduce((max, r) => Math.max(max, r.partySize), 0))}
          hint={largestPartyHint(upcoming, guestById)}
        />
      </StatRow>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" flush kicker="The book" title="Reservations">
          <div className="px-5">
            <Tabs
              tabs={[
                { value: 'upcoming', label: 'Upcoming', count: upcoming.length },
                { value: 'past', label: 'Past', count: past.length },
              ]}
              defaultValue="upcoming"
            />
          </div>
          <DataTable
            columns={columns}
            rows={rows}
            onRowHref={(r) => `/guests/${r.guestId}`}
            emptyMessage={tab === 'past' ? 'No past reservations in the window.' : 'Nothing on the books yet.'}
          />
        </Card>

        <Card kicker="Where bookings come from" title="Source breakdown">
          <SourceBreakdown reservations={reservations} />
          <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
            OpenTable carries the pre-theater book in Hell&apos;s Kitchen; the website widget wins late-night East
            Village.
          </p>
        </Card>
      </div>
    </>
  );
}

function largestPartyHint(upcoming: Reservation[], guestById: Map<string, Guest>): string {
  const largest = upcoming.reduce<Reservation | null>(
    (best, r) => (best === null || r.partySize > best.partySize ? r : best),
    null,
  );
  if (!largest) return 'No upcoming bookings';
  const name = guestById.get(largest.guestId)?.name ?? 'Guest';
  return `${name} · ${fmtDate(largest.date)}${largest.occasion ? ` · ${largest.occasion}` : ''}`;
}
