'use client';

import * as React from 'react';
import type { InvoiceStatus } from '@viox/db';
import { Badge } from '@viox/ui';

export interface ApproveActionsProps {
  invoiceNumber: string;
  initialStatus: InvoiceStatus;
}

const BTN = 'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors';
const BTN_GOLD = `${BTN} border-[rgba(201,153,92,.5)] text-[var(--accent)] hover:bg-[rgba(201,153,92,.1)]`;
const BTN_DANGER = `${BTN} border-[rgba(248,113,113,.4)] text-[var(--bad)] hover:bg-[rgba(248,113,113,.08)]`;
const BTN_GHOST = `${BTN} border-[var(--border)] text-[var(--muted)] hover:bg-white/[.04] hover:text-[var(--text)]`;

/**
 * Demo-only approve flow: optimistic local status + toast confirmation.
 * No writes leave the page — this mirrors the MarginEdge review UX.
 */
export default function ApproveActions({ invoiceNumber, initialStatus }: ApproveActionsProps) {
  const [status, setStatus] = React.useState<InvoiceStatus>(initialStatus);
  const [toast, setToast] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const act = (next: InvoiceStatus, message: string) => {
    setStatus(next);
    setToast(message);
  };

  return (
    <div className="flex items-center gap-2">
      <Badge status={status} className="!px-2.5 !py-1" />

      {status === 'pending_review' && (
        <>
          <button
            type="button"
            className={BTN_GOLD}
            onClick={() =>
              act('approved', `Invoice ${invoiceNumber} approved — queued for accounting export.`)
            }
          >
            Approve invoice
          </button>
          <button
            type="button"
            className={BTN_DANGER}
            onClick={() =>
              act('disputed', `Invoice ${invoiceNumber} disputed — credit memo requested from the vendor.`)
            }
          >
            Dispute
          </button>
        </>
      )}

      {status === 'approved' && (
        <button
          type="button"
          className={BTN_GOLD}
          onClick={() =>
            act('exported', `Invoice ${invoiceNumber} exported to accounting with GL codes attached.`)
          }
        >
          Export to accounting
        </button>
      )}

      {status === 'disputed' && (
        <button
          type="button"
          className={BTN_GHOST}
          onClick={() =>
            act('approved', `Dispute resolved — invoice ${invoiceNumber} approved at credited totals.`)
          }
        >
          Resolve &amp; approve
        </button>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-2.5 rounded-xl border border-[rgba(52,211,153,.35)] bg-[var(--panel)] px-4 py-3 shadow-[var(--shadow-pop)]"
        >
          <span className="mt-0.5 shrink-0 text-[var(--good)]">
            <CheckCircleIcon />
          </span>
          <div>
            <div className="text-sm text-[var(--text)]">{toast}</div>
            <div className="mt-0.5 text-xs text-[var(--muted)]">Demo mode — change is local to this session.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="10" cy="10" r="8" />
      <path d="m6.5 10.5 2.5 2.5 4.5-6" />
    </svg>
  );
}
