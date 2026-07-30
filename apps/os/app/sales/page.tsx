import * as React from 'react';
import { Suspense } from 'react';
import { getRepository, DEMO_TODAY } from '@viox/db';
import type { DailySales } from '@viox/db';
import {
  Badge,
  Card,
  DataTable,
  Kicker,
  PageHeader,
  Stat,
  StatRow,
  fmtDate,
  fmtNumber,
  fmtPct,
  fmtSignedPct,
  fmtUSD,
  fmtUSDk,
  trendPct,
  type Column,
} from '@viox/ui';
import DailySalesChart, { type SalesPoint, type SalesSeries } from './components/DailySalesChart';
import SalesFilterBar from './components/SalesFilterBar';

// ---------- demo-date helpers (anchor = 2026-07-29) ----------

const DAY_MS = 86_400_000;
const ANCHOR = Date.parse(`${DEMO_TODAY}T00:00:00Z`);
const daysAgoIso = (n: number) => new Date(ANCHOR - n * DAY_MS).toISOString().slice(0, 10);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekdayOf = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];

const LABOR_TARGET = 29;
const SERIES_COLORS = ['#C9995C', '#7EB2F5', '#34D399', '#FBBF24'];
const CATEGORY_COLORS: Record<string, string> = {
  Food: '#C9995C',
  Cocktails: '#7EB2F5',
  Wine: '#34D399',
  Beer: '#FBBF24',
  'NA Bev': '#8FA3C0',
};
const DAYPART_META: [string, string][] = [
  ['Brunch', '#FBBF24'],
  ['Lunch', '#7EB2F5'],
  ['Pre-Theater', '#C9995C'],
  ['Dinner', '#34D399'],
  ['Late Night', '#8FA3C0'],
];

// ---------- aggregation ----------

interface Totals {
  net: number;
  gross: number;
  guests: number;
  checks: number;
  comps: number;
  voids: number;
  labor: number;
  days: number;
}

function agg(rows: DailySales[]): Totals {
  const t: Totals = { net: 0, gross: 0, guests: 0, checks: 0, comps: 0, voids: 0, labor: 0, days: rows.length };
  for (const d of rows) {
    t.net += d.netSales;
    t.gross += d.grossSales;
    t.guests += d.guestCount;
    t.checks += d.checkCount;
    t.comps += d.comps;
    t.voids += d.voids;
    t.labor += d.laborCost;
  }
  return t;
}

const avgCheckOf = (t: Totals) => (t.checks > 0 ? t.net / t.checks : 0);
const laborPctOf = (t: Totals) => (t.net > 0 ? (t.labor / t.net) * 100 : 0);
const pts = (n: number) => Math.round(n * 10) / 10;

// ---------- WoW / MoM comparison rows ----------

interface MetricRow {
  id: string;
  metric: string;
  cur: string;
  prior: string;
  wow: number | null;
  mtd: string;
  pmtd: string;
  mom: number | null;
  invert: boolean;
  isPts: boolean;
}

function DeltaCell({ value, invert, isPts }: { value: number | null; invert: boolean; isPts: boolean }) {
  if (value === null) return <span className="text-[var(--muted)]">—</span>;
  const good = invert ? value <= 0 : value >= 0;
  const cls = value === 0 ? 'text-[var(--muted)]' : good ? 'text-[var(--good)]' : 'text-[var(--bad)]';
  const body = isPts
    ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)} pts`
    : fmtSignedPct(value);
  return <span className={`font-medium ${cls}`}>{body}</span>;
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string; range?: string }>;
}) {
  const { loc, range } = await searchParams;
  const rangeDays = range && ['7', '30', '60', '90'].includes(range) ? Number(range) : 30;

  const repo = getRepository();
  const [locations, allSales] = await Promise.all([repo.getLocations(), repo.getDailySales()]);

  const activeLoc = locations.find((l) => l.id === loc);
  const scoped = activeLoc ? allSales.filter((d) => d.locationId === activeLoc.id) : allSales;
  const scopeLabel = activeLoc ? activeLoc.name : 'Both locations';

  // ---------- current vs prior window ----------
  const curFrom = daysAgoIso(rangeDays - 1);
  const priorFrom = daysAgoIso(2 * rangeDays - 1);
  const cur = scoped.filter((d) => d.date >= curFrom);
  const prior = scoped.filter((d) => d.date >= priorFrom && d.date < curFrom);
  const hasPrior = prior.length > 0;

  const tCur = agg(cur);
  const tPrior = agg(prior);
  const laborDelta = pts(laborPctOf(tCur) - laborPctOf(tPrior));

  // ---------- chart ----------
  const chartLocs = activeLoc ? [activeLoc] : locations;
  const series: SalesSeries[] = chartLocs.map((l) => ({
    key: l.id,
    name: l.name,
    color: SERIES_COLORS[locations.findIndex((x) => x.id === l.id) % SERIES_COLORS.length],
  }));
  const salesByKey = new Map(cur.map((d) => [`${d.locationId}|${d.date}`, d.netSales]));
  const chartData: SalesPoint[] = [];
  for (let off = rangeDays - 1; off >= 0; off--) {
    const date = daysAgoIso(off);
    const point: SalesPoint = { label: fmtDate(date) };
    for (const l of chartLocs) point[l.id] = salesByKey.get(`${l.id}|${date}`) ?? 0;
    chartData.push(point);
  }

  // ---------- daypart + category mix ----------
  const daypartTotals = new Map<string, number>();
  const categoryTotals = new Map<string, number>();
  for (const d of cur) {
    for (const [k, v] of Object.entries(d.dayparts)) daypartTotals.set(k, (daypartTotals.get(k) ?? 0) + v);
    for (const [k, v] of Object.entries(d.categorySales)) categoryTotals.set(k, (categoryTotals.get(k) ?? 0) + v);
  }
  const daypartRows = DAYPART_META.filter(([name]) => (daypartTotals.get(name) ?? 0) > 0).map(
    ([name, color]) => [name, color, daypartTotals.get(name) ?? 0] as const,
  );
  const daypartTotal = daypartRows.reduce((s, [, , v]) => s + v, 0);
  const catRows = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]);
  const catTotal = catRows.reduce((s, [, v]) => s + v, 0);

  // ---------- best / worst day (scope aggregated per date) ----------
  const byDate = new Map<string, Totals>();
  for (const d of cur) {
    const t = byDate.get(d.date) ?? { net: 0, gross: 0, guests: 0, checks: 0, comps: 0, voids: 0, labor: 0, days: 0 };
    t.net += d.netSales;
    t.gross += d.grossSales;
    t.guests += d.guestCount;
    t.checks += d.checkCount;
    t.comps += d.comps;
    t.voids += d.voids;
    t.labor += d.laborCost;
    t.days += 1;
    byDate.set(d.date, t);
  }
  const dayList = [...byDate.entries()].sort((a, b) => b[1].net - a[1].net);
  const bestDay = dayList[0];
  const worstDay = dayList[dayList.length - 1];

  // ---------- WoW + MoM table (fixed windows, scoped) ----------
  const w0 = scoped.filter((d) => d.date >= daysAgoIso(6));
  const w1 = scoped.filter((d) => d.date >= daysAgoIso(13) && d.date < daysAgoIso(6));
  const monthStart = `${DEMO_TODAY.slice(0, 8)}01`;
  const dom = DEMO_TODAY.slice(8, 10);
  const prevMonthStart = '2026-06-01';
  const prevMonthEnd = `2026-06-${dom}`;
  const mtd = scoped.filter((d) => d.date >= monthStart);
  const pm = scoped.filter((d) => d.date >= prevMonthStart && d.date <= prevMonthEnd);
  const [t0, t1, tM, tP] = [agg(w0), agg(w1), agg(mtd), agg(pm)];

  const metric = (
    id: string,
    label: string,
    pick: (t: Totals) => number,
    fmt: (n: number) => string,
    opts: { invert?: boolean; isPts?: boolean } = {},
  ): MetricRow => {
    const [c, p, m, q] = [pick(t0), pick(t1), pick(tM), pick(tP)];
    return {
      id,
      metric: label,
      cur: fmt(c),
      prior: fmt(p),
      wow: opts.isPts ? pts(c - p) : trendPct(c, p),
      mtd: fmt(m),
      pmtd: fmt(q),
      mom: opts.isPts ? pts(m - q) : trendPct(m, q),
      invert: opts.invert ?? false,
      isPts: opts.isPts ?? false,
    };
  };

  const comparisonRows: MetricRow[] = [
    metric('net', 'Net sales', (t) => t.net, fmtUSD),
    metric('gross', 'Gross sales', (t) => t.gross, fmtUSD),
    metric('guests', 'Guests', (t) => t.guests, fmtNumber),
    metric('checks', 'Checks', (t) => t.checks, fmtNumber),
    metric('avg', 'Avg check', avgCheckOf, fmtUSD),
    metric('comps', 'Comps', (t) => t.comps, fmtUSD, { invert: true }),
    metric('voids', 'Voids', (t) => t.voids, fmtUSD, { invert: true }),
    metric('labor', 'Labor %', laborPctOf, (n) => fmtPct(n), { invert: true, isPts: true }),
  ];

  const comparisonCols: Column<MetricRow>[] = [
    { key: 'metric', header: 'Metric', cellClassName: 'font-medium' },
    { key: 'cur', header: 'Last 7d', numeric: true },
    { key: 'prior', header: 'Prior 7d', numeric: true, cellClassName: 'text-[var(--muted)]' },
    {
      key: 'wow',
      header: 'WoW',
      numeric: true,
      render: (r) => <DeltaCell value={r.wow} invert={r.invert} isPts={r.isPts} />,
    },
    { key: 'mtd', header: 'Jul MTD', numeric: true },
    { key: 'pmtd', header: `Jun 1–${Number(dom)}`, numeric: true, cellClassName: 'text-[var(--muted)]' },
    {
      key: 'mom',
      header: 'MoM',
      numeric: true,
      render: (r) => <DeltaCell value={r.mom} invert={r.invert} isPts={r.isPts} />,
    },
  ];

  const compsVoids = tCur.comps + tCur.voids;
  const compsVoidsPrior = tPrior.comps + tPrior.voids;

  return (
    <>
      <PageHeader
        kicker={`Sales · ${scopeLabel}`}
        title="Sales Command"
        subtitle={`Toast POS feed — net sales, guests, dayparts, and category mix across the trailing ${rangeDays} days.`}
        actions={
          <Badge tone="accent" className="!px-2.5 !py-1">
            Demo day · {fmtDate(DEMO_TODAY, true)}
          </Badge>
        }
      />

      <Suspense fallback={<div className="h-9 rounded-lg border border-[var(--border)] bg-[var(--panel)]" />}>
        <SalesFilterBar locations={locations.map((l) => ({ id: l.id, name: l.name }))} />
      </Suspense>

      {/* ---------- KPI row ---------- */}
      <StatRow cols={5}>
        <Stat
          label={`Net sales · ${rangeDays}d`}
          value={fmtUSDk(tCur.net)}
          delta={hasPrior ? trendPct(tCur.net, tPrior.net) : undefined}
          hint={hasPrior ? `vs ${fmtUSDk(tPrior.net)} prior ${rangeDays}d` : `${tCur.days} service days`}
          highlight
        />
        <Stat
          label="Guests"
          value={fmtNumber(tCur.guests)}
          delta={hasPrior ? trendPct(tCur.guests, tPrior.guests) : undefined}
          hint={`${fmtNumber(tCur.checks)} checks · ${(tCur.checks > 0 ? tCur.guests / tCur.checks : 0).toFixed(1)} covers/check`}
        />
        <Stat
          label="Avg check"
          value={fmtUSD(avgCheckOf(tCur))}
          delta={hasPrior ? trendPct(avgCheckOf(tCur), avgCheckOf(tPrior)) : undefined}
          hint="net sales per check"
        />
        <Stat
          label="Comps + voids"
          value={fmtUSD(compsVoids)}
          delta={hasPrior ? trendPct(compsVoids, compsVoidsPrior) : undefined}
          deltaGood={hasPrior ? trendPct(compsVoids, compsVoidsPrior) <= 0 : undefined}
          hint={`${fmtPct(tCur.gross > 0 ? (compsVoids / tCur.gross) * 100 : 0)} of gross`}
        />
        <Stat
          label="Labor %"
          value={fmtPct(laborPctOf(tCur))}
          delta={hasPrior ? laborDelta : undefined}
          deltaGood={hasPrior ? laborDelta <= 0 : undefined}
          hint={`target ≤ ${LABOR_TARGET}% · pts vs prior`}
        />
      </StatRow>

      {/* ---------- trend + category mix ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          kicker={`Net sales · last ${rangeDays} days`}
          title="Daily sales"
          action={<span>Toast nightly sync</span>}
          className="lg:col-span-2"
        >
          <DailySalesChart data={chartData} series={series} />
        </Card>

        <Card kicker={`Revenue mix · ${rangeDays}d`} title="Category mix">
          <div className="space-y-4">
            {catRows.map(([cat, value]) => {
              const share = catTotal > 0 ? (value / catTotal) * 100 : 0;
              return (
                <div key={cat}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-[var(--muted)]">{cat}</span>
                    <span className="tabular-nums text-[var(--text)]">
                      {fmtUSDk(value)} · {fmtPct(share, 0)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[.06]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${share}%`, backgroundColor: CATEGORY_COLORS[cat] ?? '#8FA3C0' }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
              {fmtUSDk(catTotal)} net over {rangeDays} days · {scopeLabel.toLowerCase()}
            </div>
          </div>
        </Card>
      </div>

      {/* ---------- dayparts + best/worst days ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card kicker={`Service periods · ${rangeDays}d`} title="Daypart breakdown">
          <div className="space-y-4">
            {daypartRows.map(([name, color, value]) => {
              const share = daypartTotal > 0 ? (value / daypartTotal) * 100 : 0;
              return (
                <div key={name}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-[var(--muted)]">{name}</span>
                    <span className="tabular-nums text-[var(--text)]">
                      {fmtUSDk(value)} · {fmtPct(share, 0)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[.06]">
                    <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
            <div className="border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
              Hell&apos;s Kitchen runs lunch + pre-theater; East Village runs late-night Fri/Sat to 2AM.
            </div>
          </div>
        </Card>

        {bestDay && (
          <DayCard
            kicker={`Best day · ${rangeDays}d`}
            tone="good"
            date={bestDay[0]}
            totals={bestDay[1]}
            note="Feature this shape: staff up, push high-margin cocktails."
          />
        )}
        {worstDay && (
          <DayCard
            kicker={`Slowest day · ${rangeDays}d`}
            tone="bad"
            date={worstDay[0]}
            totals={worstDay[1]}
            note="Candidate for promos, industry night, or trimmed floor plan."
          />
        )}
      </div>

      {/* ---------- WoW + MoM comparison ---------- */}
      <Card
        kicker={`Period comparison · ${scopeLabel}`}
        title="Week-over-week & month-over-month"
        action={<span>Jul MTD vs same span in Jun</span>}
        flush
      >
        <DataTable columns={comparisonCols} rows={comparisonRows} zebra />
      </Card>
    </>
  );
}

// ---------- best / worst day card ----------

function DayCard({
  kicker,
  tone,
  date,
  totals,
  note,
}: {
  kicker: string;
  tone: 'good' | 'bad';
  date: string;
  totals: Totals;
  note: string;
}) {
  const toneVar = tone === 'good' ? 'var(--good)' : 'var(--bad)';
  return (
    <Card kicker={kicker} title={`${weekdayOf(date)} · ${fmtDate(date)}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums" style={{ color: toneVar }}>
          {fmtUSDk(totals.net)}
        </span>
        <span className="text-xs text-[var(--muted)]">net sales</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--border)] pt-4">
        <div>
          <Kicker>Guests</Kicker>
          <div className="mt-1 text-sm font-medium tabular-nums text-[var(--text)]">{fmtNumber(totals.guests)}</div>
        </div>
        <div>
          <Kicker>Avg check</Kicker>
          <div className="mt-1 text-sm font-medium tabular-nums text-[var(--text)]">{fmtUSD(avgCheckOf(totals))}</div>
        </div>
        <div>
          <Kicker>Labor %</Kicker>
          <div className="mt-1 text-sm font-medium tabular-nums text-[var(--text)]">{fmtPct(laborPctOf(totals))}</div>
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">{note}</p>
    </Card>
  );
}
