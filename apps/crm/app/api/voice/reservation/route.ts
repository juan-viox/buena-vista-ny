// ============================================================
// POST /api/voice/reservation — ElevenLabs "Anfitrión" webhook.
// The voice concierge calls this tool with the guest's details;
// storage (guest upsert + reservation_request insert via plain
// PostgREST fetch) lives in the shared lib so the WhatsApp
// concierge uses the exact same path. Behavior is unchanged.
// GET returns a no-auth health check for smoke tests.
// ============================================================

import { captureReservation, str, toOptIn, toPartySize } from '@/lib/reservations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** Health check — no secret required, no data returned. */
export async function GET(): Promise<Response> {
  return json({ ok: true, configured: !!process.env.SUPABASE_URL });
}

export async function POST(req: Request): Promise<Response> {
  // ---- auth ----
  const secret = process.env.VOICE_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-viox-secret') !== secret) {
    return json({ ok: false, error: 'Unauthorized.' }, 401);
  }

  // ---- parse + validate ----
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400);
  }
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const guestName = str(b.guest_name);
  if (!guestName) {
    return json({ ok: false, error: 'guest_name is required.' }, 400);
  }

  // ---- capture through the shared lib (same env gating + storage logic) ----
  const result = await captureReservation({
    guestName,
    phone: str(b.phone),
    email: str(b.email),
    partySize: toPartySize(b.party_size),
    requestedDate: str(b.requested_date),
    requestedTime: str(b.requested_time),
    location: str(b.location), // 'hells-kitchen' | 'east-village' | free text
    occasion: str(b.occasion),
    notes: str(b.notes),
    marketingOptIn: toOptIn(b.marketing_opt_in),
    channel: 'voice',
  });

  if (!result.ok) {
    return json({ ok: false, error: result.message }, 500);
  }
  if (!result.stored) {
    return json({ ok: true, stored: false, reason: 'storage not configured' });
  }
  return json({ ok: true, stored: true, id: result.id, message: result.message });
}
