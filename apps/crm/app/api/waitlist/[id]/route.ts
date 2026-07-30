// ============================================================
// PATCH /api/waitlist/[id] — host-stand status transitions:
//   table_ready → status 'notified' + notified_at + table_ready SMS
//   seated      → status 'seated'   + seated_at
//   left        → status 'left'
// Returns { ok, row, smsSent }.
//
// Auth: owner/gm-gated via requireManagerForMutation (demo →
// 403 { readOnly:true }; AUTH_REQUIRED=1 + non-owner/gm → 403).
// ============================================================

import { TENANT_SLUG } from '@/lib/reservations';
import { sendWorkflowSms } from '@/lib/sms-workflows';
import { requireManagerForMutation } from '../../auth/_lib';

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

const ACTIONS = ['table_ready', 'seated', 'left'] as const;
type Action = (typeof ACTIONS)[number];

function isAction(v: string): v is Action {
  return (ACTIONS as readonly string[]).includes(v);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // ---- owner/gm gate; demo sessions read-only ----
  const denied = await requireManagerForMutation(req);
  if (denied) return denied;

  const { id } = await params;

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

  const action = typeof b.action === 'string' ? b.action : '';
  if (!isAction(action)) {
    return json(
      { ok: false, error: `Unknown action "${action}" — expected table_ready | seated | left.` },
      400,
    );
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> =
    action === 'table_ready'
      ? { status: 'notified', notified_at: now }
      : action === 'seated'
        ? { status: 'seated', seated_at: now }
        : { status: 'left' };

  const supabase = supabaseTarget();
  if (!supabase) {
    return json(
      { ok: false, error: 'Storage not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      503,
    );
  }

  try {
    const res = await fetch(
      `${supabase.base}/waitlist?id=eq.${encodeURIComponent(id)}&tenant_slug=eq.${TENANT_SLUG}`,
      {
        method: 'PATCH',
        headers: { ...supabase.headers, Prefer: 'return=representation' },
        body: JSON.stringify(patch),
        cache: 'no-store',
      },
    );
    if (!res.ok) {
      console.error('[api/waitlist/id] update failed', res.status, await res.text());
      return json({ ok: false, error: 'Could not update the waitlist entry.' }, 502);
    }
    const rows = (await res.json()) as WaitlistRow[];
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row) return json({ ok: false, error: 'Waitlist entry not found.' }, 404);

    // table_ready is the only transition the guest hears about.
    // sendWorkflowSms never throws — a send failure just reports smsSent:false.
    let smsSent = false;
    if (action === 'table_ready' && row.phone) {
      const sms = await sendWorkflowSms('table_ready', {
        to: row.phone,
        refId: String(row.id),
        guestName: row.guest_name ?? undefined,
        partySize: row.party_size ?? undefined,
        location: row.location ?? undefined,
      });
      smsSent = sms.ok;
    }

    return json({ ok: true, row, smsSent });
  } catch (err) {
    console.error('[api/waitlist/id] error', err);
    return json({ ok: false, error: 'Internal error updating the waitlist entry.' }, 500);
  }
}
