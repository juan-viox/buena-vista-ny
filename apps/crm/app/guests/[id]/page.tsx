import * as React from 'react';
import { notFound } from 'next/navigation';
import { DEMO_TODAY, getRepository } from '@viox/db';
import type { CateringEvent, Guest, Reservation } from '@viox/db';
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  Stat,
  StatRow,
  fmtDate,
  fmtDateTime,
  fmtNumber,
  fmtUSD,
  statusLabel,
  type Column,
} from '@viox/ui';
import { TagsEditor } from './TagsEditor';

export const dynamic = 'force-dynamic';

/* ---------- date helpers (lexical ISO math, demo-anchored) ---------- */

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = toIso.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** Days until the next occurrence of an MM-DD birthday, from the demo anchor. */
function daysUntilBirthday(birthday: string): number {
  const [mm, dd] = birthday.split('-').map(Number);
  const [y] = DEMO_TODAY.split('-').map(Number);
  const thisYear = `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  if (thisYear >= DEMO_TODAY) return daysBetween(DEMO_TODAY, thisYear);
  return daysBetween(DEMO_TODAY, `${y + 1}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`);
}

/* ---------- rule-based next action ---------- */

interface Suggestion {
  title: string;
  reason: string;
  action: string;
  href: string;
  tone: 'accent' | 'warn' | 'good' | 'info';
}

const OPEN_STAGES = new Set<CateringEvent['stage']>(['lead', 'proposal', 'tasting', 'booked', 'beo_final']);

function suggestNextAction(guest: Guest, linkedEvents: CateringEvent[]): Suggestion {
  const daysSinceVisit = daysBetween(guest.lastVisit, DEMO_TODAY);
  const bday = guest.birthday ? daysUntilBirthday(guest.birthday) : null;
  const openEvent = linkedEvents.find((e) => OPEN_STAGES.has(e.stage));

  if (guest.tags.includes('lapsed') || daysSinceVisit > 90) {
    return {
      title: 'Send the win-back pour',
      reason: `Last visit was ${daysSinceVisit} days ago. The “We Miss You — Welcome Back Pour” email is converting at 1 in 5 — add ${guest.name.split(' ')[0]} to the next send.`,
      action: 'Open win-back campaign',
      href: '/campaigns/cmp_winback',
      tone: 'warn',
    };
  }
  if (bday !== null && bday <= 45) {
    return {
      title: 'Birthday coming up — invite now',
      reason: `Birthday in ${bday} day${bday === 1 ? '' : 's'} (${fmtDate(`2026-${guest.birthday}`)}). Queue the “Flan on Us” invite and suggest a table${guest.favoriteItems[0] ? ` — favorite: ${guest.favoriteItems[0]}` : ''}.`,
      action: 'Open birthday campaign',
      href: '/campaigns/cmp_aug_birthdays',
      tone: 'accent',
    };
  }
  if (openEvent) {
    return {
      title: `Nudge the open event — ${statusLabel(openEvent.stage)}`,
      reason: `“${openEvent.title}” (${fmtNumber(openEvent.partySize)} guests, ${fmtDate(openEvent.eventDate)}) is sitting at ${statusLabel(openEvent.stage).toLowerCase()}. A same-week follow-up closes most of these.`,
      action: 'View event leads',
      href: '/leads',
      tone: 'info',
    };
  }
  if (guest.tags.includes('event_host')) {
    return {
      title: 'Pitch a fall private-dining date',
      reason: `${guest.name.split(' ')[0]} has hosted before and has no open event on the books. September private-room Saturdays still have availability.`,
      action: 'View event leads',
      href: '/leads',
      tone: 'info',
    };
  }
  if (guest.tags.includes('vip') && daysSinceVisit > 14) {
    return {
      title: 'Personal touch from the floor',
      reason: `A VIP quiet for ${daysSinceVisit} days. A short personal note from Christian — mention the ${guest.favoriteItems[0] ?? 'usual table'} — beats any blast.`,
      action: 'Open campaigns',
      href: '/campaigns',
      tone: 'accent',
    };
  }
  if (guest.tags.includes('new')) {
    return {
      title: 'Lock in the second visit',
      reason: `Joined ${daysBetween(guest.createdAt.slice(0, 10), DEMO_TODAY)} days ago with ${guest.visits} visit${guest.visits === 1 ? '' : 's'}. A welcome note with a weeknight sangría offer turns first-timers into regulars.`,
      action: 'Open campaigns',
      href: '/campaigns',
      tone: 'good',
    };
  }
  if (guest.tags.includes('big_spender') || guest.tags.includes('wine_club')) {
    return {
      title: 'Save a seat at the Rioja dinner',
      reason: `${fmtUSD(guest.avgSpend)} average check puts ${guest.name.split(' ')[0]} squarely in the wine-dinner audience. The September Rioja dinner draft is waiting.`,
      action: 'Open Rioja dinner draft',
      href: '/campaigns/cmp_rioja_dinner',
      tone: 'accent',
    };
  }
  return {
    title: 'Keep the cadence',
    reason: `Healthy regular — last in ${daysSinceVisit} days ago. Include in the next seasonal campaign; no special handling needed.`,
    action: 'Open campaigns',
    href: '/campaigns',
    tone: 'good',
  };
}

/* ---------- page ---------- */

export default async function GuestProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = getRepository();
  const [guests, reservations, events, locations] = await Promise.all([
    repo.getGuests(),
    repo.getReservations(),
    repo.getCateringEvents(),
    repo.getLocations(),
  ]);

  const guest = guests.find((g) => g.id === id);
  if (!guest) notFound();

  const locationNames = Object.fromEntries(locations.map((l) => [l.id, l.name]));
  const history = reservations
    .filter((r) => r.guestId === guest.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const linkedEvents = events
    .filter((e) => e.guestId === guest.id)
    .sort((a, b) => (a.eventDate < b.eventDate ? 1 : -1));
  const suggestion = suggestNextAction(guest, linkedEvents);
  const daysSinceVisit = daysBetween(guest.lastVisit, DEMO_TODAY);

  const historyColumns: Column<Reservation>[] = [
    {
      key: 'date',
      header: 'When',
      render: (r) => <span className="font-medium text-[var(--text)]">{fmtDateTime(r.date)}</span>,
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
    { key: 'source', header: 'Source', render: (r) => <Badge tone="muted">{sourceLabel(r.source)}</Badge> },
    { key: 'status', header: 'Status', render: (r) => <Badge status={r.status} /> },
  ];

  return (
    <>
      <PageHeader
        kicker={<a href="/guests" className="transition-colors hover:text-[var(--accent2)]">← Guests</a>}
        title={
          <span className="inline-flex items-center gap-2.5">
            {guest.name}
            {guest.tags.includes('vip') && <Badge status="vip" />}
          </span>
        }
        subtitle={
          <>
            {guest.email}
            {guest.phone ? <> · {guest.phone}</> : null} · {locationNames[guest.favoriteLocationId] ?? '—'} regular ·
            source: {sourceLabel(guest.source)}
          </>
        }
        actions={
          <Badge tone={guest.marketingOptIn ? 'good' : 'bad'}>
            {guest.marketingOptIn ? 'Marketing opt-in' : 'No marketing'}
          </Badge>
        }
      />

      <StatRow cols={4}>
        <Stat label="Visits" value={fmtNumber(guest.visits)} hint={`Since ${fmtDate(guest.createdAt, true)}`} />
        <Stat label="Lifetime spend" value={fmtUSD(guest.lifetimeSpend)} highlight hint="All time, both rooms" />
        <Stat label="Avg spend" value={fmtUSD(guest.avgSpend)} hint="Per visit" />
        <Stat
          label="Last visit"
          value={fmtDate(guest.lastVisit)}
          hint={daysSinceVisit === 0 ? 'Today' : `${fmtNumber(daysSinceVisit)} days ago`}
        />
      </StatRow>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* suggested next action */}
          <Card
            kicker="VioX Copilot · rule engine"
            title="Suggested next action"
            action={<Badge tone={suggestion.tone}>{suggestion.title}</Badge>}
            className="border-[rgba(212,164,55,.28)]"
          >
            <p className="text-sm leading-relaxed text-[var(--text)]">{suggestion.reason}</p>
            <a
              href={suggestion.href}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[rgba(212,164,55,.45)] bg-[rgba(212,164,55,.1)] px-3 py-1.5 text-xs font-medium text-[var(--accent2)] transition-colors hover:bg-[rgba(212,164,55,.18)]"
            >
              {suggestion.action}
              <ArrowIcon />
            </a>
          </Card>

          <Card flush kicker="Reservations" title="Visit history" action={<span>{history.length} on record</span>}>
            {history.length > 0 ? (
              <DataTable columns={historyColumns} rows={history} />
            ) : (
              <div className="px-5 pb-5">
                <EmptyState title="No reservations yet" message="POS visits only — this guest books as a walk-in." />
              </div>
            )}
          </Card>

          <Card
            kicker="Private dining"
            title="Linked events"
            action={<a href="/leads" className="transition-colors hover:text-[var(--accent2)]">Event leads →</a>}
          >
            {linkedEvents.length > 0 ? (
              <ul className="divide-y divide-[var(--border)]">
                {linkedEvents.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[var(--text)]">{e.title}</div>
                      <div className="mt-0.5 text-xs text-[var(--muted)]">
                        {fmtDateTime(e.eventDate)} · {fmtNumber(e.partySize)} guests · {e.space} ·{' '}
                        {locationNames[e.locationId] ?? '—'}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs font-medium tabular-nums text-[var(--accent2)]">
                        {fmtUSD(e.quotedTotal > 0 ? e.quotedTotal : e.budget)}
                      </span>
                      <Badge status={e.stage} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No linked events"
                message="No private-dining inquiries from this guest yet — event hosts show up here automatically."
              />
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card kicker="Profile" title="Tags">
            <TagsEditor initialTags={guest.tags} />
          </Card>

          <Card kicker="From the POS" title="Favorite items">
            <div className="flex flex-wrap gap-1.5">
              {guest.favoriteItems.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-full border border-[rgba(201,153,92,.35)] bg-[rgba(201,153,92,.07)] px-2.5 py-1 text-xs font-medium text-[var(--accent)]"
                >
                  {item}
                </span>
              ))}
              {guest.favoriteItems.length === 0 && (
                <span className="text-xs text-[var(--muted)]">No favorites logged yet.</span>
              )}
            </div>
            {guest.birthday && (
              <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
                Birthday: <span className="font-medium text-[var(--text)]">{fmtDate(`2026-${guest.birthday}`)}</span>
                {' · '}
                {fmtNumber(daysUntilBirthday(guest.birthday))} days out
              </p>
            )}
          </Card>

          <Card kicker="Floor & host notes" title="Notes">
            {guest.notes ? (
              <p className="text-sm leading-relaxed text-[var(--text)]">{guest.notes}</p>
            ) : (
              <p className="text-xs text-[var(--muted)]">No notes yet — hosts and captains can add context here.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/* ---------- labels ---------- */

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    pos: 'POS',
    reservation: 'Reservation',
    newsletter: 'Newsletter',
    event: 'Event',
    walk_in: 'Walk-in',
    opentable: 'OpenTable',
    phone: 'Phone',
    website: 'Website',
  };
  return labels[source] ?? statusLabel(source);
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5" />
    </svg>
  );
}
