'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface ScopeOption {
  id: string;
  name: string;
}

/**
 * /labor filter bar — location scope + role filter, both URL params
 * (`loc`, `role`) read by the server page. Defaults (all / all) keep
 * the URL clean.
 */
export default function LaborFilterBar({ locations, roles }: { locations: ScopeOption[]; roles: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const loc = searchParams.get('loc') ?? 'all';
  const role = searchParams.get('role') ?? 'all';

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

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[.12em] text-[var(--muted)]">Role</span>
        <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-0.5">
          <button type="button" className={pill(role === 'all')} onClick={() => set('role', 'all', 'all')}>
            All roles
          </button>
          {roles.map((r) => (
            <button key={r} type="button" className={pill(role === r)} onClick={() => set('role', r, 'all')}>
              {r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
