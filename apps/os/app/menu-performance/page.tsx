import * as React from 'react';
import { Suspense } from 'react';
import { getRepository, DEMO_TODAY } from '@viox/db';
import type { MenuItemSales } from '@viox/db';
import {
  Badge,
  Card,
  Kicker,
  PageHeader,
  Stat,
  StatRow,
  fmtDate,
  fmtNumber,
  fmtPct,
  fmtUSD,
  fmtUSDk,
  trendPct,
  type BadgeTone,
} from '@viox/ui';
import MenuFilterBar from './components/MenuFilterBar';
import MenuMatrix, { type MatrixPoint, type Quadrant } from './components/MenuMatrix';
import MenuTable, { type MenuTableRow } from './components/MenuTable';

const PERIOD_LABELS: Record<string, string> = { '2026-07': 'July 2026', '2026-06': 'June 2026' };

interface ItemAgg {
  name: string;
  category: string;
  qtySold: number;
  netSales: number;
  plateCost: number;
  margin: number;
  quadrant: Quadrant;
  /** true when the two locations disagreed and the quadrant was re-derived. */
  derived: boolean;
}

const QUADRANT_ORDER: Quadrant[] = ['star', 'plow_horse', 'puzzle', 'dog'];

const QUADRANT_COPY: Record<Quadrant, { title: string; tone: BadgeTone; action: string }> = {
  star: {
    title: 'Stars',
    tone: 'good',
    action: 'Protect and feature — hold spec and portioning, headline these on menus, socials, and server pitches.',
  },
  plow_horse: {
    title: 'Plow horses',
    tone: 'warn',
    action: 'Popular but thin margin — engineer the plate cost down or take a $1–2 price nudge; volume will hold.',
  },
  puzzle: {
    title: 'Puzzles',
    tone: 'info',
    action: 'High margin, low velocity — reposition on the menu, train the server pitch, run as a featured special.',
  },
  dog: {
    title: 'Dogs',
    tone: 'bad',
    action: 'Low margin, low velocity — rework the recipe, fold into a prix fixe, or retire at the next menu print.',
  },
};

/** Kasavana–Smith: popular = share ≥ 70% of an even split; profitable = unit margin ≥ weighted average. */
function deriveQuadrant(qty: number, unitMargin: number, popularityQty: number, avgUnitMargin: number): Quadrant {
  const popular = qty >= popularityQty;
  const profitable = unitMargin >= avgUnitMargin;
  if (popular && profitable) return 'star';
  if (popular) return 'plow_horse';
  if (profitable) return 'puzzle';
  return 'dog';
}

function aggregate(rows: MenuItemSales[]): ItemAgg[] {
  const byName = new Map<string, ItemAgg & { quadrants: Quadrant[] }>();
  for (const r of rows) {
    const cur = byName.get(r.menuItemName);
    if (cur) {
      cur.qtySold += r.qtySold;
      cur.netSales += r.netSales;
      cur.margin += r.margin;
      cur.quadrants.push(r.quadrant);
    } else {
      byName.set(r.menuItemName, {
        name: r.menuItemName,
        category: r.category,
        qtySold: r.qtySold,
        netSales: r.netSales,
        plateCost: r.plateCost,
        margin: r.margin,
        quadrant: r.quadrant,
        derived: false,
        quadrants: [r.quadrant],
      });
    }
  }
  const items = [...byName.values()];

  const totalQty = items.reduce((s, i) => s + i.qtySold, 0);
  const totalMargin = items.reduce((s, i) => s + i.margin, 0);
  const popularityQty = items.length > 0 ? (totalQty / items.length) * 0.7 : 0;
  const avgUnitMargin = totalQty > 0 ? totalMargin / totalQty : 0;

  return items.map((i) => {
    const agreed = i.quadrants.every((q) => q === i.quadrants[0]);
    const unitMargin = i.qtySold > 0 ? i.margin / i.qtySold : 0;
    return {
      name: i.name,
      category: i.category,
      qtySold: i.qtySold,
      netSales: i.netSales,
      plateCost: i.plateCost,
      margin: i.margin,
      quadrant: agreed ? i.quadrants[0] : deriveQuadrant(i.qtySold, unitMargin, popularityQty, avgUnitMargin),
      derived: !agreed,
    };
  });
}

export default async function MenuPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; loc?: string }>;
}) {
  const { period: periodParam, loc } = await searchParams;
  const period = periodParam === '2026-06' ? '2026-06' : '2026-07';
  const otherPeriod = period === '2026-07' ? '2026-06' : '2026-07';

  const repo = getRepository();
  const [locations, periodRows, otherRows] = await Promise.all([
    repo.getLocations(),
    repo.getMenuItemSales(period),
    repo.getMenuItemSales(otherPeriod),
  ]);

  const activeLoc = locations.find((l) => l.id === loc);
  const scope = (rows: MenuItemSales[]) => (activeLoc ? rows.filter((r) => r.locationId === activeLoc.id) : rows);
  const scopeLabel = activeLoc ? activeLoc.name : 'Both locations';

  const items = aggregate(scope(periodRows));
  const otherItems = aggregate(scope(otherRows));

  // ---------- headline totals ----------
  const totalNet = items.reduce((s, i) => s + i.netSales, 0);
  const totalMargin = items.reduce((s, i) => s + i.margin, 0);
  const totalQty = items.reduce((s, i) => s + i.qtySold, 0);
  const totalCost = items.reduce((s, i) => s + i.qtySold * i.plateCost, 0);
  const costPct = totalNet > 0 ? (totalCost / totalNet) * 100 : 0;

  const otherNet = otherItems.reduce((s, i) => s + i.netSales, 0);
  const otherMargin = otherItems.reduce((s, i) => s + i.margin, 0);
  const otherCost = otherItems.reduce((s, i) => s + i.qtySold * i.plateCost, 0);
  const otherCostPct = otherNet > 0 ? (otherCost / otherNet) * 100 : 0;
  const costDelta = Math.round((costPct - otherCostPct) * 10) / 10;

  const starCount = items.filter((i) => i.quadrant === 'star').length;
  const vsLabel = `vs ${PERIOD_LABELS[otherPeriod].slice(0, 3)}`;

  // ---------- matrix ----------
  const popularityQty = items.length > 0 ? (totalQty / items.length) * 0.7 : 0;
  const avgUnitMargin = totalQty > 0 ? totalMargin / totalQty : 0;
  const points: MatrixPoint[] = items.map((i) => {
    const unitNet = i.qtySold > 0 ? i.netSales / i.qtySold : 0;
    return {
      name: i.name,
      category: i.category,
      qty: i.qtySold,
      unitMargin: Math.round((i.qtySold > 0 ? i.margin / i.qtySold : 0) * 100) / 100,
      netSales: i.netSales,
      costPct: unitNet > 0 ? (i.plateCost / unitNet) * 100 : 0,
      quadrant: i.quadrant,
    };
  });

  // ---------- table rows ----------
  const tableRows: MenuTableRow[] = items.map((i) => {
    const unitNet = i.qtySold > 0 ? i.netSales / i.qtySold : 0;
    return {
      id: i.name,
      name: i.name,
      category: i.category,
      quadrant: i.quadrant,
      qtySold: i.qtySold,
      netSales: i.netSales,
      plateCost: i.plateCost,
      unitMargin: Math.round((i.qtySold > 0 ? i.margin / i.qtySold : 0) * 100) / 100,
      margin: i.margin,
      costPct: unitNet > 0 ? (i.plateCost / unitNet) * 100 : 0,
    };
  });

  return (
    <>
      <PageHeader
        kicker={`Menu engineering · ${scopeLabel}`}
        title="Menu Performance"
        subtitle={`Popularity vs profitability for ${PERIOD_LABELS[period]} — every plate placed in its Kasavana–Smith quadrant with a recommended play.`}
        actions={
          <Badge tone="accent" className="!px-2.5 !py-1">
            Demo day · {fmtDate(DEMO_TODAY, true)}
          </Badge>
        }
      />

      <Suspense fallback={<div className="h-9 rounded-lg border border-[var(--border)] bg-[var(--panel)]" />}>
        <MenuFilterBar locations={locations.map((l) => ({ id: l.id, name: l.name }))} />
      </Suspense>

      {/* ---------- KPI row ---------- */}
      <StatRow cols={4}>
        <Stat
          label={`Menu net sales · ${PERIOD_LABELS[period].slice(0, 3)}`}
          value={fmtUSDk(totalNet)}
          delta={trendPct(totalNet, otherNet)}
          hint={`${vsLabel} ${fmtUSDk(otherNet)} · ${fmtNumber(totalQty)} plates`}
          highlight
        />
        <Stat
          label="Contribution margin"
          value={fmtUSDk(totalMargin)}
          delta={trendPct(totalMargin, otherMargin)}
          hint={`${vsLabel} ${fmtUSDk(otherMargin)} · ${fmtPct(totalNet > 0 ? (totalMargin / totalNet) * 100 : 0, 0)} of net`}
        />
        <Stat
          label="Food cost %"
          value={fmtPct(costPct)}
          delta={costDelta}
          deltaGood={costDelta <= 0}
          hint={`target 28% · pts ${vsLabel}`}
        />
        <Stat
          label="Stars"
          value={`${starCount} / ${items.length}`}
          hint={`${items.filter((i) => i.quadrant === 'dog').length === 1 ? '1 dog needs' : `${items.filter((i) => i.quadrant === 'dog').length} dogs need`} a decision`}
        />
      </StatRow>

      {/* ---------- matrix ---------- */}
      <Card
        kicker={`${PERIOD_LABELS[period]} · ${scopeLabel}`}
        title="Menu engineering matrix"
        action={<span>Qty sold × margin per plate</span>}
      >
        <MenuMatrix points={points} xThreshold={popularityQty} yThreshold={avgUnitMargin} />
      </Card>

      {/* ---------- quadrant summary cards ---------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {QUADRANT_ORDER.map((q) => {
          const group = items.filter((i) => i.quadrant === q).sort((a, b) => b.margin - a.margin);
          const groupMargin = group.reduce((s, i) => s + i.margin, 0);
          const copy = QUADRANT_COPY[q];
          return (
            <Card
              key={q}
              kicker={`${group.length} item${group.length === 1 ? '' : 's'}`}
              title={copy.title}
              action={<Badge status={q} />}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-semibold tracking-tight tabular-nums text-[var(--text)]">
                  {fmtUSDk(groupMargin)}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {fmtPct(totalMargin > 0 ? (groupMargin / totalMargin) * 100 : 0, 0)} of margin
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {group.length > 0 ? (
                  group.map((i) => (
                    <Badge key={i.name} tone={copy.tone}>
                      {i.name}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-[var(--muted)]">None this period.</span>
                )}
              </div>
              <div className="mt-4 border-t border-[var(--border)] pt-3">
                <Kicker>Recommended play</Kicker>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{copy.action}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ---------- sortable item table ---------- */}
      <Card
        kicker={`${items.length} tracked items · ${PERIOD_LABELS[period]}`}
        title="Item detail"
        action={<span>Click a column to sort</span>}
        flush
      >
        <MenuTable rows={tableRows} />
      </Card>
    </>
  );
}
