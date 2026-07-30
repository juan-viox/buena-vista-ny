// ============================================================
// apps/crm/lib/email-workflows.ts — branded guest email for
// Buena Vista, the email twin of sms-workflows.ts. renderEmail()
// turns the same lifecycle events into an elegant inline-CSS
// HTML email (cream card, azulejo-navy header band, gold detail
// rows). sendWorkflowEmail() renders, sends via the Resend
// adapter, and best-effort logs into the email_log table via
// plain PostgREST fetch — it never throws, so an email problem
// can never break a capture flow or an API route.
//
// email_log columns: id, tenant_slug, to_email, subject,
//   body_preview, kind, ref_id, resend_id, direction, status,
//   created_at
// ============================================================

import { isEmailConfigured, sendEmail } from '@viox/integrations';
import { TENANT_SLUG } from './reservations';
import type { SmsContext, SmsEvent } from './sms-workflows';

// Email lifecycle events mirror the SMS ones exactly.
export type EmailEvent = SmsEvent;
export type EmailContext = SmsContext;

// ---------- brand + locations ----------

const NAVY = '#1E3A5F';
const GOLD = '#C9995C';
const CREAM = '#F7F2E9';
const INK = '#22303F';
const MUTED = '#6B7684';

interface LocationInfo {
  name: string;
  phone?: string;
  address?: string;
}

const LOCATIONS: Record<string, LocationInfo> = {
  'hells-kitchen': {
    name: "Hell's Kitchen",
    phone: '(212) 388-5040',
    address: '536 9th Ave, New York, NY 10018',
  },
  'east-village': {
    name: 'East Village',
    phone: '(929) 220-0547',
    address: '88 2nd Ave, New York, NY 10003',
  },
};

function locationInfo(location?: string): LocationInfo {
  if (!location) return { name: 'Buena Vista' };
  const known = LOCATIONS[location.trim().toLowerCase()];
  if (known) return { ...known, name: `Buena Vista ${known.name}` };
  return { name: `Buena Vista ${location.trim()}` };
}

// ---------- small helpers ----------

/** Escape user-supplied text for HTML interpolation. */
function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(guestName?: string): string {
  const n = guestName?.trim();
  return n ? n : '';
}

/** Free text with guaranteed terminal punctuation. */
function sentence(text: string): string {
  const t = text.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

// ---------- layout ----------

const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
const SANS = "'Jost', 'Helvetica Neue', Helvetica, Arial, sans-serif";

/** One gold "CTA-style" detail row: ◆ label — value. */
function detailRow(label: string, value: string): string {
  return (
    `<tr>` +
    `<td style="padding:10px 16px;border-bottom:1px solid rgba(201,153,92,.25);font-family:${SANS};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${GOLD};white-space:nowrap;">` +
    `<span style="color:${GOLD};">&#9670;</span>&nbsp;&nbsp;${esc(label)}` +
    `</td>` +
    `<td style="padding:10px 16px;border-bottom:1px solid rgba(201,153,92,.25);font-family:${SANS};font-size:14px;font-weight:500;color:${INK};text-align:right;">${esc(value)}</td>` +
    `</tr>`
  );
}

/** Detail rows from whatever context we have. */
function detailTable(ctx: EmailContext): string {
  const rows: string[] = [];
  const loc = locationInfo(ctx.location);
  if (ctx.partySize && ctx.partySize > 0) rows.push(detailRow('Party', `${ctx.partySize} guests`));
  if (ctx.date?.trim()) rows.push(detailRow('Date', ctx.date.trim()));
  if (ctx.time?.trim()) rows.push(detailRow('Time', ctx.time.trim()));
  if (ctx.location?.trim()) rows.push(detailRow('Location', loc.name));
  if (ctx.quotedMin && ctx.quotedMin > 0) rows.push(detailRow('Current wait', `about ${ctx.quotedMin} min`));
  if (rows.length === 0) return '';
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;border:1px solid rgba(201,153,92,.35);border-radius:10px;border-collapse:separate;overflow:hidden;background:rgba(201,153,92,.06);">` +
    rows.join('') +
    `</table>`
  );
}

function footerLocation(key: 'hells-kitchen' | 'east-village'): string {
  const l = LOCATIONS[key];
  return (
    `<td width="50%" valign="top" style="padding:0 8px;">` +
    `<div style="font-family:${SANS};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${GOLD};">${esc(l.name)}</div>` +
    `<div style="margin-top:4px;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};">${esc(l.address ?? '')}<br/>${esc(l.phone ?? '')}</div>` +
    `</td>`
  );
}

/** Full branded shell around a heading + body paragraphs + detail rows. */
function shell(opts: { heading: string; bodyHtml: string; ctx: EmailContext }): string {
  return (
    `<div style="margin:0;padding:0;background-color:${CREAM};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};padding:0;margin:0;">` +
    `<tr><td align="center" style="padding:32px 16px;">` +
    // card
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFDF8;border:1px solid rgba(30,58,95,.12);border-radius:14px;border-collapse:separate;overflow:hidden;box-shadow:0 2px 12px rgba(30,58,95,.08);">` +
    // navy header band
    `<tr><td align="center" style="background-color:${NAVY};padding:26px 24px 22px;">` +
    `<div style="font-family:${SANS};font-size:11px;letter-spacing:.32em;color:${GOLD};text-transform:uppercase;">&#9670;&nbsp;&nbsp;Restaurant &amp; Bar&nbsp;&nbsp;&#9670;</div>` +
    `<div style="margin-top:8px;font-family:${SERIF};font-size:30px;letter-spacing:.18em;color:#FFFFFF;text-transform:uppercase;">Buena&nbsp;Vista</div>` +
    `<div style="margin-top:10px;width:56px;height:2px;background-color:${GOLD};font-size:0;line-height:0;">&nbsp;</div>` +
    `</td></tr>` +
    // body
    `<tr><td style="padding:30px 32px 8px;">` +
    `<h1 style="margin:0;font-family:${SERIF};font-size:24px;font-weight:600;color:${NAVY};">${opts.heading}</h1>` +
    `<div style="margin-top:14px;font-family:${SANS};font-size:14px;line-height:1.7;color:${INK};">${opts.bodyHtml}</div>` +
    detailTable(opts.ctx) +
    `</td></tr>` +
    // reply note
    `<tr><td style="padding:14px 32px 26px;">` +
    `<div style="font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};border-top:1px solid rgba(30,58,95,.1);padding-top:16px;">` +
    `Reply to this email and our team will follow up.` +
    `</div>` +
    `</td></tr>` +
    // footer band with both locations
    `<tr><td style="background-color:rgba(30,58,95,.05);padding:20px 24px 22px;border-top:1px solid rgba(30,58,95,.1);">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    footerLocation('hells-kitchen') +
    footerLocation('east-village') +
    `</tr></table>` +
    `<div style="margin-top:16px;text-align:center;font-family:${SANS};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${GOLD};">&#9670;&nbsp;&nbsp;Buena Vista &middot; New York&nbsp;&nbsp;&#9670;</div>` +
    `</td></tr>` +
    `</table>` +
    `</td></tr></table>` +
    `</div>`
  );
}

// ---------- rendering ----------

export interface RenderedEmail {
  subject: string;
  html: string;
}

/**
 * Elegant branded HTML for one workflow event — the same seven
 * lifecycle events the SMS side sends, with the same warm bilingual
 * accent.
 */
export function renderEmail(event: EmailEvent, ctx: EmailContext = {}): RenderedEmail {
  const loc = locationInfo(ctx.location);
  const name = firstName(ctx.guestName);
  const hola = name ? `Hola ${esc(name)},` : 'Hola,';

  switch (event) {
    case 'request_received':
      return {
        subject: `We received your reservation request — ${loc.name}`,
        html: shell({
          heading: '&iexcl;Gracias! Request received',
          bodyHtml:
            `<p style="margin:0;">${hola}</p>` +
            `<p style="margin:12px 0 0;">${esc(loc.name)} has received your reservation request. ` +
            `Our team is reviewing it now and will confirm shortly${loc.phone ? ` — or call us at ${esc(loc.phone)} if plans change` : ''}.</p>`,
          ctx,
        }),
      };

    case 'reservation_confirmed':
      return {
        subject: `¡Confirmado! Your table at ${loc.name} is set`,
        html: shell({
          heading: '&iexcl;Confirmado! Your table is set',
          bodyHtml:
            `<p style="margin:0;">${hola}</p>` +
            `<p style="margin:12px 0 0;">Your reservation at ${esc(loc.name)} is confirmed. ` +
            `We can&#39;t wait to host you — &iexcl;salud!${loc.phone ? ` Need anything before then? Call ${esc(loc.phone)}.` : ''}</p>`,
          ctx,
        }),
      };

    case 'reservation_updated':
      return {
        subject: `Your reservation at ${loc.name} has been updated`,
        html: shell({
          heading: '&iexcl;Listo! Reservation updated',
          bodyHtml:
            `<p style="margin:0;">${hola}</p>` +
            `<p style="margin:12px 0 0;">Your reservation at ${esc(loc.name)} has been updated — the latest details are below. ` +
            `See you soon. &iexcl;Gracias!</p>`,
          ctx,
        }),
      };

    case 'reservation_declined':
      return {
        subject: `About your reservation request — ${loc.name}`,
        html: shell({
          heading: 'Lo sentimos — we couldn&#39;t take this one',
          bodyHtml:
            `<p style="margin:0;">${hola}</p>` +
            `<p style="margin:12px 0 0;">We couldn&#39;t take your reservation request at ${esc(loc.name)} this time.` +
            `${ctx.custom?.trim() ? ` ${esc(sentence(ctx.custom))}` : ''}</p>` +
            `<p style="margin:12px 0 0;">${
              loc.phone
                ? `Call ${esc(loc.phone)} or simply reply to this email and we&#39;ll find a time that works. &iexcl;Gracias!`
                : `Reply to this email and we&#39;ll find a time that works. &iexcl;Gracias!`
            }</p>`,
          ctx,
        }),
      };

    case 'waitlist_joined':
      return {
        subject: `You're on the waitlist at ${loc.name}`,
        html: shell({
          heading: '&iexcl;Gracias! You&#39;re on the list',
          bodyHtml:
            `<p style="margin:0;">${hola}</p>` +
            `<p style="margin:12px 0 0;">You&#39;re on the waitlist at ${esc(loc.name)}. ` +
            `We&#39;ll let you know the moment your table is ready.</p>`,
          ctx,
        }),
      };

    case 'table_ready':
      return {
        subject: `Your table at ${loc.name} is ready`,
        html: shell({
          heading: 'Your table is ready',
          bodyHtml:
            `<p style="margin:0;">${hola}</p>` +
            `<p style="margin:12px 0 0;">Your table at ${esc(loc.name)} is ready! ` +
            `Please see the host within 10 minutes and we&#39;ll seat you. &iexcl;Salud!</p>`,
          ctx,
        }),
      };

    case 'order_update':
      return {
        subject: `An update on your order — ${loc.name}`,
        html: shell({
          heading: 'Order update',
          bodyHtml:
            `<p style="margin:0;">${hola}</p>` +
            `<p style="margin:12px 0 0;">An update from ${esc(loc.name)}: ` +
            `${ctx.custom?.trim() ? esc(sentence(ctx.custom)) : 'your order is being prepared and will be ready soon.'} &iexcl;Gracias!</p>`,
          ctx,
        }),
      };
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

/** Best-effort email_log insert. Fails soft — never throws. */
async function logEmail(row: {
  to_email: string;
  subject: string;
  body_preview?: string;
  kind: EmailEvent;
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
        body_preview: row.body_preview ?? null,
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
        console.error('[email-workflows] email_log write failed', res.status, detail.slice(0, 300));
      }
    }
  } catch (err) {
    console.error('[email-workflows] email_log write error', err);
  }
}

/** Plain-text preview of the rendered HTML (for the log + inbox list). */
function toPreview(html: string, max = 500): string {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&iexcl;/g, '¡')
    .replace(/&middot;/g, '·')
    .replace(/&#9670;/g, '')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// ---------- send + log ----------

export interface SendWorkflowEmailInput extends EmailContext {
  /** Destination email address. */
  to: string;
  /** Row id the email refers to (reservation_request / waitlist id). */
  refId?: string;
}

export interface SendWorkflowEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  /** The rendered subject that was (or would have been) sent. */
  subject: string;
}

/**
 * Render → send → log. Never throws: any failure comes back as
 * { ok: false, error } so callers can note it and move on.
 */
export async function sendWorkflowEmail(
  event: EmailEvent,
  input: SendWorkflowEmailInput,
): Promise<SendWorkflowEmailResult> {
  let subject = '';
  try {
    const rendered = renderEmail(event, input);
    subject = rendered.subject;
    if (!isEmailConfigured()) {
      return { ok: false, error: 'Email not configured.', subject };
    }
    const result = await sendEmail({ to: input.to, subject, html: rendered.html });
    await logEmail({
      to_email: input.to,
      subject,
      body_preview: toPreview(rendered.html),
      kind: event,
      ref_id: input.refId,
      resend_id: result.id,
      status: result.ok ? 'sent' : 'failed',
    });
    return { ok: result.ok, id: result.id, error: result.error, subject };
  } catch (err) {
    console.error('[email-workflows] send error', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown email error.', subject };
  }
}

export { isEmailConfigured } from '@viox/integrations';
