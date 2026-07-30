// ============================================================
// POST /api/public/lead — public capture endpoint for the
// marketing site (buena-vista-ny.vercel.app). Three kinds:
//
//   reservation_request → captureReservation (channel 'web'):
//     guest upsert + reservation_requests insert + the existing
//     request_received SMS/email hooks.
//   event_inquiry → catering lead: try catering_events (stage
//     'lead') when the table exists, else fall back to a
//     reservation_requests row with channel 'web-event'; then a
//     notification email to the events inbox + an auto-reply to
//     the guest when we have their email.
//   newsletter → guests upsert by tenant+email (source
//     'newsletter', marketing_opt_in true) + a welcome email.
//
// CORS: only the site origins below may call from a browser.
// Honeypot: a filled `website` field is silently accepted and
// dropped. Rate limit: best-effort in-memory 10/min/IP.
// Everything fails soft — with no storage/email env configured
// the endpoint answers { ok: true, stored: false } and the site
// keeps its ¡Gracias! UX.
// ============================================================

import { captureReservation, str, toOptIn, toPartySize, TENANT_SLUG } from '@/lib/reservations';
import { isEmailConfigured, sendEmail } from '@viox/integrations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------- CORS ----------

const ALLOWED_ORIGINS = [
  'https://buena-vista-ny.vercel.app',
  'http://localhost:8734', // local static-site dev
  'http://127.0.0.1:8734',
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(req) },
  });
}

export async function OPTIONS(req: Request): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

/** Health check — no data returned. */
export async function GET(req: Request): Promise<Response> {
  return json(req, { ok: true, configured: !!process.env.SUPABASE_URL });
}

// ---------- best-effort in-memory rate limit (10/min/IP) ----------

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const stamps = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (stamps.length >= RATE_LIMIT) {
    hits.set(ip, stamps);
    return true;
  }
  stamps.push(now);
  hits.set(ip, stamps);
  // Bound the map so a long-lived instance can't grow unbounded.
  if (hits.size > 5000) {
    for (const key of hits.keys()) {
      if (hits.size <= 2500) break;
      hits.delete(key);
    }
  }
  return false;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

// ---------- Supabase PostgREST target (same env gating as the lib) ----------

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

/** Best-effort email_log insert (mirrors lib/email-workflows). Never throws. */
async function logEmail(row: {
  to_email: string;
  subject: string;
  kind: string;
  ref_id?: string;
  resend_id?: string;
  status: 'sent' | 'failed';
}): Promise<void> {
  const supabase = supabaseTarget();
  if (!supabase) return;
  try {
    const res = await fetch(`${supabase.base}/email_log`, {
      method: 'POST',
      headers: { ...supabase.headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        tenant_slug: TENANT_SLUG,
        to_email: row.to_email,
        subject: row.subject,
        kind: row.kind,
        ref_id: row.ref_id ?? null,
        resend_id: row.resend_id ?? null,
        direction: 'outbound',
        status: row.status,
      }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      if (res.status !== 404 && !detail.includes('42P01')) {
        console.error('[public/lead] email_log write failed', res.status, detail.slice(0, 300));
      }
    }
  } catch (err) {
    console.error('[public/lead] email_log write error', err);
  }
}

// ---------- shared branded email shell (compact) ----------

const NAVY = '#1E3A5F';
const GOLD = '#C9995C';
const CREAM = '#F7F2E9';
const INK = '#22303F';
const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const SANS = "'Jost', 'Helvetica Neue', Helvetica, Arial, sans-serif";

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function detailRow(label: string, value: string): string {
  return (
    `<tr>` +
    `<td style="padding:10px 16px;border-bottom:1px solid rgba(201,153,92,.25);font-family:${SANS};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${GOLD};white-space:nowrap;">&#9670;&nbsp;&nbsp;${esc(label)}</td>` +
    `<td style="padding:10px 16px;border-bottom:1px solid rgba(201,153,92,.25);font-family:${SANS};font-size:14px;font-weight:500;color:${INK};text-align:right;">${esc(value)}</td>` +
    `</tr>`
  );
}

function shell(heading: string, bodyHtml: string, rows: string[]): string {
  const table = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;border:1px solid rgba(201,153,92,.35);border-radius:10px;border-collapse:separate;overflow:hidden;background:rgba(201,153,92,.06);">${rows.join('')}</table>`
    : '';
  return (
    `<div style="margin:0;padding:0;background-color:${CREAM};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};"><tr><td align="center" style="padding:32px 16px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFDF8;border:1px solid rgba(30,58,95,.12);border-radius:14px;border-collapse:separate;overflow:hidden;box-shadow:0 2px 12px rgba(30,58,95,.08);">` +
    `<tr><td align="center" style="background-color:${NAVY};padding:26px 24px 22px;">` +
    `<div style="font-family:${SANS};font-size:11px;letter-spacing:.32em;color:${GOLD};text-transform:uppercase;">&#9670;&nbsp;&nbsp;Restaurant &amp; Bar&nbsp;&nbsp;&#9670;</div>` +
    `<div style="margin-top:8px;font-family:${SERIF};font-size:30px;letter-spacing:.18em;color:#FFFFFF;text-transform:uppercase;">Buena&nbsp;Vista</div>` +
    `<div style="margin-top:10px;width:56px;height:2px;background-color:${GOLD};font-size:0;line-height:0;">&nbsp;</div>` +
    `</td></tr>` +
    `<tr><td style="padding:30px 32px 26px;">` +
    `<h1 style="margin:0;font-family:${SERIF};font-size:24px;font-weight:600;color:${NAVY};">${heading}</h1>` +
    `<div style="margin-top:14px;font-family:${SANS};font-size:14px;line-height:1.7;color:${INK};">${bodyHtml}</div>` +
    table +
    `<div style="margin-top:20px;font-family:${SANS};font-size:13px;line-height:1.6;color:#6B7684;border-top:1px solid rgba(30,58,95,.1);padding-top:16px;">Reply to this email and our team will follow up.</div>` +
    `</td></tr>` +
    `<tr><td style="background-color:rgba(30,58,95,.05);padding:18px 24px;border-top:1px solid rgba(30,58,95,.1);text-align:center;font-family:${SANS};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${GOLD};">&#9670;&nbsp;&nbsp;Buena Vista &middot; New York&nbsp;&nbsp;&#9670;</td></tr>` +
    `</table></td></tr></table></div>`
  );
}

// ---------- payload ----------

type LeadKind = 'event_inquiry' | 'newsletter' | 'reservation_request';

interface LeadBody {
  kind: LeadKind;
  name?: string;
  email?: string;
  phone?: string;
  partySize?: number;
  eventDate?: string;
  date?: string;
  time?: string;
  location?: string;
  occasion?: string;
  notes?: string;
  marketingOptIn: boolean;
}

function parseLead(b: Record<string, unknown>): LeadBody | null {
  const kind = str(b.kind);
  if (kind !== 'event_inquiry' && kind !== 'newsletter' && kind !== 'reservation_request') return null;
  return {
    kind,
    name: str(b.name),
    email: str(b.email),
    phone: str(b.phone),
    partySize: toPartySize(b.party_size),
    eventDate: str(b.event_date),
    date: str(b.date),
    time: str(b.time),
    location: str(b.location),
    occasion: str(b.occasion),
    notes: str(b.notes),
    marketingOptIn: toOptIn(b.marketing_opt_in),
  };
}

// ---------- newsletter: guests upsert by tenant+email ----------

async function upsertNewsletterGuest(lead: LeadBody): Promise<{ stored: boolean; id?: string }> {
  const supabase = supabaseTarget();
  if (!supabase || !lead.email) return { stored: false };
  const email = lead.email;
  const fallbackName = lead.name ?? email.split('@')[0] ?? 'VIP Guest';
  try {
    // The live guests table is unique on (tenant_slug, phone) only,
    // so the email upsert is find-then-patch/insert.
    const findUrl =
      `${supabase.base}/guests?tenant_slug=eq.${encodeURIComponent(TENANT_SLUG)}` +
      `&email=eq.${encodeURIComponent(email)}&select=id&limit=1`;
    const found = await fetch(findUrl, { headers: supabase.headers, cache: 'no-store' });
    if (found.ok) {
      const rows = (await found.json()) as Array<{ id?: string | number }>;
      const existingId = Array.isArray(rows) && rows[0]?.id != null ? String(rows[0].id) : undefined;
      if (existingId) {
        const patch = await fetch(`${supabase.base}/guests?id=eq.${encodeURIComponent(existingId)}`, {
          method: 'PATCH',
          headers: { ...supabase.headers, Prefer: 'return=minimal' },
          body: JSON.stringify({ marketing_opt_in: true }),
          cache: 'no-store',
        });
        if (!patch.ok) console.error('[public/lead] newsletter guest patch failed', patch.status, await patch.text().catch(() => ''));
        return { stored: patch.ok, id: existingId };
      }
    }
    const insert = await fetch(`${supabase.base}/guests`, {
      method: 'POST',
      headers: { ...supabase.headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        tenant_slug: TENANT_SLUG,
        name: fallbackName,
        email,
        phone: lead.phone ?? null,
        source: 'newsletter',
        marketing_opt_in: true,
      }),
      cache: 'no-store',
    });
    if (!insert.ok) {
      console.error('[public/lead] newsletter guest insert failed', insert.status, await insert.text().catch(() => ''));
      return { stored: false };
    }
    const rows = (await insert.json()) as Array<{ id?: string | number }>;
    const id = Array.isArray(rows) && rows[0]?.id != null ? String(rows[0].id) : undefined;
    return { stored: true, id };
  } catch (err) {
    console.error('[public/lead] newsletter guest upsert error', err);
    return { stored: false };
  }
}

async function sendNewsletterWelcome(lead: LeadBody, refId?: string): Promise<boolean> {
  if (!lead.email || !isEmailConfigured()) return false;
  const hola = lead.name ? `Hola ${esc(lead.name)},` : 'Hola,';
  const subject = "You're on the VIP list — Buena Vista";
  const html = shell(
    '&iexcl;Bienvenido! You&#39;re on the list',
    `<p style="margin:0;">${hola}</p>` +
      `<p style="margin:12px 0 0;">You&#39;re on the Buena Vista VIP list — first pours, secret menus, and invitations to nights that never make it to social media. &iexcl;Salud!</p>`,
    [],
  );
  const result = await sendEmail({ to: lead.email, subject, html });
  await logEmail({
    to_email: lead.email,
    subject,
    kind: 'newsletter_welcome',
    ref_id: refId,
    resend_id: result.id,
    status: result.ok ? 'sent' : 'failed',
  });
  return result.ok;
}

// ---------- event inquiry: catering lead + emails ----------

const EVENTS_NOTIFY_TO = 'juan@viox.ai';

/**
 * Try a catering_events lead row first (table may not exist in the
 * live project yet); on any failure fall back to a
 * reservation_requests row with channel 'web-event' so no inquiry
 * is ever dropped.
 */
async function storeEventInquiry(lead: LeadBody): Promise<{ stored: boolean; id?: string; table?: string }> {
  const supabase = supabaseTarget();
  if (!supabase) return { stored: false };

  const when = lead.eventDate ?? lead.date;

  // (a) Guest upsert — best effort, same contract as captureReservation.
  let guestId: string | undefined;
  try {
    const guestUrl = lead.phone ? `${supabase.base}/guests?on_conflict=tenant_slug,phone` : `${supabase.base}/guests`;
    const prefer = lead.phone ? 'resolution=merge-duplicates,return=representation' : 'return=representation';
    const guestRes = await fetch(guestUrl, {
      method: 'POST',
      headers: { ...supabase.headers, Prefer: prefer },
      body: JSON.stringify({
        tenant_slug: TENANT_SLUG,
        name: lead.name ?? 'Event Inquiry',
        phone: lead.phone ?? null,
        email: lead.email ?? null,
        source: 'event',
        marketing_opt_in: lead.marketingOptIn,
      }),
      cache: 'no-store',
    });
    if (guestRes.ok) {
      const rows = (await guestRes.json()) as Array<{ id?: string | number }>;
      if (Array.isArray(rows) && rows[0]?.id != null) guestId = String(rows[0].id);
    }
  } catch (err) {
    console.error('[public/lead] event guest upsert error', err);
  }

  // (b) catering_events lead — only when the table exists.
  try {
    const res = await fetch(`${supabase.base}/catering_events`, {
      method: 'POST',
      headers: { ...supabase.headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        tenant_slug: TENANT_SLUG,
        guest_id: guestId ?? null,
        title: `${lead.name ?? 'Website'} — ${lead.occasion ?? 'private event'}`,
        contact_name: lead.name ?? 'Website inquiry',
        contact_email: lead.email ?? '',
        contact_phone: lead.phone ?? '',
        stage: 'lead',
        event_date: when ?? null,
        party_size: lead.partySize ?? 0,
        notes: lead.notes ?? '',
      }),
      cache: 'no-store',
    });
    if (res.ok) {
      const rows = (await res.json()) as Array<{ id?: string | number }>;
      const id = Array.isArray(rows) && rows[0]?.id != null ? String(rows[0].id) : undefined;
      return { stored: true, id, table: 'catering_events' };
    }
    // Fall through to reservation_requests on any failure (missing
    // table 404 / 42P01, schema mismatch, etc.).
  } catch (err) {
    console.error('[public/lead] catering_events insert error', err);
  }

  // (c) Fallback: reservation_requests row, channel 'web-event'.
  try {
    const res = await fetch(`${supabase.base}/reservation_requests`, {
      method: 'POST',
      headers: { ...supabase.headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        tenant_slug: TENANT_SLUG,
        guest_id: guestId ?? null,
        guest_name: lead.name ?? 'Event Inquiry',
        phone: lead.phone ?? null,
        email: lead.email ?? null,
        party_size: lead.partySize ?? null,
        requested_date: when ?? null,
        requested_time: lead.time ?? null,
        location: lead.location ?? null,
        occasion: lead.occasion ?? 'private event',
        notes: lead.notes ?? null,
        channel: 'web-event',
        status: 'new',
      }),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('[public/lead] event fallback insert failed', res.status, await res.text().catch(() => ''));
      return { stored: false };
    }
    const rows = (await res.json()) as Array<{ id?: string | number }>;
    const id = Array.isArray(rows) && rows[0]?.id != null ? String(rows[0].id) : undefined;
    return { stored: true, id, table: 'reservation_requests' };
  } catch (err) {
    console.error('[public/lead] event fallback insert error', err);
    return { stored: false };
  }
}

async function sendEventEmails(lead: LeadBody, refId?: string): Promise<{ notified: boolean; replied: boolean }> {
  if (!isEmailConfigured()) return { notified: false, replied: false };
  const when = lead.eventDate ?? lead.date;
  const rows: string[] = [];
  if (lead.partySize) rows.push(detailRow('Party', `${lead.partySize} guests`));
  if (when) rows.push(detailRow('Date', when));
  if (lead.time) rows.push(detailRow('Time', lead.time));
  if (lead.location) rows.push(detailRow('Location', lead.location));
  if (lead.occasion) rows.push(detailRow('Occasion', lead.occasion));

  // (a) Internal notification.
  let notified = false;
  try {
    const subject = `New private-event inquiry — ${lead.name ?? 'website'}${lead.partySize ? ` (${lead.partySize} guests)` : ''}`;
    const contact = [lead.email, lead.phone].filter(Boolean).map((v) => esc(String(v))).join(' &middot; ');
    const html = shell(
      'New private-event inquiry',
      `<p style="margin:0;"><strong>${esc(lead.name ?? 'Website inquiry')}</strong>${contact ? ` &mdash; ${contact}` : ''}</p>` +
        (lead.notes ? `<p style="margin:12px 0 0;">${esc(lead.notes)}</p>` : ''),
      rows,
    );
    const result = await sendEmail({ to: EVENTS_NOTIFY_TO, subject, html, replyTo: lead.email });
    notified = result.ok;
    await logEmail({ to_email: EVENTS_NOTIFY_TO, subject, kind: 'event_inquiry_notify', ref_id: refId, resend_id: result.id, status: result.ok ? 'sent' : 'failed' });
  } catch (err) {
    console.error('[public/lead] event notify email error', err);
  }

  // (b) Guest auto-reply.
  let replied = false;
  if (lead.email) {
    try {
      const subject = 'We received your event inquiry — Buena Vista';
      const hola = lead.name ? `Hola ${esc(lead.name)},` : 'Hola,';
      const html = shell(
        '&iexcl;Gracias! Inquiry received',
        `<p style="margin:0;">${hola}</p>` +
          `<p style="margin:12px 0 0;">We received your private-event inquiry and our events team is reviewing it now — expect to hear from us within one business day. Dates, menus, minimums, and everything in between: we&#39;ll walk you through it all.</p>`,
        rows,
      );
      const result = await sendEmail({ to: lead.email, subject, html });
      replied = result.ok;
      await logEmail({ to_email: lead.email, subject, kind: 'event_inquiry_reply', ref_id: refId, resend_id: result.id, status: result.ok ? 'sent' : 'failed' });
    } catch (err) {
      console.error('[public/lead] event auto-reply error', err);
    }
  }
  return { notified, replied };
}

// ---------- POST ----------

export async function POST(req: Request): Promise<Response> {
  if (rateLimited(clientIp(req))) {
    return json(req, { ok: false, error: 'Too many requests — try again in a minute.' }, 429);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(req, { ok: false, error: 'Invalid JSON body.' }, 400);
  }
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  // Honeypot: bots fill `website` — accept and drop, no signal back.
  if (str(b.website)) {
    return json(req, { ok: true, stored: false });
  }

  const lead = parseLead(b);
  if (!lead) {
    return json(req, { ok: false, error: "kind must be 'event_inquiry', 'newsletter', or 'reservation_request'." }, 400);
  }

  try {
    switch (lead.kind) {
      case 'reservation_request': {
        if (!lead.name) return json(req, { ok: false, error: 'name is required.' }, 400);
        const result = await captureReservation({
          guestName: lead.name,
          phone: lead.phone,
          email: lead.email,
          partySize: lead.partySize,
          requestedDate: lead.date ?? lead.eventDate,
          requestedTime: lead.time,
          location: lead.location,
          occasion: lead.occasion,
          notes: lead.notes,
          marketingOptIn: lead.marketingOptIn,
          channel: 'web',
        });
        if (!result.ok) return json(req, { ok: false, error: result.message }, 500);
        return json(req, {
          ok: true,
          stored: result.stored,
          id: result.id,
          smsSent: result.smsSent,
          emailSent: result.emailSent,
        });
      }

      case 'newsletter': {
        if (!lead.email) return json(req, { ok: false, error: 'email is required.' }, 400);
        const stored = await upsertNewsletterGuest(lead);
        const emailSent = await sendNewsletterWelcome(lead, stored.id);
        return json(req, { ok: true, stored: stored.stored, id: stored.id, emailSent });
      }

      case 'event_inquiry': {
        if (!lead.name) return json(req, { ok: false, error: 'name is required.' }, 400);
        const stored = await storeEventInquiry(lead);
        const emails = await sendEventEmails(lead, stored.id);
        return json(req, {
          ok: true,
          stored: stored.stored,
          id: stored.id,
          notified: emails.notified,
          emailSent: emails.replied,
        });
      }
    }
  } catch (err) {
    console.error('[public/lead] error', err);
    return json(req, { ok: false, error: 'Internal error.' }, 500);
  }
}
