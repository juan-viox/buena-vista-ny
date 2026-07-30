// ============================================================
// POST /api/auth/session — exchange magic-link hash tokens for
// httpOnly session cookies. The callback page posts
// { access_token, refresh_token }; we validate the access token
// against GoTrue /user before trusting it, then set cookies.
// ============================================================

import { appendSessionCookies, authTarget, fetchGotrueUser, json } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const target = authTarget();
  if (!target) return json({ ok: false, error: 'Auth is not configured on this deployment.' }, 503);

  let body: { access_token?: unknown; refresh_token?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }

  const access = typeof body.access_token === 'string' ? body.access_token : '';
  const refresh = typeof body.refresh_token === 'string' ? body.refresh_token : '';
  if (!access || !refresh) return json({ ok: false, error: 'Both tokens are required.' }, 400);

  const user = await fetchGotrueUser(target, access);
  if (!user) return json({ ok: false, error: 'The sign-in link is invalid or has expired.' }, 401);

  const headers = new Headers();
  appendSessionCookies(headers, access, refresh);
  return json({ ok: true }, 200, headers);
}
