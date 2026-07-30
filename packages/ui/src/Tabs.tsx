'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface TabDef {
  value: string;
  label: React.ReactNode;
  /** Small count/figure rendered after the label. */
  count?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabDef[];
  /** URL search param that drives the active tab. Default "tab". */
  param?: string;
  /** Active tab when the param is absent. Defaults to the first tab. */
  defaultValue?: string;
  className?: string;
}

/**
 * URL-param driven tab strip. Server pages read the same param via
 * `searchParams` to decide what to render — no client state to sync.
 */
export function Tabs({ tabs, param = 'tab', defaultValue, className = '' }: TabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get(param) ?? defaultValue ?? tabs[0]?.value;

  const select = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === (defaultValue ?? tabs[0]?.value)) next.delete(param);
    else next.set(param, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className={`flex items-center gap-1 border-b border-[var(--border)] ${className}`} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.value === active;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => select(tab.value)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-[var(--accent)] text-[var(--text)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 rounded-full bg-white/[.06] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--muted)]">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
