import * as React from 'react';
import { Suspense } from 'react';
import { getRepository, DEMO_TODAY } from '@viox/db';
import type { DailySales, LaborShift, Location } from '@viox/db';
import {
  Badge,
  Card,
  DataTable,
  Kicker,
  PageHeader,
  ProgressBar,
  Stat,
  StatRow,
  fmtDate,
  fmtNumber,
  fmtPct,
  fmtUSD,
  fmtUSDk,
  trendPct,
  type BadgeTone,
  type Column,
} from '@viox/ui';
import LaborFilterBar from './components/LaborFilterBar';
import LaborTrendChart, { type LaborTrendPoint } from './components/LaborTrendChart';

// ---------- demo-date helpers (anchor = 2026-07-29) ----------

const DAY_MS = 86_400_000;
const ANCHOR = Date.parse(`${DEMO_TODAY}T00:00:00Z`);
const daysAgoIso = (n: number) => new Date(ANCHOR - n * DAY_MS).toISOString().slice(0, 10);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekdayOf = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];

const LABOR_TARGET = 29;
const OT_THRESHOLD = 40;
const OT_WATCH = 28;

const ROLE_TONES: Record<string, BadgeTone> = {
  Server: 'info',
  Bartender: 'accent',
  'Line Cook': 'warn',
  Host: 'muted',
  Manager: 'good',
};
const ROLE_COLORS: Record<string, string> = {
  Server: 'var(--info)',
  Bartender: 'var(--accent)',
  'Line Cook': 'var(--warn)',
  Host: 'var(--muted)',
  Manager: 'var(--good)',
};

const pts = (n: number) => Math.round(n * 10) / 10;
const sum = (ns: number[]) => ns.reduce((s, n) => s + n, 0);

export default async function LaborPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string; role?: string }>;
}) {
  const { loc, role } = await searchParams;

  const repo = getRepository();
  const [locations, sales30, shifts] = await Promise.all([
    repo.getLocations(),
    repo.getDailySales({ from: daysAgoIso(29), to: DEMO_TODAY }),
    repo.getLaborShifts(),
  ]);

  const activeLoc = locations.find((l) => l.id === loc);
  const scopeLabel = activeLoc ? activeLoc.name : 'Both locations';
  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? '—';

  const scopedSales = activeLoc ? sales30.filter((d) => d.locationId === activeLoc.id) : sales30;
  const scopedShifts = activeLoc ? shifts.filter((s) => s.locationId === activeLoc.id) : shifts;

  const roles = [...new Set(shifts.map((s) => s.role))];
  const activeRole = role && roles.includes(role) ? role : undefined;
  const tableShifts = (activeRole ? scopedShifts.filter((s) => s.role === activeRole) : scopedShifts).sort(
    (a, b) => (a.date === b.date ? (a.cost === b.cost ? a.employee.localeCompare(b.employee) : b.cost - a.cost) : a.date < b.date ? 1 : -1),
  );

  // ---------- labor KPIs (from POS daily sales) ----------
  const laborPctOf = (rows: DailySales[]) => {
    const net = sum(rows.map((d) => d.netSales));
    return net > 0 ? (sum(rows.map((d) => d.laborCost)) / net) * 100 : 0;
  };
  const last7 = scopedSales.filter((d) => d.date >= daysAgoIso(6));
  const prior7 = scopedSales.filter((d) => d.date >= daysAgoIso(13) && d.date < daysAgoIso(6));
  const net7 = sum(last7.map((d) => d.netSales));
  const cost7 = sum(last7.map((d) => d.laborCost));
  const cost7Prior = sum(prior7.map((d) => d.laborCost));
  const labor7 = laborPctOf(last7);
  const labor7Prior = laborPctOf(prior7);
  const laborDelta = pts(labor7 - labor7Prior);
  const labor30 = laborPctOf(scopedSales);

  // ---------- weekly hours per employee (scheduled shifts, last 7d) ----------
  const byEmployee = new Map<string, { employee: string; role: string; locationId: string; hours: number; cost: number; shifts: number }>();
  for (const s of scopedShifts) {
    const cur = byEmployee.get(s.employee) ?? {
      employee: s.employee,
      role: s.role,
      locationId: s.locationId,
      hours: 0,
      cost: 0,
      shifts: 0,
    };
    cur.hours += s.hours;
    cur.cost += s.cost;
    cur.shifts += 1;
    byEmployee.set(s.employee, cur);
  }
  const weeklyHours = [...byEmployee.values()].sort((a, b) => b.hours - a.hours);
  const otFlags = weeklyHours.filter((e) => e.hours > OT_THRESHOLD);
  const otWatch = weeklyHours.filter((e) => e.hours > OT_WATCH && e.hours <= OT_THRESHOLD);
  const scheduledHours = sum(scopedShifts.map((s) => s.hours));

  // ---------- role-cost breakdown (last 7d scheduled) ----------
  const byRole = new Map<string, { role: string; cost: number; hours: number; heads: Set<string> }>();
  for (const s of scopedShifts) {
    const cur = byRole.get(s.role) ?? { role: s.role, cost: 0, hours: 0, heads: new Set<string>() };
    cur.cost += s.cost;
    cur.hours += s.hours;
    cur.heads.add(s.employee);
    byRole.set(s.role, cur);
  }
  const roleRows = [...byRole.values()].sort((a, b) => b.cost - a.cost);
  const roleCostTotal = sum(roleRows.map((r) => r.cost));

  // ---------- trend chart: labor % vs sales, 30 days ----------
  const byDate = new Map<string, { net: number; labor: number }>();
  for (const d of scopedSales) {
    const cur = byDate.get(d.date) ?? { net: 0, labor: 0 };
    cur.net += d.netSales;
    cur.labor += d.laborCost;
    byDate.set(d.date, cur);
  }
  const chartData: LaborTrendPoint[] = [];
  for (let off = 29; off >= 0; off--) {
    const date = daysAgoIso(off);
    const t = byDate.get(date);
    chartData.push({
      label: fmtDate(date),
      netSales: t?.net ?? 0,
      laborPct: t && t.net > 0 ? Math.round((t.labor / t.net) * 1000) / 10 : 0,
    });
  }

  // ---------- best / worst labor day (30d, scope-aggregated) ----------
  const dayPcts = [...byDate.entries()]
    .filter(([, t]) => t.net > 0)
    .map(([date, t]) => ({ date, pct: (t.labor / t.net) * 100 }))
    .sort((a, b) => a.pct - b.pct);
  const bestDay = dayPcts[0];
  const worstDay = dayPcts[dayPcts.length - 1];

  // ---------- shifts table ----------
  const shiftCols: Column<LaborShift>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (s) => (
        <span>
          <span className="text-[var(--muted)]">{weekdayOf(s.date)}</span> {fmtDate(s.date)}
        </span>
      ),
    },
    { key: 'location', header: 'Location', render: (s) => locName(s.locationId), cellClassName: 'text-[var(--muted)]' },
    { key: 'employee', header: 'Employee', cellClassName: 'font-medium' },
    {
      key: 'role',
      header: 'Role',
      render: (s) => <Badge tone={ROLE_TONES[s.role] ?? 'muted'}>{s.role}</Badge>,
    },
    { key: 'hours', header: 'Hours', numeric: true, render: (s) => s.hours.toFixed(2) },
    { key: 'wage', header: 'Wage', numeric: true, render: (s) => `${fmtUSD(s.wage)}/hr` },
    { key: 'cost', header: 'Cost', numeric: true, render: (s) => fmtUSD(s.cost) },
  ];

  return (
    <>
      <PageHeader
        kicker={`Labor · ${scopeLabel}`}
        title="Labor Command"
        subtitle="Labor percentage against sales, scheduled shifts, role costs, and overtime exposure — Toast time-clock feed."
        actions={
          <Badge tone="accent" className="!px-2.5 !py-1">
            Demo day · {fmtDate(DEMO_TODAY, true)}
          </Badge>
        }
      />

      <Suspense fallback={<div className="h-9 rounded-lg border border-[var(--border)] bg-[var(--panel)]" />}>
        <LaborFilterBar locations={locations.map((l) => ({ id: l.id, name: l.name }))} roles={roles} />
      </Suspense>

      {/* ---------- KPI row ---------- */}
      <StatRow cols={5}>
        <Stat
          label="Labor % · 7d"
          value={fmtPct(labor7)}
          delta={laborDelta}
          deltaGood={laborDelta <= 0}
          hint={`target ≤ ${LABOR_TARGET}% · pts vs prior 7d`}
          highlight
        />
        <Stat
          label="Labor cost · 7d"
          value={fmtUSDk(cost7)}
          delta={trendPct(cost7, cost7Prior)}
          deltaGood={trendPct(cost7, cost7Prior) <= 0}
          hint={`on ${fmtUSDk(net7)} net sales`}
        />
        <Stat
          label="Sales per labor $"
          value={fmtUSD(cost7 > 0 ? net7 / cost7 : 0)}
          hint="net sales returned per $1 of labor"
        />
        <Stat
          label="Scheduled hours · 7d"
          value={fmtNumber(scheduledHours)}
          hint={`${scopedShifts.length} shifts · ${weeklyHours.length} staff`}
        />
        <Stat
          label="Overtime flags"
          value={fmtNumber(otFlags.length)}
          hint={
            otFlags.length > 0
              ? `${otFlags[0].employee} leads at ${otFlags[0].hours.toFixed(1)}h`
              : otWatch.length > 0
                ? `${otWatch.length} approaching · ${otWatch[0].employee} at ${otWatch[0].hours.toFixed(1)}h`
                : 'no one near 40h this week'
          }
        />
      </StatRow>

      {/* ---------- trend + targets ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          kicker="Labor % vs net sales · last 30 days"
          title="Labor efficiency trend"
          action={<span>Toast time clock · nightly</span>}
          className="lg:col-span-2"
        >
          <LaborTrendChart data={chartData} target={LABOR_TARGET} />
        </Card>

        <Card kicker="Where we stand" title="Labor targets">
          <div className="space-y-4">
            {(activeLoc ? [activeLoc] : locations).map((l: Location) => {
              const locRows = last7.filter((d) => d.locationId === l.id);
              const pct = laborPctOf(locRows);
              const tone = pct <= LABOR_TARGET ? 'good' : pct <= LABOR_TARGET + 1.5 ? 'warn' : 'bad';
              return (
                <ProgressBar
                  key={l.id}
                  value={(pct / (LABOR_TARGET + 8)) * 100}
                  tone={tone}
                  label={`${l.name} · 7d`}
                  valueLabel={`${fmtPct(pct)} / ${LABOR_TARGET}%`}
                />
              );
            })}
            <div className="grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4">
              <div>
                <Kicker>30d average</Kicker>
                <div className="mt-1 text-sm font-medium tabular-nums text-[var(--text)]">{fmtPct(labor30)}</div>
              </div>
              <div>
                <Kicker>Target</Kicker>
                <div className="mt-1 text-sm font-medium tabular-nums text-[var(--text)]">≤ {LABOR_TARGET}%</div>
              </div>
              {bestDay && (
                <div>
                  <Kicker>Leanest day</Kicker>
                  <div className="mt-1 text-sm font-medium tabular-nums text-[var(--good)]">
                    {fmtPct(bestDay.pct)} <span className="text-xs font-normal text-[var(--muted)]">{fmtDate(bestDay.date)}</span>
                  </div>
                </div>
              )}
              {worstDay && (
                <div>
                  <Kicker>Heaviest day</Kicker>
                  <div className="mt-1 text-sm font-medium tabular-nums text-[var(--bad)]">
                    {fmtPct(worstDay.pct)} <span className="text-xs font-normal text-[var(--muted)]">{fmtDate(worstDay.date)}</span>
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              Busy Fri/Sat nights run leanest; slow Mondays creep past target — tighten the Monday floor plan first.
            </p>
          </div>
        </Card>
      </div>

      {/* ---------- role costs + overtime ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card kicker="Scheduled cost by role · last 7 days" title="Role-cost breakdown">
          <div className="space-y-4">
            {roleRows.map((r) => {
              const share = roleCostTotal > 0 ? (r.cost / roleCostTotal) * 100 : 0;
              return (
                <div key={r.role}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-[var(--muted)]">
                      {r.role} · {r.heads.size} staff
                    </span>
                    <span className="tabular-nums text-[var(--text)]">
                      {fmtUSD(r.cost)} · {fmtNumber(r.hours)}h · {fmtPct(share, 0)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[.06]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${share}%`, backgroundColor: ROLE_COLORS[r.role] ?? 'var(--muted)' }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
              {fmtUSD(roleCostTotal)} scheduled across {scopedShifts.length} shifts · avg{' '}
              {fmtUSD(scheduledHours > 0 ? roleCostTotal / scheduledHours : 0)}/hr blended
            </div>
          </div>
        </Card>

        <Card
          kicker="Weekly hours vs 40h line"
          title="Overtime watch"
          action={
            <Badge tone={otFlags.length > 0 ? 'bad' : 'good'}>
              {otFlags.length > 0 ? `${otFlags.length} over 40h` : 'None over 40h'}
            </Badge>
          }
        >
          <div className="space-y-4">
            {weeklyHours.slice(0, 6).map((e) => {
              const over = e.hours > OT_THRESHOLD;
              const near = e.hours > OT_WATCH;
              return (
                <div key={e.employee}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-[var(--muted)]">
                      <span className="font-medium text-[var(--text)]">{e.employee}</span> · {e.role} ·{' '}
                      {locName(e.locationId)}
                    </span>
                    <span className="tabular-nums text-[var(--text)]">
                      {e.hours.toFixed(1)}h / {OT_THRESHOLD}h
                      {over && <span className="ml-1.5 text-[var(--bad)]">OT +{(e.hours - OT_THRESHOLD).toFixed(1)}h</span>}
                    </span>
                  </div>
                  <ProgressBar value={(e.hours / OT_THRESHOLD) * 100} tone={over ? 'bad' : near ? 'warn' : 'good'} />
                </div>
              );
            })}
            <div className="border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
              Flags fire past 40h/week per employee. {otWatch.length > 0
                ? `${otWatch.map((e) => e.employee.split(' ')[0]).join(' + ')} trending high — rebalance the Fri/Sat close rotation.`
                : 'Rotation is balanced this week.'}
            </div>
          </div>
        </Card>
      </div>

      {/* ---------- shifts table ---------- */}
      <Card
        kicker={`Last 7 days · ${scopeLabel}${activeRole ? ` · ${activeRole}s` : ''}`}
        title="Shifts"
        action={<span>{tableShifts.length} shifts · {fmtUSD(sum(tableShifts.map((s) => s.cost)))}</span>}
        flush
      >
        <DataTable
          columns={shiftCols}
          rows={tableShifts}
          emptyMessage="No shifts match this filter."
        />
      </Card>
    </>
  );
}
