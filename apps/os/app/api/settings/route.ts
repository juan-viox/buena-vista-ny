// ============================================================
// /api/settings — integration credential vault (OS).
//
//   GET ?provider=slack|twilio|toast|marginedge|stripe|resend
//     → { ok, provider, readOnly, storage, entries:[{key,hint,updatedAt}],
//         keys:[{key,envVar,envConfigured}] }   — hints only, never values.
//   PUT { provider, entries: { key: value, … } }
//     → save each non-empty value encrypted; { ok, saved:[…], errors:{…} }
//     Writes are owner/gm-gated (requireManagerForMutation): demo
//     sessions → 403 { readOnly:true }; with AUTH_REQUIRED=1 any
//     non-owner/gm role → 403.
//   DELETE { provider, key } → remove one saved row (env fallback,
//     if any, takes over); same owner/gm + demo gate.
//   Writes without SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
//     INTEGRATION_SETTINGS_KEY → 503 { ok:false, reason:'not configured' }.
//
// Auth: the middleware gates this route (AUTH_REQUIRED); demo
// sessions pass the middleware, so the write handlers re-check the
// viox-demo cookie themselves. All storage access is server-side
// via the service role inside @viox/integrations settings helpers.
// ============================================================

import {
  PROVIDER_ENV_MAP,
  deleteIntegrationSetting,
  isSettingsCryptoConfigured,
  isSettingsStoreConfigured,
  knownSettingsKeys,
  knownSettingsProviders,
  listIntegrationSettings,
  setIntegrationSetting,
} from '@viox/integrations';
import {
  ACCESS_COOKIE,
  DEMO_COOKIE,
  authTarget,
  fetchGotrueUser,
  json,
  requireManagerForMutation,
} from '../auth/_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------- request helpers ----------

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('=') || '');
  }
  return null;
}

/** Demo-bypass session — read-only everywhere in the settings API. */
function isDemoSession(req: Request): boolean {
  return readCookie(req, DEMO_COOKIE) === '1';
}

/** Best-effort author for updated_by: session email, else a fixed tag. */
async function resolveUpdatedBy(req: Request): Promise<string> {
  const access = readCookie(req, ACCESS_COOKIE);
  const target = authTarget();
  if (access && target) {
    const user = await fetchGotrueUser(target, access);
    if (user?.email) return user.email;
  }
  return 'os-dashboard';
}

function validProvider(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const provider = value.trim().toLowerCase();
  return knownSettingsProviders().includes(provider) ? provider : null;
}

// ---------- GET — hints only ----------

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const provider = validProvider(url.searchParams.get('provider'));
  if (!provider) {
    return json(
      { ok: false, error: `provider must be one of: ${knownSettingsProviders().join(', ')}.` },
      400,
    );
  }

  const entries = await listIntegrationSettings(provider);
  const keys = knownSettingsKeys(provider).map((key) => {
    const envVar = PROVIDER_ENV_MAP[`${provider}.${key}`];
    return { key, envVar, envConfigured: Boolean(envVar && process.env[envVar]) };
  });

  return json({
    ok: true,
    provider,
    readOnly: isDemoSession(req),
    storage: isSettingsStoreConfigured() ? 'supabase' : 'unconfigured',
    entries,
    keys,
  });
}

// ---------- PUT — save entries ----------

export async function PUT(req: Request): Promise<Response> {
  const denied = await requireManagerForMutation(req);
  if (denied) return denied;
  if (!isSettingsStoreConfigured() || !isSettingsCryptoConfigured()) {
    return json(
      {
        ok: false,
        reason: 'not configured',
        error:
          'Settings vault not configured — set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and INTEGRATION_SETTINGS_KEY. Credentials keep falling back to env vars meanwhile.',
      },
      503,
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400);
  }
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const provider = validProvider(body.provider);
  if (!provider) {
    return json(
      { ok: false, error: `provider must be one of: ${knownSettingsProviders().join(', ')}.` },
      400,
    );
  }
  const entries =
    body.entries && typeof body.entries === 'object' && !Array.isArray(body.entries)
      ? (body.entries as Record<string, unknown>)
      : null;
  if (!entries) return json({ ok: false, error: 'entries must be an object of { key: value }.' }, 400);

  const allowedKeys = new Set(knownSettingsKeys(provider));
  const updatedBy = await resolveUpdatedBy(req);

  const saved: string[] = [];
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (typeof value !== 'string' || value.trim() === '') continue; // skip empty — keep existing
    if (!allowedKeys.has(key)) {
      errors[key] = `Unknown ${provider} setting.`;
      continue;
    }
    const result = await setIntegrationSetting(provider, key, value.trim(), updatedBy);
    if (result.ok) saved.push(key);
    else errors[key] = result.error ?? 'Save failed.';
  }

  const ok = Object.keys(errors).length === 0;
  return json({ ok, provider, saved, ...(ok ? {} : { errors }) }, ok ? 200 : 502);
}

// ---------- DELETE — remove one saved row ----------

export async function DELETE(req: Request): Promise<Response> {
  const denied = await requireManagerForMutation(req);
  if (denied) return denied;
  if (!isSettingsStoreConfigured()) {
    return json(
      {
        ok: false,
        reason: 'not configured',
        error: 'Settings vault not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      },
      503,
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400);
  }
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const provider = validProvider(body.provider);
  if (!provider) {
    return json(
      { ok: false, error: `provider must be one of: ${knownSettingsProviders().join(', ')}.` },
      400,
    );
  }
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key || !knownSettingsKeys(provider).includes(key)) {
    return json({ ok: false, error: `key must be one of: ${knownSettingsKeys(provider).join(', ')}.` }, 400);
  }

  const result = await deleteIntegrationSetting(provider, key);
  if (!result.ok) return json({ ok: false, error: result.error ?? 'Delete failed.' }, 502);
  return json({ ok: true, provider, key });
}
