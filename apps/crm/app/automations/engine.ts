// ============================================================
// app/automations/engine.ts — Popmenu-parity marketing automation
// engine for Buena Vista. Five always-on playbooks (Birthday
// Treat, Winback 60d, Post-visit Thank You, Waitlist Follow-up,
// VIP Paella Preview) with audiences computed live from the
// @viox/db fixture dataset (anchored to DEMO_TODAY). Message
// rendering + sending + sms_log/email_log writes are fully
// reused from lib/sms-workflows + lib/email-workflows via the
// free-text `order_update` lane, so automations ride the exact
// same branded templates and logging the lifecycle events use.
//
// SAFETY (standing test-user rule): live mode NEVER contacts a
// fixture guest. Sends are hard-fenced to the allowlist below
// (Juan's test phone/email) no matter what the audience says —
// fixture contacts are fake, but the fence holds regardless.
// ============================================================

import { DEMO_TODAY, getRepository } from '@viox/db';
import type { Guest, Reservation } from '@viox/db';
import { renderSms, sendWorkflowSms } from '@/lib/sms-workflows';
import { renderEmail, sendWorkflowEmail } from '@/lib/email-workflows';

// ---------- ids ----------

export type AutomationId =
  | 'birthday'
  | 'winback'
  | 'post_visit'
  | 'waitlist_followup'
  | 'vip_paella';

/** The two playbooks exposed on the "Run now" path. */
export type RunnableAutomationId = 'birthday' | 'winback';

export const RUNNABLE_AUTOMATIONS: readonly RunnableAutomationId[] = ['birthday', 'winback'] as const;

export function isRunnableAutomation(v: unknown): v is RunnableAutomationId {
  return v === 'birthday' || v === 'winback';
}

// ---------- allowlist (standing test-user rule) ----------

const ALLOWED_PHONE_DIGITS = '12012909540'; // Juan (test user)
const ALLOWED_EMAIL = 'juan@viox.ai';

export function isAllowedPhone(phone?: string): boolean {
  if (!phone) return false;
  const d = phone.replace(/\D/g, '');
  return d === ALLOWED_PHONE_DIGITS || `1${d}` === ALLOWED_PHONE_DIGITS;
}

export function isAllowedEmail(email?: string): boolean {
  return (email ?? '').trim().toLowerCase() === ALLOWED_EMAIL;
}

// ---------- date helpers (anchored to the demo "today") ----------

const DAY_MS = 86_400_000;

function isoDaysBefore(n: number): string {
  const anchor = new Date(`${DEMO_TODAY}T00:00:00Z`).getTime();
  return new Date(anchor - n * DAY_MS).toISOString().slice(0, 10);
}

// ---------- guest helpers ----------

/** "Carmen" from "Carmen Ravelo". */
function firstName(g: Guest): string {
  return g.name.trim().split(/\s+/)[0] ?? g.name;
}

/** Fixture location id → sms/email workflow location slug. */
function locationSlug(g: Guest): string | undefined {
  if (g.favoriteLocationId === 'loc_hells_kitchen') return 'hells-kitchen';
  if (g.favoriteLocationId === 'loc_east_village') return 'east-village';
  return undefined;
}

// ---------- definitions ----------

export type AutomationChannel = 'sms' | 'email';

export interface AutomationDef {
  id: AutomationId;
  name: string;
  /** Plain-English trigger, shown on the card. */
  trigger: string;
  /** Cadence label ("Monthly · 1st at 10:00 AM", …). */
  cadence: string;
  channels: AutomationChannel[];
  /** Whether the card gets a "Run now" button (and the API accepts it). */
  runnable: boolean;
  audience(guests: Guest[], reservations: Reservation[]): Guest[];
  /** Free-text body handed to the order_update template lane. */
  custom(g: Guest): string;
  /** Seeded demo "last run" — ISO datetime, deterministic from DEMO_TODAY. */
  seededLastRun: string;
}

const optedIn = (g: Guest) => g.marketingOptIn;

export const AUTOMATIONS: readonly AutomationDef[] = [
  {
    id: 'birthday',
    name: 'Birthday Treat',
    trigger: 'Guest has a birthday this month (August) and is opted in — invite them in, dessert on us.',
    cadence: 'Monthly · 1st at 10:00 AM',
    channels: ['sms', 'email'],
    runnable: true,
    audience: (guests) => guests.filter((g) => optedIn(g) && (g.birthday ?? '').startsWith('08-')),
    custom: () =>
      "your birthday month is here! Book any table in August and the flan de caramelo — candle included — is on the house. Reply BIRTHDAY and we'll hold your favorite table",
    seededLastRun: `${isoDaysBefore(28)}T10:00:00-04:00`,
  },
  {
    id: 'winback',
    name: 'Winback 60d',
    trigger: 'Regular hasn’t visited in 60+ days — a welcome-back sangría brings the corner table home.',
    cadence: 'Weekly · Mondays at 9:30 AM',
    channels: ['sms', 'email'],
    runnable: true,
    audience: (guests) => guests.filter((g) => optedIn(g) && g.lastVisit <= isoDaysBefore(60)),
    custom: () =>
      "it's been a while and the corner table misses you. Come back this month and a welcome-back sangría is on us with any entrée. Reply RESERVE and we'll set your table",
    seededLastRun: `${isoDaysBefore(3)}T09:30:00-04:00`,
  },
  {
    id: 'post_visit',
    name: 'Post-visit Thank You',
    trigger: 'The day after a completed reservation — gracias, plus a nudge for a quick word of feedback.',
    cadence: 'Daily · 11:00 AM',
    channels: ['sms', 'email'],
    runnable: false,
    audience: (guests, reservations) => {
      const yesterday = isoDaysBefore(1);
      const ids = new Set(
        reservations.filter((r) => r.status === 'completed' && r.date.startsWith(yesterday)).map((r) => r.guestId),
      );
      return guests.filter((g) => optedIn(g) && ids.has(g.id));
    },
    custom: () =>
      "¡gracias for dining with us last night! We loved hosting you — reply with a word on how everything was, and we'll see you again soon",
    seededLastRun: `${isoDaysBefore(1)}T11:00:00-04:00`,
  },
  {
    id: 'waitlist_followup',
    name: 'Waitlist Follow-up',
    trigger: 'Guest left without being seated (walked waitlist / no-show) — an apology and priority next time.',
    cadence: 'Daily · 10:30 AM (previous night)',
    channels: ['sms'],
    runnable: false,
    audience: (guests, reservations) => {
      const cutoff = isoDaysBefore(14);
      const ids = new Set(
        reservations
          .filter((r) => r.status === 'no_show' && r.date.slice(0, 10) >= cutoff)
          .map((r) => r.guestId),
      );
      return guests.filter((g) => optedIn(g) && ids.has(g.id));
    },
    custom: () =>
      "lo sentimos we couldn't get you seated. Text us before your next visit and you'll jump straight to priority on the list — the first sangría is on us",
    seededLastRun: `${isoDaysBefore(1)}T10:30:00-04:00`,
  },
  {
    id: 'vip_paella',
    name: 'VIP Paella Preview',
    trigger: 'Monthly VIP-first opening of the Paella Wednesdays series — reserve the pan before everyone else.',
    cadence: 'Monthly · last Friday at 4:00 PM',
    channels: ['sms', 'email'],
    runnable: false,
    audience: (guests) => guests.filter((g) => optedIn(g) && g.tags.includes('vip')),
    custom: () =>
      "Chef Rafael is opening this month's Paella Wednesdays to our VIP table first. Reply PAELLA to reserve your pan — Buenavista or Negra — before it opens to everyone",
    seededLastRun: `${isoDaysBefore(11)}T16:00:00-04:00`,
  },
] as const;

export function getAutomation(id: AutomationId): AutomationDef {
  const def = AUTOMATIONS.find((a) => a.id === id);
  if (!def) throw new Error(`Unknown automation "${id}".`);
  return def;
}

// ---------- preview rendering (exact copy the send path produces) ----------

export interface AutomationPreview {
  guest: string;
  channel: AutomationChannel;
  to: string;
  /** SMS: the full rendered body. Email: plain-text excerpt of the HTML. */
  body: string;
  /** Email only. */
  subject?: string;
}

/** Quick plain-text excerpt of a rendered HTML email. */
function emailExcerpt(html: string, max = 220): string {
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
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** The rendered SMS body for one guest — exactly what sendWorkflowSms sends. */
export function renderAutomationSms(def: AutomationDef, g: Guest): string {
  return renderSms('order_update', {
    guestName: firstName(g),
    location: locationSlug(g),
    custom: def.custom(g),
  });
}

export function buildPreviews(def: AutomationDef, audience: Guest[], limit = 25): AutomationPreview[] {
  const previews: AutomationPreview[] = [];
  for (const g of audience.slice(0, limit)) {
    if (def.channels.includes('sms') && g.phone) {
      previews.push({ guest: g.name, channel: 'sms', to: g.phone, body: renderAutomationSms(def, g) });
    }
    if (def.channels.includes('email') && g.email) {
      const rendered = renderEmail('order_update', {
        guestName: firstName(g),
        location: locationSlug(g),
        custom: def.custom(g),
      });
      previews.push({
        guest: g.name,
        channel: 'email',
        to: g.email,
        subject: rendered.subject,
        body: emailExcerpt(rendered.html),
      });
    }
  }
  return previews;
}

// ---------- meta (GET /api/automations + page cards) ----------

export interface AutomationMeta {
  id: AutomationId;
  name: string;
  trigger: string;
  cadence: string;
  channels: AutomationChannel[];
  runnable: boolean;
  audience: number;
  seededLastRun: string;
}

export async function getAutomationMeta(): Promise<AutomationMeta[]> {
  const repo = getRepository();
  const [guests, reservations] = await Promise.all([repo.getGuests(), repo.getReservations()]);
  return AUTOMATIONS.map((def) => ({
    id: def.id,
    name: def.name,
    trigger: def.trigger,
    cadence: def.cadence,
    channels: def.channels,
    runnable: def.runnable,
    audience: def.audience(guests, reservations).length,
    seededLastRun: def.seededLastRun,
  }));
}

// ---------- run ----------

export interface AutomationRunResult {
  ok: true;
  automation: RunnableAutomationId;
  dryRun: boolean;
  /** Guests matching the trigger (before the send allowlist). */
  audience: number;
  /** Messages actually delivered (live mode; allowlisted contacts only). */
  sent: number;
  /** Audience contacts skipped by the test-user allowlist (live mode). */
  skippedByAllowlist: number;
  /** Send attempts that failed (adapter not configured / provider error). */
  failed: number;
  previews: AutomationPreview[];
}

/**
 * Run one automation. dryRun composes everything and sends nothing.
 * Live mode composes for the whole audience but only ever hands a
 * message to sendWorkflowSms/sendWorkflowEmail when the destination
 * is on the test-user allowlist — fixture guests are never contacted.
 */
export async function runAutomation(
  automation: RunnableAutomationId,
  opts: { dryRun?: boolean } = {},
): Promise<AutomationRunResult> {
  const dryRun = opts.dryRun ?? false;
  const def = getAutomation(automation);
  const repo = getRepository();
  const [guests, reservations] = await Promise.all([repo.getGuests(), repo.getReservations()]);
  const audience = def.audience(guests, reservations);
  const previews = buildPreviews(def, audience);

  if (dryRun) {
    return { ok: true, automation, dryRun: true, audience: audience.length, sent: 0, skippedByAllowlist: 0, failed: 0, previews };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const g of audience) {
    const ctx = { guestName: firstName(g), location: locationSlug(g), custom: def.custom(g), refId: g.id };

    if (def.channels.includes('sms') && g.phone) {
      if (!isAllowedPhone(g.phone)) {
        skipped += 1; // SAFETY: never text a fixture/real-looking contact
      } else {
        const res = await sendWorkflowSms('order_update', { ...ctx, to: g.phone });
        if (res.ok) sent += 1;
        else failed += 1;
      }
    }

    if (def.channels.includes('email') && g.email) {
      if (!isAllowedEmail(g.email)) {
        skipped += 1; // SAFETY: never email a fixture/real-looking contact
      } else {
        const res = await sendWorkflowEmail('order_update', { ...ctx, to: g.email });
        if (res.ok) sent += 1;
        else failed += 1;
      }
    }
  }

  return {
    ok: true,
    automation,
    dryRun: false,
    audience: audience.length,
    sent,
    skippedByAllowlist: skipped,
    failed,
    previews,
  };
}
