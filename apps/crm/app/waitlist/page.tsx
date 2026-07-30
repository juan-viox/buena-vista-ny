// ============================================================
// /waitlist — walk-in queue for the host stand. Server component
// reads the live waitlist table via plain PostgREST (no-store)
// and hands rows to the client board; if Supabase env is missing
// it renders the same "not configured" info card the live
// reservation inbox uses (local dev), but the page is written
// for prod.
// ============================================================

import * as React from 'react';
import { Badge, PageHeader } from '@viox/ui';
import { WaitlistBoard, type WaitlistRow } from './WaitlistBoard';

export const dynamic = 'force-dynamic';

type WaitlistFeed =
  | { configured: false }
  | { configured: true; error: true }
  | { configured: true; error?: false; rows: WaitlistRow[] };

async function fetchWaitlist(): Promise<WaitlistFeed> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { configured: false };
  try {
    const res = await fetch(
      `${url.replace(/\/+$/, '')}/rest/v1/waitlist?tenant_slug=eq.buena-vista&select=*&order=created_at.desc&limit=100`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) {
      console.error('[waitlist] feed fetch failed', res.status);
      return { configured: true, error: true };
    }
    const rows = (await res.json()) as WaitlistRow[];
    return { configured: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (err) {
    console.error('[waitlist] feed fetch error', err);
    return { configured: true, error: true };
  }
}

export default async function WaitlistPage() {
  const feed = await fetchWaitlist();

  return (
    <>
      <PageHeader
        kicker="Front of house"
        title="Waitlist — Walk-ins"
        subtitle="Tonight's walk-in queue across Hell's Kitchen and East Village — quote a wait, text guests when their table is ready, seat them."
        actions={
          feed.configured ? (
            <Badge tone="good">Live · SMS notify</Badge>
          ) : (
            <Badge tone="muted">Not configured</Badge>
          )
        }
      />

      {!feed.configured ? (
        <div className="rounded-xl border border-[rgba(126,178,245,.35)] bg-[rgba(126,178,245,.06)] px-4 py-3 text-sm text-[var(--text)]">
          <div className="font-medium text-[#7EB2F5]">Live waitlist not configured</div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run the walk-in queue against the waitlist table.
            Guests with a phone get a welcome SMS on join and a table-ready SMS when you call them up (Twilio).
          </p>
        </div>
      ) : feed.error ? (
        <div className="rounded-xl border border-[rgba(251,191,36,.35)] bg-[rgba(251,191,36,.06)] px-4 py-3 text-sm text-[var(--text)]">
          <div className="font-medium text-[var(--warn)]">Waitlist unreachable</div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Could not reach the waitlist table just now — refresh to retry.
          </p>
        </div>
      ) : (
        <WaitlistBoard initialRows={feed.rows} />
      )}
    </>
  );
}
