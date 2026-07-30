// ============================================================
// /api/team — team roster + management (identical wrapper in
// both OS and CRM; @viox/integrations/src/team does the work).
//
//   GET → { ok, team, callerRole, canManage, readOnly }
//     any authed or demo session (middleware is the gate).
//   POST { action:'invite', email, name, role }   → { ok, invited }
//   POST { action:'deactivate'|'reactivate', userId } → { ok }
//   PATCH { userId|email, role }                  → { ok, role }
//     writes require callerRole owner|gm → else 403; demo
//     sessions always 403 { readOnly:true }. Invite redirect
//     lands on THIS app's /login (same-origin).
// ============================================================

import {
  TEAM_ROLES,
  callerRole,
  canManageTeam,
  deactivateUser,
  inviteUser,
  isTeamRole,
  isValidEmail,
  listTeam,
  reactivateUser,
  updateRole,
} from '@viox/integrations/src/team';
import { json } from '../auth/_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Gate =
  | { ok: true; role: 'owner' | 'gm' }
  | { ok: false; response: Response };

/** Owner/GM gate for every write; demo always read-only 403. */
async function requireManager(req: Request): Promise<Gate> {
  const role = await callerRole(req);
  if (role === 'demo') {
    return { ok: false, response: json({ ok: false, readOnly: true, error: 'Demo sessions are read-only.' }, 403) };
  }
  if (!canManageTeam(role)) {
    return { ok: false, response: json({ ok: false, error: 'Only owners and GMs can manage the team.' }, 403) };
  }
  return { ok: true, role: role as 'owner' | 'gm' };
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw = (await req.json()) as unknown;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ---------- GET — roster ----------

export async function GET(req: Request): Promise<Response> {
  const role = await callerRole(req);
  const result = await listTeam();
  if (!result.ok) return json({ ok: false, error: result.error }, 503);
  return json({
    ok: true,
    team: result.data ?? [],
    callerRole: role,
    canManage: canManageTeam(role),
    readOnly: role === 'demo',
  });
}

// ---------- POST — invite | deactivate | reactivate ----------

export async function POST(req: Request): Promise<Response> {
  const gate = await requireManager(req);
  if (!gate.ok) return gate.response;

  const body = await readBody(req);
  if (!body) return json({ ok: false, error: 'Invalid JSON body.' }, 400);
  const action = typeof body.action === 'string' ? body.action : 'invite';

  if (action === 'deactivate' || action === 'reactivate') {
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId) return json({ ok: false, error: 'userId is required.' }, 400);
    const result = action === 'deactivate' ? await deactivateUser({ userId }) : await reactivateUser({ userId });
    if (!result.ok) return json({ ok: false, error: result.error }, 502);
    return json({ ok: true, action, userId });
  }

  if (action !== 'invite') {
    return json({ ok: false, error: 'action must be invite, deactivate or reactivate.' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!isValidEmail(email)) return json({ ok: false, error: 'Enter a valid email address.' }, 400);
  const role = body.role;
  if (!isTeamRole(role)) {
    return json({ ok: false, error: `role must be one of: ${TEAM_ROLES.join(', ')}.` }, 400);
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  // Invite lands on this app's own /login (same-origin).
  const redirectTo = `${new URL(req.url).origin}/login`;
  const result = await inviteUser({ email, name, role, redirectTo });
  if (!result.ok || !result.invited) return json({ ok: false, error: result.error }, 502);
  return json({ ok: true, invited: result.invited });
}

// ---------- PATCH — role change ----------

export async function PATCH(req: Request): Promise<Response> {
  const gate = await requireManager(req);
  if (!gate.ok) return gate.response;

  const body = await readBody(req);
  if (!body) return json({ ok: false, error: 'Invalid JSON body.' }, 400);

  const role = body.role;
  if (!isTeamRole(role)) {
    return json({ ok: false, error: `role must be one of: ${TEAM_ROLES.join(', ')}.` }, 400);
  }
  const userId = typeof body.userId === 'string' && body.userId.trim() ? body.userId.trim() : undefined;
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : undefined;
  if (!userId && !isValidEmail(email)) {
    return json({ ok: false, error: 'Provide userId or a valid email.' }, 400);
  }

  const result = await updateRole({ userId, email, role });
  if (!result.ok) return json({ ok: false, error: result.error }, 502);
  return json({ ok: true, role });
}
