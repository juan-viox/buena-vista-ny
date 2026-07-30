'use client';

import * as React from 'react';
import { Badge, Kicker, fmtDate, fmtNumber, fmtUSD, fmtUSDk } from '@viox/ui';

export interface SegmentGuestPreview {
  id: string;
  name: string;
  tags: string[];
  visits: number;
  lifetimeSpend: number;
  avgSpend: number;
  lastVisit: string;
}

export interface SegmentCardData {
  id: string;
  name: string;
  description: string;
  rules: string;
  guestCount: number;
  /** Σ avgSpend of matched guests — expected revenue if each books one visit. */
  estRevenue: number;
  lifetimeValue: number;
  guests: SegmentGuestPreview[];
}

/** Segment cards with inline guest-list expansion. */
export function SegmentCards({ segments }: { segments: SegmentCardData[] }) {
  const [openId, setOpenId] = React.useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {segments.map((seg) => {
        const open = openId === seg.id;
        return (
          <section
            key={seg.id}
            className={`flex flex-col rounded-xl border bg-[var(--panel)] shadow-[0_1px_0_rgba(255,255,255,.03)_inset] transition-colors ${
              open ? 'border-[rgba(212,164,55,.4)] md:col-span-2 xl:col-span-3' : 'border-[var(--border)]'
            }`}
          >
            <div className="px-5 pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Kicker>{seg.rules}</Kicker>
                  <h3 className="mt-0.5 truncate text-sm font-semibold text-[var(--text)]">{seg.name}</h3>
                </div>
                <Badge tone="accent" className="shrink-0">
                  {fmtNumber(seg.guestCount)} guests
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{seg.description}</p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-px border-t border-[var(--border)] bg-[var(--border)]">
              <div className="bg-[var(--panel)] px-5 py-3">
                <Kicker>Est. next-visit revenue</Kicker>
                <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--accent2)]">
                  {fmtUSDk(seg.estRevenue)}
                </div>
              </div>
              <div className="bg-[var(--panel)] px-5 py-3">
                <Kicker>Lifetime value</Kicker>
                <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--text)]">
                  {fmtUSDk(seg.lifetimeValue)}
                </div>
              </div>
            </div>

            <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : seg.id)}
                aria-expanded={open}
                className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${
                  open ? 'text-[var(--accent2)]' : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                <Chevron open={open} />
                {open ? 'Hide guest preview' : 'Preview guests'}
              </button>
              <a
                href="/campaigns"
                className="text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--accent2)]"
              >
                New campaign →
              </a>
            </div>

            {open && (
              <div className="border-t border-[var(--border)] bg-[var(--panel2)] px-2 pb-2 pt-1">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <Th>Guest</Th>
                      <Th>Tags</Th>
                      <Th right>Visits</Th>
                      <Th right>Avg spend</Th>
                      <Th right>Lifetime</Th>
                      <Th right>Last visit</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {seg.guests.map((g) => (
                      <tr key={g.id} className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-white/[.04]">
                        <td className="p-0">
                          <a href={`/guests/${g.id}`} className="block px-3 py-2 font-medium text-[var(--text)]">
                            {g.name}
                          </a>
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex flex-wrap gap-1">
                            {g.tags.slice(0, 2).map((t) => (
                              <Badge key={t} status={t} />
                            ))}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--text)]">{fmtNumber(g.visits)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--text)]">{fmtUSD(g.avgSpend)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-[var(--accent2)]">
                          {fmtUSD(g.lifetimeSpend)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">{fmtDate(g.lastVisit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {seg.guestCount > seg.guests.length && (
                  <p className="px-3 py-2 text-[11px] text-[var(--muted)]">
                    Showing {seg.guests.length} of {fmtNumber(seg.guestCount)} —{' '}
                    <a href="/guests" className="text-[var(--accent2)] hover:underline">
                      open the full guest book →
                    </a>
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`whitespace-nowrap px-3 py-2 text-[11px] font-medium uppercase tracking-[.12em] text-[var(--muted)] ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m4.5 2.5 3.5 3.5-3.5 3.5" />
    </svg>
  );
}
