import * as React from 'react';

export interface EmptyStateProps {
  title: React.ReactNode;
  message?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

/** Quiet dashed placeholder for empty lists/tables. */
export function EmptyState({ title, message, action, icon, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel2)] px-6 py-10 text-center ${className}`}
    >
      <div className="text-[var(--muted)]">{icon ?? <DefaultIcon />}</div>
      <div className="text-sm font-medium text-[var(--text)]">{title}</div>
      {message && <div className="max-w-sm text-xs text-[var(--muted)]">{message}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function DefaultIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M3.5 9.5h17M8 14h4" />
    </svg>
  );
}
