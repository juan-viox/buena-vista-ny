import * as React from 'react';
import { notFound } from 'next/navigation';
import { getRepository } from '@viox/db';
import type { InvoiceLine } from '@viox/db';
import {
  Badge,
  Card,
  DataTable,
  PageHeader,
  Stat,
  StatRow,
  fmtDate,
  fmtNumber,
  fmtSignedPct,
  fmtUSD,
  type Column,
} from '@viox/ui';
import ApproveActions from './ApproveActions';

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = getRepository();
  const [invoices, vendors, locations] = await Promise.all([
    repo.getInvoices(),
    repo.getVendors(),
    repo.getLocations(),
  ]);

  const invoice = invoices.find((i) => i.id === id);
  if (!invoice) notFound();

  const lines = await repo.getInvoiceLines(invoice.id);
  const vendor = vendors.find((v) => v.id === invoice.vendorId);
  const location = locations.find((l) => l.id === invoice.locationId);

  const flagged = lines.filter((l) => l.priceChangePct > 8);
  const avgLine = lines.length > 0 ? invoice.total / lines.length : 0;

  const columns: Column<InvoiceLine>[] = [
    {
      key: 'description',
      header: 'Line item',
      render: (l) => (
        <div className="min-w-0">
          <div className="font-medium">{l.description}</div>
          {l.priceChangePct > 8 && (
            <div className="mt-0.5 text-xs text-[var(--bad)]">
              price spike vs 30-day average — verify before approving
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Qty',
      numeric: true,
      render: (l) => `${fmtNumber(l.qty)} ${l.unit}`,
    },
    {
      key: 'unitPrice',
      header: 'Unit price',
      numeric: true,
      render: (l) => fmtUSD(l.unitPrice),
    },
    {
      key: 'priceChangePct',
      header: 'vs 30d avg',
      numeric: true,
      render: (l) => <PriceChangeCell pct={l.priceChangePct} />,
    },
    {
      key: 'total',
      header: 'Line total',
      numeric: true,
      render: (l) => <span className="font-medium">{fmtUSD(l.total)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        kicker={
          <span>
            <a href="/invoices" className="hover:text-[var(--accent)]">
              Invoices
            </a>
            {' · '}
            {vendor?.name ?? 'Vendor'}
          </span>
        }
        title={invoice.invoiceNumber}
        subtitle={`${fmtDate(invoice.date, true)} · ${location?.name ?? '—'} · ${invoice.lineCount} lines · terms ${vendor?.terms ?? '—'} · acct ${vendor?.accountNumber ?? '—'}`}
        actions={<ApproveActions invoiceNumber={invoice.invoiceNumber} initialStatus={invoice.status} />}
      />

      {/* ---------- KPI row ---------- */}
      <StatRow cols={4}>
        <Stat label="Invoice total" value={fmtUSD(invoice.total)} highlight />
        <Stat label="Lines" value={fmtNumber(lines.length)} hint={`avg ${fmtUSD(avgLine)} per line`} />
        <Stat
          label="Price flags"
          value={fmtNumber(flagged.length)}
          hint={
            flagged.length > 0
              ? `${flagged[0].description.split(' — ')[0]} leads at ${fmtSignedPct(flagged[0].priceChangePct)}`
              : 'All lines within 8% of trailing average'
          }
        />
        <Stat
          label="Capture"
          value={invoice.scanned ? 'Photo scan' : 'Manual'}
          hint={invoice.scanned ? 'lines extracted via OCR ingest' : 'keyed in by the team'}
        />
      </StatRow>

      {/* ---------- line items ---------- */}
      <Card
        kicker="Line items"
        title="Extracted lines"
        action={
          flagged.length > 0 ? (
            <Badge tone="bad">{flagged.length} price {flagged.length === 1 ? 'spike' : 'spikes'}</Badge>
          ) : (
            <Badge tone="good">Pricing in range</Badge>
          )
        }
        flush
      >
        <DataTable columns={columns} rows={lines} emptyMessage="No lines captured on this invoice." />
        <div className="flex items-center justify-end gap-6 border-t border-[var(--border)] px-4 py-3 text-sm">
          <span className="text-xs uppercase tracking-[.12em] text-[var(--muted)]">Invoice total</span>
          <span className="text-base font-semibold tabular-nums text-[var(--text)]">{fmtUSD(invoice.total)}</span>
        </div>
      </Card>

      {/* ---------- photo-scan ingest ---------- */}
      <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel2)] px-6 py-6 sm:flex-row">
        <span className="mt-0.5 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2.5 text-[var(--muted)]">
          <CameraIcon />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--text)]">
            Photo-scan ingest — how this invoice got here
          </div>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            {invoice.scanned
              ? `The ${location?.name ?? ''} team snapped this ${vendor?.name ?? 'vendor'} invoice at delivery. `
              : 'This invoice was keyed in manually — snap a photo next time and skip the data entry. '}
            MarginEdge-style OCR reads every line item, matches each product to your inventory catalog, checks
            the unit price against the trailing 30-day average, and flags anything that moved more than 8%.
            Approved invoices export straight to accounting with GL codes attached — no double entry.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="muted">1 · Snap or upload</Badge>
            <Badge tone="muted">2 · OCR line extraction</Badge>
            <Badge tone="muted">3 · Catalog match + price check</Badge>
            <Badge tone="muted">4 · Approve → accounting export</Badge>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------- cell helpers ----------

function PriceChangeCell({ pct }: { pct: number }) {
  if (pct > 8) {
    return <Badge tone="bad">{fmtSignedPct(pct)}</Badge>;
  }
  if (pct < -3) {
    return <span className="text-xs font-medium tabular-nums text-[var(--good)]">{fmtSignedPct(pct)}</span>;
  }
  return <span className="text-xs tabular-nums text-[var(--muted)]">{fmtSignedPct(pct)}</span>;
}

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.4-2.1a1.5 1.5 0 0 1 1.25-.65h3.7a1.5 1.5 0 0 1 1.25.65L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
      <circle cx="12" cy="13" r="3.25" />
    </svg>
  );
}
