import * as React from 'react';

/** Uppercase, letter-spaced micro-label used above titles and stats. */
export function Kicker({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[11px] font-medium uppercase tracking-[.12em] text-[var(--muted)] ${className}`}>
      {children}
    </div>
  );
}
