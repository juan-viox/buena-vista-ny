// ============================================================
// /api/settings-test — live connection tests for saved creds.
//
//   POST { provider: slack | twilio_whatsapp | toast | marginedge
//                    | stripe | resend }
//     → { ok, provider, detail, checkedAt }
//
// Each test resolves credentials through getIntegrationSetting
// (encrypted DB value → env fallback) and calls the provider's
// cheapest authenticated endpoint. Secrets are never echoed —
// only status text. 10s timeout per call; the route never throws
// (failures come back as { ok:false, detail }).
// Demo-bypass sessions (viox-demo=1) are read-only → 403.
// ============================================================

import { getIntegrationSetting } from '@viox/integrations';
import { DEMO_COOKIE, json } from '../auth/_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 10_000;

const TEST_PROVIDERS = ['slack', 'twilio_whatsapp', 'toast', 'marginedge', 'stripe', 'resend'] as const;
type TestProvider = (typeof TEST_PROVIDERS)[number];

interface TestOutcome {
  ok: boolean;
  detail: string;
}

// ---------- plumbing ----------

function isDemoSession(req: Request): boolean {
  const header = req.headers.get('cookie') ?? '';
  return header.split(';').some((part) => {
    const [k, ...rest] = part.trim().split('=');
    return k === DEMO_COOKIE && rest.join('=') === '1';
  });
}

interface FetchOutcome {
  status: number;
  body: unknown;
  /** Network / timeout failure — status is 0. */
  error?: string;
}

/** fetch with a hard timeout; never throws. JSON-parses best-effort. */
async function timedFetch(url: string, init: RequestInit = {}): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    const text = await res.text().catch(() => '');
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { status: 0, body: null, error: aborted ? `Timed out after ${TIMEOUT_MS / 1000}s.` : 'Network error.' };
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function missing(...pairs: Array<[string, string | null]>): string | null {
  const gaps = pairs.filter(([, v]) => !v).map(([name]) => name);
  return gaps.length ? `Missing settings: ${gaps.join(', ')} — save them in Settings or set the env vars.` : null;
}

function statusClass(status: number): string {
  if (status >= 500) return `provider error (HTTP ${status})`;
  if (status === 401 || status === 403) return `auth rejected (HTTP ${status})`;
  if (status >= 400) return `request rejected (HTTP ${status})`;
  return `HTTP ${status}`;
}

// ---------- provider tests ----------

async function testSlack(): Promise<TestOutcome> {
  const token = await getIntegrationSetting('slack', 'bot_token');
  const gap = missing(['slack.bot_token', token]);
  if (gap) return { ok: false, detail: gap };

  const res = await timedFetch('https://slack.com/api/auth.test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.error) return { ok: false, detail: `Slack auth.test unreachable — ${res.error}` };
  const data = asRecord(res.body);
  if (res.status === 200 && data.ok === true) {
    return {
      ok: true,
      detail: `Authenticated as ${String(data.user ?? 'bot')} in workspace ${String(data.team ?? '?')}.`,
    };
  }
  return { ok: false, detail: `Slack rejected the token (${String(data.error ?? statusClass(res.status))}).` };
}

async function testTwilioWhatsApp(): Promise<TestOutcome> {
  const sid = await getIntegrationSetting('twilio', 'account_sid');
  const token = await getIntegrationSetting('twilio', 'auth_token');
  const gap = missing(['twilio.account_sid', sid], ['twilio.auth_token', token]);
  if (gap) return { ok: false, detail: gap };

  const basic = Buffer.from(`${sid}:${token}`).toString('base64');
  const auth = { Authorization: `Basic ${basic}` };

  const bal = await timedFetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid as string)}/Balance.json`,
    { headers: auth },
  );
  if (bal.error) return { ok: false, detail: `Twilio unreachable — ${bal.error}` };
  if (bal.status !== 200) {
    return { ok: false, detail: `Twilio credentials rejected — ${statusClass(bal.status)}.` };
  }
  const balance = asRecord(bal.body);
  const balanceText = `Balance ${String(balance.balance ?? '?')} ${String(balance.currency ?? '')}`.trim();

  // WhatsApp senders registered on this account (Senders API).
  let sendersText = 'senders list unavailable';
  const senders = await timedFetch('https://messaging.twilio.com/v2/Channels/Senders?PageSize=100', {
    headers: auth,
  });
  if (!senders.error && senders.status === 200) {
    const list = asRecord(senders.body).senders;
    if (Array.isArray(list)) {
      const wa = list.filter((s) => String(asRecord(s).sender_id ?? '').startsWith('whatsapp:'));
      sendersText = `${wa.length} registered WhatsApp sender${wa.length === 1 ? '' : 's'}`;
    }
  } else if (!senders.error) {
    sendersText = `senders list unavailable (${statusClass(senders.status)})`;
  }

  const from = await getIntegrationSetting('twilio', 'whatsapp_from');
  const fromText = from ? 'whatsapp_from set' : 'whatsapp_from NOT set';
  return { ok: true, detail: `${balanceText}; ${sendersText}; ${fromText}.` };
}

async function testToast(): Promise<TestOutcome> {
  const clientId = await getIntegrationSetting('toast', 'client_id');
  const clientSecret = await getIntegrationSetting('toast', 'client_secret');
  const gap = missing(['toast.client_id', clientId], ['toast.client_secret', clientSecret]);
  if (gap) return { ok: false, detail: gap };

  const hostname = (await getIntegrationSetting('toast', 'hostname')) ?? 'ws-api.toasttab.com';
  const res = await timedFetch(`https://${hostname}/authentication/v1/authentication/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret, userAccessType: 'TOAST_MACHINE_CLIENT' }),
  });
  if (res.error) return { ok: false, detail: `Toast (${hostname}) unreachable — ${res.error}` };

  if (res.status === 200) {
    const guid = await getIntegrationSetting('toast', 'restaurant_guid');
    const guidText = guid ? 'restaurant_guid set' : 'restaurant_guid NOT set';
    return { ok: true, detail: `Authenticated (200) — machine-client token issued; ${guidText}.` };
  }
  if (res.status === 401) {
    return { ok: false, detail: 'Toast rejected the credentials (401) — check client_id / client_secret.' };
  }
  return { ok: false, detail: `Toast login failed — ${statusClass(res.status)}.` };
}

async function testMarginEdge(): Promise<TestOutcome> {
  const apiKey = await getIntegrationSetting('marginedge', 'api_key');
  const gap = missing(['marginedge.api_key', apiKey]);
  if (gap) return { ok: false, detail: gap };

  const res = await timedFetch('https://api.marginedge.com/public/restaurantUnits', {
    headers: { 'X-API-KEY': apiKey as string },
  });
  if (res.error) return { ok: false, detail: `MarginEdge unreachable — ${res.error}` };
  if (res.status === 200) {
    const body = res.body;
    const units = Array.isArray(body)
      ? body.length
      : Array.isArray(asRecord(body).restaurantUnits)
        ? (asRecord(body).restaurantUnits as unknown[]).length
        : null;
    return {
      ok: true,
      detail: units === null ? 'API key accepted (200).' : `API key accepted — ${units} restaurant unit${units === 1 ? '' : 's'} visible.`,
    };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, detail: `MarginEdge rejected the API key (${res.status}).` };
  }
  return { ok: false, detail: `MarginEdge check failed — ${statusClass(res.status)}.` };
}

async function testStripe(): Promise<TestOutcome> {
  const secretKey = await getIntegrationSetting('stripe', 'secret_key');
  const gap = missing(['stripe.secret_key', secretKey]);
  if (gap) return { ok: false, detail: gap };

  const res = await timedFetch('https://api.stripe.com/v1/account', {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (res.error) return { ok: false, detail: `Stripe unreachable — ${res.error}` };
  const data = asRecord(res.body);
  if (res.status === 200) {
    return {
      ok: true,
      detail: `Account ${String(data.id ?? '?')} — charges_enabled=${String(data.charges_enabled ?? '?')}.`,
    };
  }
  // Stripe error messages can echo a partially-masked copy of the key
  // ("Invalid API Key provided: sk_test_****…") — strip anything key-shaped
  // so no fragment of a credential ever reaches the client.
  const message = asRecord(data.error).message;
  const sanitized =
    typeof message === 'string'
      ? message.replace(/\b[a-z]{2,8}_(?:live_|test_)?[A-Za-z0-9*…]{8,}/g, '[key redacted]')
      : null;
  return {
    ok: false,
    detail: `Stripe rejected the key — ${sanitized ?? statusClass(res.status)}`,
  };
}

async function testResend(): Promise<TestOutcome> {
  const apiKey = await getIntegrationSetting('resend', 'api_key');
  const gap = missing(['resend.api_key', apiKey]);
  if (gap) return { ok: false, detail: gap };

  const res = await timedFetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.error) return { ok: false, detail: `Resend unreachable — ${res.error}` };
  if (res.status === 200) {
    const list = asRecord(res.body).data;
    const count = Array.isArray(list) ? list.length : 0;
    return { ok: true, detail: `API key accepted — ${count} verified domain${count === 1 ? '' : 's'}.` };
  }
  return { ok: false, detail: `Resend rejected the key — ${statusClass(res.status)}.` };
}

const TESTS: Record<TestProvider, () => Promise<TestOutcome>> = {
  slack: testSlack,
  twilio_whatsapp: testTwilioWhatsApp,
  toast: testToast,
  marginedge: testMarginEdge,
  stripe: testStripe,
  resend: testResend,
};

// ---------- POST ----------

export async function POST(req: Request): Promise<Response> {
  if (isDemoSession(req)) {
    return json({ ok: false, readOnly: true, error: 'Demo sessions are read-only.' }, 403);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400);
  }
  const provider = String(asRecord(raw).provider ?? '').trim().toLowerCase();
  if (!(TEST_PROVIDERS as readonly string[]).includes(provider)) {
    return json({ ok: false, error: `provider must be one of: ${TEST_PROVIDERS.join(', ')}.` }, 400);
  }

  try {
    const outcome = await TESTS[provider as TestProvider]();
    return json({ ...outcome, provider, checkedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[settings-test] unexpected error', provider, err);
    return json({
      ok: false,
      provider,
      detail: 'Internal error running the connection test.',
      checkedAt: new Date().toISOString(),
    });
  }
}
