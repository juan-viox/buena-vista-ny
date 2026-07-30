// ============================================================
// POST /api/auth/login — email + password sign-in.
//   { email, password } → GoTrue /token?grant_type=password
//   200 → sets sb-access + sb-refresh httpOnly cookies, { ok }
//   4xx → { ok:false, error } (never leaks GoTrue internals)
// ============================================================

import { appendSessionCookies, authTarget, gotrueError, json } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const target = authTarget();
  if (!target) return json({ ok: false, error: 'Auth is not configured on this deployment.' }, 503);

  let body: { email?: unknown; password?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return json({ ok: false, error: 'Email and password are required.' }, 400);

  let res: Response;
  try {
    res = await fetch(`${target.base}/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: target.anon, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch {
    return json({ ok: false, error: 'Could not reach the auth service.' }, 502);
  }

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!res.ok || !data.access_token || !data.refresh_token) {
    const msg = res.status === 400 ? 'Invalid email or password.' : gotrueError(data, 'Sign-in failed.');
    return json({ ok: false, error: msg }, 401);
  }

  const headers = new Headers();
  appendSessionCookies(headers, data.access_token, data.refresh_token, data.expires_in);
  return json({ ok: true }, 200, headers);
}
