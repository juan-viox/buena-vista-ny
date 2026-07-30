// ============================================================
// /api/auth/logout — end the session.
//   POST → clears sb-access, sb-refresh, viox-demo; { ok }
//   GET  → same, then 303 → /login (handy as a plain link)
// Best-effort revokes the refresh token at GoTrue too.
// ============================================================

import {
  ACCESS_COOKIE,
  appendClearedSessionCookies,
  authTarget,
  json,
} from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

async function revokeAtGotrue(req: Request): Promise<void> {
  const target = authTarget();
  const access = readCookie(req, ACCESS_COOKIE);
  if (!target || !access) return;
  try {
    await fetch(`${target.base}/logout`, {
      method: 'POST',
      headers: { apikey: target.anon, authorization: `Bearer ${access}` },
      cache: 'no-store',
    });
  } catch {
    /* cookie clearing below is what actually ends the app session */
  }
}

export async function POST(req: Request): Promise<Response> {
  await revokeAtGotrue(req);
  const headers = new Headers();
  appendClearedSessionCookies(headers);
  return json({ ok: true }, 200, headers);
}

export async function GET(req: Request): Promise<Response> {
  await revokeAtGotrue(req);
  const headers = new Headers();
  appendClearedSessionCookies(headers);
  headers.set('location', new URL('/login', req.url).toString());
  headers.set('cache-control', 'no-store');
  return new Response(null, { status: 303, headers });
}
