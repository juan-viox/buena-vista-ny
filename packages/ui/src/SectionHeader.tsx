import * as React from 'react';
import { Kicker } from './Kicker';

export interface SectionHeaderProps {
  title: React.ReactNode;
  kicker?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/** Section divider header inside a page: kicker + title + optional action. */
export function SectionHeader({ title, kicker, description, action, className = '' }: SectionHeaderProps) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {kicker && <Kicker>{kicker}</Kicker>}
        <h2 className="mt-0.5 text-base font-semibold text-[var(--text)]">{title}</h2>
        {description && <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
