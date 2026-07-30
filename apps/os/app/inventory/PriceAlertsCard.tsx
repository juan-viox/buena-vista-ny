'use client';

import * as React from 'react';
import type { PriceAlert } from '@viox/db';
import { Badge, Card, fmtDate, fmtSignedPct, fmtUSD } from '@viox/ui';

export interface PriceAlertsCardProps {
  alerts: PriceAlert[];
  className?: string;
}

/**
 * Vendor price-movement alerts (MarginEdge parity). The acknowledged
 * toggle is optimistic, client-local demo state — no writes leave the page.
 */
export default function PriceAlertsCard({ alerts, className = '' }: PriceAlertsCardProps) {
  const [acked, setAcked] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(alerts.map((a) => [a.id, a.acknowledged])),
  );

  const openCount = alerts.filter((a) => !acked[a.id]).length;
  const sorted = [...alerts].sort((a, b) => {
    const oa = acked[a.id] ? 1 : 0;
    const ob = acked[b.id] ? 1 : 0;
    if (oa !== ob) return oa - ob; // open first
    return a.date < b.date ? 1 : -1; // newest first
  });

  const toggle = (id: string) => setAcked((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <Card
      kicker="Price watch"
      title="Vendor price alerts"
      action={
        <Badge tone={openCount > 0 ? 'warn' : 'good'}>
          {openCount > 0 ? `${openCount} open` : 'All clear'}
        </Badge>
      }
      flush
      className={className}
    >
      <div className="divide-y divide-[var(--border)]">
        {sorted.map((a) => {
          const isAcked = Boolean(acked[a.id]);
          const spike = a.changePct >= 12;
          return (
            <div
              key={a.id}
              className={`flex items-start justify-between gap-3 px-5 py-3 transition-opacity ${
                isAcked ? 'opacity-55' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-[var(--text)]">{a.itemName}</span>
                  <Badge tone={spike ? 'bad' : 'warn'}>{fmtSignedPct(a.changePct)}</Badge>
                </div>
                <div className="mt-0.5 text-xs text-[var(--muted)]">
                  {a.vendorName} · {fmtUSD(a.oldPrice)} → {fmtUSD(a.newPrice)} · {fmtDate(a.date)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggle(a.id)}
                className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  isAcked
                    ? 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
                    : 'border-[rgba(201,153,92,.5)] text-[var(--accent)] hover:bg-[rgba(201,153,92,.1)]'
                }`}
              >
                {isAcked ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckIcon />
                    Acknowledged
                  </span>
                ) : (
                  'Acknowledge'
                )}
              </button>
            </div>
          );
        })}
        <div className="px-5 py-3 text-xs text-[var(--muted)]">
          Alerts fire when an invoice line moves more than 8% off the trailing 30-day average.
        </div>
      </div>
    </Card>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m2.5 6.5 2.5 2.5 4.5-6" />
    </svg>
  );
}
