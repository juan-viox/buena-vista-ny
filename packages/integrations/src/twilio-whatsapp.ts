// ============================================================
// Twilio WhatsApp adapter — webhook signature validation, TwiML
// replies, and outbound sends via plain fetch + node:crypto (no
// twilio SDK). Powers the Anfitrión WhatsApp concierge.
//
// Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
//      TWILIO_WHATSAPP_FROM (e.g. whatsapp:+16462468761)
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

/** True when all three Twilio WhatsApp env vars are present. */
export function isWhatsAppConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM
  );
}

/**
 * Validate an X-Twilio-Signature header per the Twilio spec:
 * take the full public URL of the webhook, append each POST
 * parameter name+value sorted alphabetically by name, HMAC-SHA1
 * the result with the account's auth token, base64-encode, and
 * compare (timing-safe) against the header value.
 */
export function validateTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null | undefined,
): boolean {
  if (!signature) return false;
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join('');
  const expected = createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** TwiML XML for a single reply message (Content-Type: text/xml). */
export function twimlMessage(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(text)}</Message></Response>`;
}

export interface SendWhatsAppInput {
  /** Destination in E.164, with or without the whatsapp: prefix. */
  to: string;
  body: string;
}

export interface SendWhatsAppResult {
  ok: boolean;
  /** Twilio message SID on success. */
  sid?: string;
  error?: string;
}

function withWhatsAppPrefix(n: string): string {
  return n.startsWith('whatsapp:') ? n : `whatsapp:${n}`;
}

/**
 * Proactive outbound WhatsApp send via the Twilio REST API
 * (template-window rules apply — freeform only inside the 24h
 * session; use approved templates otherwise).
 */
export async function sendWhatsApp({ to, body }: SendWhatsAppInput): Promise<SendWhatsAppResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) {
    return { ok: false, error: 'Twilio WhatsApp env not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM).' };
  }

  try {
    const form = new URLSearchParams({
      From: withWhatsAppPrefix(from),
      To: withWhatsAppPrefix(to),
      Body: body,
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) {
      const detail = data.message ?? `Twilio responded ${res.status}.`;
      console.error('[twilio-whatsapp] send failed', res.status, detail);
      return { ok: false, error: detail };
    }
    return { ok: true, sid: data.sid };
  } catch (err) {
    console.error('[twilio-whatsapp] send error', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown send error.' };
  }
}
