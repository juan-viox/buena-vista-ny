'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

export interface NavLinkProps {
  href: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** Match only the exact path (use for the index route). */
  exact?: boolean;
}

/** Sidebar link with usePathname-driven active state. */
export function NavLink({ href, label, icon, exact = false }: NavLinkProps) {
  const pathname = usePathname();
  const active = exact || href === '/' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-white/[.06] font-medium text-[var(--text)]'
          : 'text-[var(--muted)] hover:bg-white/[.03] hover:text-[var(--text)]'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--accent)]" aria-hidden />
      )}
      {icon && <span className={`h-4 w-4 shrink-0 ${active ? 'text-[var(--accent)]' : ''}`}>{icon}</span>}
      <span className="truncate">{label}</span>
    </a>
  );
}
