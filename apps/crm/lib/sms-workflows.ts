// ============================================================
// apps/crm/lib/sms-workflows.ts — branded guest SMS for Buena
// Vista. renderSms() turns a workflow event + context into warm,
// on-brand copy (≤320 chars, location name + phone where it
// helps, a light Spanish accent). sendWorkflowSms() renders,
// sends via the Twilio SMS adapter, and best-effort logs the
// send into the sms_log table via plain PostgREST fetch — it
// never throws, so a texting problem can never break a capture
// flow or an API route.
//
// sms_log columns: id, tenant_slug, to_phone, body, kind,
//                  ref_id, twilio_sid, status, created_at
// ============================================================

import { isSmsConfigured, normalizePhone, sendSms } from '@viox/integrations';
import { TENANT_SLUG } from './reservations';

// ---------- events ----------

export type SmsEvent =
  | 'request_received'
  | 'reservation_confirmed'
  | 'reservation_updated'
  | 'reservation_declined'
  | 'waitlist_joined'
  | 'table_ready'
  | 'order_update';

export const SMS_EVENTS: readonly SmsEvent[] = [
  'request_received',
  'reservation_confirmed',
  'reservation_updated',
  'reservation_declined',
  'waitlist_joined',
  'table_ready',
  'order_update',
] as const;

export function isSmsEvent(v: unknown): v is SmsEvent {
  return typeof v === 'string' && (SMS_EVENTS as readonly string[]).includes(v);
}

// ---------- context ----------

export interface SmsContext {
  guestName?: string;
  partySize?: number;
  /** e.g. '2026-08-02' or 'Saturday' — rendered verbatim. */
  date?: string;
  /** e.g. '7:30 PM' — rendered verbatim. */
  time?: string;
  /** 'hells-kitchen' | 'east-village' | free text. */
  location?: string;
  /** Quoted waitlist minutes. */
  quotedMin?: number;
  /** Free-text detail (order_update body, decline reason, etc.). */
  custom?: string;
}

// ---------- location directory ----------

interface LocationInfo {
  name: string;
  phone?: string;
}

const LOCATIONS: Record<string, LocationInfo> = {
  'hells-kitchen': { name: "Hell's Kitchen", phone: '(212) 388-5040' },
  'east-village': { name: 'East Village', phone: '(929) 220-0547' },
};

function locationInfo(location?: string): LocationInfo {
  if (!location) return { name: 'Buena Vista' };
  const known = LOCATIONS[location.trim().toLowerCase()];
  if (known) return { name: `Buena Vista ${known.name}`, phone: known.phone };
  return { name: `Buena Vista ${location.trim()}` };
}

// ---------- rendering ----------

const MAX_SMS_CHARS = 320;
const OPT_OUT = 'Reply STOP to opt out.';

/** ", Maria" — or empty when we don't have a name. */
function withName(guestName?: string): string {
  const n = guestName?.trim();
  return n ? `, ${n}` : '';
}

/** " for 4" party fragment. */
function partyBit(partySize?: number): string {
  return partySize && partySize > 0 ? ` for ${partySize}` : '';
}

/** " on Aug 2 at 7:30 PM" fragment from whatever we have. */
function whenBit(date?: string, time?: string): string {
  const d = date?.trim();
  const t = time?.trim();
  if (d && t) return ` on ${d} at ${t}`;
  if (d) return ` on ${d}`;
  if (t) return ` at ${t}`;
  return '';
}

/** "Questions? Call (212) 388-5040." — empty when no phone known. */
function callBit(loc: LocationInfo, lead = 'Questions?'): string {
  return loc.phone ? ` ${lead} Call ${loc.phone}.` : '';
}

function clamp(text: string): string {
  if (text.length <= MAX_SMS_CHARS) return text;
  return `${text.slice(0, MAX_SMS_CHARS - 1).trimEnd()}…`;
}

/** Free text with guaranteed terminal punctuation. */
function sentence(text: string): string {
  const t = text.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/**
 * Warm, branded copy for one workflow event. Always ≤320 chars.
 * First-touch events (request_received, waitlist_joined) end with
 * the required opt-out line.
 */
export function renderSms(event: SmsEvent, ctx: SmsContext = {}): string {
  const loc = locationInfo(ctx.location);
  const name = withName(ctx.guestName);
  const party = partyBit(ctx.partySize);
  const when = whenBit(ctx.date, ctx.time);

  switch (event) {
    case 'request_received':
      return clamp(
        `¡Gracias${name}! ${loc.name} received your reservation request${party}${when}. ` +
          `Our team will confirm shortly.${callBit(loc)} ${OPT_OUT}`,
      );

    case 'reservation_confirmed':
      return clamp(
        `¡Confirmado${name}! Your table${party} at ${loc.name} is set${when}. ` +
          `We can't wait to host you — ¡salud!${callBit(loc, 'Need anything?')}`,
      );

    case 'reservation_updated':
      return clamp(
        `¡Listo${name}! Your reservation at ${loc.name} is updated${party ? ` —${party.replace(' for', ' party of')}` : ''}${when}. ` +
          `See you soon. ¡Gracias!${callBit(loc)}`,
      );

    case 'reservation_declined':
      return clamp(
        `Lo sentimos${name} — we couldn't take your reservation request${when} at ${loc.name}.` +
          `${ctx.custom ? ` ${sentence(ctx.custom)}` : ''}` +
          `${loc.phone ? ` Call ${loc.phone} and we'll find a time that works.` : " We'd love to find a time that works."} ¡Gracias!`,
      );

    case 'waitlist_joined':
      return clamp(
        `¡Gracias${name}! You're on the waitlist at ${loc.name}${party ? party.replace(' for', ' — party of') : ''}.` +
          `${ctx.quotedMin && ctx.quotedMin > 0 ? ` Current wait: about ${ctx.quotedMin} min.` : ''}` +
          ` We'll text you the moment your table is ready. ${OPT_OUT}`,
      );

    case 'table_ready':
      return clamp(
        `${ctx.guestName?.trim() ? `${ctx.guestName.trim()}, your` : 'Your'} table at ${loc.name} is ready! ` +
          `Please see the host within 10 minutes and we'll seat you. ¡Salud!`,
      );

    case 'order_update':
      return clamp(
        `Hola${name} — update from ${loc.name}: ${ctx.custom?.trim() ? sentence(ctx.custom) : 'your order is being prepared and will be ready soon.'} ¡Gracias!`,
      );
  }
}

// ---------- Supabase PostgREST target (same env gating as reservations) ----------

interface SupabaseTarget {
  base: string;
  headers: Record<string, string>;
}

function supabaseTarget(): SupabaseTarget | null {
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

/** Best-effort sms_log insert. Fails soft — never throws. */
async function logSms(row: {
  to_phone: string;
  body: string;
  kind: SmsEvent;
  ref_id?: string;
  twilio_sid?: string;
  status: 'sent' | 'failed';
}): Promise<void> {
  const supabase = supabaseTarget();
  if (!supabase) return;
  try {
    const res = await fetch(`${supabase.base}/sms_log`, {
      method: 'POST',
      headers: { ...supabase.headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        tenant_slug: TENANT_SLUG,
        to_phone: row.to_phone,
        body: row.body,
        kind: row.kind,
        ref_id: row.ref_id ?? null,
        twilio_sid: row.twilio_sid ?? null,
        status: row.status,
      }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      if (res.status !== 404 && !detail.includes('42P01')) {
        console.error('[sms-workflows] sms_log write failed', res.status, detail.slice(0, 300));
      }
    }
  } catch (err) {
    console.error('[sms-workflows] sms_log write error', err);
  }
}

// ---------- send + log ----------

export interface SendWorkflowSmsInput extends SmsContext {
  /** Destination phone (any US format; normalized before send). */
  to: string;
  /** Row id the text refers to (reservation_request / waitlist id). */
  refId?: string;
}

export interface SendWorkflowSmsResult {
  ok: boolean;
  sid?: string;
  error?: string;
  /** The rendered copy that was (or would have been) sent. */
  body: string;
}

/**
 * Render → send → log. Never throws: any failure comes back as
 * { ok: false, error } so callers can note it and move on.
 */
export async function sendWorkflowSms(
  event: SmsEvent,
  input: SendWorkflowSmsInput,
): Promise<SendWorkflowSmsResult> {
  let body = '';
  try {
    body = renderSms(event, input);
    if (!isSmsConfigured()) {
      return { ok: false, error: 'SMS not configured.', body };
    }
    const to = normalizePhone(input.to);
    const result = await sendSms({ to, body });
    await logSms({
      to_phone: to,
      body,
      kind: event,
      ref_id: input.refId,
      twilio_sid: result.sid,
      status: result.ok ? 'sent' : 'failed',
    });
    return { ok: result.ok, sid: result.sid, error: result.error, body };
  } catch (err) {
    console.error('[sms-workflows] send error', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown SMS error.', body };
  }
}

export { isSmsConfigured } from '@viox/integrations';
