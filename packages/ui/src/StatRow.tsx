import * as React from 'react';

const COLS: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  5: 'sm:grid-cols-2 lg:grid-cols-5',
  6: 'sm:grid-cols-3 lg:grid-cols-6',
};

export interface StatRowProps {
  children: React.ReactNode;
  /** Column count at desktop width (2–6). Default 4. */
  cols?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}

/** Responsive grid wrapper for a row of <Stat /> tiles. */
export function StatRow({ children, cols = 4, className = '' }: StatRowProps) {
  return <div className={`grid grid-cols-1 gap-3 ${COLS[cols] ?? COLS[4]} ${className}`}>{children}</div>;
}
