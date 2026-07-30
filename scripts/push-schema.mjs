#!/usr/bin/env node
// ============================================================
// push-schema.mjs — pushes packages/db/schema.sql to the
// Supabase project via the Management API (plain fetch, no SDK).
//
//   node scripts/push-schema.mjs --dry     # validate only (no network)
//   node scripts/push-schema.mjs --apply   # actually run the DDL
//
// Default is DRY. The schema is additive-only (`create table if
// not exists` / `create index if not exists`) — the script refuses
// to run any file containing DROP TABLE/SCHEMA/DATABASE or
// TRUNCATE, so the LIVE production tables (guests,
// reservation_requests, waitlist, sms_log, email_log,
// whatsapp_messages) can never be dropped by this path.
//
// Auth: SUPABASE_ACCESS_TOKEN env, else ~/.supabase/access-token.
// Project: SUPABASE_PROJECT_REF env, else saxhlzmgsrqsjhknkurc.
// ============================================================

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = join(ROOT, 'packages', 'db', 'schema.sql');
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'saxhlzmgsrqsjhknkurc';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
if (!apply && !args.has('--dry')) {
  console.log('[push-schema] no mode flag given — defaulting to --dry (use --apply to run the DDL).');
}

function readToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const file = join(homedir(), '.supabase', 'access-token');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  return null;
}

// ---- load + guard the schema ----
const sql = readFileSync(SCHEMA_PATH, 'utf8');

const destructive = sql.match(/\b(drop\s+(table|schema|database)|truncate)\b/i);
if (destructive) {
  console.error(`[push-schema] REFUSING: schema.sql contains a destructive statement: "${destructive[0]}"`);
  process.exit(1);
}

const tables = [...sql.matchAll(/create table if not exists\s+([\w.]+)/gi)].map((m) => m[1]);
const indexes = [...sql.matchAll(/create index if not exists\s+(\w+)/gi)].length;
const liveTables = ['guests', 'reservation_requests', 'waitlist', 'sms_log', 'email_log', 'whatsapp_messages'];
const collisions = tables.filter((t) => liveTables.includes(t.replace(/^public\./, '')));

console.log(`[push-schema] project: ${PROJECT_REF}`);
console.log(`[push-schema] schema:  ${SCHEMA_PATH} (${sql.length.toLocaleString()} bytes)`);
console.log(`[push-schema] tables:  ${tables.length} (all "if not exists"), indexes: ${indexes}`);
if (collisions.length) {
  console.log(
    `[push-schema] note: ${collisions.join(', ')} already exist in prod with a different (live) shape — ` +
      `"if not exists" leaves them untouched.`,
  );
}

const token = readToken();
console.log(`[push-schema] token:   ${token ? 'found' : 'MISSING (set SUPABASE_ACCESS_TOKEN or ~/.supabase/access-token)'}`);

if (!apply) {
  console.log('[push-schema] DRY RUN — nothing sent. Re-run with --apply to push.');
  process.exit(0);
}

if (!token) {
  console.error('[push-schema] cannot apply without an access token.');
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const body = await res.text();
if (!res.ok) {
  console.error(`[push-schema] FAILED ${res.status}: ${body.slice(0, 800)}`);
  process.exit(1);
}
console.log(`[push-schema] applied OK (${res.status}). Response: ${body.slice(0, 300)}`);
