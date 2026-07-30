// ============================================================
// Shared helpers for /api/auth/* — Supabase GoTrue via plain
// fetch (no SDK). Cookie/session design:
//   sb-access  — GoTrue access JWT. httpOnly, Lax, Path=/,
//                Max-Age = expires_in (~1h), Secure in prod.
//   sb-refresh — GoTrue refresh token. Same flags, 30 days.
//   viox-demo  — "1" = read-only demo session. 7 days.
// Env: SUPABASE_URL (preferred — matches the rest of this repo;
// NEXT_PUBLIC_SUPABASE_URL also accepted but note getRepository()
// treats it as the driver switch) + NEXT_PUBLIC_SUPABASE_ANON_KEY.
// With neither set, every route degrades to a clear 503 and the
// apps behave exactly as today (flag-off safety).
// ============================================================

export const ACCESS_COOKIE = 'sb-access';
export const REFRESH_COOKIE = 'sb-refresh';
export const DEMO_COOKIE = 'viox-demo';

export const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const DEMO_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
export const DEFAULT_ACCESS_MAX_AGE = 3600; // GoTrue default expires_in

export interface AuthTarget {
  /** e.g. https://xyz.supabase.co/auth/v1 */
  base: string;
  anon: string;
}

export function authTarget(): AuthTarget | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return { base: `${url.replace(/\/+$/, '')}/auth/v1`, anon };
}

export function json(body: unknown, status = 200, headers?: Headers): Response {
  const h = headers ?? new Headers();
  h.set('content-type', 'application/json; charset=utf-8');
  h.set('cache-control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers: h });
}

function cookieStr(name: string, value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function appendSessionCookies(
  h: Headers,
  accessToken: string,
  refreshToken: string,
  expiresIn?: number,
): void {
  const accessMaxAge =
    typeof expiresIn === 'number' && expiresIn > 0 ? Math.floor(expiresIn) : DEFAULT_ACCESS_MAX_AGE;
  h.append('set-cookie', cookieStr(ACCESS_COOKIE, accessToken, accessMaxAge));
  h.append('set-cookie', cookieStr(REFRESH_COOKIE, refreshToken, REFRESH_MAX_AGE));
}

export function appendDemoCookie(h: Headers): void {
  h.append('set-cookie', cookieStr(DEMO_COOKIE, '1', DEMO_MAX_AGE));
}

export function appendClearedSessionCookies(h: Headers): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, DEMO_COOKIE]) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    h.append('set-cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  }
}

/** Best-effort human message out of a GoTrue error body. */
export function gotrueError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    for (const key of ['error_description', 'msg', 'message', 'error']) {
      if (typeof b[key] === 'string' && b[key]) return b[key] as string;
    }
  }
  return fallback;
}

/** GET /auth/v1/user — returns the user object when the token is valid, else null. */
export async function fetchGotrueUser(
  target: AuthTarget,
  accessToken: string,
): Promise<{ email?: string } | null> {
  try {
    const res = await fetch(`${target.base}/user`, {
      headers: { apikey: target.anon, authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as { email?: string };
  } catch {
    return null;
  }
}
