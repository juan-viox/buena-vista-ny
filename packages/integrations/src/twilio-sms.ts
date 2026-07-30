// ============================================================
// Twilio SMS adapter — outbound sends via plain fetch (no twilio
// SDK). Mirrors the WhatsApp adapter's REST style. Every send
// passes BOTH the pinned sender and the Messaging Service:
//   From=TWILIO_SMS_FROM  +  MessagingServiceSid=TWILIO_MESSAGING_SERVICE_SID
// — pinning the number the guest sees while riding the registered
// A2P campaign attached to the Messaging Service.
//
// Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
//      TWILIO_SMS_FROM               (e.g. +19294105502)
//      TWILIO_MESSAGING_SERVICE_SID  (MG…)
// ============================================================

/** True when the Twilio SMS env is present (SID + token + a sender). */
export function isSmsConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_SMS_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID)
  );
}

/**
 * Normalize a US-default phone number to E.164.
 *  - "+…" input: keep the country code, strip formatting.
 *  - 10 digits: assume US → +1XXXXXXXXXX.
 *  - 11 digits starting with 1: → +1XXXXXXXXXX.
 *  - Anything else: best effort "+<digits>".
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

export interface SendSmsInput {
  /** Destination phone; normalized to E.164 (+1 default) before send. */
  to: string;
  body: string;
}

export interface SendSmsResult {
  ok: boolean;
  /** Twilio message SID on success. */
  sid?: string;
  error?: string;
}

/** Outbound SMS via the Twilio REST API. Never throws. */
export async function sendSms({ to, body }: SendSmsInput): Promise<SendSmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid || !token || (!from && !messagingServiceSid)) {
    return {
      ok: false,
      error:
        'Twilio SMS env not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_SMS_FROM / TWILIO_MESSAGING_SERVICE_SID).',
    };
  }

  try {
    const form = new URLSearchParams({ To: normalizePhone(to), Body: body });
    // Both together: From pins the sender, MessagingServiceSid rides the A2P campaign.
    if (from) form.set('From', from);
    if (messagingServiceSid) form.set('MessagingServiceSid', messagingServiceSid);

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
      console.error('[twilio-sms] send failed', res.status, detail);
      return { ok: false, error: detail };
    }
    return { ok: true, sid: data.sid };
  } catch (err) {
    console.error('[twilio-sms] send error', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown send error.' };
  }
}
