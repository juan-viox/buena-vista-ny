import * as React from 'react';
import { Kicker } from './Kicker';
import { fmtSignedPct } from './format';

export interface StatProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Percent delta vs prior period, e.g. 4.2 or -1.8. */
  delta?: number;
  /**
   * Is the delta favorable? Defaults to `delta >= 0`.
   * Pass explicitly for inverted metrics (food cost %, labor %).
   */
  deltaGood?: boolean;
  hint?: React.ReactNode;
  /** Render the value in tenant gold — use sparingly, one per row. */
  highlight?: boolean;
  className?: string;
}

/** KPI tile: kicker label, big tabular figure, optional delta + hint. */
export function Stat({ label, value, delta, deltaGood, hint, highlight = false, className = '' }: StatProps) {
  const good = deltaGood ?? (delta !== undefined && delta >= 0);
  const deltaColor = delta === undefined ? '' : good ? 'text-[var(--good)]' : 'text-[var(--bad)]';
  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--panel)] px-5 py-4 ${className}`}
    >
      <Kicker>{label}</Kicker>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          className={`text-2xl font-semibold leading-none tracking-tight tabular-nums ${
            highlight ? 'text-[var(--accent)]' : 'text-[var(--text)]'
          }`}
        >
          {value}
        </span>
        {delta !== undefined && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${deltaColor}`}>
            <DeltaArrow up={delta >= 0} />
            {fmtSignedPct(delta)}
          </span>
        )}
      </div>
      {hint && <div className="mt-1.5 text-xs text-[var(--muted)]">{hint}</div>}
    </div>
  );
}

function DeltaArrow({ up }: { up: boolean }) {
  return (
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
  );
}
