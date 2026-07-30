// ============================================================
// /api/briefing/daily — the owner's morning briefing, cron-ready.
//
//   GET|POST /api/briefing/daily
//     Auth (any one):
//       • Authorization: Bearer <CRON_SECRET>   (Vercel cron sends
//         this automatically once the CRON_SECRET env var exists)
//       • x-viox-secret: <CRON_SECRET or VIOX_CRON_SECRET>
//       • ?secret=<CRON_SECRET or VIOX_CRON_SECRET>
//     With NO secret env configured the route is open (demo mode),
//     matching /api/slack/digest — flag-off behavior is unchanged.
//
// Composes the briefing from the DataRepository (fixtures in demo,
// live driver later — same swap as everything else):
//   1. Yesterday's sales vs prior day + same day last week (both rooms)
//   2. Food-cost flag — recipes over their target cost %
//   3. Low stock — items at or below par
//   4. Today's + next-7-days catering events
//   5. Unreplied reviews count
//   6. New reservations / waitlist / guests in the last 24h —
//      read straight from the LIVE Supabase tables when
//      SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are present
//      (fails soft to null counts otherwise).
//
// When Resend env is present (RESEND_API_KEY + EMAIL_FROM) the same
// briefing is delivered as a branded HTML email (the email-workflows
// cream/navy/gold shell) to BRIEFING_TO (default juan@viox.ai).
// Always returns the briefing JSON — email is additive, never
// required, and an email failure never fails the route.
// ============================================================

import { getRepository } from '@viox/db';
import type { CateringEvent, DailySales, Location } from '@viox/db';
import { DEMO_TODAY } from '@viox/agents';
import { isEmailConfigured, sendEmail } from '@viox/integrations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TENANT_SLUG = 'buena-vista';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// ---------- auth (CRON_SECRET bearer • x-viox-secret • ?secret=) ----------

function isAuthorized(req: Request, url: URL): boolean {
  const secrets = [process.env.CRON_SECRET, process.env.VIOX_CRON_SECRET].filter(
    (s): s is string => !!s,
  );
  if (secrets.length === 0) return true; // no gate configured — demo/preview mode
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const header = req.headers.get('x-viox-secret') ?? '';
  const qs = url.searchParams.get('secret') ?? '';
  return secrets.some((s) => bearer === s || header === s || qs === s);
}

// ---------- date helpers ----------

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Today's date in the restaurant's timezone (America/New_York). */
function nyToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Live driver flips the anchor to the real calendar; demo stays deterministic. */
function isLiveData(): boolean {
  const v = (process.env.USE_SUPABASE_DATA ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return r1(((current - previous) / Math.abs(previous)) * 100);
}

// ---------- briefing shape ----------

interface SalesDay {
  date: string;
  netSales: number;
  guests: number;
  avgCheck: number;
  byLocation: Record<string, number>;
}

interface Briefing {
  tenant: string;
  date: string;                 // the briefing anchor date ("today")
  mode: 'demo' | 'live';
  sales: {
    yesterday: SalesDay | null;
    priorDay: SalesDay | null;
    sameDayLastWeek: SalesDay | null;
    vsPriorDayPct: number | null;
    vsLastWeekPct: number | null;
  };
  foodCost: {
    flag: boolean;
    avgCostPct: number;
    avgTargetPct: number;
    itemsOverTarget: number;
    worstOffenders: { item: string; costPct: number; targetPct: number; overByPts: number }[];
  };
  lowStock: {
    count: number;
    items: { item: string; onHand: number; unit: string; par: number }[];
  };
  events: {
    today: BriefEvent[];
    next7Days: BriefEvent[];
    /** When the 7-day window is clear: the next few booked/open events beyond it. */
    nextUp: BriefEvent[];
  };
  reviews: {
    unrepliedCount: number;
    newestUnreplied: { platform: string; rating: number; author: string; date: string } | null;
  };
  crmLast24h: {
    source: 'supabase' | 'unavailable';
    newReservations: number | null;
    newWaitlist: number | null;
    newGuests: number | null;
  };
}

interface BriefEvent {
  title: string;
  date: string;                 // ISO datetime
  stage: string;
  partySize: number;
  space: string;
  location: string;
  quotedTotal: number;
  depositPaid: boolean;
}

// ---------- section builders ----------

function summarizeDay(rows: DailySales[], locName: Map<string, string>): SalesDay | null {
  if (rows.length === 0) return null;
  const byLocation: Record<string, number> = {};
  let net = 0;
  let guests = 0;
  let checks = 0;
  for (const row of rows) {
    net += row.netSales;
    guests += row.guestCount;
    checks += row.checkCount;
    const name = locName.get(row.locationId) ?? row.locationId;
    byLocation[name] = Math.round((byLocation[name] ?? 0) + row.netSales);
  }
  return {
    date: rows[0].date.slice(0, 10),
    netSales: Math.round(net),
    guests,
    avgCheck: checks > 0 ? r1(net / checks) : 0,
    byLocation,
  };
}

function briefEvent(e: CateringEvent, locName: Map<string, string>): BriefEvent {
  return {
    title: e.title,
    date: e.eventDate,
    stage: e.stage,
    partySize: e.partySize,
    space: e.space,
    location: locName.get(e.locationId) ?? e.locationId,
    quotedTotal: e.quotedTotal,
    depositPaid: e.depositPaid,
  };
}

/** HEAD count against a live Supabase table via PostgREST. Fails soft to null. */
async function supabaseCount(table: string, sinceIso: string): Promise<number | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url.replace(/\/+$/, '')}/rest/v1/${table}?select=id&tenant_slug=eq.${TENANT_SLUG}&created_at=gte.${encodeURIComponent(sinceIso)}`,
      {
        method: 'HEAD',
        headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;
    const range = res.headers.get('content-range'); // e.g. "0-4/5" or "*/0"
    const total = range?.split('/')[1];
    const n = total ? Number(total) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function composeBriefing(): Promise<Briefing> {
  const repo = getRepository();
  const live = isLiveData();
  const today = live ? nyToday() : DEMO_TODAY;
  const yesterday = addDays(today, -1);
  const priorDay = addDays(today, -2);
  const lastWeek = addDays(today, -8); // same weekday as yesterday

  const [locations, salesYesterday, salesPrior, salesLastWeek, recipes, inventory, allEvents, reviews] =
    await Promise.all([
      repo.getLocations(),
      repo.getDailySales({ from: yesterday, to: yesterday }),
      repo.getDailySales({ from: priorDay, to: priorDay }),
      repo.getDailySales({ from: lastWeek, to: lastWeek }),
      repo.getRecipes(),
      repo.getInventoryItems(),
      repo.getCateringEvents(),
      repo.getReviews(),
    ]);

  const locName = new Map<string, string>(locations.map((l: Location) => [l.id, l.name]));

  // 1 — sales
  const yDay = summarizeDay(salesYesterday, locName);
  const pDay = summarizeDay(salesPrior, locName);
  const wDay = summarizeDay(salesLastWeek, locName);

  // 2 — food cost
  const over = recipes
    .filter((r) => r.costPct > r.targetCostPct)
    .sort((a, b) => (b.costPct - b.targetCostPct) - (a.costPct - a.targetCostPct));
  const avgCost = recipes.length ? r1(recipes.reduce((s, r) => s + r.costPct, 0) / recipes.length) : 0;
  const avgTarget = recipes.length
    ? r1(recipes.reduce((s, r) => s + r.targetCostPct, 0) / recipes.length)
    : 0;

  // 3 — low stock
  const low = inventory
    .filter((i) => i.onHand <= i.parLevel)
    .sort((a, b) => a.onHand / Math.max(a.parLevel, 1) - b.onHand / Math.max(b.parLevel, 1));

  // 4 — events today + next 7 days (open pipeline only)
  const horizon = addDays(today, 7);
  const open = allEvents
    .filter((e) => e.stage !== 'lost' && e.stage !== 'completed')
    .filter((e) => e.eventDate.slice(0, 10) >= today)
    .sort((a, b) => (a.eventDate < b.eventDate ? -1 : 1));
  const upcoming = open.filter((e) => e.eventDate.slice(0, 10) <= horizon);
  const todaysEvents = upcoming.filter((e) => e.eventDate.slice(0, 10) === today);
  const weekEvents = upcoming.filter((e) => e.eventDate.slice(0, 10) !== today);
  const nextUp = upcoming.length === 0 ? open.slice(0, 3) : [];

  // 5 — reviews
  const unreplied = reviews.filter((r) => !r.replied);
  const newest = unreplied[0] ?? null;

  // 6 — live CRM counts (last 24h, real clock — these tables are live prod)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [newReservations, newWaitlist, newGuests] = await Promise.all([
    supabaseCount('reservation_requests', since),
    supabaseCount('waitlist', since),
    supabaseCount('guests', since),
  ]);
  const haveSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  return {
    tenant: TENANT_SLUG,
    date: today,
    mode: live ? 'live' : 'demo',
    sales: {
      yesterday: yDay,
      priorDay: pDay,
      sameDayLastWeek: wDay,
      vsPriorDayPct: yDay && pDay ? pctChange(yDay.netSales, pDay.netSales) : null,
      vsLastWeekPct: yDay && wDay ? pctChange(yDay.netSales, wDay.netSales) : null,
    },
    foodCost: {
      flag: over.length > 0,
      avgCostPct: avgCost,
      avgTargetPct: avgTarget,
      itemsOverTarget: over.length,
      worstOffenders: over.slice(0, 3).map((r) => ({
        item: r.menuItemName,
        costPct: r.costPct,
        targetPct: r.targetCostPct,
        overByPts: r1(r.costPct - r.targetCostPct),
      })),
    },
    lowStock: {
      count: low.length,
      items: low.slice(0, 8).map((i) => ({ item: i.name, onHand: i.onHand, unit: i.unit, par: i.parLevel })),
    },
    events: {
      today: todaysEvents.map((e) => briefEvent(e, locName)),
      next7Days: weekEvents.map((e) => briefEvent(e, locName)),
      nextUp: nextUp.map((e) => briefEvent(e, locName)),
    },
    reviews: {
      unrepliedCount: unreplied.length,
      newestUnreplied: newest
        ? { platform: newest.platform, rating: newest.rating, author: newest.author, date: newest.date }
        : null,
    },
    crmLast24h: {
      source: haveSupabase ? 'supabase' : 'unavailable',
      newReservations,
      newWaitlist,
      newGuests,
    },
  };
}

// ---------- branded HTML email (email-workflows shell, ops flavor) ----------

const NAVY = '#1E3A5F';
const GOLD = '#C9995C';
const CREAM = '#F7F2E9';
const INK = '#22303F';
const MUTED = '#6B7684';
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

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}%`;

function sectionTitle(label: string): string {
  return (
    `<div style="margin:26px 0 10px;font-family:${SANS};font-size:11px;letter-spacing:.22em;` +
    `text-transform:uppercase;color:${GOLD};">&#9670;&nbsp;&nbsp;${esc(label)}</div>`
  );
}

function kvRow(label: string, value: string): string {
  return (
    `<tr>` +
    `<td style="padding:9px 16px;border-bottom:1px solid rgba(201,153,92,.25);font-family:${SANS};font-size:12px;color:${MUTED};">${esc(label)}</td>` +
    `<td style="padding:9px 16px;border-bottom:1px solid rgba(201,153,92,.25);font-family:${SANS};font-size:14px;font-weight:500;color:${INK};text-align:right;">${esc(value)}</td>` +
    `</tr>`
  );
}

function kvTable(rows: string[]): string {
  if (rows.length === 0) return '';
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(201,153,92,.35);border-radius:10px;border-collapse:separate;overflow:hidden;background:rgba(201,153,92,.06);">` +
    rows.join('') +
    `</table>`
  );
}

function para(text: string): string {
  return `<p style="margin:6px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${INK};">${text}</p>`;
}

function composeBriefingHtml(b: Briefing): { subject: string; html: string } {
  const y = b.sales.yesterday;
  const parts: string[] = [];

  // Sales
  parts.push(sectionTitle('Sales — yesterday'));
  if (y) {
    const rows: string[] = [kvRow('Net sales', usd(y.netSales))];
    for (const [loc, net] of Object.entries(y.byLocation)) rows.push(kvRow(loc, usd(net)));
    rows.push(kvRow('Covers', y.guests.toLocaleString('en-US')));
    rows.push(kvRow('Avg check', usd(y.avgCheck)));
    if (b.sales.vsPriorDayPct !== null) rows.push(kvRow('vs prior day', signed(b.sales.vsPriorDayPct)));
    if (b.sales.vsLastWeekPct !== null) rows.push(kvRow('vs same day last week', signed(b.sales.vsLastWeekPct)));
    parts.push(kvTable(rows));
  } else {
    parts.push(para('No sales posted for yesterday yet.'));
  }

  // Food cost
  parts.push(sectionTitle('Food cost'));
  if (b.foodCost.flag) {
    parts.push(
      para(
        `<strong style="color:${NAVY};">${b.foodCost.itemsOverTarget} recipe${b.foodCost.itemsOverTarget === 1 ? '' : 's'} over target</strong> — menu running ${b.foodCost.avgCostPct}% vs ${b.foodCost.avgTargetPct}% target.`,
      ),
    );
    parts.push(
      kvTable(
        b.foodCost.worstOffenders.map((w) =>
          kvRow(w.item, `${w.costPct}% vs ${w.targetPct}% (+${w.overByPts} pts)`),
        ),
      ),
    );
  } else {
    parts.push(para(`All recipes at or under target — menu running ${b.foodCost.avgCostPct}%.`));
  }

  // Low stock
  parts.push(sectionTitle('Low stock'));
  if (b.lowStock.count > 0) {
    parts.push(para(`${b.lowStock.count} item${b.lowStock.count === 1 ? '' : 's'} at or below par:`));
    parts.push(
      kvTable(b.lowStock.items.map((i) => kvRow(i.item, `${i.onHand} ${i.unit} on hand · par ${i.par}`))),
    );
  } else {
    parts.push(para('Nothing at or below par. Good shape.'));
  }

  // Events
  parts.push(sectionTitle('Events — today & next 7 days'));
  const windowEvents = [...b.events.today, ...b.events.next7Days];
  const eventRows = (list: BriefEvent[]) =>
    kvTable(
      list.map((e) =>
        kvRow(
          `${e.date.slice(0, 10)} — ${e.title}`,
          `${e.partySize} guests · ${e.space} · ${usd(e.quotedTotal)}${e.depositPaid ? '' : ' · deposit due'}`,
        ),
      ),
    );
  if (windowEvents.length > 0) {
    parts.push(eventRows(windowEvents));
  } else if (b.events.nextUp.length > 0) {
    parts.push(para('Nothing in the next 7 days — next on the books:'));
    parts.push(eventRows(b.events.nextUp));
  } else {
    parts.push(para('No events on the books.'));
  }

  // Reviews
  parts.push(sectionTitle('Reviews'));
  if (b.reviews.unrepliedCount > 0) {
    const n = b.reviews.newestUnreplied;
    parts.push(
      para(
        `<strong style="color:${NAVY};">${b.reviews.unrepliedCount} review${b.reviews.unrepliedCount === 1 ? '' : 's'} awaiting a reply</strong>${
          n ? ` — newest: ${esc(n.author)} on ${esc(n.platform)} (${n.rating}★, ${esc(n.date.slice(0, 10))}).` : '.'
        }`,
      ),
    );
  } else {
    parts.push(para('Inbox zero — every review has a reply.'));
  }

  // Live CRM counts
  if (b.crmLast24h.source === 'supabase') {
    parts.push(sectionTitle('New in the CRM — last 24h'));
    parts.push(
      kvTable([
        kvRow('Reservation requests', String(b.crmLast24h.newReservations ?? '—')),
        kvRow('Waitlist joins', String(b.crmLast24h.newWaitlist ?? '—')),
        kvRow('New guest profiles', String(b.crmLast24h.newGuests ?? '—')),
      ]),
    );
  }

  const html =
    `<div style="margin:0;padding:0;background-color:${CREAM};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};padding:0;margin:0;">` +
    `<tr><td align="center" style="padding:32px 16px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFDF8;border:1px solid rgba(30,58,95,.12);border-radius:14px;border-collapse:separate;overflow:hidden;box-shadow:0 2px 12px rgba(30,58,95,.08);">` +
    `<tr><td align="center" style="background-color:${NAVY};padding:26px 24px 22px;">` +
    `<div style="font-family:${SANS};font-size:11px;letter-spacing:.32em;color:${GOLD};text-transform:uppercase;">&#9670;&nbsp;&nbsp;Morning Briefing&nbsp;&nbsp;&#9670;</div>` +
    `<div style="margin-top:8px;font-family:${SERIF};font-size:30px;letter-spacing:.18em;color:#FFFFFF;text-transform:uppercase;">Buena&nbsp;Vista</div>` +
    `<div style="margin-top:8px;font-family:${SANS};font-size:12px;letter-spacing:.14em;color:rgba(255,255,255,.75);text-transform:uppercase;">${esc(b.date)}${b.mode === 'demo' ? ' &middot; demo data' : ''}</div>` +
    `<div style="margin-top:10px;width:56px;height:2px;background-color:${GOLD};font-size:0;line-height:0;">&nbsp;</div>` +
    `</td></tr>` +
    `<tr><td style="padding:8px 32px 30px;">` +
    parts.join('') +
    `</td></tr>` +
    `<tr><td style="background-color:rgba(30,58,95,.05);padding:18px 24px;border-top:1px solid rgba(30,58,95,.1);">` +
    `<div style="text-align:center;font-family:${SANS};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${GOLD};">&#9670;&nbsp;&nbsp;VioX Restaurant OS &middot; Buena Vista NY&nbsp;&nbsp;&#9670;</div>` +
    `</td></tr>` +
    `</table>` +
    `</td></tr></table>` +
    `</div>`;

  return { subject: `Morning briefing — Buena Vista — ${b.date}`, html };
}

// ---------- handler (GET + POST share it — cron services differ) ----------

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (!isAuthorized(req, url)) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }

  let briefing: Briefing;
  try {
    briefing = await composeBriefing();
  } catch (err) {
    return json(
      { ok: false, reason: err instanceof Error ? err.message : 'briefing build failed' },
      500,
    );
  }

  // Email is additive: without Resend env the route still returns the JSON.
  const to = process.env.BRIEFING_TO || 'juan@viox.ai';
  let email: { attempted: boolean; sent: boolean; to?: string; error?: string } = {
    attempted: false,
    sent: false,
  };
  if (isEmailConfigured()) {
    const { subject, html } = composeBriefingHtml(briefing);
    const result = await sendEmail({ to, subject, html });
    email = { attempted: true, sent: result.ok, to, ...(result.error ? { error: result.error } : {}) };
  }

  return json({ ok: true, generatedAt: new Date().toISOString(), email, briefing });
}

export { handle as GET, handle as POST };
