import * as React from 'react';

export interface ProgressBarProps {
  /** 0–100. Values are clamped. */
  value: number;
  tone?: 'accent' | 'good' | 'warn' | 'bad';
  /** Optional left label / right value row above the bar. */
  label?: React.ReactNode;
  valueLabel?: React.ReactNode;
  className?: string;
}

const TONE_VAR: Record<NonNullable<ProgressBarProps['tone']>, string> = {
  accent: 'var(--accent)',
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
};

/** Thin progress/utilization bar on the panel surface. */
export function ProgressBar({ value, tone = 'accent', label, valueLabel, className = '' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={className}>
      {(label || valueLabel) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-[var(--muted)]">{label}</span>
          <span className="tabular-nums text-[var(--text)]">{valueLabel}</span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[.06]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, backgroundColor: TONE_VAR[tone] }}
        />
      </div>
    </div>
  );
}
