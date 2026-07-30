// ============================================================
// PATCH /api/reservations/[id] — host-stand actions on the live
// reservation inbox: confirm / decline / modify. Updates the
// reservation_requests row via plain PostgREST fetch (same style
// as lib/reservations.ts), then fires the matching guest SMS
// through the shared workflow sender and reports smsSent.
//
// Auth: owner/gm-gated via requireManagerForMutation (it mutates
// guest-facing state + sends SMS/email). Demo sessions → 403
// { readOnly:true }; AUTH_REQUIRED=1 + non-owner/gm → 403.
// ============================================================

import { TENANT_SLUG, str, toPartySize } from '@/lib/reservations';
import { sendWorkflowSms, type SmsEvent } from '@/lib/sms-workflows';
import { sendWorkflowEmail } from '@/lib/email-workflows';
import { requireManagerForMutation } from '../../auth/_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// ---------- Supabase PostgREST target (same env gating as the voice route) ----------

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

// ---------- action → status / SMS event ----------

const STATUS_BY_ACTION = {
  confirm: 'confirmed',
  decline: 'declined',
  modify: 'modified',
} as const;

type Action = keyof typeof STATUS_BY_ACTION;

const SMS_EVENT_BY_ACTION: Record<Action, SmsEvent> = {
  confirm: 'reservation_confirmed',
  decline: 'reservation_declined',
  modify: 'reservation_updated',
};

function isAction(v: string): v is Action {
  return v in STATUS_BY_ACTION;
}

interface ReservationRow {
  id: string | number;
  guest_name: string | null;
  phone: string | null;
  email?: string | null;
  party_size: number | null;
  requested_date: string | null;
  requested_time: string | null;
  location: string | null;
  occasion: string | null;
  status: string | null;
  channel?: string | null;
  created_at: string | null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // ---- owner/gm gate; demo sessions read-only ----
  const denied = await requireManagerForMutation(req);
  if (denied) return denied;

  const { id } = await params;

  // ---- reject non-JSON bodies outright ----
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
      { ok: false, error: `Unknown action "${action}" — expected confirm | decline | modify.` },
      400,
    );
  }

  // ---- build the PostgREST patch ----
  const patch: Record<string, unknown> = { status: STATUS_BY_ACTION[action] };
  if (action === 'modify') {
    const f = (b.fields && typeof b.fields === 'object' ? b.fields : {}) as Record<string, unknown>;
    const partySize = toPartySize(f.party_size);
    const requestedDate = str(f.requested_date);
    const requestedTime = str(f.requested_time);
    const location = str(f.location);
    if (partySize !== undefined) patch.party_size = partySize;
    if (requestedDate !== undefined) patch.requested_date = requestedDate;
    if (requestedTime !== undefined) patch.requested_time = requestedTime;
    if (location !== undefined) patch.location = location;
  }

  const supabase = supabaseTarget();
  if (!supabase) {
    return json(
      { ok: false, error: 'Storage not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      503,
    );
  }

  try {
    const res = await fetch(
      `${supabase.base}/reservation_requests?id=eq.${encodeURIComponent(id)}&tenant_slug=eq.${TENANT_SLUG}`,
      {
        method: 'PATCH',
        headers: { ...supabase.headers, Prefer: 'return=representation' },
        body: JSON.stringify(patch),
        cache: 'no-store',
      },
    );
    if (!res.ok) {
      console.error('[api/reservations] update failed', res.status, await res.text());
      return json({ ok: false, error: 'Could not update the reservation request.' }, 502);
    }
    const rows = (await res.json()) as ReservationRow[];
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row) {
      return json({ ok: false, error: 'Reservation request not found.' }, 404);
    }

    // ---- guest SMS (post-update ctx so modified fields render correctly;
    //      sendWorkflowSms never throws — a send failure just reports smsSent:false) ----
    let smsSent = false;
    if (row.phone) {
      const sms = await sendWorkflowSms(SMS_EVENT_BY_ACTION[action], {
        to: row.phone,
        refId: String(row.id),
        guestName: row.guest_name ?? undefined,
        partySize: row.party_size ?? undefined,
        date: row.requested_date ?? undefined,
        time: row.requested_time ?? undefined,
        location: row.location ?? undefined,
      });
      smsSent = sms.ok;
    }

    // ---- guest email (same event, same post-update ctx;
    //      sendWorkflowEmail never throws — a send failure just reports emailSent:false) ----
    let emailSent = false;
    if (row.email) {
      const email = await sendWorkflowEmail(SMS_EVENT_BY_ACTION[action], {
        to: row.email,
        refId: String(row.id),
        guestName: row.guest_name ?? undefined,
        partySize: row.party_size ?? undefined,
        date: row.requested_date ?? undefined,
        time: row.requested_time ?? undefined,
        location: row.location ?? undefined,
      });
      emailSent = email.ok;
    }

    return json({ ok: true, row, smsSent, emailSent });
  } catch (err) {
    console.error('[api/reservations] error', err);
    return json({ ok: false, error: 'Internal error updating the reservation request.' }, 500);
  }
}
