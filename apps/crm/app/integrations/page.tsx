import * as React from 'react';
import type { Metadata } from 'next';
import { getRepository } from '@viox/db';
import type { Campaign, CateringEvent, Guest, IntegrationProvider, IntegrationState } from '@viox/db';
import { getIntegrationAdapters } from '@viox/integrations';
import { Badge, Card, Kicker, PageHeader, fmtDateTime, fmtNumber, fmtPct, fmtUSDk } from '@viox/ui';

export const metadata: Metadata = {
  title: 'Integrations — VioX CRM',
};

/* ============================================================
   Integrations hub (CRM) — same provider-card design as the OS
   hub, plus guest-source attribution and the marketing-channel
   connections available in the VioX stack.
   Provider metadata mirrors docs/integrations.md.
   ============================================================ */

interface Tint {
  text: string;
  border: string;
  bg: string;
}

interface ProviderMeta {
  id: IntegrationProvider;
  name: string;
  monogram: string;
  tint: Tint;
  category: string;
  transport: string;
  syncs: string[];
  approval: string;
  checklist: string[];
}

const TINTS: Record<string, Tint> = {
  toast: { text: '#FB923C', border: 'rgba(251,146,60,.35)', bg: 'rgba(251,146,60,.08)' },
  marginedge: { text: '#34D399', border: 'rgba(52,211,153,.35)', bg: 'rgba(52,211,153,.08)' },
  caterease: { text: '#7EB2F5', border: 'rgba(126,178,245,.35)', bg: 'rgba(126,178,245,.08)' },
  site: { text: '#C9995C', border: 'rgba(201,153,92,.4)', bg: 'rgba(201,153,92,.08)' },
  whatsapp: { text: '#25D366', border: 'rgba(37,211,102,.35)', bg: 'rgba(37,211,102,.08)' },
};

/* ---------- WhatsApp concierge (Twilio → Anfitrión) ---------- */

const WHATSAPP_ENV_VARS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'] as const;

const WHATSAPP_CHECKLIST = [
  'Fresh TWILIO_AUTH_TOKEN — the current one 401s (it was rotated); pull the live token from Twilio Console → Account → API keys & tokens',
  'WhatsApp sender: reuse the existing Twilio WhatsApp sender or provision a new one (Messaging → Senders → WhatsApp senders)',
  "Point the sender's inbound webhook to https://buena-vista-crm.vercel.app/api/whatsapp/inbound (HTTP POST)",
  'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM (e.g. whatsapp:+1646…) in Vercel → buena-vista-crm → Environment Variables',
];

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'toast',
    name: 'Toast POS',
    monogram: 'T',
    tint: TINTS.toast,
    category: 'Point of sale · sales, labor, menu mix',
    transport: 'Partner API · OAuth2 + webhooks',
    syncs: [
      'Daily sales rollups per location — net/gross, checks, comps & voids',
      'Category + daypart splits (Food/Cocktails/Wine · Lunch/Pre-Theater/Dinner/Late Night)',
      'Monthly menu-item mix with margins and menu-engineering quadrants',
      'Labor shifts and punches by role and employee',
    ],
    approval: 'Toast partner API application — approve the partner connection in Toast Web',
    checklist: [
      'Toast Web admin login able to approve a partner/API connection (Toast → Integrations → browse & approve)',
      "Restaurant GUIDs for both locations (Hell's Kitchen, East Village) from each location's setup page",
      'Confirmation of API access on their Toast plan (standard API access is a paid add-on outside the partner program)',
      'Sales category + daypart (service period) naming as configured in Toast, so splits map 1:1',
    ],
  },
  {
    id: 'marginedge',
    name: 'MarginEdge',
    monogram: 'ME',
    tint: TINTS.marginedge,
    category: 'AP & food cost · invoices, catalog, price alerts',
    transport: 'REST API · API key (X-API-KEY)',
    syncs: [
      'Vendor invoices with full line detail, including photo-captured scans',
      'Inventory catalog — last vs 30-day average price, pars, on-hand',
      'Price-move alerts on >8% swings (raised natively from hourly price diffs)',
      'Ingredient costs feeding native recipe & plate costing',
    ],
    approval: 'MarginEdge API key issued from the admin portal (Settings → API Access) via their account manager',
    checklist: [
      'MarginEdge API key and company id (admin portal → Settings → API Access)',
      'Confirmation both restaurant units are on a plan with API access enabled',
      'One-time vendor list export so vendor ids/names align',
      'Their food/bev category tree for clean COGS mapping',
    ],
  },
  {
    id: 'caterease',
    name: 'Caterease',
    monogram: 'CE',
    tint: TINTS.caterease,
    category: 'Catering & events · pipeline, BEOs, payments',
    transport: 'Scheduled CSV export · SFTP or email-to-webhook',
    syncs: [
      'Event pipeline across every stage — lead → proposal → tasting → booked → BEO final',
      'BEOs: timeline, courses, staffing, rentals, AV, dietary notes',
      'Deposit and balance payments per event',
      'Spaces, party sizes, and menu packages',
    ],
    approval: 'Scheduled export setup — a Caterease login with report-writer/export permissions (no public API)',
    checklist: [
      'A Caterease login with report-writer/export permissions',
      'Chosen export destination (SFTP credentials we provision, or the email-to-webhook address we issue) + schedule (daily 11:30 PM)',
      'One-time full historical export: Events + Payments + Menu packages',
      'Decision point for Christian: continuous CSV sync vs full migration into VioX Events (we recommend migration)',
    ],
  },
];

const ADAPTER_METHODS = [
  'syncSales',
  'syncLabor',
  'syncMenuMix',
  'syncInvoices',
  'syncInvoiceLines',
  'syncEvents',
] as const;

const OPEN_STAGES: CateringEvent['stage'][] = ['lead', 'proposal', 'tasting', 'booked', 'beo_final'];

const SOURCE_META: { source: Guest['source']; name: string; via: string; badge: string }[] = [
  { source: 'newsletter', name: 'Newsletter form', via: 'Marketing site — email capture on buenavista site', badge: 'Live · site form' },
  { source: 'reservation', name: 'OpenTable reservations', via: 'Reservation guests flowing in via the Toast sync', badge: 'Via Toast' },
  { source: 'event', name: 'Event leads', via: 'Catering inquiries — Caterease import + site event form', badge: 'Caterease + site' },
  { source: 'pos', name: 'POS capture', via: 'Checks matched to guest profiles at the terminal', badge: 'Via Toast' },
  { source: 'walk_in', name: 'Walk-ins', via: 'Host-stand entries at either room', badge: 'Manual' },
];

interface ChannelMeta {
  id: Campaign['channel'];
  name: string;
  monogram: string;
  detail: string;
}

const CHANNELS: ChannelMeta[] = [
  { id: 'email', name: 'Resend — Email', monogram: 'R', detail: 'Campaign + transactional sends from the Campaigns module; domain auth (SPF/DKIM) provisioned per tenant.' },
  { id: 'sms', name: 'Twilio — SMS', monogram: 'Tw', detail: 'A2P 10DLC registered sender for blasts and reminders; opt-in enforced from the guest record.' },
  { id: 'whatsapp', name: 'Twilio — WhatsApp', monogram: 'WA', detail: 'Template-based sends via a verified WhatsApp Business sender; ideal for event confirmations.' },
];

export default async function IntegrationsPage() {
  const repo = getRepository();
  const adapters = getIntegrationAdapters();

  const [states, dailySales, laborShifts, menuMix, invoices, items, alerts, recipes, events, guests, reservations, campaigns] =
    await Promise.all([
      repo.getIntegrations(),
      repo.getDailySales(),
      repo.getLaborShifts(),
      repo.getMenuItemSales('2026-07'),
      repo.getInvoices(),
      repo.getInventoryItems(),
      repo.getPriceAlerts(),
      repo.getRecipes(),
      repo.getCateringEvents(),
      repo.getGuests(),
      repo.getReservations(),
      repo.getCampaigns(),
    ]);

  const stateOf = (p: IntegrationProvider): IntegrationState | undefined =>
    states.find((s) => s.provider === p);

  const wiredFeeds = (p: IntegrationProvider): string[] =>
    ADAPTER_METHODS.filter((m) => typeof adapters[p][m] === 'function');

  /* ---------- live record counts per provider ---------- */
  const salesDays = new Set(dailySales.map((d) => d.date)).size;
  const menuSkus = new Set(menuMix.map((m) => m.menuItemName)).size;
  const pendingInvoices = invoices.filter((i) => i.status === 'pending_review').length;
  const openAlerts = alerts.filter((a) => !a.acknowledged).length;
  const openEvents = events.filter((e) => OPEN_STAGES.includes(e.stage));
  const pipelineValue = openEvents.reduce((s, e) => s + (e.quotedTotal || e.budget), 0);
  const depositsPaid = events.filter((e) => e.depositPaid).length;

  const statsFor: Record<IntegrationProvider, { label: string; value: string; hint?: string }[]> = {
    toast: [
      { label: 'Sales days', value: fmtNumber(salesDays), hint: 'both rooms' },
      { label: 'Labor shifts', value: fmtNumber(laborShifts.length) },
      { label: 'Menu SKUs', value: fmtNumber(menuSkus), hint: 'Jul mix' },
    ],
    marginedge: [
      { label: 'Invoices · 45d', value: fmtNumber(invoices.length), hint: `${pendingInvoices} pending` },
      { label: 'Catalog items', value: fmtNumber(items.length) },
      { label: 'Price alerts', value: fmtNumber(openAlerts), hint: `${recipes.length} recipes costed` },
    ],
    caterease: [
      { label: 'Events on book', value: fmtNumber(events.length) },
      { label: 'Open pipeline', value: fmtUSDk(pipelineValue) },
      { label: 'Deposits paid', value: fmtNumber(depositsPaid) },
    ],
  };

  /* ---------- guest sources ---------- */
  const bySource = new Map<Guest['source'], number>();
  for (const g of guests) bySource.set(g.source, (bySource.get(g.source) ?? 0) + 1);
  const optIns = guests.filter((g) => g.marketingOptIn).length;
  const openTableRes = reservations.filter((r) => r.source === 'opentable').length;

  const sourceRows = SOURCE_META.map((m) => ({
    ...m,
    count: bySource.get(m.source) ?? 0,
  })).sort((a, b) => b.count - a.count);
  const maxSource = Math.max(1, ...sourceRows.map((r) => r.count));

  /* ---------- channels ---------- */
  const byChannel = new Map<Campaign['channel'], number>();
  for (const c of campaigns) byChannel.set(c.channel, (byChannel.get(c.channel) ?? 0) + 1);

  /* ---------- WhatsApp concierge status (from env) ---------- */
  const waEnvSet = WHATSAPP_ENV_VARS.map((v) => ({ name: v, set: !!process.env[v] }));
  const waConfigured = waEnvSet.every((v) => v.set);

  return (
    <>
      <PageHeader
        kicker="System · Integrations"
        title="Integrations Hub"
        subtitle="Where guests, reservations and event leads come from — Toast, MarginEdge and Caterease through one adapter contract, plus the outbound channels in the VioX stack."
        actions={<Badge tone="info">3 connectors · demo sync</Badge>}
      />

      {/* ---------- provider cards ---------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {PROVIDERS.map((p) => {
          const state = stateOf(p.id);
          const feeds = wiredFeeds(p.id);
          return (
            <Card key={p.id} flush className="flex flex-col">
              {/* header */}
              <div className="flex items-start justify-between gap-3 px-5 pt-5">
                <div className="flex min-w-0 items-center gap-3">
                  <Monogram text={p.monogram} tint={p.tint} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--text)]">{p.name}</div>
                    <div className="mt-0.5 truncate text-xs text-[var(--muted)]">{p.category}</div>
                  </div>
                </div>
                <Badge status={state?.status ?? 'awaiting_credentials'} className="mt-0.5 shrink-0">
                  Connected — demo data
                </Badge>
              </div>

              {state && (
                <p className="px-5 pt-3 text-xs leading-relaxed text-[var(--muted)]">{state.detail}</p>
              )}

              {/* what syncs */}
              <div className="px-5 pt-4">
                <Kicker>What syncs</Kicker>
                <ul className="mt-2 space-y-1.5">
                  {p.syncs.map((s) => (
                    <li key={s} className="flex items-start gap-2 text-xs leading-relaxed text-[var(--text)]">
                      <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--good)]" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* live record counts */}
              <div className="mx-5 mt-4 grid grid-cols-3 divide-x divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--panel2)]">
                {statsFor[p.id].map((s) => (
                  <div key={s.label} className="px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-[.12em] text-[var(--muted)]">{s.label}</div>
                    <div className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--text)]">{s.value}</div>
                    {s.hint && <div className="text-[10px] tabular-nums text-[var(--muted)]">{s.hint}</div>}
                  </div>
                ))}
              </div>

              {/* adapter feeds */}
              <div className="px-5 pt-4 text-[11px] leading-relaxed text-[var(--muted)]">
                Adapter feeds:{' '}
                {feeds.map((f, i) => (
                  <React.Fragment key={f}>
                    {i > 0 && ' · '}
                    <code className="text-[var(--text)]">{f}()</code>
                  </React.Fragment>
                ))}
              </div>

              {/* go-live checklist */}
              <details className="group mt-4 border-t border-[var(--border)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-xs font-medium text-[var(--text)] transition-colors hover:bg-white/[.03] [&::-webkit-details-marker]:hidden">
                  Go-live checklist
                  <ChevronIcon className="h-3.5 w-3.5 text-[var(--muted)] transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-3 px-5 pb-4">
                  <div className="flex items-start gap-2 rounded-lg border border-[rgba(251,191,36,.3)] bg-[rgba(251,191,36,.06)] px-3 py-2.5 text-xs leading-relaxed">
                    <KeyIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warn)]" />
                    <span className="text-[var(--text)]">
                      <span className="font-medium text-[var(--warn)]">Approval step:</span> {p.approval}
                    </span>
                  </div>
                  <ol className="space-y-2">
                    {p.checklist.map((c, i) => (
                      <li key={c} className="flex items-start gap-2.5 text-xs leading-relaxed text-[var(--text)]">
                        <span className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel2)] text-[10px] tabular-nums text-[var(--muted)]">
                          {i + 1}
                        </span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </details>

              {/* footer */}
              <footer className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3 text-[11px] text-[var(--muted)]">
                <span className="tabular-nums">
                  Last sync {state?.lastSyncAt ? fmtDateTime(state.lastSyncAt) : '—'}
                </span>
                <span className="truncate text-right">{p.transport}</span>
              </footer>
            </Card>
          );
        })}
      </div>

      {/* ---------- WhatsApp concierge (Twilio → Anfitrión) ---------- */}
      <Card flush>
        {/* header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <Monogram text="WA" tint={TINTS.whatsapp} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--text)]">WhatsApp Concierge</div>
              <div className="mt-0.5 truncate text-xs text-[var(--muted)]">
                Guest messaging · Anfitrión answering on WhatsApp, bilingual
              </div>
            </div>
          </div>
          <Badge status={waConfigured ? 'connected_live' : 'awaiting_credentials'} className="mt-0.5 shrink-0">
            {waConfigured ? 'Live — Twilio env set' : 'Awaiting credentials'}
          </Badge>
        </div>

        {/* flow */}
        <div className="mx-5 mt-4 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-3">
          <div className="flex items-center gap-2 whitespace-nowrap text-xs text-[var(--text)]">
            {['Guest WhatsApp', 'Twilio sender', 'Anfitrión (concierge agent)', 'Reply in-thread'].map((step, i) => (
              <React.Fragment key={step}>
                {i > 0 && <span aria-hidden className="text-[var(--muted)]">→</span>}
                <span className={i === 2 ? 'font-medium text-[var(--accent2)]' : ''}>{step}</span>
              </React.Fragment>
            ))}
            <span aria-hidden className="text-[var(--muted)]">+</span>
            <span className="text-[var(--muted)]">confirmed reservations land in CRM → Reservations</span>
          </div>
        </div>

        {/* env status pills */}
        <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
          {waEnvSet.map((v) => (
            <span
              key={v.name}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel2)] px-2.5 py-1 text-[10px] tabular-nums text-[var(--muted)]"
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: v.set ? 'var(--good)' : 'var(--warn)' }}
              />
              <code className="text-[var(--text)]">{v.name}</code>
              {v.set ? 'set' : 'missing'}
            </span>
          ))}
          <span className="text-[11px] text-[var(--muted)]">
            Webhook: <code className="text-[var(--text)]">/api/whatsapp/inbound</code> · replies TwiML, capped at 500 chars
          </span>
        </div>

        {/* go-live checklist */}
        <details className="group mt-4 border-t border-[var(--border)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-xs font-medium text-[var(--text)] transition-colors hover:bg-white/[.03] [&::-webkit-details-marker]:hidden">
            Go-live checklist
            <ChevronIcon className="h-3.5 w-3.5 text-[var(--muted)] transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 px-5 pb-4">
            <div className="flex items-start gap-2 rounded-lg border border-[rgba(251,191,36,.3)] bg-[rgba(251,191,36,.06)] px-3 py-2.5 text-xs leading-relaxed">
              <KeyIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warn)]" />
              <span className="text-[var(--text)]">
                <span className="font-medium text-[var(--warn)]">Approval step:</span> WhatsApp sender approval in
                Twilio (display name review by Meta) — then the three env vars below unlock signature-validated inbound.
              </span>
            </div>
            <ol className="space-y-2">
              {WHATSAPP_CHECKLIST.map((c, i) => (
                <li key={c} className="flex items-start gap-2.5 text-xs leading-relaxed text-[var(--text)]">
                  <span className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel2)] text-[10px] tabular-nums text-[var(--muted)]">
                    {i + 1}
                  </span>
                  <span>{c}</span>
                </li>
              ))}
            </ol>
          </div>
        </details>

        {/* footer */}
        <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3 text-[11px] text-[var(--muted)]">
          <span>Same capture path as the voice concierge — one reservations lib, two channels</span>
          <span className="truncate text-right">Twilio WhatsApp · TwiML webhook + REST sends</span>
        </footer>
      </Card>

      {/* ---------- guest sources + marketing channels ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          kicker="Where guests come from"
          title="Guest sources"
          action={<span>{fmtNumber(guests.length)} guests · {fmtNumber(optIns)} opted in</span>}
        >
          <div className="space-y-4">
            {sourceRows.map((r) => {
              const share = guests.length > 0 ? (r.count / guests.length) * 100 : 0;
              return (
                <div key={r.source}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm text-[var(--text)]">{r.name}</span>
                      <span className="ml-2 hidden text-xs text-[var(--muted)] sm:inline">{r.via}</span>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-[var(--text)]">
                      {fmtNumber(r.count)} · {fmtPct(share, 0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[.06]">
                      <div
                        className="h-full rounded-full bg-[var(--accent2)]"
                        style={{ width: `${(r.count / maxSource) * 100}%`, opacity: r.source === 'newsletter' ? 1 : 0.45 }}
                      />
                    </div>
                    <Badge tone={r.source === 'newsletter' ? 'accent' : 'muted'} className="shrink-0">
                      {r.badge}
                    </Badge>
                  </div>
                </div>
              );
            })}
            <div className="border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
              {fmtNumber(openTableRes)} OpenTable reservations rode in on the Toast sync — the newsletter form on the
              marketing site posts straight into this CRM.
            </div>
          </div>
        </Card>

        <Card
          kicker="Outbound"
          title="Marketing channels"
          action={<Badge tone="muted">Available in VioX stack</Badge>}
          flush
        >
          <div className="divide-y divide-[var(--border)]">
            {CHANNELS.map((ch) => (
              <div key={ch.id} className="flex items-start gap-3 px-5 py-4">
                <Monogram text={ch.monogram} tint={TINTS.site} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-[var(--text)]">{ch.name}</span>
                    <Badge tone="muted" className="shrink-0">
                      Available in VioX stack
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{ch.detail}</p>
                  <div className="mt-1.5 text-[11px] tabular-nums text-[var(--muted)]">
                    {fmtNumber(byChannel.get(ch.id) ?? 0)} campaigns on this channel in the workspace
                  </div>
                </div>
              </div>
            ))}
            <div className="px-5 py-3 text-xs text-[var(--muted)]">
              Channels activate per tenant — sends route from the{' '}
              <a href="/campaigns" className="text-[var(--text)] hover:text-[var(--accent2)]">
                Campaigns
              </a>{' '}
              module against segment opt-ins.
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

/* ---------- local pieces ---------- */

function Monogram({ text, tint, size = 'md' }: { text: string; tint: Tint; size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-10 w-10 text-sm';
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-lg border font-bold ${dims}`}
      style={{ color: tint.text, borderColor: tint.border, backgroundColor: tint.bg }}
      aria-hidden
    >
      {text}
    </div>
  );
}

function svgProps(className: string) {
  return {
    viewBox: '0 0 24 24',
    className,
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className ?? '')}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className ?? '')}>
      <path d="m6 9.5 6 6 6-6" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className ?? '')}>
      <circle cx="8" cy="14.5" r="4" />
      <path d="M11 11.5 20 3M16 6.5l3 3M13.5 9l2 2" />
    </svg>
  );
}
