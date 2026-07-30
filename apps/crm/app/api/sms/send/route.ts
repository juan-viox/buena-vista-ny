// ============================================================
// POST /api/sms/send — internal SMS workflow trigger. The CRM UI,
// voice concierge tools, and ops scripts hit this with a workflow
// event + guest context; auth matches the voice reservation
// webhook (x-viox-secret === VOICE_WEBHOOK_SECRET). Rendering,
// the Twilio send, and the sms_log write all live in
// lib/sms-workflows. GET is a no-auth health check.
//
// Body: { to: string, event: SmsEvent, ctx?: SmsContext & { refId?: string } }
// ============================================================

import { isSmsConfigured } from '@viox/integrations';
import { SMS_EVENTS, isSmsEvent, sendWorkflowSms, type SmsContext } from '@/lib/sms-workflows';
import { str, toPartySize } from '@/lib/reservations';

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
  return json({ ok: true, configured: isSmsConfigured() });
}

function toQuotedMin(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function POST(req: Request): Promise<Response> {
  // ---- auth (same gate as /api/voice/reservation) ----
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

  const to = str(b.to);
  if (!to) {
    return json({ ok: false, error: 'to is required.' }, 400);
  }
  const event = b.event;
  if (!isSmsEvent(event)) {
    return json({ ok: false, error: `event must be one of: ${SMS_EVENTS.join(', ')}.` }, 400);
  }

  const rawCtx = (b.ctx && typeof b.ctx === 'object' ? b.ctx : {}) as Record<string, unknown>;
  const ctx: SmsContext & { refId?: string } = {
    guestName: str(rawCtx.guestName) ?? str(rawCtx.guest_name),
    partySize: toPartySize(rawCtx.partySize ?? rawCtx.party_size),
    date: str(rawCtx.date),
    time: str(rawCtx.time),
    location: str(rawCtx.location),
    quotedMin: toQuotedMin(rawCtx.quotedMin ?? rawCtx.quoted_min),
    custom: str(rawCtx.custom),
    refId: str(rawCtx.refId) ?? str(rawCtx.ref_id),
  };

  const result = await sendWorkflowSms(event, { ...ctx, to });
  if (!result.ok) {
    return json({ ok: false, error: result.error ?? 'SMS send failed.', body: result.body }, 502);
  }
  return json({ ok: true, sid: result.sid, body: result.body });
}
