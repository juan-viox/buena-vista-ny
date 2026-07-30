// ============================================================
// /api/waitlist — walk-in queue for the host stand.
//   POST { guest_name, phone?, party_size, location,
//          quoted_wait_min?, notes? }
//     → insert a waiting row + fire the waitlist_joined SMS
//       when we have a phone. Returns { ok, row, smsSent }.
//   GET → current rows (newest first, no-store) for the board.
//
// TODO(auth): same-origin CRM dashboard only today — add a
// session/role gate before exposing beyond the UI.
// ============================================================

import { TENANT_SLUG, str, toPartySize } from '@/lib/reservations';
import { sendWorkflowSms } from '@/lib/sms-workflows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function supabaseTarget(): { base: string; headers: Record<string, string> } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {
    base: `${url.replace(/\/+$/, '')}/rest/v1`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  };
}

/** Light E.164 normalization for host-stand phone entry (US default). */
function normalizePhone(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const kept = v.replace(/[^\d+]/g, '');
  if (kept.startsWith('+')) return kept.length > 1 ? kept : undefined;
  const bare = kept.replace(/\D/g, '');
  if (bare.length === 10) return `+1${bare}`;
  if (bare.length === 11 && bare.startsWith('1')) return `+${bare}`;
  return bare.length > 0 ? bare : undefined;
}

/** Non-negative integer minutes or undefined. */
function toMinutes(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

interface WaitlistRow {
  id: string | number;
  guest_name: string | null;
  phone: string | null;
  party_size: number | null;
  location: string | null;
  status: string | null;
  quoted_wait_min: number | null;
  notes: string | null;
  created_at: string | null;
  notified_at: string | null;
  seated_at: string | null;
}

// ---------- GET — current board rows ----------

export async function GET(): Promise<Response> {
  const supabase = supabaseTarget();
  if (!supabase) {
    return json({ ok: false, error: 'Storage not configured.', rows: [] }, 503);
  }
  try {
    const res = await fetch(
      `${supabase.base}/waitlist?tenant_slug=eq.${TENANT_SLUG}&order=created_at.desc&limit=100`,
      { headers: supabase.headers, cache: 'no-store' },
    );
    if (!res.ok) {
      console.error('[api/waitlist] read failed', res.status, await res.text());
      return json({ ok: false, error: 'Could not read the waitlist.', rows: [] }, 502);
    }
    const rows = (await res.json()) as WaitlistRow[];
    return json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (err) {
    console.error('[api/waitlist] read error', err);
    return json({ ok: false, error: 'Internal error reading the waitlist.', rows: [] }, 500);
  }
}

// ---------- POST — add a walk-in ----------

export async function POST(req: Request): Promise<Response> {
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return json({ ok: false, error: 'Expected an application/json body.' }, 415);
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400);
  }
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const guestName = str(b.guest_name);
  if (!guestName) return json({ ok: false, error: 'guest_name is required.' }, 400);
  const partySize = toPartySize(b.party_size);
  if (!partySize) return json({ ok: false, error: 'party_size must be a positive number.' }, 400);
  const location = str(b.location);
  if (!location) return json({ ok: false, error: 'location is required.' }, 400);

  const phone = normalizePhone(str(b.phone));
  const quotedWaitMin = toMinutes(b.quoted_wait_min);
  const notes = str(b.notes);

  const supabase = supabaseTarget();
  if (!supabase) {
    return json(
      { ok: false, error: 'Storage not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      503,
    );
  }

  try {
    const res = await fetch(`${supabase.base}/waitlist`, {
      method: 'POST',
      headers: { ...supabase.headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        tenant_slug: TENANT_SLUG,
        guest_name: guestName,
        phone: phone ?? null,
        party_size: partySize,
        location,
        status: 'waiting',
        quoted_wait_min: quotedWaitMin ?? null,
        notes: notes ?? null,
      }),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('[api/waitlist] insert failed', res.status, await res.text());
      return json({ ok: false, error: 'Could not add the guest to the waitlist.' }, 502);
    }
    const rows = (await res.json()) as WaitlistRow[];
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row) return json({ ok: false, error: 'Insert returned no row.' }, 502);

    // sendWorkflowSms never throws — a send failure just reports smsSent:false.
    let smsSent = false;
    if (row.phone) {
      const sms = await sendWorkflowSms('waitlist_joined', {
        to: row.phone,
        refId: String(row.id),
        guestName: row.guest_name ?? undefined,
        partySize: row.party_size ?? undefined,
        location: row.location ?? undefined,
        quotedMin: row.quoted_wait_min ?? undefined,
      });
      smsSent = sms.ok;
    }

    return json({ ok: true, row, smsSent }, 201);
  } catch (err) {
    console.error('[api/waitlist] error', err);
    return json({ ok: false, error: 'Internal error adding to the waitlist.' }, 500);
  }
}
