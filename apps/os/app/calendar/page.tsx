import * as React from 'react';
import { getRepository, DEMO_TODAY } from '@viox/db';
import type { CateringEvent, EventStage } from '@viox/db';
import { Badge, Card, PageHeader, fmtDateTime, fmtUSDk } from '@viox/ui';

// ---------- month + color config ----------

const DEFAULT_MONTH = '2026-08'; // events book clusters in August during the demo window
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STAGE_CHIP: Record<string, { hex: string; border: string; bg: string }> = {
  lead: { hex: 'var(--info)', border: 'rgba(126,178,245,.4)', bg: 'rgba(126,178,245,.09)' },
  proposal: { hex: 'var(--warn)', border: 'rgba(251,191,36,.4)', bg: 'rgba(251,191,36,.09)' },
  tasting: { hex: 'var(--orange)', border: 'rgba(251,146,60,.4)', bg: 'rgba(251,146,60,.09)' },
  booked: { hex: 'var(--good)', border: 'rgba(52,211,153,.4)', bg: 'rgba(52,211,153,.09)' },
  beo_final: { hex: 'var(--accent)', border: 'rgba(201,153,92,.45)', bg: 'rgba(201,153,92,.1)' },
  completed: { hex: 'var(--muted)', border: 'rgba(143,163,192,.35)', bg: 'rgba(143,163,192,.08)' },
};

const STAGE_LEGEND: { stage: EventStage; label: string }[] = [
  { stage: 'lead', label: 'Lead' },
  { stage: 'proposal', label: 'Proposal' },
  { stage: 'tasting', label: 'Tasting' },
  { stage: 'booked', label: 'Booked' },
  { stage: 'beo_final', label: 'BEO final' },
  { stage: 'completed', label: 'Completed' },
];

const LOCATION_COLORS = ['var(--accent)', 'var(--info)', 'var(--good)', 'var(--warn)'];

// ---------- date helpers (UTC-safe, lexical ISO strings) ----------

function shiftMonth(year: number, month1: number, delta: number): string {
  const d = new Date(Date.UTC(year, month1 - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function shortTime(iso: string): string {
  const t = /T(\d{2}):(\d{2})/.exec(iso);
  if (!t) return '';
  let h = Number(t[1]);
  const mer = h >= 12 ? 'p' : 'a';
  h = h % 12 === 0 ? 12 : h % 12;
  return t[2] === '00' ? `${h}${mer}` : `${h}:${t[2]}${mer}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; loc?: string }>;
}) {
  const { m, loc } = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(m ?? '') ? (m as string) : DEFAULT_MONTH;
  const [year, month1] = month.split('-').map(Number);

  const repo = getRepository();
  const [locations, events] = await Promise.all([repo.getLocations(), repo.getCateringEvents()]);

  const activeLoc = locations.find((l) => l.id === loc);
  const scoped = (activeLoc ? events.filter((e) => e.locationId === activeLoc.id) : events).filter(
    (e) => e.stage !== 'lost',
  );
  const scopeLabel = activeLoc ? activeLoc.name : 'Both locations';

  const locColor = new Map(locations.map((l, i) => [l.id, LOCATION_COLORS[i % LOCATION_COLORS.length]]));
  const locName = new Map(locations.map((l) => [l.id, l.name]));

  // ---------- month grid cells ----------
  const firstDow = new Date(Date.UTC(year, month1 - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const d = new Date(Date.UTC(year, month1 - 1, 1 + i - firstDow));
    return {
      iso: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month1 - 1,
    };
  });

  const byDay = new Map<string, CateringEvent[]>();
  for (const e of scoped) {
    const day = e.eventDate.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(e);
    byDay.set(day, list);
  }
  for (const list of byDay.values()) list.sort((a, b) => (a.eventDate < b.eventDate ? -1 : 1));

  const monthEvents = scoped.filter((e) => e.eventDate.slice(0, 7) === month);
  const monthValue = monthEvents.reduce((s, e) => s + (e.quotedTotal || e.budget), 0);

  // ---------- side list: next 10 from demo today ----------
  const upcoming = scoped
    .filter((e) => e.eventDate.slice(0, 10) >= DEMO_TODAY && e.stage !== 'completed')
    .sort((a, b) => (a.eventDate < b.eventDate ? -1 : 1))
    .slice(0, 10);

  const withLoc = (target: string) => (loc ? `${target}&loc=${encodeURIComponent(loc)}` : target);
  const prevHref = withLoc(`/calendar?m=${shiftMonth(year, month1, -1)}`);
  const nextHref = withLoc(`/calendar?m=${shiftMonth(year, month1, 1)}`);
  const todayHref = withLoc(`/calendar?m=${DEMO_TODAY.slice(0, 7)}`);

  return (
    <>
      <PageHeader
        kicker={`Events calendar · ${scopeLabel}`}
        title={`${MONTH_NAMES[month1 - 1]} ${year}`}
        subtitle={`${monthEvents.length} events on the book this month · ${fmtUSDk(monthValue)} in quoted value.`}
        actions={
          <>
            <a href={todayHref} className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:border-[rgba(201,153,92,.4)]">
              Today
            </a>
            <a href={prevHref} aria-label="Previous month" className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:border-[rgba(201,153,92,.4)]">
              ‹ {MONTH_NAMES[(month1 + 10) % 12].slice(0, 3)}
            </a>
            <a href={nextHref} aria-label="Next month" className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:border-[rgba(201,153,92,.4)]">
              {MONTH_NAMES[month1 % 12].slice(0, 3)} ›
            </a>
          </>
        }
      />

      {/* ---------- legend ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3.5">
          {STAGE_LEGEND.map(({ stage, label }) => (
            <span key={stage} className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: STAGE_CHIP[stage].hex }} />
              {label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3.5">
          {locations.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: locColor.get(l.id) }} />
              {l.name}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {/* ---------- month grid ---------- */}
        <Card flush className="xl:col-span-3">
          <div className="overflow-x-auto">
            <div className="min-w-[840px]">
              <div className="grid grid-cols-7 border-b border-[var(--border)]">
                {DOW.map((d) => (
                  <div key={d} className="px-3 py-2 text-[11px] font-medium uppercase tracking-[.12em] text-[var(--muted)]">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((cell, i) => {
                  const dayEvents = cell.inMonth ? (byDay.get(cell.iso) ?? []) : [];
                  const isToday = cell.iso === DEMO_TODAY;
                  const shown = dayEvents.slice(0, 3);
                  const overflow = dayEvents.length - shown.length;
                  return (
                    <div
                      key={cell.iso}
                      className={`min-h-[112px] border-r border-[var(--border)] p-1.5 [&:nth-child(7n)]:border-r-0 ${
                        i >= totalCells - 7 ? '' : 'border-b'
                      } ${cell.inMonth ? '' : 'bg-[var(--panel2)] opacity-45'}`}
                    >
                      <div className="mb-1 flex items-center justify-between px-1">
                        <span
                          className={`text-xs tabular-nums ${
                            isToday
                              ? 'flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 font-semibold text-[var(--accent-ink)]'
                              : cell.inMonth
                                ? 'text-[var(--muted)]'
                                : 'text-[var(--muted)]'
                          }`}
                        >
                          {cell.day}
                        </span>
                        {isToday && (
                          <span className="text-[9px] font-medium uppercase tracking-[.12em] text-[var(--accent)]">
                            Today
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {shown.map((e) => {
                          const chip = STAGE_CHIP[e.stage] ?? STAGE_CHIP.completed;
                          return (
                            <a
                              key={e.id}
                              href={`/events/${e.id}`}
                              title={`${e.title} — ${fmtDateTime(e.eventDate)} · ${e.partySize} guests · ${locName.get(e.locationId) ?? ''}`}
                              className="flex items-center gap-1.5 rounded border px-1.5 py-1 text-[11px] leading-4 transition-opacity hover:opacity-80"
                              style={{ borderColor: chip.border, backgroundColor: chip.bg, color: chip.hex }}
                            >
                              <span
                                className="h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: locColor.get(e.locationId) ?? 'var(--muted)' }}
                              />
                              <span className="shrink-0 tabular-nums opacity-80">{shortTime(e.eventDate)}</span>
                              <span className="truncate">{e.title}</span>
                            </a>
                          );
                        })}
                        {overflow > 0 && (
                          <div className="px-1.5 text-[10px] text-[var(--muted)]">+{overflow} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        {/* ---------- next 10 ---------- */}
        <Card kicker="From demo day forward" title="Next 10 events" action={<a href="/events" className="hover:text-[var(--accent)]">Pipeline →</a>} flush>
          <div className="divide-y divide-[var(--border)]">
            {upcoming.map((e) => (
              <a key={e.id} href={`/events/${e.id}`} className="block px-5 py-3 transition-colors hover:bg-white/[.03]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: locColor.get(e.locationId) ?? 'var(--muted)' }}
                      />
                      <span className="truncate text-sm text-[var(--text)]">{e.title}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">
                      {fmtDateTime(e.eventDate)} · {e.partySize} guests
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-medium tabular-nums text-[var(--text)]">
                      {fmtUSDk(e.quotedTotal || e.budget)}
                    </div>
                    <Badge status={e.stage} className="mt-1" />
                  </div>
                </div>
              </a>
            ))}
            {upcoming.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-[var(--muted)]">
                Nothing upcoming in this scope — new inquiries land here automatically.
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
