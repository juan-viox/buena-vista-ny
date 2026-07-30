import * as React from 'react';
import { Kicker } from './Kicker';

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  kicker?: React.ReactNode;
  /** Right-aligned actions: buttons, filters, export links. */
  actions?: React.ReactNode;
  className?: string;
}

/** Top-of-page header block: kicker, H1, subtitle, actions. */
export function PageHeader({ title, subtitle, kicker, actions, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {kicker && <Kicker>{kicker}</Kicker>}
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-[var(--text)]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
