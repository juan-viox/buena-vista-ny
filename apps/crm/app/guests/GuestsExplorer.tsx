'use client';

import * as React from 'react';
import type { Guest, GuestTag } from '@viox/db';
import { Badge, DataTable, fmtDate, fmtNumber, fmtUSD, statusLabel, type Column } from '@viox/ui';

export interface GuestsExplorerProps {
  guests: Guest[];
  /** locationId → display name. */
  locationNames: Record<string, string>;
}

type SortKey = 'lifetimeSpend' | 'visits' | 'lastVisit';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'lifetimeSpend', label: 'Lifetime spend' },
  { key: 'visits', label: 'Visits' },
  { key: 'lastVisit', label: 'Last visit' },
];

const TAG_ORDER: GuestTag[] = [
  'vip', 'big_spender', 'regular', 'event_host', 'wine_club', 'brunch', 'birthday_month', 'new', 'lapsed',
];

/** Searchable / filterable / sortable guest book. Client-side over the fixture set. */
export function GuestsExplorer({ guests, locationNames }: GuestsExplorerProps) {
  const [query, setQuery] = React.useState('');
  const [activeTags, setActiveTags] = React.useState<GuestTag[]>([]);
  const [sortKey, setSortKey] = React.useState<SortKey>('lifetimeSpend');
  const [sortDesc, setSortDesc] = React.useState(true);

  const tagCounts = React.useMemo(() => {
    const counts = new Map<GuestTag, number>();
    for (const g of guests) for (const t of g.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return counts;
  }, [guests]);

  const toggleTag = (tag: GuestTag) =>
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = guests.filter((g) => {
      if (activeTags.length > 0 && !activeTags.some((t) => g.tags.includes(t))) return false;
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) ||
        g.email.toLowerCase().includes(q) ||
        (g.phone ?? '').toLowerCase().includes(q) ||
        g.favoriteItems.some((i) => i.toLowerCase().includes(q))
      );
    });
    return [...filtered].sort((a, b) => {
      const cmp =
        sortKey === 'lastVisit'
          ? a.lastVisit < b.lastVisit ? -1 : a.lastVisit > b.lastVisit ? 1 : 0
          : a[sortKey] - b[sortKey];
      return sortDesc ? -cmp : cmp;
    });
  }, [guests, query, activeTags, sortKey, sortDesc]);

  const columns = React.useMemo(() => buildColumns(locationNames), [locationNames]);

  return (
    <div className="space-y-3">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, favorite dish…"
            aria-label="Search guests"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel2)] py-2 pl-9 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[rgba(212,164,55,.5)] focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[.12em] text-[var(--muted)]">Sort</span>
          {SORT_OPTIONS.map((opt) => {
            const active = opt.key === sortKey;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => toggleSort(opt.key)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'border-[rgba(212,164,55,.45)] bg-[rgba(212,164,55,.1)] text-[var(--accent2)]'
                    : 'border-[var(--border)] bg-white/[.03] text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {opt.label}
                {active && <span className="ml-1 tabular-nums">{sortDesc ? '↓' : '↑'}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* tag chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {TAG_ORDER.filter((t) => (tagCounts.get(t) ?? 0) > 0).map((tag) => {
          const active = activeTags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-4 transition-colors ${
                active
                  ? 'border-[rgba(212,164,55,.5)] bg-[rgba(212,164,55,.12)] text-[var(--accent2)]'
                  : 'border-[var(--border)] bg-white/[.03] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {statusLabel(tag)}
              <span className="tabular-nums opacity-70">{tagCounts.get(tag)}</span>
            </button>
          );
        })}
        {activeTags.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveTags([])}
            className="ml-1 text-[11px] font-medium text-[var(--muted)] underline-offset-2 transition-colors hover:text-[var(--text)] hover:underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs tabular-nums text-[var(--muted)]">
          {fmtNumber(rows.length)} of {fmtNumber(guests.length)} guests
        </span>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)]">
        <DataTable
          columns={columns}
          rows={rows}
          onRowHref={(g) => `/guests/${g.id}`}
          emptyMessage="No guests match this search — try clearing a tag filter."
        />
      </div>
    </div>
  );
}

function buildColumns(locationNames: Record<string, string>): Column<Guest>[] {
  return [
    {
      key: 'name',
      header: 'Guest',
      render: (g) => {
        const vip = g.tags.includes('vip');
        return (
          <div className="flex min-w-0 items-center gap-2">
            {vip && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent2)]" aria-hidden />}
            <div className="min-w-0">
              <div className={`truncate font-medium ${vip ? 'text-[var(--accent2)]' : 'text-[var(--text)]'}`}>
                {g.name}
              </div>
              <div className="truncate text-xs text-[var(--muted)]">{g.email}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'tags',
      header: 'Tags',
      render: (g) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          {g.tags.slice(0, 2).map((t) => (
            <Badge key={t} status={t} />
          ))}
          {g.tags.length > 2 && <span className="text-[11px] text-[var(--muted)]">+{g.tags.length - 2}</span>}
        </span>
      ),
    },
    {
      key: 'location',
      header: 'Home room',
      cellClassName: 'text-[var(--muted)]',
      render: (g) => locationNames[g.favoriteLocationId] ?? '—',
    },
    { key: 'visits', header: 'Visits', numeric: true, render: (g) => fmtNumber(g.visits) },
    { key: 'avgSpend', header: 'Avg spend', numeric: true, render: (g) => fmtUSD(g.avgSpend) },
    {
      key: 'lifetimeSpend',
      header: 'Lifetime',
      numeric: true,
      render: (g) => <span className="font-medium text-[var(--accent2)]">{fmtUSD(g.lifetimeSpend)}</span>,
    },
    {
      key: 'lastVisit',
      header: 'Last visit',
      numeric: true,
      cellClassName: 'text-[var(--muted)]',
      render: (g) => fmtDate(g.lastVisit),
    },
  ];
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.8-3.8" />
    </svg>
  );
}
