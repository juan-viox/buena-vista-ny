import * as React from 'react';
import { Suspense } from 'react';
import { getRepository } from '@viox/db';
import type { Recipe } from '@viox/db';
import {
  Badge,
  Card,
  DataTable,
  PageHeader,
  ProgressBar,
  Stat,
  StatRow,
  Tabs,
  fmtNumber,
  fmtPct,
  fmtUSD,
  type Column,
  type TabDef,
} from '@viox/ui';

const CATEGORY_ORDER = ['Mains', 'Starters', 'Cocktails', 'Desserts', 'Brunch'];

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  const repo = getRepository();
  const recipes = await repo.getRecipes();

  const categories = CATEGORY_ORDER.filter((c) => recipes.some((r) => r.category === c));

  // ---------- KPIs ----------
  const avgCost = recipes.length > 0 ? recipes.reduce((s, r) => s + r.costPct, 0) / recipes.length : 0;
  const overTarget = recipes.filter((r) => r.costPct > r.targetCostPct);
  const bestMargin = [...recipes].sort((a, b) => (b.menuPrice - b.plateCost) - (a.menuPrice - a.plateCost))[0];
  const worst = [...recipes].sort((a, b) => b.costPct / b.targetCostPct - a.costPct / a.targetCostPct)[0];

  // ---------- category tabs ----------
  const tabs: TabDef[] = [
    { value: 'all', label: 'Full menu', count: recipes.length },
    ...categories.map((c) => ({
      value: c,
      label: c,
      count: recipes.filter((r) => r.category === c).length,
    })),
  ];
  const activeCat = cat && categories.includes(cat) ? cat : 'all';
  const visible = (activeCat === 'all' ? recipes : recipes.filter((r) => r.category === activeCat))
    .slice()
    .sort((a, b) => b.costPct / b.targetCostPct - a.costPct / a.targetCostPct); // problem dishes first

  // ---------- table ----------
  const columns: Column<Recipe>[] = [
    {
      key: 'menuItemName',
      header: 'Dish',
      render: (r) => (
        <div className="min-w-0">
          <div className="font-medium">{r.menuItemName}</div>
          <div className="mt-0.5 text-xs text-[var(--muted)]">
            {r.category} · {r.ingredients.length} ingredients
          </div>
        </div>
      ),
    },
    {
      key: 'menuPrice',
      header: 'Menu price',
      numeric: true,
      render: (r) => fmtUSD(r.menuPrice),
    },
    {
      key: 'plateCost',
      header: 'Plate cost',
      numeric: true,
      render: (r) => fmtUSD(r.plateCost),
    },
    {
      key: 'costPct',
      header: 'Cost % vs target',
      width: '220px',
      render: (r) => <CostBar recipe={r} />,
    },
    {
      key: 'margin',
      header: 'Margin $',
      numeric: true,
      render: (r) => <span className="font-medium">{fmtUSD(r.menuPrice - r.plateCost)}</span>,
    },
    {
      key: 'verdict',
      header: 'Status',
      align: 'center',
      render: (r) => <VerdictBadge recipe={r} />,
    },
  ];

  return (
    <>
      <PageHeader
        kicker="Inventory · Recipes & Costing"
        title="Recipes & Plate Costing"
        subtitle="Every menu item costed against live vendor prices — the moment an ingredient moves, the plate cost moves with it."
        actions={
          overTarget.length > 0 ? (
            <Badge tone="warn">{overTarget.length} dishes over target</Badge>
          ) : (
            <Badge tone="good">Menu on target</Badge>
          )
        }
      />

      {/* ---------- KPI row ---------- */}
      <StatRow cols={4}>
        <Stat
          label="Avg plate cost"
          value={fmtPct(avgCost)}
          hint="simple average across the costed menu"
          highlight
        />
        <Stat
          label="Over target"
          value={fmtNumber(overTarget.length)}
          hint={
            worst && worst.costPct > worst.targetCostPct
              ? `${worst.menuItemName} worst at ${fmtPct(worst.costPct)} vs ${fmtPct(worst.targetCostPct, 0)}`
              : 'Every dish inside its target'
          }
        />
        <Stat
          label="Best margin"
          value={bestMargin ? fmtUSD(bestMargin.menuPrice - bestMargin.plateCost) : '—'}
          hint={bestMargin ? `${bestMargin.menuItemName} at ${fmtUSD(bestMargin.menuPrice)}` : ''}
        />
        <Stat
          label="Costed recipes"
          value={fmtNumber(recipes.length)}
          hint={`${categories.length} menu categories · priced off last invoices`}
        />
      </StatRow>

      {/* ---------- plate-cost table ---------- */}
      <div>
        <Suspense fallback={<div className="h-10 border-b border-[var(--border)]" />}>
          <Tabs tabs={tabs} param="cat" defaultValue="all" />
        </Suspense>
        <Card flush className="mt-4">
          <DataTable
            columns={columns}
            rows={visible}
            onRowHref={(r) => `/recipes/${r.id}`}
            emptyMessage="No recipes in this category yet."
          />
        </Card>
        <div className="mt-2 text-xs text-[var(--muted)]">
          Sorted worst-first by cost vs target · click a dish for its ingredient breakdown and price sensitivity.
        </div>
      </div>
    </>
  );
}

// ---------- cell helpers ----------

function CostBar({ recipe }: { recipe: Recipe }) {
  const ratio = recipe.targetCostPct > 0 ? recipe.costPct / recipe.targetCostPct : 0;
  const tone = ratio <= 0.95 ? 'good' : ratio <= 1.02 ? 'warn' : 'bad';
  return (
    <div className="w-48">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className={`font-medium tabular-nums ${ratio > 1.02 ? 'text-[var(--bad)]' : 'text-[var(--text)]'}`}>
          {fmtPct(recipe.costPct)}
        </span>
        <span className="tabular-nums text-[var(--muted)]">target {fmtPct(recipe.targetCostPct, 0)}</span>
      </div>
      <ProgressBar value={Math.min(100, ratio * 100)} tone={tone} />
    </div>
  );
}

function VerdictBadge({ recipe }: { recipe: Recipe }) {
  const delta = recipe.costPct - recipe.targetCostPct;
  if (delta <= 0) return <Badge tone="good">On target</Badge>;
  if (delta <= 1.5) return <Badge tone="warn">Watch</Badge>;
  return <Badge tone="bad">Over target</Badge>;
}
