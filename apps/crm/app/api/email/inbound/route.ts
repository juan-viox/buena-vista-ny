// ============================================================
// /api/email/inbound — Resend webhook receiver.
//
//  - email.received  → guest replied to a concierge email: store
//    an inbound row in email_log (counterparty address in
//    to_email, subject + 500-char text/html preview).
//  - email.delivered / email.bounced (and complained) → update
//    the matching outbound email_log row's status by resend_id.
//
// Signature: Resend signs webhooks Svix-style (svix-id /
// svix-timestamp / svix-signature, HMAC-SHA256 base64 over
// "id.timestamp.body" with the base64 secret after "whsec_").
// Implemented with node:crypto — no deps. When
// RESEND_WEBHOOK_SECRET is absent the check is skipped so the
// endpoint can be curl-tested in dev.
//
// GET → { ok, configured } health probe.
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import { isEmailConfigured } from '@viox/integrations';
import { TENANT_SLUG } from '@/lib/reservations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// ---------- Svix signature verification (no deps) ----------

const TOLERANCE_SEC = 5 * 60;

function verifySvixSignature(req: Request, payload: string, secret: string): boolean {
  try {
    const id = req.headers.get('svix-id');
    const timestamp = req.headers.get('svix-timestamp');
    const signatures = req.headers.get('svix-signature');
    if (!id || !timestamp || !signatures) return false;

    // Reject stale/future timestamps (replay protection).
    const ts = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SEC) return false;

    const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'base64');
    const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`, 'utf8').digest();

    // Header holds space-delimited "v1,<base64sig>" entries.
    for (const part of signatures.split(' ')) {
      const [version, sig] = part.split(',');
      if (version !== 'v1' || !sig) continue;
      const candidate = Buffer.from(sig, 'base64');
      if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return true;
    }
    return false;
  } catch (err) {
    console.error('[email/inbound] signature check error', err);
    return false;
  }
}

// ---------- Supabase PostgREST target (same env gating as reservations) ----------

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

// ---------- payload shapes (only the fields we read) ----------

interface ResendWebhook {
  type?: string;
  data?: {
    email_id?: string;
    from?: string | { address?: string; name?: string };
    to?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
  };
}

function fromAddress(from: unknown): string {
  if (typeof from === 'string') return from;
  if (from && typeof from === 'object') {
    const addr = (from as { address?: unknown }).address;
    if (typeof addr === 'string') return addr;
  }
  return '';
}

/** Plain 500-char preview from text (preferred) or stripped html. */
function preview(text?: string, html?: string, max = 500): string {
  const source = text?.trim() ? text : (html ?? '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const clean = source.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

// ---------- handlers ----------

export async function GET(): Promise<Response> {
  return json({ ok: true, configured: isEmailConfigured() });
}

export async function POST(req: Request): Promise<Response> {
  const payload = await req.text();

  // ---- signature (skipped when the secret isn't set) ----
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret && !verifySvixSignature(req, payload, secret)) {
    return json({ ok: false, error: 'Invalid webhook signature.' }, 401);
  }

  let event: ResendWebhook;
  try {
    event = JSON.parse(payload) as ResendWebhook;
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400);
  }
  const type = event.type ?? '';
  const data = event.data ?? {};

  const supabase = supabaseTarget();
  if (!supabase) {
    // Always 200 non-error types so Resend doesn't retry forever in dev.
    return json({ ok: true, stored: false, reason: 'not_configured' });
  }

  try {
    // ---- inbound guest reply → email_log row ----
    if (type === 'email.received') {
      const guest = fromAddress(data.from);
      const res = await fetch(`${supabase.base}/email_log`, {
        method: 'POST',
        headers: { ...supabase.headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          tenant_slug: TENANT_SLUG,
          // email_log keys the counterparty address in to_email —
          // for inbound rows that's the guest who wrote to us.
          to_email: guest || 'unknown',
          subject: data.subject ?? '(no subject)',
          body_preview: preview(data.text, data.html),
          kind: 'inbound',
          resend_id: data.email_id ?? null,
          direction: 'inbound',
          status: 'received',
        }),
        cache: 'no-store',
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        if (res.status !== 404 && !detail.includes('42P01')) {
          console.error('[email/inbound] email_log insert failed', res.status, detail.slice(0, 300));
        }
        return json({ ok: true, stored: false });
      }
      return json({ ok: true, stored: true });
    }

    // ---- delivery lifecycle → update outbound row status by resend_id ----
    const STATUS_BY_TYPE: Record<string, string> = {
      'email.delivered': 'delivered',
      'email.bounced': 'bounced',
      'email.complained': 'complained',
    };
    const status = STATUS_BY_TYPE[type];
    if (status && data.email_id) {
      const res = await fetch(
        `${supabase.base}/email_log?resend_id=eq.${encodeURIComponent(data.email_id)}&tenant_slug=eq.${TENANT_SLUG}`,
        {
          method: 'PATCH',
          headers: { ...supabase.headers, Prefer: 'return=minimal' },
          body: JSON.stringify({ status }),
          cache: 'no-store',
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        if (res.status !== 404 && !detail.includes('42P01')) {
          console.error('[email/inbound] email_log status update failed', res.status, detail.slice(0, 300));
        }
      }
      return json({ ok: true });
    }

    // Unhandled event types are acknowledged so Resend doesn't retry.
    return json({ ok: true, ignored: type || 'unknown' });
  } catch (err) {
    console.error('[email/inbound] error', err);
    return json({ ok: false, error: 'Internal error handling the webhook.' }, 500);
  }
}
