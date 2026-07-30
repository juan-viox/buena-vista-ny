// ============================================================
// apps/crm/lib/reservations.ts — shared reservation capture +
// WhatsApp message log. The Supabase guest-upsert and
// reservation_request-insert logic here is extracted verbatim
// from /api/voice/reservation so the voice concierge and the
// WhatsApp concierge store guests through one code path (plain
// PostgREST fetch, no SDK). Everything fails soft: missing env
// or a missing table never breaks a live call or chat.
//
// whatsapp_messages table DDL (run once in the Supabase SQL editor):
//
//   create table if not exists whatsapp_messages (
//     id          uuid primary key default gen_random_uuid(),
//     tenant_slug text not null default 'buena-vista',
//     wa_from     text not null,             -- e.g. 'whatsapp:+12015551234'
//     role        text not null,             -- 'user' | 'assistant'
//     body        text not null,
//     created_at  timestamptz not null default now()
//   );
//   create index if not exists whatsapp_messages_thread_idx
//     on whatsapp_messages (tenant_slug, wa_from, created_at desc);
// ============================================================

import { sendWorkflowSms } from './sms-workflows';
import { sendWorkflowEmail } from './email-workflows';

export const TENANT_SLUG = 'buena-vista';

// ---------- input coercion helpers (shared by voice + whatsapp) ----------

/** Trimmed non-empty string or undefined. */
export function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/** Coerce party size to a positive integer or undefined. */
export function toPartySize(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Accept true/false, "true"/"yes"/"si"/"sí"/"1" from voice tool calls. */
export function toOptIn(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['true', 'yes', 'si', 'sí', '1'].includes(v.trim().toLowerCase());
  return false;
}

// ---------- Supabase PostgREST target (same env gating as the voice route) ----------

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

// ---------- reservation capture ----------

export interface ReservationInput {
  guestName: string;
  phone?: string;
  email?: string;
  partySize?: number;
  requestedDate?: string;
  requestedTime?: string;
  /** 'hells-kitchen' | 'east-village' | free text */
  location?: string;
  occasion?: string;
  notes?: string;
  marketingOptIn?: boolean;
  /** Channel stamped on the row + guest source. Defaults to 'voice'. */
  channel?: 'voice' | 'whatsapp';
}

export interface CaptureReservationResult {
  /** false only on a storage failure (the caller should surface an error). */
  ok: boolean;
  stored: boolean;
  id?: string;
  message: string;
  reason?: 'not_configured' | 'error';
  /** True when the post-capture "request received" SMS went out. */
  smsSent: boolean;
  /** True when the post-capture "request received" email went out. */
  emailSent: boolean;
}

/**
 * Upsert the guest (by tenant+phone when we have a phone) and insert a
 * reservation_request row. Exact behavior of the original voice route:
 * a guest failure must never lose the reservation request itself, and
 * unconfigured storage returns stored:false without erroring.
 */
export async function captureReservation(input: ReservationInput): Promise<CaptureReservationResult> {
  const channel = input.channel ?? 'voice';

  // ---- storage not configured: never fail a live call ----
  const supabase = supabaseTarget();
  if (!supabase) {
    return { ok: true, stored: false, reason: 'not_configured', message: 'storage not configured', smsSent: false, emailSent: false };
  }

  try {
    // (a) Guest upsert (by tenant+phone when we have a phone) — best effort:
    // a guest failure must not lose the reservation request itself.
    let guestId: string | undefined;
    try {
      const guestBody = {
        tenant_slug: TENANT_SLUG,
        name: input.guestName,
        phone: input.phone ?? null,
        email: input.email ?? null,
        source: channel,
        marketing_opt_in: input.marketingOptIn ?? false,
      };
      const guestUrl = input.phone
        ? `${supabase.base}/guests?on_conflict=tenant_slug,phone`
        : `${supabase.base}/guests`;
      const prefer = input.phone
        ? 'resolution=merge-duplicates,return=representation'
        : 'return=representation';
      const guestRes = await fetch(guestUrl, {
        method: 'POST',
        headers: { ...supabase.headers, Prefer: prefer },
        body: JSON.stringify(guestBody),
        cache: 'no-store',
      });
      if (guestRes.ok) {
        const rows = (await guestRes.json()) as Array<{ id?: string | number }>;
        const id = Array.isArray(rows) ? rows[0]?.id : undefined;
        if (id !== undefined && id !== null) guestId = String(id);
      } else {
        console.error('[reservations] guest upsert failed', guestRes.status, await guestRes.text());
      }
    } catch (guestErr) {
      console.error('[reservations] guest upsert error', guestErr);
    }

    // (b) Reservation request insert.
    const requestBody = {
      tenant_slug: TENANT_SLUG,
      guest_id: guestId ?? null,
      guest_name: input.guestName,
      phone: input.phone ?? null,
      email: input.email ?? null,
      party_size: input.partySize ?? null,
      requested_date: input.requestedDate ?? null,
      requested_time: input.requestedTime ?? null,
      location: input.location ?? null,
      occasion: input.occasion ?? null,
      notes: input.notes ?? null,
      channel,
      status: 'new',
    };
    const insertRes = await fetch(`${supabase.base}/reservation_requests`, {
      method: 'POST',
      headers: { ...supabase.headers, Prefer: 'return=representation' },
      body: JSON.stringify(requestBody),
      cache: 'no-store',
    });
    if (!insertRes.ok) {
      console.error('[reservations] insert failed', insertRes.status, await insertRes.text());
      return { ok: false, stored: false, reason: 'error', message: 'Could not store the reservation request.', smsSent: false, emailSent: false };
    }
    const inserted = (await insertRes.json()) as Array<{ id?: string | number }>;
    const rowId = Array.isArray(inserted) ? inserted[0]?.id : undefined;
    const id = rowId !== undefined && rowId !== null ? String(rowId) : undefined;

    // (c) Post-capture "request received" SMS — awaited so the caller
    // can report smsSent, but failure-safe: a texting problem must
    // never fail a capture that already stored.
    let smsSent = false;
    if (input.phone) {
      try {
        const sms = await sendWorkflowSms('request_received', {
          to: input.phone,
          refId: id,
          guestName: input.guestName,
          partySize: input.partySize,
          date: input.requestedDate,
          time: input.requestedTime,
          location: input.location,
        });
        smsSent = sms.ok;
        if (!sms.ok && sms.error) {
          console.error('[reservations] request_received sms failed', sms.error);
        }
      } catch (smsErr) {
        console.error('[reservations] request_received sms error', smsErr);
      }
    }

    // (d) Post-capture "request received" email — same failure-safe
    // contract as the SMS hook: an email problem must never fail a
    // capture that already stored.
    let emailSent = false;
    if (input.email) {
      try {
        const email = await sendWorkflowEmail('request_received', {
          to: input.email,
          refId: id,
          guestName: input.guestName,
          partySize: input.partySize,
          date: input.requestedDate,
          time: input.requestedTime,
          location: input.location,
        });
        emailSent = email.ok;
        if (!email.ok && email.error) {
          console.error('[reservations] request_received email failed', email.error);
        }
      } catch (emailErr) {
        console.error('[reservations] request_received email error', emailErr);
      }
    }

    return {
      ok: true,
      stored: true,
      id,
      message: 'Reservation request captured — the team will confirm shortly.',
      smsSent,
      emailSent,
    };
  } catch (err) {
    console.error('[reservations] error', err);
    return { ok: false, stored: false, reason: 'error', message: 'Internal error storing the reservation request.', smsSent: false, emailSent: false };
  }
}

// ---------- WhatsApp message log (whatsapp_messages) ----------

export interface WhatsAppMessage {
  role: 'user' | 'assistant';
  body: string;
}

/**
 * Last `limit` messages for one WhatsApp thread, oldest → newest.
 * Fails soft: missing env, a missing table (404 / Postgres 42P01),
 * or any network error returns [] so the chat keeps working.
 */
export async function getRecentMessages(from: string, limit = 6): Promise<WhatsAppMessage[]> {
  const supabase = supabaseTarget();
  if (!supabase) return [];
  try {
    const url =
      `${supabase.base}/whatsapp_messages` +
      `?tenant_slug=eq.${encodeURIComponent(TENANT_SLUG)}` +
      `&wa_from=eq.${encodeURIComponent(from)}` +
      `&select=role,body&order=created_at.desc&limit=${limit}`;
    const res = await fetch(url, { headers: supabase.headers, cache: 'no-store' });
    if (!res.ok) {
      // Table may not exist yet (PostgREST 404, or 42P01 in the error body).
      const detail = await res.text().catch(() => '');
      if (res.status !== 404 && !detail.includes('42P01')) {
        console.error('[reservations] whatsapp_messages read failed', res.status, detail.slice(0, 300));
      }
      return [];
    }
    const rows = (await res.json()) as Array<{ role?: string; body?: string }>;
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r): r is { role: string; body: string } => typeof r.body === 'string' && (r.role === 'user' || r.role === 'assistant'))
      .map((r) => ({ role: r.role as 'user' | 'assistant', body: r.body }))
      .reverse();
  } catch (err) {
    console.error('[reservations] whatsapp_messages read error', err);
    return [];
  }
}

/** Append one message to the thread log. Fails soft — never throws. */
export async function saveMessage(from: string, role: 'user' | 'assistant', body: string): Promise<void> {
  const supabase = supabaseTarget();
  if (!supabase) return;
  try {
    const res = await fetch(`${supabase.base}/whatsapp_messages`, {
      method: 'POST',
      headers: { ...supabase.headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ tenant_slug: TENANT_SLUG, wa_from: from, role, body }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      if (res.status !== 404 && !detail.includes('42P01')) {
        console.error('[reservations] whatsapp_messages write failed', res.status, detail.slice(0, 300));
      }
    }
  } catch (err) {
    console.error('[reservations] whatsapp_messages write error', err);
  }
}
