'use client';

// ============================================================
// ConnectionsHub — the configurable-provider half of /integrations.
//
// At-a-glance cards for every provider with saved credentials in
// the vault (WhatsApp/Twilio, Slack, Toast, MarginEdge, Stripe),
// each opening a setup panel (?setup=<slug>) with:
//   1. a plain-English "How this connects" intro,
//   2. numbered wizard steps with copy-buttons for webhook URLs,
//   3. a masked credential form → PUT /api/settings → auto
//      POST /api/settings-test → live status badge.
//
// Status ladder per provider:
//   Not configured → Saved — untested (amber) → Connected (green)
//                                            → Failed (red, detail)
// Demo-bypass sessions (GET returns readOnly:true, writes 403):
// forms render disabled with a "Sign in to configure" note.
// ============================================================

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Badge, Kicker } from '@viox/ui';

// ---------- provider catalog ----------

interface Tint {
  text: string;
  border: string;
  bg: string;
}

const TINTS: Record<string, Tint> = {
  whatsapp: { text: '#25D366', border: 'rgba(37,211,102,.35)', bg: 'rgba(37,211,102,.08)' },
  slack: { text: '#E58FAC', border: 'rgba(224,30,90,.35)', bg: 'rgba(224,30,90,.08)' },
  toast: { text: 'var(--orange, #fb923c)', border: 'rgba(251,146,60,.35)', bg: 'rgba(251,146,60,.08)' },
  marginedge: { text: 'var(--good)', border: 'rgba(52,211,153,.35)', bg: 'rgba(52,211,153,.08)' },
  stripe: { text: '#8FA8F5', border: 'rgba(99,91,255,.4)', bg: 'rgba(99,91,255,.1)' },
};

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  /** Render as a visible text input (identifiers), not a masked secret. */
  plain?: boolean;
  help?: string;
}

interface StepDef {
  text: React.ReactNode;
  /** Copy-button payload (webhook URLs, names). */
  copy?: { label: string; value: string };
}

interface ProviderDef {
  /** URL slug for ?setup= */
  slug: string;
  /** Settings-vault provider (GET/PUT /api/settings). */
  settingsId: string;
  /** Connection-test provider (POST /api/settings-test). */
  testId: string;
  name: string;
  monogram: string;
  tint: Tint;
  category: string;
  powers: string;
  how: string;
  steps: StepDef[];
  fields: FieldDef[];
  note?: string;
}

const WHATSAPP_WEBHOOK = 'https://buena-vista-crm.vercel.app/api/whatsapp/inbound';
const SLACK_EVENTS_URL = 'https://buena-vista-os.vercel.app/api/slack/events';

const PROVIDERS: ProviderDef[] = [
  {
    slug: 'whatsapp',
    settingsId: 'twilio',
    testId: 'twilio_whatsapp',
    name: 'WhatsApp / Meta',
    monogram: 'WA',
    tint: TINTS.whatsapp,
    category: 'Guest messaging · Twilio WhatsApp Business',
    powers: 'Anfitrión concierge answering guests on WhatsApp, bilingual, with reservation capture into the CRM.',
    how: 'Twilio’s WhatsApp channel is a plain REST API — no middleware to run. Guests message the sender, Twilio POSTs to the CRM webhook, and the app replies through the same API using the keys you save here.',
    steps: [
      {
        text: (
          <>
            In Twilio Console → <strong>Messaging → Senders → WhatsApp senders</strong>, register a new sender on
            your Twilio number (or reuse an existing one).
          </>
        ),
      },
      {
        text: (
          <>
            Complete the <strong>Meta Business OAuth</strong> step when Twilio prompts — this links the sender to the
            restaurant’s Meta Business account (Meta verifies the business).
          </>
        ),
      },
      {
        text: (
          <>
            Set the display name to <strong>&ldquo;Buena Vista Restaurant &amp; Bar&rdquo;</strong> — Meta reviews it
            (usually &lt; 24h).
          </>
        ),
        copy: { label: 'Copy display name', value: 'Buena Vista Restaurant & Bar' },
      },
      {
        text: (
          <>
            On the sender, set <strong>&ldquo;When a message comes in&rdquo;</strong> → HTTP POST to the CRM inbound
            webhook.
          </>
        ),
        copy: { label: 'Copy webhook URL', value: WHATSAPP_WEBHOOK },
      },
      { text: <>Paste the Account SID, Auth Token and WhatsApp sender below, then Save.</> },
      {
        text: (
          <>
            Run the test — it verifies the credentials and shows how many WhatsApp senders are registered. If outbound
            sends fail with <code>error 63007</code>, the from-number isn’t registered as a WhatsApp sender yet
            (Meta review still pending) — the credentials themselves are fine.
          </>
        ),
      },
    ],
    fields: [
      { key: 'account_sid', label: 'Account SID', placeholder: 'AC…', plain: true },
      { key: 'auth_token', label: 'Auth token', placeholder: 'Twilio Console → Account → API keys & tokens' },
      {
        key: 'whatsapp_from',
        label: 'WhatsApp sender',
        placeholder: 'whatsapp:+1646…',
        plain: true,
        help: 'Prefixed with whatsapp: — e.g. whatsapp:+16462468761',
      },
    ],
  },
  {
    slug: 'slack',
    settingsId: 'slack',
    testId: 'slack',
    name: 'Slack',
    monogram: '#',
    tint: TINTS.slack,
    category: 'Team collaboration · AI Team in your channels',
    powers: 'Mise, Ledger, Sala, Turno, Fiesta and Vega answering in-channel and by DM, plus morning digests.',
    how: 'Slack’s Events + Web APIs are REST endpoints. Slack POSTs mentions and DMs to the OS events route; the OS replies via chat.postMessage with the bot token you save here. Nothing runs on your side.',
    steps: [
      {
        text: (
          <>
            Go to <code>api.slack.com/apps</code> → <strong>Create New App</strong> (from scratch) named
            &ldquo;VioX OS — Buena Vista&rdquo; in the restaurant’s workspace.
          </>
        ),
        copy: { label: 'Copy app name', value: 'VioX OS — Buena Vista' },
      },
      {
        text: (
          <>
            <strong>OAuth &amp; Permissions → Bot Token Scopes</strong>: add <code>app_mentions:read</code>,{' '}
            <code>chat:write</code>, <code>im:history</code>, <code>channels:history</code>.
          </>
        ),
      },
      {
        text: (
          <>
            <strong>Event Subscriptions</strong> → enable → paste the Request URL (it answers Slack’s verification
            challenge automatically once the signing secret is saved here).
          </>
        ),
        copy: { label: 'Copy events URL', value: SLACK_EVENTS_URL },
      },
      {
        text: (
          <>
            Subscribe to bot events <code>app_mention</code> + <code>message.im</code>, then <strong>install the app
            to the workspace</strong>.
          </>
        ),
      },
      {
        text: (
          <>
            Copy the <code>xoxb-</code> bot token (OAuth &amp; Permissions), the Signing Secret (Basic Information),
            and the channel ID of the digest channel (invite the bot there first). Paste all three below → Save.
          </>
        ),
      },
      { text: <>The test calls <code>auth.test</code> and shows which workspace the bot authenticated into.</> },
    ],
    fields: [
      { key: 'bot_token', label: 'Bot token', placeholder: 'xoxb-…' },
      { key: 'signing_secret', label: 'Signing secret', placeholder: 'Basic Information → Signing Secret' },
      { key: 'channel_id', label: 'Digest channel ID', placeholder: 'C…', plain: true },
    ],
  },
  {
    slug: 'toast',
    settingsId: 'toast',
    testId: 'toast',
    name: 'Toast POS',
    monogram: 'T',
    tint: TINTS.toast,
    category: 'Point of sale · sales, labor, menu mix',
    powers: 'Daily sales rollups, daypart splits, menu-item mix and labor shifts for both rooms.',
    how: 'Toast’s partner API is a REST API behind machine-client credentials: the OS exchanges the client id + secret for a short-lived token on each sync — same pattern as any OAuth2 service.',
    steps: [
      {
        text: (
          <>
            Ask your Toast account manager for <strong>partner / API access</strong> (a machine client). Standard API
            access is a paid add-on outside the partner program — confirm it’s on the plan.
          </>
        ),
      },
      {
        text: (
          <>
            You’ll receive a <strong>client ID + client secret</strong>, plus the <strong>restaurant GUID</strong>{' '}
            for each location (from the location’s setup page in Toast Web).
          </>
        ),
      },
      {
        text: (
          <>
            Paste them below. The hostname stays <code>ws-api.toasttab.com</code> unless Toast gives you a sandbox
            host.
          </>
        ),
      },
      {
        text: (
          <>
            The test performs a real machine-client login against{' '}
            <code>/authentication/v1/authentication/login</code> — a 401 means the id/secret pair is wrong or expired.
          </>
        ),
      },
    ],
    fields: [
      {
        key: 'hostname',
        label: 'API hostname',
        placeholder: 'ws-api.toasttab.com',
        plain: true,
        help: 'Default ws-api.toasttab.com — protocol is added automatically.',
      },
      { key: 'client_id', label: 'Client ID', placeholder: 'Toast machine-client ID', plain: true },
      { key: 'client_secret', label: 'Client secret', placeholder: 'Toast machine-client secret' },
      { key: 'restaurant_guid', label: 'Restaurant GUID', placeholder: 'xxxxxxxx-xxxx-…', plain: true },
    ],
    note: 'The credential set previously on file has expired — Toast rotates partner secrets. Request a fresh pair before testing.',
  },
  {
    slug: 'marginedge',
    settingsId: 'marginedge',
    testId: 'marginedge',
    name: 'MarginEdge',
    monogram: 'ME',
    tint: TINTS.marginedge,
    category: 'AP & food cost · invoices, catalog, price alerts',
    powers: 'Vendor invoices with line detail, the inventory catalog, and the price feed behind recipe costing.',
    how: 'MarginEdge exposes a straightforward REST API keyed by a single X-API-KEY header against api.marginedge.com — one key, no OAuth dance.',
    steps: [
      {
        text: (
          <>
            Request an API key from your MarginEdge <strong>account manager</strong> (issued from the admin portal →
            Settings → API Access). Confirm both restaurant units are on a plan with API access.
          </>
        ),
      },
      { text: <>Paste the key below and Save.</> },
      {
        text: (
          <>
            The test calls <code>GET /public/restaurantUnits</code> on the fixed base URL{' '}
            <code>https://api.marginedge.com/public</code> and shows how many restaurant units the key can see.
          </>
        ),
      },
    ],
    fields: [{ key: 'api_key', label: 'API key', placeholder: 'MarginEdge X-API-KEY' }],
  },
  {
    slug: 'stripe',
    settingsId: 'stripe',
    testId: 'stripe',
    name: 'Stripe',
    monogram: 'S',
    tint: TINTS.stripe,
    category: 'Payments · online ordering & gift cards',
    powers: 'Card payments for the ordering module and gift cards on the popmenu-parity roadmap.',
    how: 'Stripe is the canonical REST API — a secret key server-side, a publishable key in the browser. The OS only ever uses the secret key on the server.',
    steps: [
      {
        text: (
          <>
            In the Stripe Dashboard → <strong>Developers → API keys</strong>, copy the <strong>secret key</strong>{' '}
            (<code>sk_live_…</code> / <code>sk_test_…</code>) and the <strong>publishable key</strong>{' '}
            (<code>pk_…</code>).
          </>
        ),
      },
      { text: <>Paste both below and Save.</> },
      {
        text: (
          <>
            The test calls <code>GET /v1/account</code> and shows the account ID plus{' '}
            <code>charges_enabled</code> — true means the account can take live payments.
          </>
        ),
      },
    ],
    fields: [
      { key: 'secret_key', label: 'Secret key', placeholder: 'sk_live_… / sk_test_…' },
      { key: 'publishable_key', label: 'Publishable key', placeholder: 'pk_live_… / pk_test_…' },
    ],
    note: 'The ordering module is tabled for now — keys stored here are encrypted and flip-ready the day ordering turns on. Nothing is charged until then.',
  },
];

// ---------- per-provider client state ----------

type StatusKind = 'loading' | 'unconfigured' | 'saved' | 'connected' | 'failed';

interface SavedEntry {
  key: string;
  hint: string | null;
  updatedAt: string | null;
}

interface KeyInfo {
  key: string;
  envVar: string;
  envConfigured: boolean;
}

interface ProviderState {
  status: StatusKind;
  detail: string | null;
  checkedAt: string | null;
  entries: SavedEntry[];
  keys: KeyInfo[];
}

const INITIAL_STATE: ProviderState = {
  status: 'loading',
  detail: null,
  checkedAt: null,
  entries: [],
  keys: [],
};

function statusBadge(s: ProviderState): { tone: 'good' | 'warn' | 'bad' | 'muted'; label: string } {
  switch (s.status) {
    case 'connected':
      return { tone: 'good', label: 'Connected' };
    case 'failed':
      return { tone: 'bad', label: 'Failed' };
    case 'saved':
      return { tone: 'warn', label: 'Saved — untested' };
    case 'unconfigured':
      return { tone: 'muted', label: 'Not configured' };
    default:
      return { tone: 'muted', label: 'Checking…' };
  }
}

function hasAnyCredential(entries: SavedEntry[], keys: KeyInfo[]): boolean {
  return entries.length > 0 || keys.some((k) => k.envConfigured);
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await res.json();
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ---------- copy button ----------

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — leave the value visible for manual copy */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel2)] px-2 py-1 text-[11px] font-medium text-[var(--text)] transition-colors hover:border-[rgba(201,153,92,.4)] hover:text-[var(--accent)]"
    >
      {copied ? (
        <>
          <svg viewBox="0 0 24 24" className="h-3 w-3 text-[var(--good)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V6a2 2 0 0 1 2-2h9" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

// ---------- main hub ----------

export function ConnectionsHub() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const openSlug = searchParams.get('setup');
  const openProvider = PROVIDERS.find((p) => p.slug === openSlug) ?? null;

  const [readOnly, setReadOnly] = React.useState(false);
  const [vaultUnconfigured, setVaultUnconfigured] = React.useState(false);
  const [states, setStates] = React.useState<Record<string, ProviderState>>(() =>
    Object.fromEntries(PROVIDERS.map((p) => [p.slug, INITIAL_STATE])),
  );

  const patchState = React.useCallback((slug: string, patch: Partial<ProviderState>) => {
    setStates((prev) => ({ ...prev, [slug]: { ...prev[slug], ...patch } }));
  }, []);

  // Initial credential inventory — hints only, one GET per settings provider.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const settingsIds = [...new Set(PROVIDERS.map((p) => p.settingsId))];
      const bySettingsId = new Map<
        string,
        { entries: SavedEntry[]; keys: KeyInfo[]; readOnly: boolean; unconfigured: boolean }
      >();
      await Promise.all(
        settingsIds.map(async (id) => {
          try {
            const res = await fetch(`/api/settings?provider=${id}`, { cache: 'no-store' });
            const data = await readJson(res);
            bySettingsId.set(id, {
              entries: Array.isArray(data.entries) ? (data.entries as SavedEntry[]) : [],
              keys: Array.isArray(data.keys) ? (data.keys as KeyInfo[]) : [],
              readOnly: data.readOnly === true,
              unconfigured: data.storage === 'unconfigured',
            });
          } catch {
            bySettingsId.set(id, { entries: [], keys: [], readOnly: false, unconfigured: false });
          }
        }),
      );
      if (cancelled) return;
      if ([...bySettingsId.values()].some((v) => v.readOnly)) setReadOnly(true);
      if ([...bySettingsId.values()].some((v) => v.unconfigured)) setVaultUnconfigured(true);
      setStates((prev) => {
        const next = { ...prev };
        for (const p of PROVIDERS) {
          const info = bySettingsId.get(p.settingsId);
          if (!info) continue;
          const relevantKeys = info.keys.filter((k) => p.fields.some((f) => f.key === k.key));
          const relevantEntries = info.entries.filter((e) => p.fields.some((f) => f.key === e.key));
          next[p.slug] = {
            ...next[p.slug],
            entries: relevantEntries,
            keys: relevantKeys,
            status: hasAnyCredential(relevantEntries, relevantKeys) ? 'saved' : 'unconfigured',
          };
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSetupParam = React.useCallback(
    (slug: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (slug) next.set('setup', slug);
      else next.delete('setup');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const runTest = React.useCallback(
    async (p: ProviderDef): Promise<void> => {
      patchState(p.slug, { status: 'loading', detail: null });
      try {
        const res = await fetch('/api/settings-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: p.testId }),
        });
        const data = await readJson(res);
        if (res.status === 403 && data.readOnly === true) {
          setReadOnly(true);
          patchState(p.slug, { status: 'saved', detail: 'Demo session — sign in to run live tests.' });
          return;
        }
        const detail = typeof data.detail === 'string' ? data.detail : `Test failed (HTTP ${res.status}).`;
        patchState(p.slug, {
          status: data.ok === true ? 'connected' : 'failed',
          detail,
          checkedAt: typeof data.checkedAt === 'string' ? data.checkedAt : new Date().toISOString(),
        });
      } catch {
        patchState(p.slug, { status: 'failed', detail: 'Connection test unreachable — network error.' });
      }
    },
    [patchState],
  );

  const refreshEntries = React.useCallback(
    async (p: ProviderDef): Promise<void> => {
      try {
        const res = await fetch(`/api/settings?provider=${p.settingsId}`, { cache: 'no-store' });
        const data = await readJson(res);
        const entries = (Array.isArray(data.entries) ? (data.entries as SavedEntry[]) : []).filter((e) =>
          p.fields.some((f) => f.key === e.key),
        );
        const keys = (Array.isArray(data.keys) ? (data.keys as KeyInfo[]) : []).filter((k) =>
          p.fields.some((f) => f.key === k.key),
        );
        patchState(p.slug, { entries, keys });
      } catch {
        /* keep the previous inventory */
      }
    },
    [patchState],
  );

  return (
    <>
      {/* ---------- vault-unconfigured info state ---------- */}
      {vaultUnconfigured && (
        <div className="flex items-start gap-3 rounded-xl border border-[rgba(126,178,245,.3)] bg-[rgba(126,178,245,.06)] px-5 py-4">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--info)]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 11v5M12 7.75v.5" />
          </svg>
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">Credential vault not configured</div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
              The encrypted settings store needs <code className="text-[var(--text)]">SUPABASE_URL</code>,{' '}
              <code className="text-[var(--text)]">SUPABASE_SERVICE_ROLE_KEY</code> and{' '}
              <code className="text-[var(--text)]">INTEGRATION_SETTINGS_KEY</code> on this deployment. Until then,
              integrations keep reading credentials from environment variables and saving from this page is
              unavailable.
            </p>
          </div>
        </div>
      )}

      {/* ---------- at-a-glance cards ---------- */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PROVIDERS.map((p) => {
          const s = states[p.slug];
          const badge = statusBadge(s);
          return (
            <section
              key={p.slug}
              className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-[0_1px_0_rgba(255,255,255,.03)_inset]"
            >
              <div className="flex items-start justify-between gap-3 px-5 pt-5">
                <div className="flex min-w-0 items-center gap-3">
                  <Monogram text={p.monogram} tint={p.tint} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--text)]">{p.name}</div>
                    <div className="mt-0.5 truncate text-xs text-[var(--muted)]">{p.category}</div>
                  </div>
                </div>
                <Badge tone={badge.tone} className="mt-0.5 shrink-0">
                  {badge.label}
                </Badge>
              </div>

              <div className="space-y-2 px-5 pb-4 pt-3">
                <p className="text-xs leading-relaxed text-[var(--muted)]">{p.powers}</p>
                {s.detail && (
                  <p
                    className={`text-[11px] leading-relaxed ${
                      s.status === 'failed' ? 'text-[var(--bad)]' : 'text-[var(--muted)]'
                    }`}
                  >
                    {s.detail}
                  </p>
                )}
              </div>

              <footer className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3">
                <span className="text-[11px] tabular-nums text-[var(--muted)]">
                  {s.entries.length > 0
                    ? `${s.entries.length} secret${s.entries.length === 1 ? '' : 's'} in vault`
                    : s.keys.some((k) => k.envConfigured)
                      ? 'Backed by env vars'
                      : 'No credentials yet'}
                </span>
                <button
                  type="button"
                  onClick={() => setSetupParam(p.slug)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent2)]"
                >
                  Configure
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" />
                  </svg>
                </button>
              </footer>
            </section>
          );
        })}
      </div>

      {/* ---------- setup panel ---------- */}
      {openProvider && (
        <SetupPanel
          provider={openProvider}
          state={states[openProvider.slug]}
          readOnly={readOnly}
          onClose={() => setSetupParam(null)}
          onSaved={async () => {
            await refreshEntries(openProvider);
            await runTest(openProvider);
          }}
          onTest={() => runTest(openProvider)}
          onReadOnly={() => setReadOnly(true)}
        />
      )}
    </>
  );
}

// ---------- setup panel (slide-over) ----------

interface SetupPanelProps {
  provider: ProviderDef;
  state: ProviderState;
  readOnly: boolean;
  onClose: () => void;
  /** Called after a successful PUT — refresh hints then auto-test. */
  onSaved: () => Promise<void>;
  onTest: () => Promise<void>;
  onReadOnly: () => void;
}

function SetupPanel({ provider: p, state, readOnly, onClose, onSaved, onTest, onReadOnly }: SetupPanelProps) {
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Reset the draft when switching providers.
  React.useEffect(() => {
    setValues({});
    setFormError(null);
  }, [p.slug]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const savedFor = (key: string) => state.entries.find((e) => e.key === key);
  const envFor = (key: string) => state.keys.find((k) => k.key === key);

  const dirtyEntries = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const f of p.fields) {
      const v = (values[f.key] ?? '').trim();
      if (!v) continue;
      // Toast hostname: the test route prefixes https:// itself.
      out[f.key] = f.key === 'hostname' ? v.replace(/^https?:\/\//i, '').replace(/\/+$/, '') : v;
    }
    return out;
  };

  const handleSave = async () => {
    const entries = dirtyEntries();
    if (Object.keys(entries).length === 0) {
      setFormError('Nothing to save — enter at least one value. Blank fields keep their saved value.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: p.settingsId, entries }),
      });
      const data = await readJson(res);
      if (res.status === 403 && data.readOnly === true) {
        onReadOnly();
        setFormError('Demo session — sign in to save credentials.');
        return;
      }
      if (data.ok !== true) {
        const errs = data.errors && typeof data.errors === 'object' ? Object.values(data.errors as Record<string, string>) : [];
        setFormError(errs[0] ?? (typeof data.error === 'string' ? data.error : `Save failed (HTTP ${res.status}).`));
        return;
      }
      setValues({});
      setTesting(true);
      await onSaved(); // refresh hints + auto-run the connection test
    } catch {
      setFormError('Save failed — network error.');
    } finally {
      setSaving(false);
      setTesting(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await onTest();
    } finally {
      setTesting(false);
    }
  };

  const badge = statusBadge(state);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${p.name} setup`}>
      {/* backdrop */}
      <button
        type="button"
        aria-label="Close setup panel"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
      />
      {/* panel */}
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--bg)] shadow-2xl">
        {/* header */}
        <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/95 px-6 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Monogram text={p.monogram} tint={p.tint} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[var(--text)]">{p.name} setup</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                  {state.checkedAt && (
                    <span className="text-[10px] tabular-nums text-[var(--muted)]">
                      checked {new Date(state.checkedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 px-6 py-5">
          {/* how this connects */}
          <div>
            <Kicker>How this connects</Kicker>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text)]">{p.how}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--muted)]">
              Everything here is a standard REST API call from the app’s own servers — no MCP, no third-party
              bridge, nothing to install. Credentials are AES-256 encrypted in the tenant vault; this page only ever
              sees the last four characters back.
            </p>
          </div>

          {p.note && (
            <div className="flex items-start gap-2 rounded-lg border border-[rgba(251,191,36,.3)] bg-[rgba(251,191,36,.06)] px-3 py-2.5 text-xs leading-relaxed text-[var(--text)]">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warn)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
                <path d="M12 10v4.5M12 17.5v.4" />
              </svg>
              <span>{p.note}</span>
            </div>
          )}

          {/* wizard steps */}
          <div>
            <Kicker>Setup steps</Kicker>
            <ol className="mt-2 space-y-3">
              {p.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs leading-relaxed text-[var(--text)]">
                  <span className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel2)] text-[10px] tabular-nums text-[var(--muted)]">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    {step.text}
                    {step.copy && (
                      <span className="mt-1.5 flex items-center gap-2">
                        <code className="min-w-0 truncate rounded border border-[var(--border)] bg-[var(--panel2)] px-2 py-1 text-[10px] text-[var(--text)]">
                          {step.copy.value}
                        </code>
                        <CopyButton value={step.copy.value} label="Copy" />
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* credential form */}
          <div>
            <div className="flex items-center justify-between gap-3">
              <Kicker>Credentials</Kicker>
              {readOnly && <Badge tone="info">Read-only — demo session</Badge>}
            </div>

            <div className="mt-3 space-y-3">
              {p.fields.map((f) => {
                const saved = savedFor(f.key);
                const env = envFor(f.key);
                return (
                  <label key={f.key} className="block">
                    <span className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="text-xs font-medium text-[var(--text)]">{f.label}</span>
                      <span className="text-[10px] tabular-nums text-[var(--muted)]">
                        {saved
                          ? `saved •••• ${saved.hint ?? '????'}`
                          : env?.envConfigured
                            ? `env ${env.envVar} set`
                            : 'not set'}
                      </span>
                    </span>
                    <input
                      type={f.plain ? 'text' : 'password'}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={readOnly}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={saved ? `•••• ${saved.hint ?? ''} — enter to replace` : f.placeholder}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-xs text-[var(--text)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[rgba(201,153,92,.5)] disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    {f.help && <span className="mt-1 block text-[10px] text-[var(--muted)]">{f.help}</span>}
                  </label>
                );
              })}
            </div>

            {formError && <p className="mt-3 text-[11px] leading-relaxed text-[var(--bad)]">{formError}</p>}

            {state.detail && (
              <div
                className={`mt-3 rounded-lg border px-3 py-2.5 text-[11px] leading-relaxed ${
                  state.status === 'connected'
                    ? 'border-[rgba(52,211,153,.35)] bg-[rgba(52,211,153,.06)] text-[var(--text)]'
                    : state.status === 'failed'
                      ? 'border-[rgba(248,113,113,.35)] bg-[rgba(248,113,113,.06)] text-[var(--text)]'
                      : 'border-[var(--border)] bg-[var(--panel2)] text-[var(--muted)]'
                }`}
              >
                <span className="font-medium">{state.status === 'connected' ? 'Test passed: ' : state.status === 'failed' ? 'Test failed: ' : ''}</span>
                {state.detail}
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              {readOnly ? (
                <p className="text-xs text-[var(--muted)]">
                  Sign in to configure — demo sessions can browse the setup guide but can’t save credentials or
                  run live tests.
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || testing}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(201,153,92,.5)] bg-[rgba(201,153,92,.12)] px-3.5 py-2 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[rgba(201,153,92,.2)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save & test'}
                  </button>
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={saving || testing}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3.5 py-2 text-xs font-medium text-[var(--text)] transition-colors hover:border-[rgba(201,153,92,.4)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {testing ? 'Testing…' : 'Run test'}
                  </button>
                  <span className="text-[10px] text-[var(--muted)]">Blank fields keep their saved value.</span>
                </>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ---------- shared monogram ----------

function Monogram({ text, tint }: { text: string; tint: Tint }) {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-bold"
      style={{ color: tint.text, borderColor: tint.border, backgroundColor: tint.bg }}
      aria-hidden
    >
      {text}
    </div>
  );
}
