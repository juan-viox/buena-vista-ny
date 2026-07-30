// ============================================================
// Auth gate — VioX AI OS.
// FLAG-OFF SAFETY: unless AUTH_REQUIRED=1 is set, this is a
// no-op (first line returns) and the app behaves exactly as
// today. When on:
//   1. public paths (/login, /api/auth/*, webhook routes that
//      carry their own secrets, /api/public/*) pass through
//   2. viox-demo=1 cookie → pass (read-only demo session)
//   3. sb-access cookie → validated against GoTrue /auth/v1/user
//      with a 60s in-memory cache; expired sessions try one
//      silent refresh via sb-refresh before giving up
//   4. otherwise → pages redirect to /login?next=…, API routes
//      get 401 JSON.
// ============================================================

import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_COOKIE = 'sb-access';
const REFRESH_COOKIE = 'sb-refresh';
const DEMO_COOKIE = 'viox-demo';

/** Paths that must stay reachable without a session (webhooks carry
 * their own shared-secret checks inside the route handlers). */
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth',
  '/api/voice',
  '/api/whatsapp',
  '/api/email/inbound',
  '/api/slack',
  '/api/briefing', // cron webhook — carries its own CRON_SECRET check
  '/api/sms/send',
  '/api/automations/run',
  '/api/public',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function authEnv(): { base: string; anon: string } | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { base: `${url.replace(/\/+$/, '')}/auth/v1`, anon };
}

// ---- 60s in-memory token validation cache (per server instance) ----
const VALIDATION_TTL_MS = 60_000;
const CACHE_MAX = 500;
const tokenCache = new Map<string, { ok: boolean; exp: number }>();

async function isValidAccessToken(token: string): Promise<boolean> {
  const now = Date.now();
  const hit = tokenCache.get(token);
  if (hit && hit.exp > now) return hit.ok;

  const env = authEnv();
  if (!env) return false; // AUTH_REQUIRED=1 without Supabase env → fail closed

  try {
    const res = await fetch(`${env.base}/user`, {
      headers: { apikey: env.anon, authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const ok = res.ok;
    if (tokenCache.size >= CACHE_MAX) tokenCache.clear(); // crude but bounded
    tokenCache.set(token, { ok, exp: now + VALIDATION_TTL_MS });
    return ok;
  } catch {
    return false; // transient network error: don't cache, fail closed
  }
}

async function refreshSession(
  refreshToken: string,
): Promise<{ access: string; refresh: string; expiresIn: number } | null> {
  const env = authEnv();
  if (!env) return null;
  try {
    const res = await fetch(`${env.base}/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: env.anon, 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!data.access_token || !data.refresh_token) return null;
    return { access: data.access_token, refresh: data.refresh_token, expiresIn: data.expires_in ?? 3600 };
  } catch {
    return null;
  }
}

const cookieOpts = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
};

export async function middleware(req: NextRequest): Promise<NextResponse> {
  // FLAG-OFF: with no new env vars set, the gate does not exist.
  if (process.env.AUTH_REQUIRED !== '1') return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // Read-only demo session.
  if (req.cookies.get(DEMO_COOKIE)?.value === '1') return NextResponse.next();

  // Real session: validate the access token (cached 60s).
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  if (access && (await isValidAccessToken(access))) return NextResponse.next();

  // Access token missing/expired — try one silent refresh.
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    const fresh = await refreshSession(refresh);
    if (fresh) {
      const res = NextResponse.next();
      res.cookies.set(ACCESS_COOKIE, fresh.access, { ...cookieOpts, maxAge: Math.floor(fresh.expiresIn) });
      res.cookies.set(REFRESH_COOKIE, fresh.refresh, { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 });
      tokenCache.set(fresh.access, { ok: true, exp: Date.now() + VALIDATION_TTL_MS });
      return res;
    }
  }

  // No session: APIs get 401, pages go to /login.
  if (pathname.startsWith('/api/')) {
    return new NextResponse(JSON.stringify({ ok: false, error: 'Authentication required.' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const login = req.nextUrl.clone();
  login.pathname = '/login';
  login.search = pathname !== '/' ? `?next=${encodeURIComponent(pathname + req.nextUrl.search)}` : '';
  return NextResponse.redirect(login);
}

export const config = {
  // Skip Next internals + static assets; everything else flows through
  // (and immediately passes when AUTH_REQUIRED is unset).
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpe?g|svg|gif|webp|avif|ico|txt|xml|mp4|webm|woff2?|ttf|otf|map)$).*)',
  ],
};
