import * as React from 'react';
import type { Metadata } from 'next';
import { getRepository } from '@viox/db';
import type { CateringEvent, IntegrationProvider, IntegrationState } from '@viox/db';
import { getIntegrationAdapters, isSlackConfigured } from '@viox/integrations';
import { Badge, Card, Kicker, PageHeader, fmtDateTime, fmtNumber, fmtUSDk } from '@viox/ui';

export const metadata: Metadata = {
  title: 'Integrations — VioX AI OS',
};

/* ============================================================
   Integrations hub (OS) — provider cards, data-flow diagram,
   native-replacement status, and the go-live runway.
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
  native: { runs: string[]; stays: string[]; staysLabel: string };
}

const TINTS: Record<string, Tint> = {
  toast: { text: 'var(--orange)', border: 'rgba(251,146,60,.35)', bg: 'rgba(251,146,60,.08)' },
  marginedge: { text: 'var(--good)', border: 'rgba(52,211,153,.35)', bg: 'rgba(52,211,153,.08)' },
  caterease: { text: 'var(--info)', border: 'rgba(126,178,245,.35)', bg: 'rgba(126,178,245,.08)' },
  site: { text: 'var(--accent)', border: 'rgba(201,153,92,.4)', bg: 'rgba(201,153,92,.08)' },
  slack: { text: '#E58FAC', border: 'rgba(224,30,90,.35)', bg: 'rgba(224,30,90,.08)' },
};

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
    native: {
      runs: ['Sales dashboards & daypart analytics', 'Menu engineering quadrants', 'Labor % vs target tracking'],
      stays: ['Order-taking & payments (terminals)', 'Kitchen display system', 'Payroll & tip pooling'],
      staysLabel: 'Stays in Toast',
    },
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
    native: {
      runs: ['Price alerts on >8% moves', 'Recipe & plate costing vs target', 'AP review queue & dispute tracking'],
      stays: ['Invoice photo OCR (ME ingestion team)', 'Bill pay', 'Accounting (QBO) export'],
      staysLabel: 'Stays in MarginEdge',
    },
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
    native: {
      runs: ['Full pipeline & kanban', 'BEO builder with draft/sent/signed states', 'Deposits, balances & event calendar'],
      stays: ['Nothing required — VioX Events covers the full workflow (migration recommended)'],
      staysLabel: 'Stays in Caterease',
    },
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

/* ---------- Slack team collaboration ---------- */

const SLACK_CAPABILITIES = [
  'Mention @BuenaVista OS in any channel — the right specialist answers in-thread with live numbers. Lead with "as mise" or "@ledger" to pick a teammate; plain mentions go to the general copilot.',
  'DM the bot for a private read — same tool belt (sales, food cost, low stock, events, guests, campaigns), threaded replies.',
  'Morning digests per agent — /api/slack/digest?agent=mise posts each specialist’s brief to your channel on a cron, gated by VIOX_CRON_SECRET.',
];

const SLACK_SETUP_STEPS = [
  <>Create the app at <code className="text-[var(--text)]">api.slack.com/apps</code> — name it &ldquo;VioX OS — Buena Vista&rdquo;</>,
  <>OAuth &amp; Permissions → add bot scopes <code className="text-[var(--text)]">app_mentions:read</code> + <code className="text-[var(--text)]">chat:write</code> + <code className="text-[var(--text)]">im:history</code> + <code className="text-[var(--text)]">channels:history</code></>,
  <>Enable Event Subscriptions → Request URL <code className="text-[var(--text)]">https://buena-vista-os.vercel.app/api/slack/events</code> → subscribe to <code className="text-[var(--text)]">app_mention</code> + <code className="text-[var(--text)]">message.im</code></>,
  <>Install the app to the workspace</>,
  <>Add <code className="text-[var(--text)]">SLACK_BOT_TOKEN</code> (xoxb-) + <code className="text-[var(--text)]">SLACK_SIGNING_SECRET</code> + <code className="text-[var(--text)]">SLACK_CHANNEL_ID</code> env vars in Vercel</>,
];

const GO_LIVE_STEPS = [
  { step: '01', title: 'Collect credentials', body: 'Checklist items land in the tenant vault — one handoff per provider.' },
  { step: '02', title: 'Validate connectors', body: 'Status flips demo → awaiting creds → live as each connector verifies.' },
  { step: '03', title: 'Backfill history', body: 'Toast 90 days, MarginEdge 45 days, Caterease full book of business.' },
  { step: '04', title: 'Incremental sync', body: 'Webhooks + polls take over; fixtures stay behind DEMO_MODE for demos.' },
];

export default async function IntegrationsPage() {
  const repo = getRepository();
  const adapters = getIntegrationAdapters();
  const slackConfigured = isSlackConfigured();

  const [states, dailySales, laborShifts, menuMix, invoices, items, alerts, recipes, events, guests] =
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
  const newsletterGuests = guests.filter((g) => g.source === 'newsletter').length;

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

  /* ---------- data-flow rows ---------- */
  const flows = [
    {
      id: 'toast',
      source: { name: 'Toast POS', role: 'Point of sale', monogram: 'T', tint: TINTS.toast },
      cadence: 'Nightly · 6:05 AM',
      dest: { name: 'Sales & Labor', detail: `${fmtNumber(dailySales.length)} rollups · ${fmtNumber(laborShifts.length)} shifts` },
    },
    {
      id: 'marginedge',
      source: { name: 'MarginEdge', role: 'AP & food cost', monogram: 'ME', tint: TINTS.marginedge },
      cadence: 'Hourly poll · 5:40 AM full',
      dest: { name: 'Invoices & Items', detail: `${fmtNumber(invoices.length)} invoices · ${fmtNumber(items.length)} items` },
    },
    {
      id: 'caterease',
      source: { name: 'Caterease', role: 'Catering & events', monogram: 'CE', tint: TINTS.caterease },
      cadence: 'Daily export · 11:30 PM',
      dest: { name: 'Events Pipeline', detail: `${fmtNumber(events.length)} events · ${fmtUSDk(pipelineValue)} open` },
    },
    {
      id: 'site',
      source: { name: 'buenavista site', role: 'Newsletter form', monogram: 'BV', tint: TINTS.site },
      cadence: 'Real-time · webhook',
      dest: { name: 'CRM Guests', detail: `${fmtNumber(newsletterGuests)} newsletter signups` },
    },
  ];

  return (
    <>
      <PageHeader
        kicker="System · Integrations"
        title="Integrations Hub"
        subtitle="Toast, MarginEdge and Caterease feed the OS through one adapter contract — demo fixtures today, the same method signatures when credentials arrive."
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

              {/* native replacement status */}
              <div className="px-5 pt-4">
                <Kicker>Native replacement status</Kicker>
                <div className="mt-2 space-y-2.5">
                  <div>
                    <div className="text-[11px] font-medium text-[var(--good)]">Runs natively in VioX OS</div>
                    <ul className="mt-1 space-y-1">
                      {p.native.runs.map((r) => (
                        <li key={r} className="flex items-start gap-2 text-xs text-[var(--text)]">
                          <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--good)]" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-[var(--muted)]">{p.native.staysLabel}</div>
                    <ul className="mt-1 space-y-1">
                      {p.native.stays.map((r) => (
                        <li key={r} className="flex items-start gap-2 text-xs text-[var(--muted)]">
                          <ArrowIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
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

      {/* ---------- Slack team collaboration ---------- */}
      <Card flush className="flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <Monogram text="#" tint={TINTS.slack} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--text)]">Slack</div>
              <div className="mt-0.5 truncate text-xs text-[var(--muted)]">
                Team collaboration · the AI team in your channels
              </div>
            </div>
          </div>
          {slackConfigured ? (
            <Badge status="connected_live" className="mt-0.5 shrink-0">
              Configured
            </Badge>
          ) : (
            <Badge status="awaiting_credentials" className="mt-0.5 shrink-0">
              Awaiting credentials
            </Badge>
          )}
        </div>

        <p className="px-5 pt-3 text-xs leading-relaxed text-[var(--muted)]">
          Puts Mise, Ledger, Sala, Turno, Fiesta and Vega where the team already talks. Every answer
          runs through the same copilot tool belt as the in-app chat — fixtures in demo, live data
          when the connectors flip.
        </p>

        <div className="grid grid-cols-1 gap-x-8 gap-y-4 px-5 pb-5 pt-4 lg:grid-cols-2">
          <div>
            <Kicker>What it does</Kicker>
            <ul className="mt-2 space-y-1.5">
              {SLACK_CAPABILITIES.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-[var(--text)]">
                  <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--good)]" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2.5 text-[11px] leading-relaxed text-[var(--muted)]">
              Endpoints: <code className="text-[var(--text)]">/api/slack/events</code> (mentions + DMs) ·{' '}
              <code className="text-[var(--text)]">/api/slack/digest?agent=mise|ledger|sala|turno|fiesta|vega</code>{' '}
              (morning briefs)
            </div>
          </div>

          <div>
            <Kicker>Setup checklist</Kicker>
            <ol className="mt-2 space-y-2">
              {SLACK_SETUP_STEPS.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs leading-relaxed text-[var(--text)]">
                  <span className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel2)] text-[10px] tabular-nums text-[var(--muted)]">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <footer className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3 text-[11px] text-[var(--muted)]">
          <span>
            {slackConfigured
              ? 'Bot token + signing secret detected — mention the bot to test it.'
              : 'Reads SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET at render — flips to Configured the moment env vars land.'}
          </span>
          <span className="shrink-0 text-right">Events API + chat.postMessage</span>
        </footer>
      </Card>

      {/* ---------- data-flow diagram ---------- */}
      <Card
        kicker="Pipeline topology"
        title="Data flow"
        action={<span>@viox/integrations adapters</span>}
      >
        <div className="space-y-3">
          {flows.map((f) => (
            <div key={f.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
              {/* source node */}
              <div className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2.5 sm:w-60 sm:shrink-0">
                <Monogram text={f.source.monogram} tint={f.source.tint} size="sm" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-[var(--text)]">{f.source.name}</div>
                  <div className="truncate text-[10px] uppercase tracking-[.12em] text-[var(--muted)]">
                    {f.source.role}
                  </div>
                </div>
              </div>

              {/* connector */}
              <div className="relative hidden min-w-0 flex-1 items-center px-2 sm:flex">
                <div className="h-px flex-1 border-t border-dashed border-[rgba(168,196,229,.3)]" />
                <svg viewBox="0 0 10 10" className="-ml-px h-2.5 w-2.5 shrink-0 text-[rgba(168,196,229,.5)]" fill="currentColor" aria-hidden>
                  <path d="M1 1l8 4-8 4V1Z" />
                </svg>
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--bg)] px-2.5 py-0.5 text-[10px] uppercase tracking-[.12em] text-[var(--muted)]">
                  {f.cadence}
                </span>
              </div>
              <div className="flex items-center gap-2 pl-4 text-[10px] uppercase tracking-[.12em] text-[var(--muted)] sm:hidden">
                <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 rotate-90" fill="currentColor" aria-hidden>
                  <path d="M1 1l8 4-8 4V1Z" />
                </svg>
                {f.cadence}
              </div>

              {/* destination node */}
              <div className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2.5 sm:w-72 sm:shrink-0">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-[var(--text)]">{f.dest.name}</div>
                  <div className="truncate text-[10px] tabular-nums text-[var(--muted)]">{f.dest.detail}</div>
                </div>
                <ModuleIcon className="h-4 w-4 shrink-0 text-[var(--accent)]" />
              </div>
            </div>
          ))}
          <div className="border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
            Every connector implements the same <code className="text-[var(--text)]">IntegrationAdapter</code> contract —
            the app layer reads through <code className="text-[var(--text)]">getRepository()</code> in demo and live mode alike.
          </div>
        </div>
      </Card>

      {/* ---------- go-live runway ---------- */}
      <Card kicker="Runway" title="Go-live sequence" action={<span>Config event, not a rebuild</span>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {GO_LIVE_STEPS.map((s) => (
            <div key={s.step} className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-3.5">
              <div className="text-[11px] font-semibold tabular-nums text-[var(--accent)]">{s.step}</div>
              <div className="mt-1 text-sm font-semibold text-[var(--text)]">{s.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{s.body}</p>
            </div>
          ))}
        </div>
      </Card>
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

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className ?? '')}>
      <path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" />
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

function ModuleIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className ?? '')}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}
