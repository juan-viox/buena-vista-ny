import * as React from 'react';
import { getRepository } from '@viox/db';
import type { CateringEvent, EventStage } from '@viox/db';
import { Badge, Card, PageHeader, Stat, StatRow, fmtDate, fmtNumber, fmtUSDk } from '@viox/ui';
import PipelineBoard from './PipelineBoard';

// Stage-weighted close probability for the weighted-pipeline figure.
const STAGE_WEIGHTS: Partial<Record<EventStage, number>> = {
  lead: 0.15,
  proposal: 0.4,
  tasting: 0.6,
  booked: 0.95,
  beo_final: 1,
};

const OPEN_STAGES: EventStage[] = ['lead', 'proposal', 'tasting', 'booked', 'beo_final'];
const LOCATION_COLORS = ['#C9995C', '#7EB2F5', '#34D399', '#FBBF24'];

const valueOf = (e: CateringEvent) => e.quotedTotal || e.budget;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string }>;
}) {
  const { loc } = await searchParams;
  const repo = getRepository();
  const [locations, events] = await Promise.all([repo.getLocations(), repo.getCateringEvents()]);

  const activeLoc = locations.find((l) => l.id === loc);
  const scoped = activeLoc ? events.filter((e) => e.locationId === activeLoc.id) : events;
  const scopeLabel = activeLoc ? activeLoc.name : 'Both locations';

  const open = scoped.filter((e) => OPEN_STAGES.includes(e.stage));
  const totalPipeline = open.reduce((s, e) => s + valueOf(e), 0);
  const weighted = open.reduce((s, e) => s + valueOf(e) * (STAGE_WEIGHTS[e.stage] ?? 0), 0);

  const confirmed = scoped.filter((e) => e.stage === 'booked' || e.stage === 'beo_final');
  const bookedRevenue = confirmed.reduce((s, e) => s + valueOf(e), 0);
  const depositsHeld = confirmed.reduce((s, e) => s + (e.depositPaid ? e.depositAmount : 0), 0);

  const avgParty = open.length > 0 ? open.reduce((s, e) => s + e.partySize, 0) / open.length : 0;

  const lost = scoped
    .filter((e) => e.stage === 'lost')
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const lostValue = lost.reduce((s, e) => s + valueOf(e), 0);

  const boardEvents = scoped.filter((e) => e.stage !== 'lost');
  const boardLocations = locations.map((l, i) => ({
    id: l.id,
    name: l.name,
    color: LOCATION_COLORS[i % LOCATION_COLORS.length],
  }));

  return (
    <>
      <PageHeader
        kicker={`Events · ${scopeLabel}`}
        title="Catering Pipeline"
        subtitle="Every inquiry from first call to signed BEO — drag cards between stages as deals move."
        actions={
          <a
            href="/calendar"
            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:border-[rgba(201,153,92,.4)]"
          >
            Calendar view →
          </a>
        }
      />

      {/* ---------- pipeline value ---------- */}
      <StatRow cols={4}>
        <Stat
          label="Total pipeline"
          value={fmtUSDk(totalPipeline)}
          hint={`${open.length} open deals · lead through BEO final`}
          highlight
        />
        <Stat
          label="Weighted pipeline"
          value={fmtUSDk(weighted)}
          hint="Stage-weighted close probability"
        />
        <Stat
          label="Booked revenue"
          value={fmtUSDk(bookedRevenue)}
          hint={`${confirmed.length} confirmed · ${fmtUSDk(depositsHeld)} deposits held`}
        />
        <Stat
          label="Avg party size"
          value={fmtNumber(avgParty)}
          hint="Across the open pipeline"
        />
      </StatRow>

      {/* ---------- kanban board ---------- */}
      <PipelineBoard events={boardEvents} locations={boardLocations} />

      {/* ---------- lost deals ---------- */}
      <Card
        kicker="Post-mortem"
        title="Lost deals"
        action={
          lost.length > 0 ? (
            <span>
              {lost.length} lost · {fmtUSDk(lostValue)} walked
            </span>
          ) : (
            <span>None this quarter</span>
          )
        }
        flush
      >
        {lost.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-[var(--muted)]">
            Nothing lost in the current window — keep proposals moving inside 5 days to hold the streak.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {lost.map((e) => (
              <a
                key={e.id}
                href={`/events/${e.id}`}
                className="block px-5 py-3 transition-colors hover:bg-white/[.03]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-[var(--text)]">{e.title}</div>
                    <div className="mt-0.5 truncate text-xs text-[var(--muted)]">
                      {fmtDate(e.eventDate)} · {e.partySize} guests · {e.notes}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-medium tabular-nums text-[var(--text)]">
                      {fmtUSDk(valueOf(e))}
                    </div>
                    <Badge status="lost" className="mt-1" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
