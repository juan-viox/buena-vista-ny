// ============================================================
// Resend email adapter — outbound transactional email via plain
// fetch (no SDK), mirroring the Twilio adapters' REST style.
//
// Env: RESEND_API_KEY   (re_…)
//      EMAIL_FROM       e.g. "Buena Vista Concierge <concierge@viox.ai>"
//      EMAIL_REPLY_TO   optional default reply-to, e.g. juan@viox.ai
// ============================================================

/** True when the Resend email env is present (API key + a sender). */
export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export interface SendEmailInput {
  /** Destination address. */
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text alternative. */
  text?: string;
  /** Overrides EMAIL_REPLY_TO for this send. */
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  /** Resend email id on success. */
  id?: string;
  error?: string;
}

/** Outbound email via the Resend REST API. Never throws. */
export async function sendEmail({ to, subject, html, text, replyTo }: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { ok: false, error: 'Resend email env not configured (RESEND_API_KEY / EMAIL_FROM).' };
  }

  try {
    const payload: Record<string, unknown> = { from, to: [to], subject, html };
    if (text) payload.text = text;
    const resolvedReplyTo = replyTo ?? process.env.EMAIL_REPLY_TO;
    if (resolvedReplyTo) payload.reply_to = resolvedReplyTo;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      const detail = data.message ?? `Resend responded ${res.status}.`;
      console.error('[resend-email] send failed', res.status, detail);
      return { ok: false, error: detail };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    console.error('[resend-email] send error', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown send error.' };
  }
}
