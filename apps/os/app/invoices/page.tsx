import * as React from 'react';
import { getRepository } from '@viox/db';
import type { Invoice, Vendor } from '@viox/db';
import {
  Badge,
  Card,
  DataTable,
  PageHeader,
  SectionHeader,
  Stat,
  StatRow,
  fmtDate,
  fmtNumber,
  fmtPct,
  fmtUSD,
  fmtUSDk,
  type Column,
} from '@viox/ui';

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string }>;
}) {
  const { loc } = await searchParams;
  const repo = getRepository();
  const [invoices, vendors, locations] = await Promise.all([
    repo.getInvoices(),
    repo.getVendors(),
    repo.getLocations(),
  ]);

  const activeLoc = locations.find((l) => l.id === loc);
  const scoped = activeLoc ? invoices.filter((i) => i.locationId === activeLoc.id) : invoices;

  const vendorById = new Map(vendors.map((v: Vendor) => [v.id, v]));
  const vendorName = (id: string) => vendorById.get(id)?.name ?? '—';
  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? id;

  // ---------- KPIs ----------
  const pending = scoped.filter((i) => i.status === 'pending_review');
  const disputed = scoped.filter((i) => i.status === 'disputed');
  const openAP = [...pending, ...disputed].reduce((s, i) => s + i.total, 0);
  const totalSpend = scoped.reduce((s, i) => s + i.total, 0);
  const scanRate = scoped.length > 0 ? (scoped.filter((i) => i.scanned).length / scoped.length) * 100 : 0;

  // ---------- totals by vendor ----------
  const byVendor = new Map<string, { total: number; count: number; last: string }>();
  for (const inv of scoped) {
    const cur = byVendor.get(inv.vendorId) ?? { total: 0, count: 0, last: '' };
    cur.total += inv.total;
    cur.count += 1;
    if (inv.date > cur.last) cur.last = inv.date;
    byVendor.set(inv.vendorId, cur);
  }
  const vendorTotals = [...byVendor.entries()]
    .map(([vendorId, agg]) => ({ vendorId, ...agg }))
    .sort((a, b) => b.total - a.total);

  // ---------- table ----------
  const columns: Column<Invoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice',
      render: (i) => <span className="font-medium">{i.invoiceNumber}</span>,
    },
    {
      key: 'vendor',
      header: 'Vendor',
      render: (i) => vendorName(i.vendorId),
    },
    {
      key: 'location',
      header: 'Location',
      cellClassName: 'text-[var(--muted)]',
      render: (i) => locName(i.locationId),
    },
    {
      key: 'date',
      header: 'Date',
      cellClassName: 'text-[var(--muted)]',
      render: (i) => fmtDate(i.date),
    },
    { key: 'lineCount', header: 'Lines', numeric: true },
    {
      key: 'scanned',
      header: 'Capture',
      render: (i) =>
        i.scanned ? <Badge tone="info">Photo scan</Badge> : <Badge tone="muted">Manual entry</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (i) => <Badge status={i.status} />,
    },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      render: (i) => <span className="font-medium">{fmtUSD(i.total)}</span>,
    },
  ];

  const scopeLabel = activeLoc ? activeLoc.name : 'both locations';

  return (
    <>
      <PageHeader
        kicker={`Inventory · Invoices · ${activeLoc ? activeLoc.name : 'Both locations'}`}
        title="Invoices"
        subtitle="AP inbox for vendor invoices — photo-captured lines land here for review, approval, and accounting export."
        actions={<Badge tone="info">MarginEdge-style OCR ingest</Badge>}
      />

      {/* ---------- KPI row ---------- */}
      <StatRow cols={4}>
        <Stat
          label="Open AP"
          value={fmtUSDk(openAP)}
          hint={`${pending.length} pending review · ${disputed.length} disputed`}
          highlight
        />
        <Stat
          label="Pending review"
          value={fmtNumber(pending.length)}
          hint={
            pending.length > 0
              ? `oldest: ${vendorName(pending[pending.length - 1].vendorId)} · ${fmtDate(pending[pending.length - 1].date)}`
              : 'Queue is clear'
          }
        />
        <Stat
          label="45-day purchases"
          value={fmtUSDk(totalSpend)}
          hint={`${scoped.length} invoices across ${vendorTotals.length} vendors`}
        />
        <Stat
          label="Photo-scan rate"
          value={fmtPct(scanRate, 0)}
          hint="captured via OCR ingest vs manual entry"
        />
      </StatRow>

      {/* ---------- totals by vendor ---------- */}
      <div>
        <SectionHeader
          kicker="Spend concentration"
          title="Totals by vendor"
          description={`Trailing 45 days of purchasing across ${scopeLabel}.`}
        />
        <StatRow cols={4} className="mt-4">
          {vendorTotals.slice(0, 4).map((v) => (
            <Stat
              key={v.vendorId}
              label={vendorName(v.vendorId)}
              value={fmtUSDk(v.total)}
              hint={`${v.count} invoices · last ${fmtDate(v.last)} · ${vendorById.get(v.vendorId)?.terms ?? ''}`}
            />
          ))}
        </StatRow>
        {vendorTotals.length > 4 && (
          <div className="mt-2 text-xs text-[var(--muted)]">
            + {vendorTotals.length - 4} more vendors totaling{' '}
            {fmtUSDk(vendorTotals.slice(4).reduce((s, v) => s + v.total, 0))}
          </div>
        )}
      </div>

      {/* ---------- invoice list ---------- */}
      <Card
        kicker="AP inbox"
        title="All invoices"
        action={<span>newest first · click a row for line items</span>}
        flush
      >
        <DataTable
          columns={columns}
          rows={scoped}
          onRowHref={(i) => `/invoices/${i.id}`}
          emptyMessage="No invoices for this location yet."
        />
      </Card>
    </>
  );
}
