'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface LocationOption {
  id: string;
  name: string;
}

export interface LocationFilterProps {
  locations: LocationOption[];
  /** URL search param carrying the location id. Default "loc". */
  param?: string;
  allLabel?: string;
  className?: string;
}

/** Topbar location scope — drives an URL param that server pages read. */
export function LocationFilter({
  locations,
  param = 'loc',
  allLabel = 'All locations',
  className = '',
}: LocationFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(param) ?? 'all';

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = new URLSearchParams(searchParams.toString());
    if (e.target.value === 'all') next.delete(param);
    else next.set(param, e.target.value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="pointer-events-none absolute left-3 text-[var(--muted)]">
        <PinIcon />
      </span>
      <select
        value={current}
        onChange={onChange}
        aria-label="Filter by location"
        className="h-9 cursor-pointer appearance-none rounded-lg border border-[var(--border)] bg-[var(--panel)] pl-9 pr-8 text-sm text-[var(--text)] outline-none transition-colors hover:border-[rgba(201,153,92,.4)] focus:border-[var(--accent)]"
      >
        <option value="all" className="bg-[#111A2E] text-[#E8EDF7]">
          {allLabel}
        </option>
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id} className="bg-[#111A2E] text-[#E8EDF7]">
            {loc.name}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2.5 text-[var(--muted)]">
        <Chevron />
      </span>
    </label>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-6.5-5.1-6.5-10a6.5 6.5 0 1 1 13 0c0 4.9-6.5 10-6.5 10Z" />
      <circle cx="12" cy="10.5" r="2.25" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}
