// ============================================================
// POST /api/auth/magic — email a magic sign-in link.
//   { email } → GoTrue /magiclink?redirect_to=<origin>/api/auth/callback
// Always answers { ok:true } on accepted requests so the form
// can't be used to enumerate which emails have accounts.
// NOTE: <origin>/api/auth/callback must be in the Supabase
// auth redirect allow-list for the link to land back here.
// ============================================================

import { authTarget, gotrueError, json } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const target = authTarget();
  if (!target) return json({ ok: false, error: 'Auth is not configured on this deployment.' }, 503);

  let body: { email?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email) return json({ ok: false, error: 'Email is required.' }, 400);

  const redirectTo = `${new URL(req.url).origin}/api/auth/callback`;

  let res: Response;
  try {
    res = await fetch(`${target.base}/magiclink?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: 'POST',
      headers: { apikey: target.anon, 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
      cache: 'no-store',
    });
  } catch {
    return json({ ok: false, error: 'Could not reach the auth service.' }, 502);
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as unknown;
    // Rate limits and config errors are worth surfacing; user-existence is not.
    if (res.status === 429) return json({ ok: false, error: 'Too many requests — try again in a minute.' }, 429);
    if (res.status >= 500) return json({ ok: false, error: gotrueError(data, 'Auth service error.') }, 502);
  }

  return json({ ok: true });
}
