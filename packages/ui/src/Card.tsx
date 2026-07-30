import * as React from 'react';
import { Kicker } from './Kicker';

export interface CardProps {
  title?: React.ReactNode;
  kicker?: React.ReactNode;
  /** Right-aligned header slot — a link, filter, or small action. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Remove inner padding (tables usually bring their own). */
  flush?: boolean;
}

/** Glass panel — the base surface of VioX Command. */
export function Card({ title, kicker, action, children, className = '', flush = false }: CardProps) {
  const hasHeader = Boolean(title || kicker || action);
  return (
    <section
      className={`rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-[0_1px_0_rgba(255,255,255,.03)_inset] ${className}`}
    >
      {hasHeader && (
        <header className={`flex items-start justify-between gap-4 px-5 pt-4 ${flush ? 'pb-3' : ''}`}>
          <div className="min-w-0">
            {kicker && <Kicker>{kicker}</Kicker>}
            {title && <h3 className="mt-0.5 truncate text-sm font-semibold text-[var(--text)]">{title}</h3>}
          </div>
          {action && <div className="shrink-0 text-xs text-[var(--muted)]">{action}</div>}
        </header>
      )}
      <div className={flush ? '' : `px-5 pb-5 ${hasHeader ? 'pt-3' : 'pt-5'}`}>{children}</div>
    </section>
  );
}
