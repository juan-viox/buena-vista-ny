import * as React from 'react';
import { notFound } from 'next/navigation';
import { getRepository } from '@viox/db';
import type { RecipeIngredient } from '@viox/db';
import {
  Badge,
  Card,
  DataTable,
  PageHeader,
  ProgressBar,
  Stat,
  StatRow,
  fmtNumber,
  fmtPct,
  fmtSignedPct,
  fmtUSD,
  type Column,
} from '@viox/ui';

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = getRepository();
  const [recipes, items, vendors] = await Promise.all([
    repo.getRecipes(),
    repo.getInventoryItems(),
    repo.getVendors(),
  ]);

  const recipe = recipes.find((r) => r.id === id);
  if (!recipe) notFound();

  const itemById = new Map(items.map((i) => [i.id, i]));
  const vendorName = (vendorId?: string) => vendors.find((v) => v.id === vendorId)?.name ?? '—';

  const margin = recipe.menuPrice - recipe.plateCost;
  const deltaPts = Math.round((recipe.costPct - recipe.targetCostPct) * 10) / 10;
  const overTarget = recipe.costPct > recipe.targetCostPct;

  const sortedIngredients = [...recipe.ingredients].sort((a, b) => b.cost - a.cost);
  const top = sortedIngredients[0];
  const topShare = top ? (top.cost / recipe.plateCost) * 100 : 0;

  // what-if: top ingredient +10%
  const bump = top ? Math.round(top.cost * 0.1 * 100) / 100 : 0;
  const whatIfPlate = Math.round((recipe.plateCost + bump) * 100) / 100;
  const whatIfPct = (whatIfPlate / recipe.menuPrice) * 100;
  const whatIfDeltaPts = Math.round((whatIfPct - recipe.costPct) * 10) / 10;

  // menu-price suggestion (only when over target)
  const suggestedPrice = Math.ceil(recipe.plateCost / (recipe.targetCostPct / 100));
  const trimNeeded = Math.round((recipe.plateCost - (recipe.menuPrice * recipe.targetCostPct) / 100) * 100) / 100;

  const columns: Column<RecipeIngredient>[] = [
    {
      key: 'itemName',
      header: 'Ingredient',
      render: (ing) => {
        const item = itemById.get(ing.itemId);
        return (
          <div className="min-w-0">
            <div className="font-medium">{ing.itemName}</div>
            <div className="mt-0.5 text-xs text-[var(--muted)]">{vendorName(item?.primaryVendorId)}</div>
          </div>
        );
      },
    },
    {
      key: 'qty',
      header: 'Qty',
      numeric: true,
      render: (ing) => `${ing.qty} ${ing.unit}`,
    },
    {
      key: 'cost',
      header: 'Cost',
      numeric: true,
      render: (ing) => <span className="font-medium">{fmtUSD(ing.cost)}</span>,
    },
    {
      key: 'share',
      header: '% of plate',
      width: '180px',
      render: (ing) => {
        const share = recipe.plateCost > 0 ? (ing.cost / recipe.plateCost) * 100 : 0;
        return (
          <div className="w-36">
            <div className="mb-1 text-right text-xs tabular-nums text-[var(--text)]">{fmtPct(share, 0)}</div>
            <ProgressBar value={share} tone={share >= 30 ? 'warn' : 'accent'} />
          </div>
        );
      },
    },
    {
      key: 'trend',
      header: 'Item price trend',
      numeric: true,
      render: (ing) => {
        const item = itemById.get(ing.itemId);
        if (!item || item.avgPrice30d <= 0) return <span className="text-xs text-[var(--muted)]">—</span>;
        const pct = (item.lastPrice / item.avgPrice30d - 1) * 100;
        if (Math.abs(pct) < 0.5) return <span className="text-xs text-[var(--muted)]">flat</span>;
        return (
          <span
            className={`text-xs font-medium tabular-nums ${pct > 0 ? 'text-[var(--bad)]' : 'text-[var(--good)]'}`}
          >
            {fmtSignedPct(pct)}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        kicker={
          <span>
            <a href="/recipes" className="hover:text-[var(--accent)]">
              Recipes &amp; Costing
            </a>
            {' · '}
            {recipe.category}
          </span>
        }
        title={recipe.menuItemName}
        subtitle={`${recipe.ingredients.length} costed ingredients · priced off the latest vendor invoices.`}
        actions={
          overTarget ? (
            <Badge tone="bad">{fmtSignedPct(deltaPts)} pts vs target</Badge>
          ) : (
            <Badge tone="good">{fmtPct(Math.abs(deltaPts))} pts under target</Badge>
          )
        }
      />

      {/* ---------- KPI row ---------- */}
      <StatRow cols={4}>
        <Stat label="Menu price" value={fmtUSD(recipe.menuPrice)} highlight />
        <Stat
          label="Plate cost"
          value={fmtUSD(recipe.plateCost)}
          hint={top ? `${top.itemName} is ${fmtPct(topShare, 0)} of it` : undefined}
        />
        <Stat
          label="Cost %"
          value={fmtPct(recipe.costPct)}
          delta={deltaPts}
          deltaGood={deltaPts <= 0}
          hint={`target ${fmtPct(recipe.targetCostPct, 0)} · pts vs target`}
        />
        <Stat label="Margin $" value={fmtUSD(margin)} hint="contribution per plate sold" />
      </StatRow>

      {/* ---------- ingredients + sensitivity ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          kicker="Bill of materials"
          title="Ingredient breakdown"
          action={<span>sorted by cost</span>}
          flush
          className="lg:col-span-2"
        >
          <DataTable columns={columns} rows={sortedIngredients} rowKey={(ing) => ing.itemId} />
          <div className="flex items-center justify-end gap-6 border-t border-[var(--border)] px-4 py-3 text-sm">
            <span className="text-xs uppercase tracking-[.12em] text-[var(--muted)]">Plate cost</span>
            <span className="text-base font-semibold tabular-nums text-[var(--text)]">
              {fmtUSD(recipe.plateCost)}
            </span>
          </div>
        </Card>

        <div className="space-y-4">
          {/* ---------- what-if sensitivity ---------- */}
          {top && (
            <Card kicker="Price sensitivity" title="What-if: top ingredient +10%">
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                <span className="font-medium text-[var(--text)]">{top.itemName}</span> carries{' '}
                {fmtPct(topShare, 0)} of this plate. If{' '}
                <span className="text-[var(--text)]">{vendorName(itemById.get(top.itemId)?.primaryVendorId)}</span>{' '}
                moves it +10%, plate cost rises {fmtUSD(bump)} to{' '}
                <span className="font-medium tabular-nums text-[var(--text)]">{fmtUSD(whatIfPlate)}</span> and cost %
                hits{' '}
                <span className={`font-medium tabular-nums ${whatIfPct > recipe.targetCostPct ? 'text-[var(--bad)]' : 'text-[var(--text)]'}`}>
                  {fmtPct(whatIfPct)}
                </span>{' '}
                ({fmtSignedPct(whatIfDeltaPts)} pts).
              </p>
              <div className="mt-4 space-y-3">
                <ProgressBar
                  label="Today"
                  valueLabel={fmtPct(recipe.costPct)}
                  value={Math.min(100, (recipe.costPct / (recipe.targetCostPct * 1.5)) * 100)}
                  tone={overTarget ? 'bad' : 'good'}
                />
                <ProgressBar
                  label={`${top.itemName} +10%`}
                  valueLabel={fmtPct(whatIfPct)}
                  value={Math.min(100, (whatIfPct / (recipe.targetCostPct * 1.5)) * 100)}
                  tone={whatIfPct > recipe.targetCostPct ? 'bad' : 'warn'}
                />
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">
                Every +{fmtUSD(Math.round(recipe.menuPrice) / 100)} of plate cost adds ~1 pt of food cost at the
                current {fmtUSD(recipe.menuPrice)} price.
              </p>
            </Card>
          )}

          {/* ---------- pricing recommendation ---------- */}
          {overTarget ? (
            <Card kicker="Recommendation" title="Menu-price suggestion">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-semibold tabular-nums text-[var(--accent)]">
                  {fmtUSD(suggestedPrice)}
                </span>
                <span className="text-sm text-[var(--muted)]">
                  from {fmtUSD(recipe.menuPrice)} ({fmtUSD(suggestedPrice - recipe.menuPrice)} lift)
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                Repricing to {fmtUSD(suggestedPrice)} restores the {fmtPct(recipe.targetCostPct, 0)} target at
                today&apos;s ingredient costs. Prefer to hold the price? Trim{' '}
                <span className="font-medium tabular-nums text-[var(--text)]">{fmtUSD(trimNeeded)}</span> off the
                plate — start with {top ? top.itemName.toLowerCase() : 'the top ingredient'} by portion or by
                renegotiating with the vendor.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="accent">Reprice to {fmtUSD(suggestedPrice)}</Badge>
                <Badge tone="muted">or trim {fmtUSD(trimNeeded)}/plate</Badge>
              </div>
            </Card>
          ) : (
            <Card kicker="Recommendation" title="Holding its target">
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                {recipe.menuItemName} runs {fmtPct(Math.abs(deltaPts))} pts under its{' '}
                {fmtPct(recipe.targetCostPct, 0)} target and contributes{' '}
                <span className="font-medium tabular-nums text-[var(--text)]">{fmtUSD(margin)}</span> per plate. No
                price action needed — protect the margin by watching{' '}
                {top ? top.itemName.toLowerCase() : 'the top ingredient'} ({fmtNumber(Math.round(topShare))}% of
                plate cost).
              </p>
              <div className="mt-3">
                <Badge tone="good">No action needed</Badge>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
