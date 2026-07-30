import * as React from 'react';
import { Suspense } from 'react';
import { getRepository } from '@viox/db';
import type { InventoryItem, Vendor } from '@viox/db';
import {
  Badge,
  Card,
  DataTable,
  PageHeader,
  SectionHeader,
  Stat,
  StatRow,
  Tabs,
  fmtDate,
  fmtNumber,
  fmtSignedPct,
  fmtUSD,
  fmtUSDk,
  type Column,
  type TabDef,
} from '@viox/ui';
import PriceAlertsCard from './PriceAlertsCard';

const CATEGORY_ORDER = ['Seafood', 'Meat', 'Produce', 'Dairy', 'Dry Goods', 'Beverage', 'Wine', 'Spirits', 'Beer'];

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; loc?: string }>;
}) {
  const { cat } = await searchParams;
  const repo = getRepository();
  const [items, vendors, counts, alerts, locations] = await Promise.all([
    repo.getInventoryItems(),
    repo.getVendors(),
    repo.getInventoryCounts(),
    repo.getPriceAlerts(),
    repo.getLocations(),
  ]);

  const vendorById = new Map(vendors.map((v: Vendor) => [v.id, v]));
  const vendorName = (id: string) => vendorById.get(id)?.name ?? '—';
  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? id;

  // ---------- KPIs ----------
  const inventoryValue = items.reduce((s, i) => s + i.onHand * i.lastPrice, 0);
  const lowStock = items
    .filter((i) => i.onHand < i.parLevel)
    .sort((a, b) => a.onHand / a.parLevel - b.onHand / b.parLevel);
  const latestCount = [...counts].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const categories = CATEGORY_ORDER.filter((c) => items.some((i) => i.category === c));
  const openAlerts = alerts.filter((a) => !a.acknowledged);

  // ---------- category tabs ----------
  const tabs: TabDef[] = [
    { value: 'all', label: 'All items', count: items.length },
    ...categories.map((c) => ({
      value: c,
      label: c,
      count: items.filter((i) => i.category === c).length,
    })),
  ];
  const activeCat = cat && categories.includes(cat) ? cat : 'all';
  const visible = (activeCat === 'all' ? items : items.filter((i) => i.category === activeCat)).slice().sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category);
    const cb = CATEGORY_ORDER.indexOf(b.category);
    return ca !== cb ? ca - cb : a.name.localeCompare(b.name);
  });

  // ---------- table ----------
  const columns: Column<InventoryItem>[] = [
    {
      key: 'name',
      header: 'Item',
      render: (i) => (
        <div className="min-w-0">
          <div className="font-medium">{i.name}</div>
          <div className="mt-0.5 text-xs text-[var(--muted)]">{vendorName(i.primaryVendorId)}</div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (i) => <Badge tone="muted">{i.category}</Badge>,
    },
    {
      key: 'stock',
      header: 'On hand / par',
      numeric: true,
      render: (i) => (
        <span className="inline-flex items-center gap-2">
          <StockBadge item={i} />
          <span className="tabular-nums">
            {fmtNumber(i.onHand)} / {fmtNumber(i.parLevel)} {i.unit}
          </span>
        </span>
      ),
    },
    {
      key: 'lastPrice',
      header: 'Last price',
      numeric: true,
      render: (i) => `${fmtUSD(i.lastPrice)}/${i.unit}`,
    },
    {
      key: 'avgPrice30d',
      header: '30d avg',
      numeric: true,
      cellClassName: 'text-[var(--muted)]',
      render: (i) => fmtUSD(i.avgPrice30d),
    },
    {
      key: 'trend',
      header: 'Trend',
      numeric: true,
      render: (i) => <PriceTrend last={i.lastPrice} avg={i.avgPrice30d} />,
    },
    {
      key: 'value',
      header: 'On-hand value',
      numeric: true,
      render: (i) => fmtUSD(Math.round(i.onHand * i.lastPrice * 100) / 100),
    },
  ];

  return (
    <>
      <PageHeader
        kicker="Inventory · COGS"
        title="Inventory"
        subtitle="Every tracked SKU across both kitchens — pars, on-hand counts, and vendor price movement in one ledger."
        actions={<Badge tone="info">MarginEdge sync · nightly</Badge>}
      />

      {/* ---------- KPI row ---------- */}
      <StatRow cols={4}>
        <Stat
          label="Inventory value"
          value={fmtUSDk(inventoryValue)}
          hint={`${fmtNumber(items.length)} SKUs at last purchase price`}
          highlight
        />
        <Stat
          label="Low stock"
          value={fmtNumber(lowStock.length)}
          hint={
            lowStock.length > 0
              ? `${lowStock.slice(0, 2).map((i) => i.name).join(', ')} most critical`
              : 'All items at or above par'
          }
        />
        <Stat
          label="Items tracked"
          value={fmtNumber(items.length)}
          hint={`${vendors.length} vendors · ${categories.length} categories`}
        />
        <Stat
          label="Last count"
          value={latestCount ? fmtDate(latestCount.date) : '—'}
          hint={
            latestCount
              ? `${latestCount.countedBy} · ${locName(latestCount.locationId)} · ${fmtUSDk(latestCount.totalValue)}`
              : 'No counts yet'
          }
        />
      </StatRow>

      {/* ---------- price alerts + low stock ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <PriceAlertsCard alerts={alerts} className="lg:col-span-3" />

        <Card
          kicker="Reorder queue"
          title="Low stock — below par"
          action={<Badge tone={lowStock.length > 0 ? 'warn' : 'good'}>{lowStock.length} items</Badge>}
          flush
          className="lg:col-span-2"
        >
          <div className="divide-y divide-[var(--border)]">
            {lowStock.map((i) => {
              const reorderQty = Math.max(1, Math.ceil(i.parLevel * 1.25 - i.onHand));
              const critical = i.onHand / i.parLevel < 0.5;
              return (
                <div key={i.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-[var(--text)]">{i.name}</span>
                      <Badge tone={critical ? 'bad' : 'warn'}>{critical ? 'Critical' : 'Low'}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">
                      {fmtNumber(i.onHand)} of {fmtNumber(i.parLevel)} {i.unit} par · {vendorName(i.primaryVendorId)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-medium tabular-nums text-[var(--text)]">
                      Order {fmtNumber(reorderQty)} {i.unit}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">restores par +25%</div>
                  </div>
                </div>
              );
            })}
            <div className="px-5 py-3 text-xs text-[var(--muted)]">
              Suggested quantities rebuild each SKU to 125% of par ahead of the weekend push.
            </div>
          </div>
        </Card>
      </div>

      {/* ---------- item ledger ---------- */}
      <div>
        <SectionHeader
          kicker="Stock ledger"
          title="Tracked items"
          description="Last invoice price vs trailing 30-day average — red trend means the vendor moved on you."
          action={
            openAlerts.length > 0 ? (
              <Badge tone="warn">{openAlerts.length} open price alerts</Badge>
            ) : (
              <Badge tone="good">Pricing stable</Badge>
            )
          }
        />
        <Suspense fallback={<div className="mt-3 h-10 border-b border-[var(--border)]" />}>
          <Tabs tabs={tabs} param="cat" defaultValue="all" className="mt-3" />
        </Suspense>
        <Card flush className="mt-4">
          <DataTable columns={columns} rows={visible} emptyMessage="No items in this category yet." />
        </Card>
      </div>
    </>
  );
}

// ---------- cell helpers ----------

function StockBadge({ item }: { item: InventoryItem }) {
  if (item.onHand >= item.parLevel) return <Badge tone="good">At par</Badge>;
  const critical = item.onHand / item.parLevel < 0.5;
  return <Badge tone={critical ? 'bad' : 'warn'}>{critical ? 'Critical' : 'Below par'}</Badge>;
}

function PriceTrend({ last, avg }: { last: number; avg: number }) {
  const pct = avg > 0 ? (last / avg - 1) * 100 : 0;
  if (Math.abs(pct) < 0.5) {
    return <span className="text-xs text-[var(--muted)]">flat</span>;
  }
  const up = pct > 0; // cost up = bad
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${
        up ? 'text-[var(--bad)]' : 'text-[var(--good)]'
      }`}
    >
      <svg
        viewBox="0 0 12 12"
        className={`h-3 w-3 ${up ? '' : 'rotate-180'}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6 9.5v-7M2.8 5.7 6 2.5l3.2 3.2" />
      </svg>
      {fmtSignedPct(pct)}
    </span>
  );
}
