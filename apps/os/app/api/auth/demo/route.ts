// ============================================================
// POST /api/auth/demo — start a read-only demo session.
// Sets viox-demo=1 (httpOnly, 7 days); the middleware treats it
// as a pass so prospects can tour the fixture-backed UI without
// an account. No GoTrue involvement.
// ============================================================

import { appendDemoCookie, json } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  const headers = new Headers();
  appendDemoCookie(headers);
  return json({ ok: true }, 200, headers);
}
