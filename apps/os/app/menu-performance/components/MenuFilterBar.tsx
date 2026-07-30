'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface ScopeOption {
  id: string;
  name: string;
}

const PERIODS: { value: string; label: string }[] = [
  { value: '2026-07', label: 'Jul 2026' },
  { value: '2026-06', label: 'Jun 2026' },
];

/**
 * /menu-performance filter bar — reporting period + location scope,
 * both URL params (`period`, `loc`) read by the server page.
 * Defaults (2026-07 / all) keep the URL clean.
 */
export default function MenuFilterBar({ locations }: { locations: ScopeOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const period = searchParams.get('period') ?? '2026-07';
  const loc = searchParams.get('loc') ?? 'all';

  const set = (param: string, value: string, def: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === def) next.delete(param);
    else next.set(param, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const pill = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? 'bg-[rgba(201,153,92,.14)] text-[var(--accent)]'
        : 'text-[var(--muted)] hover:text-[var(--text)]'
    }`;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[.12em] text-[var(--muted)]">Period</span>
        <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={pill(period === p.value)}
              onClick={() => set('period', p.value, '2026-07')}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[.12em] text-[var(--muted)]">Scope</span>
        <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-0.5">
          <button type="button" className={pill(loc === 'all')} onClick={() => set('loc', 'all', 'all')}>
            Both locations
          </button>
          {locations.map((l) => (
            <button key={l.id} type="button" className={pill(loc === l.id)} onClick={() => set('loc', l.id, 'all')}>
              {l.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
