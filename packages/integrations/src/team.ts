// ============================================================
// Team management — server-only helpers over Supabase GoTrue
// admin API + the public.users roster table (plain fetch, no
// SDK, service role only — NEVER import from client code).
//
//   listTeam()        — GoTrue admin users ⋈ public.users by
//                       email → unified roster. DB rows with no
//                       auth match are 'demo-fixture' personas.
//   inviteUser()      — POST /auth/v1/invite (GoTrue sends the
//                       email via the configured SMTP/Resend) +
//                       upsert the public.users row.
//   updateRole()      — PATCH auth user_metadata.role + users row.
//   deactivateUser()  — ban 876000h (~100y). Never hard-deletes.
//   reactivateUser()  — ban_duration 'none'.
//   callerRole()      — resolve the calling session's role from
//                       the sb-access cookie (viox-demo → 'demo').
//
// One login covers both apps (OS + CRM): they share the same
// Supabase project, so a single GoTrue identity signs into both.
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Missing either
// degrades to clear { ok:false } results — flag-off safety.
// ============================================================

import { DEFAULT_TENANT_SLUG } from './settings';

// ---------- types ----------

export const TEAM_ROLES = ['owner', 'gm', 'chef', 'events', 'marketing', 'staff'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === 'string' && (TEAM_ROLES as readonly string[]).includes(value);
}

/** Real auth account states + display-only fixture personas. */
export type TeamStatus = 'active' | 'invited' | 'deactivated' | 'demo-fixture';

export interface TeamMember {
  /** GoTrue uid for real accounts; public.users id for fixtures. */
  id: string;
  email: string;
  name: string;
  role: TeamRole;
  status: TeamStatus;
  /** ISO timestamp of the last sign-in, or null. */
  lastSignIn: string | null;
  /** One identity signs into both OS and CRM. */
  apps: 'both';
}

export interface TeamResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

// ---------- plumbing ----------

interface ServiceTarget {
  /** e.g. https://xyz.supabase.co (no trailing slash) */
  url: string;
  key: string;
}

function serviceTarget(): ServiceTarget | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

function serviceHeaders(t: ServiceTarget): Record<string, string> {
  return { apikey: t.key, Authorization: `Bearer ${t.key}`, 'Content-Type': 'application/json' };
}

const NOT_CONFIGURED = 'Team management not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.';

/** Loose email shape check (full validation belongs to GoTrue). */
export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

// ---------- tenant lookup (cached per server instance) ----------

let tenantCache: { slug: string; id: string; exp: number } | null = null;

async function tenantIdBySlug(slug: string): Promise<string | null> {
  const now = Date.now();
  if (tenantCache && tenantCache.slug === slug && tenantCache.exp > now) return tenantCache.id;
  const t = serviceTarget();
  if (!t) return null;
  try {
    const res = await fetch(
      `${t.url}/rest/v1/tenants?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`,
      { headers: serviceHeaders(t), cache: 'no-store' },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => [])) as Array<{ id?: string }>;
    const id = Array.isArray(rows) ? rows[0]?.id : undefined;
    if (!id) return null;
    tenantCache = { slug, id, exp: now + 5 * 60_000 };
    return id;
  } catch {
    return null;
  }
}

// ---------- GoTrue admin shapes ----------

interface GotrueAdminUser {
  id: string;
  email?: string;
  last_sign_in_at?: string | null;
  invited_at?: string | null;
  banned_until?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

interface DbUserRow {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

async function listGotrueUsers(t: ServiceTarget): Promise<GotrueAdminUser[] | null> {
  try {
    const res = await fetch(`${t.url}/auth/v1/admin/users?page=1&per_page=1000`, {
      headers: serviceHeaders(t),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('[team] admin users list failed', res.status);
      return null;
    }
    const body = (await res.json().catch(() => null)) as { users?: GotrueAdminUser[] } | GotrueAdminUser[] | null;
    if (Array.isArray(body)) return body;
    if (body && Array.isArray(body.users)) return body.users;
    return [];
  } catch (err) {
    console.error('[team] admin users list error', err);
    return null;
  }
}

async function listDbUsers(t: ServiceTarget, tenantSlug: string): Promise<DbUserRow[]> {
  try {
    const tenantId = await tenantIdBySlug(tenantSlug);
    const filter = tenantId ? `tenant_id=eq.${encodeURIComponent(tenantId)}&` : '';
    const res = await fetch(`${t.url}/rest/v1/users?${filter}select=id,name,email,role&order=name.asc`, {
      headers: serviceHeaders(t),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('[team] users table read failed', res.status);
      return [];
    }
    const rows = (await res.json().catch(() => [])) as DbUserRow[];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error('[team] users table read error', err);
    return [];
  }
}

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = meta?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function authStatus(u: GotrueAdminUser): TeamStatus {
  if (u.banned_until && Date.parse(u.banned_until) > Date.now()) return 'deactivated';
  if (!u.last_sign_in_at) return 'invited';
  return 'active';
}

// ---------- listTeam ----------

const STATUS_ORDER: Record<TeamStatus, number> = { active: 0, invited: 1, deactivated: 2, 'demo-fixture': 3 };

/**
 * Unified roster: every GoTrue account (merged with its users-table
 * row by email) plus users-table rows with no auth match, flagged
 * 'demo-fixture' (display-only until invited for real).
 */
export async function listTeam(
  tenantSlug: string = DEFAULT_TENANT_SLUG,
): Promise<TeamResult<TeamMember[]>> {
  const t = serviceTarget();
  if (!t) return { ok: false, error: NOT_CONFIGURED };

  const [authUsers, dbUsers] = await Promise.all([listGotrueUsers(t), listDbUsers(t, tenantSlug)]);
  if (authUsers === null) return { ok: false, error: 'Could not reach the Supabase auth admin API.' };

  const dbByEmail = new Map<string, DbUserRow>();
  for (const row of dbUsers) {
    if (row.email) dbByEmail.set(row.email.toLowerCase(), row);
  }

  const members: TeamMember[] = [];
  const matchedEmails = new Set<string>();

  for (const u of authUsers) {
    if (!u.email) continue;
    const emailLc = u.email.toLowerCase();
    matchedEmails.add(emailLc);
    const row = dbByEmail.get(emailLc);
    const metaRole = metaString(u.user_metadata, 'role');
    const role: TeamRole = isTeamRole(row?.role) ? row!.role as TeamRole : isTeamRole(metaRole) ? metaRole : 'staff';
    members.push({
      id: u.id,
      email: u.email,
      name: row?.name?.trim() || metaString(u.user_metadata, 'name') || u.email,
      role,
      status: authStatus(u),
      lastSignIn: u.last_sign_in_at ?? null,
      apps: 'both',
    });
  }

  // users-table rows never invited into auth → demo fixtures.
  for (const row of dbUsers) {
    const emailLc = row.email?.toLowerCase();
    if (!emailLc || matchedEmails.has(emailLc)) continue;
    members.push({
      id: row.id,
      email: row.email as string,
      name: row.name?.trim() || (row.email as string),
      role: isTeamRole(row.role) ? row.role : 'staff',
      status: 'demo-fixture',
      lastSignIn: null,
      apps: 'both',
    });
  }

  members.sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name),
  );
  return { ok: true, data: members };
}

// ---------- inviteUser ----------

export interface InviteUserInput {
  email: string;
  name: string;
  role: TeamRole;
  /** Where GoTrue lands the invite link — that app's /login. */
  redirectTo: string;
  tenantSlug?: string;
}

export interface InviteUserOutcome {
  ok: boolean;
  error?: string;
  invited?: { id: string; email: string; name: string; role: TeamRole; status: 'invited' };
}

/**
 * Send a GoTrue invite email (service role) and upsert the matching
 * public.users row (id = auth uid) so app-level role checks resolve.
 */
export async function inviteUser(input: InviteUserInput): Promise<InviteUserOutcome> {
  const t = serviceTarget();
  if (!t) return { ok: false, error: NOT_CONFIGURED };
  if (!isValidEmail(input.email)) return { ok: false, error: 'Enter a valid email address.' };
  if (!isTeamRole(input.role)) return { ok: false, error: `role must be one of: ${TEAM_ROLES.join(', ')}.` };
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim() || email;

  let uid: string | null = null;
  try {
    const res = await fetch(
      `${t.url}/auth/v1/invite?redirect_to=${encodeURIComponent(input.redirectTo)}`,
      {
        method: 'POST',
        headers: serviceHeaders(t),
        body: JSON.stringify({ email, data: { name, role: input.role } }),
        cache: 'no-store',
      },
    );
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        typeof body.msg === 'string' ? body.msg
        : typeof body.error_description === 'string' ? body.error_description
        : typeof body.message === 'string' ? body.message
        : `Invite failed (HTTP ${res.status}).`;
      return { ok: false, error: msg };
    }
    uid = typeof body.id === 'string' ? body.id : null;
  } catch (err) {
    console.error('[team] invite error', err);
    return { ok: false, error: 'Invite failed (network error).' };
  }
  if (!uid) return { ok: false, error: 'Invite sent but GoTrue returned no user id.' };

  // Upsert the roster row — (tenant_id, email) unique; a pre-seeded
  // demo-fixture row with the same email is absorbed (id → auth uid;
  // nothing references users.id, so the PK rewrite is safe).
  const tenantSlug = input.tenantSlug ?? DEFAULT_TENANT_SLUG;
  const tenantId = await tenantIdBySlug(tenantSlug);
  if (tenantId) {
    try {
      const res = await fetch(`${t.url}/rest/v1/users?on_conflict=tenant_id,email`, {
        method: 'POST',
        headers: { ...serviceHeaders(t), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          id: uid,
          tenant_id: tenantId,
          name,
          email,
          role: input.role,
          location_ids: [],
        }),
        cache: 'no-store',
      });
      if (!res.ok) console.error('[team] users upsert failed', res.status, await res.text().catch(() => ''));
    } catch (err) {
      console.error('[team] users upsert error', err);
    }
  }

  return { ok: true, invited: { id: uid, email, name, role: input.role, status: 'invited' } };
}

// ---------- updateRole ----------

export interface UpdateRoleInput {
  userId?: string;
  email?: string;
  role: TeamRole;
  tenantSlug?: string;
}

/** Find one auth user by id or (exact, case-insensitive) email. */
async function findGotrueUser(
  t: ServiceTarget,
  { userId, email }: { userId?: string; email?: string },
): Promise<GotrueAdminUser | null> {
  if (userId) {
    try {
      const res = await fetch(`${t.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        headers: serviceHeaders(t),
        cache: 'no-store',
      });
      if (res.ok) return (await res.json()) as GotrueAdminUser;
    } catch {
      /* fall through */
    }
    return null;
  }
  if (email) {
    const all = await listGotrueUsers(t);
    return all?.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  }
  return null;
}

async function putGotrueUser(
  t: ServiceTarget,
  uid: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch(`${t.url}/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
      method: 'PUT',
      headers: serviceHeaders(t),
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res.ok) console.error('[team] admin user update failed', uid, res.status);
    return res.ok;
  } catch (err) {
    console.error('[team] admin user update error', uid, err);
    return false;
  }
}

/**
 * Change a member's role: auth user_metadata.role (when an auth
 * account exists) + the public.users row. Works for demo-fixture
 * rows too (users table only).
 */
export async function updateRole(input: UpdateRoleInput): Promise<TeamResult<{ role: TeamRole }>> {
  const t = serviceTarget();
  if (!t) return { ok: false, error: NOT_CONFIGURED };
  if (!isTeamRole(input.role)) return { ok: false, error: `role must be one of: ${TEAM_ROLES.join(', ')}.` };
  if (!input.userId && !isValidEmail(input.email)) {
    return { ok: false, error: 'Provide userId or a valid email.' };
  }

  const authUser = await findGotrueUser(t, { userId: input.userId, email: input.email?.trim() });
  const email = (authUser?.email ?? input.email ?? '').trim().toLowerCase();

  let touchedAuth = false;
  if (authUser) {
    touchedAuth = await putGotrueUser(t, authUser.id, { user_metadata: { role: input.role } });
    if (!touchedAuth) return { ok: false, error: 'Could not update the auth account role.' };
  }

  let touchedDb = false;
  if (email) {
    const tenantId = await tenantIdBySlug(input.tenantSlug ?? DEFAULT_TENANT_SLUG);
    const tenantFilter = tenantId ? `tenant_id=eq.${encodeURIComponent(tenantId)}&` : '';
    try {
      const res = await fetch(
        `${t.url}/rest/v1/users?${tenantFilter}email=eq.${encodeURIComponent(email)}`,
        {
          method: 'PATCH',
          headers: { ...serviceHeaders(t), Prefer: 'return=minimal' },
          body: JSON.stringify({ role: input.role }),
          cache: 'no-store',
        },
      );
      touchedDb = res.ok;
      if (!res.ok) console.error('[team] users role patch failed', email, res.status);
    } catch (err) {
      console.error('[team] users role patch error', email, err);
    }
  }

  if (!touchedAuth && !touchedDb) return { ok: false, error: 'No matching team member found.' };
  return { ok: true, data: { role: input.role } };
}

// ---------- deactivate / reactivate ----------

/** ~100 years — GoTrue has no permanent flag; never hard-delete. */
const DEACTIVATE_BAN = '876000h';

export async function deactivateUser({ userId }: { userId: string }): Promise<TeamResult<null>> {
  const t = serviceTarget();
  if (!t) return { ok: false, error: NOT_CONFIGURED };
  if (!userId) return { ok: false, error: 'userId is required.' };
  const ok = await putGotrueUser(t, userId, { ban_duration: DEACTIVATE_BAN });
  return ok ? { ok: true, data: null } : { ok: false, error: 'Could not deactivate this account.' };
}

export async function reactivateUser({ userId }: { userId: string }): Promise<TeamResult<null>> {
  const t = serviceTarget();
  if (!t) return { ok: false, error: NOT_CONFIGURED };
  if (!userId) return { ok: false, error: 'userId is required.' };
  const ok = await putGotrueUser(t, userId, { ban_duration: 'none' });
  return ok ? { ok: true, data: null } : { ok: false, error: 'Could not reactivate this account.' };
}

// ---------- callerRole ----------

export type CallerRole = TeamRole | 'demo';

function cookieFromHeader(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('=') || '');
  }
  return null;
}

/**
 * Resolve the calling session's role from a raw Cookie header:
 * viox-demo=1 → 'demo' (always read-only); sb-access → GoTrue
 * /auth/v1/user → email → users-table role (fallback
 * user_metadata.role, fallback 'staff'); no valid session → null.
 */
export async function callerRoleFromCookieHeader(header: string | null): Promise<CallerRole | null> {
  if (cookieFromHeader(header, 'viox-demo') === '1') return 'demo';
  const access = cookieFromHeader(header, 'sb-access');
  if (!access) return null;
  const t = serviceTarget();
  if (!t) return null;

  let email: string | null = null;
  let metaRole: string | null = null;
  try {
    const res = await fetch(`${t.url}/auth/v1/user`, {
      headers: { apikey: t.key, Authorization: `Bearer ${access}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const user = (await res.json().catch(() => null)) as {
      email?: string;
      user_metadata?: Record<string, unknown>;
    } | null;
    if (!user) return null;
    email = typeof user.email === 'string' ? user.email : null;
    metaRole = metaString(user.user_metadata, 'role');
  } catch {
    return null;
  }

  if (email) {
    try {
      const res = await fetch(
        `${t.url}/rest/v1/users?email=eq.${encodeURIComponent(email.toLowerCase())}&select=role&limit=1`,
        { headers: serviceHeaders(t), cache: 'no-store' },
      );
      if (res.ok) {
        const rows = (await res.json().catch(() => [])) as Array<{ role?: string }>;
        const dbRole = Array.isArray(rows) ? rows[0]?.role : undefined;
        if (isTeamRole(dbRole)) return dbRole;
      }
    } catch {
      /* fall through to metadata */
    }
  }
  if (isTeamRole(metaRole)) return metaRole;
  return 'staff';
}

/** Request-flavored wrapper for API routes. */
export async function callerRole(request: Request): Promise<CallerRole | null> {
  return callerRoleFromCookieHeader(request.headers.get('cookie'));
}

/** Only owners and GMs may invite, change roles, or (de)activate. */
export function canManageTeam(role: CallerRole | null): boolean {
  return role === 'owner' || role === 'gm';
}
