import * as React from 'react';
import { AGENTS } from '@viox/agents';
import { getRepository, DEMO_TODAY } from '@viox/db';
import type {
  ActivityEvent,
  CateringEvent,
  DailySales,
  Guest,
  Invoice,
  MenuItemSales,
  PriceAlert,
  Vendor,
} from '@viox/db';
import {
  Badge,
  Card,
  PageHeader,
  Stat,
  StatRow,
  fmtDate,
  fmtDateTime,
  fmtNumber,
  fmtPct,
  fmtUSD,
  fmtUSDk,
  trendPct,
  statusLabel,
  type BadgeTone,
} from '@viox/ui';
import SalesTrend, { type TrendPoint, type TrendSeries } from './components/SalesTrend';

// ---------- demo-date helpers (anchor = 2026-07-29) ----------

const DAY_MS = 86_400_000;
const ANCHOR = Date.parse(`${DEMO_TODAY}T00:00:00Z`);
const daysAgoIso = (n: number) => new Date(ANCHOR - n * DAY_MS).toISOString().slice(0, 10);

const FOOD_COST_TARGET = 28;
const LABOR_TARGET = 29;
const OPEN_STAGES: CateringEvent['stage'][] = ['lead', 'proposal', 'tasting', 'booked', 'beo_final'];
const SERIES_COLORS = ['var(--accent)', 'var(--info)', 'var(--good)', 'var(--warn)'];
const CATEGORY_COLORS: Record<string, string> = {
  Food: 'var(--accent)',
  Cocktails: 'var(--info)',
  Wine: 'var(--good)',
  Beer: 'var(--warn)',
  'NA Bev': 'var(--muted)',
};
const MODULE_TONES: Record<ActivityEvent['module'], BadgeTone> = {
  sales: 'good',
  inventory: 'warn',
  events: 'accent',
  crm: 'info',
  system: 'muted',
};

interface AttentionItem {
  id: string;
  title: string;
  sub: string;
  status: string;
  tone?: BadgeTone;
  href?: string;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string }>;
}) {
  const { loc } = await searchParams;
  const repo = getRepository();

  const [locations, sales30, menuJul, menuJun, items, invoices, vendors, alerts, events, guests, activity] =
    await Promise.all([
      repo.getLocations(),
      repo.getDailySales({ from: daysAgoIso(29), to: DEMO_TODAY }),
      repo.getMenuItemSales('2026-07'),
      repo.getMenuItemSales('2026-06'),
      repo.getInventoryItems(),
      repo.getInvoices(),
      repo.getVendors(),
      repo.getPriceAlerts(),
      repo.getCateringEvents(),
      repo.getGuests(),
      repo.getActivity(9),
    ]);

  const activeLoc = locations.find((l) => l.id === loc);
  const inScope = <T extends { locationId: string }>(rows: T[]) =>
    activeLoc ? rows.filter((r) => r.locationId === activeLoc.id) : rows;

  const sales = inScope(sales30);
  const mixJul = inScope(menuJul);
  const mixJun = inScope(menuJun);
  const scopedInvoices = inScope(invoices);
  const scopedEvents = inScope(events);

  // ---------- KPIs ----------
  const sumNet = (rows: DailySales[]) => rows.reduce((s, d) => s + d.netSales, 0);
  const last7 = sales.filter((d) => d.date >= daysAgoIso(6));
  const prior7 = sales.filter((d) => d.date >= daysAgoIso(13) && d.date < daysAgoIso(6));
  const net7 = sumNet(last7);
  const net7Prior = sumNet(prior7);

  const foodCostPct = (rows: MenuItemSales[]) => {
    const cost = rows.reduce((s, r) => s + r.qtySold * r.plateCost, 0);
    const net = rows.reduce((s, r) => s + r.netSales, 0);
    return net > 0 ? (cost / net) * 100 : 0;
  };
  const foodJul = foodCostPct(mixJul);
  const foodJun = foodCostPct(mixJun);
  const foodDelta = Math.round((foodJul - foodJun) * 10) / 10;

  const laborPctOf = (rows: DailySales[]) => {
    const net = sumNet(rows);
    const cost = rows.reduce((s, d) => s + d.laborCost, 0);
    return net > 0 ? (cost / net) * 100 : 0;
  };
  const labor7 = laborPctOf(last7);
  const labor7Prior = laborPctOf(prior7);
  const laborDelta = Math.round((labor7 - labor7Prior) * 10) / 10;

  const lowStock = items
    .filter((i) => i.onHand < i.parLevel)
    .sort((a, b) => a.onHand / a.parLevel - b.onHand / b.parLevel);

  const openEvents = scopedEvents.filter((e) => OPEN_STAGES.includes(e.stage));
  const pipelineValue = openEvents.reduce((s, e) => s + (e.quotedTotal || e.budget), 0);
  const bookedCount = openEvents.filter((e) => e.stage === 'booked' || e.stage === 'beo_final').length;

  const upcoming = openEvents
    .filter((e) => e.eventDate.slice(0, 10) >= DEMO_TODAY)
    .sort((a, b) => (a.eventDate < b.eventDate ? -1 : 1));
  const nextConfirmed =
    upcoming.find((e) => e.stage === 'booked' || e.stage === 'beo_final') ?? upcoming[0];

  // ---------- 30-day trend ----------
  const chartLocs = activeLoc ? [activeLoc] : locations;
  const series: TrendSeries[] = chartLocs.map((l) => ({
    key: l.id,
    name: l.name,
    color: SERIES_COLORS[locations.findIndex((x) => x.id === l.id) % SERIES_COLORS.length],
  }));
  const salesByKey = new Map(sales.map((d) => [`${d.locationId}|${d.date}`, d.netSales]));
  const chartData: TrendPoint[] = [];
  for (let off = 29; off >= 0; off--) {
    const date = daysAgoIso(off);
    const point: TrendPoint = { label: fmtDate(date) };
    for (const l of chartLocs) point[l.id] = salesByKey.get(`${l.id}|${date}`) ?? 0;
    chartData.push(point);
  }

  // ---------- category mix (last 30 days) ----------
  const categoryTotals = new Map<string, number>();
  for (const d of sales) {
    for (const [cat, v] of Object.entries(d.categorySales)) {
      categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + v);
    }
  }
  const catRows = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]);
  const catTotal = catRows.reduce((s, [, v]) => s + v, 0);

  // ---------- needs attention ----------
  const vendorName = (id: string) => vendors.find((v: Vendor) => v.id === id)?.name ?? 'Vendor';

  const beoCandidates = scopedEvents.filter(
    (e) => (e.stage === 'booked' || e.stage === 'beo_final') && e.eventDate.slice(0, 10) >= DEMO_TODAY,
  );
  const beoStates = await Promise.all(
    beoCandidates.map(async (e) => ({ event: e, beo: await repo.getBEO(e.id) })),
  );
  const unsignedBeos = beoStates.filter((x) => x.beo && x.beo.status !== 'signed');

  const openAlerts = alerts.filter((a: PriceAlert) => !a.acknowledged);
  const lapsed = guests
    .filter((g: Guest) => g.tags.includes('lapsed'))
    .sort((a, b) => b.lifetimeSpend - a.lifetimeSpend);

  const attention: AttentionItem[] = [
    ...scopedInvoices
      .filter((i: Invoice) => i.status === 'disputed')
      .map((i) => ({
        id: i.id,
        title: `Invoice ${i.invoiceNumber} disputed — ${vendorName(i.vendorId)}`,
        sub: `${fmtUSD(i.total)} · ${i.lineCount} lines · credit memo requested`,
        status: 'disputed',
        href: '/invoices',
      })),
    ...scopedInvoices
      .filter((i: Invoice) => i.status === 'pending_review')
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((i) => ({
        id: i.id,
        title: `Invoice ${i.invoiceNumber} — ${vendorName(i.vendorId)}`,
        sub: `${fmtUSD(i.total)} · ${i.lineCount} lines · scanned ${fmtDate(i.date)}`,
        status: 'pending_review',
        href: '/invoices',
      })),
    ...unsignedBeos.map(({ event, beo }) => ({
      id: event.id,
      title: `BEO ${beo!.status === 'sent' ? 'awaiting signature' : 'still in draft'} — ${event.title}`,
      sub: `${fmtDate(event.eventDate)} · ${event.partySize} guests · ${fmtUSDk(event.quotedTotal || event.budget)}`,
      status: beo!.status,
      tone: 'warn' as BadgeTone,
      href: '/events',
    })),
    ...openAlerts.slice(0, 3).map((a) => ({
      id: a.id,
      title: `${a.itemName} +${fmtPct(a.changePct)} — ${a.vendorName}`,
      sub: `${fmtUSD(a.oldPrice)} → ${fmtUSD(a.newPrice)} · ${fmtDate(a.date)}`,
      status: a.changePct >= 12 ? 'Price spike' : 'Price alert',
      tone: (a.changePct >= 12 ? 'bad' : 'warn') as BadgeTone,
      href: '/inventory',
    })),
    ...(lapsed.length > 0
      ? [
          {
            id: 'lapsed-guests',
            title: `${lapsed.length} lapsed guests past 90 days`,
            sub: `${lapsed[0].name} leads at ${fmtUSD(lapsed[0].lifetimeSpend)} lifetime — win-back segment ready`,
            status: 'lapsed',
          },
        ]
      : []),
  ];

  const scopeLabel = activeLoc ? activeLoc.name : 'Both locations';

  return (
    <>
      <PageHeader
        kicker={`Overview · ${scopeLabel}`}
        title="Command Dashboard"
        subtitle="Buena Vista Restaurant & Bar — live pulse across sales, cost, labor, and the events book."
        actions={
          <Badge tone="accent" className="!px-2.5 !py-1">
            Demo day · {fmtDate(DEMO_TODAY, true)}
          </Badge>
        }
      />

      {/* ---------- KPI row ---------- */}
      <StatRow cols={6}>
        <Stat
          label="Net sales · 7d"
          value={fmtUSDk(net7)}
          delta={trendPct(net7, net7Prior)}
          hint={`vs ${fmtUSDk(net7Prior)} prior 7d`}
          highlight
        />
        <Stat
          label="Food cost · Jul"
          value={fmtPct(foodJul)}
          delta={foodDelta}
          deltaGood={foodDelta <= 0}
          hint={`target ${FOOD_COST_TARGET}% · pts vs Jun`}
        />
        <Stat
          label="Labor · 7d"
          value={fmtPct(labor7)}
          delta={laborDelta}
          deltaGood={laborDelta <= 0}
          hint={`target ≤ ${LABOR_TARGET}% · pts vs prior 7d`}
        />
        <Stat
          label="Low stock"
          value={fmtNumber(lowStock.length)}
          hint={
            lowStock.length > 0
              ? `${lowStock
                  .slice(0, 2)
                  .map((i) => i.name)
                  .join(', ')} critical`
              : 'All items at par'
          }
        />
        <Stat
          label="Pipeline value"
          value={fmtUSDk(pipelineValue)}
          hint={`${openEvents.length} open · ${bookedCount} confirmed`}
        />
        <Stat
          label="Next event"
          value={nextConfirmed ? fmtDate(nextConfirmed.eventDate) : '—'}
          hint={nextConfirmed ? nextConfirmed.title : 'No events on the book'}
        />
      </StatRow>

      {/* ---------- trend + category mix ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          kicker="Net sales · last 30 days"
          title="Sales trend"
          action={<span>Toast nightly sync</span>}
          className="lg:col-span-2"
        >
          <SalesTrend data={chartData} series={series} />
        </Card>

        <Card kicker="Revenue mix · last 30 days" title="Category mix">
          <div className="space-y-4">
            {catRows.map(([cat, value]) => {
              const pct = catTotal > 0 ? (value / catTotal) * 100 : 0;
              return (
                <div key={cat}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-[var(--muted)]">{cat}</span>
                    <span className="tabular-nums text-[var(--text)]">
                      {fmtUSDk(value)} · {fmtPct(pct, 0)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[.06]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[cat] ?? 'var(--muted)' }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
              {fmtUSDk(catTotal)} net over 30 days · {scopeLabel.toLowerCase()}
            </div>
          </div>
        </Card>
      </div>

      {/* ---------- attention + events + activity ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          kicker="Action queue"
          title="Needs attention"
          action={<Badge tone="warn">{attention.length}</Badge>}
          flush
        >
          <div className="divide-y divide-[var(--border)]">
            {attention.map((item) => {
              const body = (
                <div className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-[var(--text)]">{item.title}</div>
                    <div className="mt-0.5 truncate text-xs text-[var(--muted)]">{item.sub}</div>
                  </div>
                  <Badge tone={item.tone} status={item.tone ? undefined : item.status} className="mt-0.5 shrink-0">
                    {statusLabel(item.status)}
                  </Badge>
                </div>
              );
              return item.href ? (
                <a key={item.id} href={item.href} className="block transition-colors hover:bg-white/[.03]">
                  {body}
                </a>
              ) : (
                <div key={item.id}>{body}</div>
              );
            })}
          </div>
        </Card>

        <Card
          kicker="Events book"
          title="Upcoming events"
          action={<a href="/events" className="hover:text-[var(--accent)]">Pipeline →</a>}
          flush
        >
          <div className="divide-y divide-[var(--border)]">
            {upcoming.slice(0, 6).map((e) => (
              <a key={e.id} href="/events" className="block px-5 py-3 transition-colors hover:bg-white/[.03]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-[var(--text)]">{e.title}</div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">
                      {fmtDateTime(e.eventDate)} · {e.partySize} guests · {e.space}
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
          </div>
        </Card>

        <Card
          kicker="Live feed"
          title="Recent activity"
          action={<span>All modules</span>}
          flush
        >
          <div className="divide-y divide-[var(--border)]">
            {activity.map((a) => (
              <div key={a.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs font-medium text-[var(--muted)]">
                    {a.actor} · {fmtDateTime(a.at)}
                  </span>
                  <Badge tone={MODULE_TONES[a.module]} className="shrink-0">
                    {a.module}
                  </Badge>
                </div>
                <p className="mt-1 text-sm leading-snug text-[var(--text)]">{a.message}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ---------- AI team ---------- */}
      <Card
        kicker="Always on"
        title="AI Team"
        action={
          <a href="/agents" className="hover:text-[var(--accent)]">
            Meet the team →
          </a>
        }
        flush
      >
        <div className="grid grid-cols-1 divide-y divide-[var(--border)] sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-3">
          {AGENTS.filter((a) => a.app !== 'crm').map((agent) => (
            <a
              key={agent.id}
              href={`/agents/${agent.id}`}
              className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[.03]"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold"
                style={{ color: agent.color, borderColor: agentTint(agent.color, 0.35), backgroundColor: agentTint(agent.color, 0.08) }}
                aria-hidden
              >
                {agent.monogram}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-[var(--text)]">{agent.name}</span>
                <span className="block truncate text-xs text-[var(--muted)]">
                  {agent.recentOutputs[0]?.title ?? agent.tagline}
                </span>
              </span>
            </a>
          ))}
        </div>
      </Card>
    </>
  );
}

function agentTint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
