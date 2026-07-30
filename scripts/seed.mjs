#!/usr/bin/env node
// ============================================================
// seed.mjs — seeds the OPS tables in Supabase from the demo
// fixture dataset (packages/db/src/fixtures), so the dashboards
// have rows to read once USE_SUPABASE_DATA flips. Also covers
// `reviews` (fixtures/reviews.ts) and `menu_items_live` (the
// scraped menu in fixtures/menus-live.json via menus-live.ts).
//
//   node scripts/seed.mjs --dry     # plan only (no network) — default
//   node scripts/seed.mjs --apply   # insert via the Management API
//
// SAFETY:
//   • The LIVE production tables (guests, reservation_requests,
//     waitlist, sms_log, email_log, whatsapp_messages) are NEVER
//     written. The fixture `guests` + `reservations` datasets are
//     therefore skipped entirely (the live `guests` table has a
//     different, tenant_slug-keyed shape).
//   • catering_events.guest_id is nulled (its fixture guest ids
//     are not seeded).
//   • Every insert is `on conflict do nothing` — re-runnable.
//
// Loads the TypeScript fixtures directly via Node's type
// stripping + a resolve hook for extensionless imports (no deps).
// Column lists are parsed from packages/db/schema.sql so rows
// always match the pushed schema.
// ============================================================

import { register } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---- resolve hook: let `import './types'` find './types.ts', and
// stamp `type: 'json'` import attributes so menus-live.ts's plain
// `import menusJson from './fixtures/menus-live.json'` loads under
// Node's type stripping (which otherwise requires the attribute). ----
// node 22.14-compatible loader via register(data:) — same behavior as the
// registerHooks version: json import attributes + extensionless .ts resolution.
const LOADER_SRC = `
export async function resolve(specifier, context, next) {
  try {
    const resolved = await next(specifier, context);
    if (resolved.url && resolved.url.endsWith('.json')) {
      return { ...resolved, importAttributes: { type: 'json' } };
    }
    return resolved;
  } catch (err) {
    if (specifier.startsWith('.') && !/\\.[a-z]+$/i.test(specifier)) {
      try { return await next(specifier + '.ts', context); } catch {}
      try { return await next(specifier + '/index.ts', context); } catch {}
    }
    throw err;
  }
}
`;
register('data:text/javascript,' + encodeURIComponent(LOADER_SRC));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'saxhlzmgsrqsjhknkurc';
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');

const F = await import(pathToFileURL(join(ROOT, 'packages', 'db', 'src', 'fixtures', 'index.ts')).href);
const ML = await import(pathToFileURL(join(ROOT, 'packages', 'db', 'src', 'menus-live.ts')).href);

// ---- schema-driven column allowlists ----
const schemaSql = readFileSync(join(ROOT, 'packages', 'db', 'schema.sql'), 'utf8');
const COLUMNS = {};
for (const m of schemaSql.matchAll(/create table if not exists\s+public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
  const cols = [];
  for (const line of m[2].split('\n')) {
    const cm = line.match(/^\s{2}(\w+)\s+/);
    if (cm && !['unique', 'check', 'primary', 'foreign', 'constraint'].includes(cm[1])) cols.push(cm[1]);
  }
  COLUMNS[m[1]] = cols;
}

// ---- value → SQL literal ----
function lit(v) {
  if (v === undefined || v === null) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'string')) {
      return v.length ? `array[${v.map((x) => lit(x)).join(',')}]::text[]` : `'{}'::text[]`;
    }
    return `${lit(JSON.stringify(v))}::jsonb`; // array of objects → jsonb
  }
  if (typeof v === 'object') return `${lit(JSON.stringify(v))}::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

const snake = (k) => k.replace(/([A-Z])/g, '_$1').toLowerCase();

/** camelCase row → snake_case row filtered to the table's schema columns. */
function toRow(table, obj, extra = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[snake(k)] = v;
  Object.assign(out, extra);
  const cols = COLUMNS[table];
  if (!cols) throw new Error(`no schema columns parsed for table "${table}"`);
  const row = {};
  for (const c of cols) if (c in out) row[c] = out[c];
  return row;
}

function insertSql(table, rows) {
  if (rows.length === 0) return null;
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const values = rows.map((r) => `(${cols.map((c) => lit(r[c])).join(',')})`).join(',\n');
  return `insert into public.${table} (${cols.join(',')})\nvalues\n${values}\non conflict do nothing;`;
}

// ---- build the plan (ops tables only — live tables untouched) ----
const T = F.TENANT;
const tid = T.id;
const plan = []; // [table, rows[]]

plan.push(['tenants', [toRow('tenants', {
  id: T.id, slug: T.slug, name: T.name, createdAt: T.createdAt,
  theme_accent: T.theme.accent, theme_primary: T.theme.primary, theme_logo_text: T.theme.logoText,
})]]);
plan.push(['locations', F.LOCATIONS.map((x) => toRow('locations', x))]);
plan.push(['users', F.USERS.map((x) => toRow('users', x))]);
plan.push(['vendors', F.VENDORS.map((x) => toRow('vendors', x))]);
plan.push(['inventory_items', F.INVENTORY_ITEMS.map((x) => toRow('inventory_items', x))]);
plan.push(['invoices', F.INVOICES.map((x) => toRow('invoices', x))]);
plan.push(['invoice_lines', Object.values(F.INVOICE_LINES).flat().map((x) => toRow('invoice_lines', x, { tenant_id: tid }))]);
plan.push(['recipes', F.RECIPES.map((x) => toRow('recipes', x))]);
plan.push(['recipe_ingredients', F.RECIPES.flatMap((r) =>
  r.ingredients.map((ing, i) => toRow('recipe_ingredients', ing, { id: `${r.id}-ing-${i + 1}`, tenant_id: tid, recipe_id: r.id })),
)]);
plan.push(['inventory_counts', F.INVENTORY_COUNTS.map((x) => toRow('inventory_counts', x))]);
plan.push(['price_alerts', F.PRICE_ALERTS.map((x) => toRow('price_alerts', x))]);
plan.push(['daily_sales', F.DAILY_SALES.map((x) => toRow('daily_sales', x))]);
plan.push(['menu_item_sales', F.MENU_ITEM_SALES.map((x) => toRow('menu_item_sales', x))]);
plan.push(['labor_shifts', F.LABOR_SHIFTS.map((x) => toRow('labor_shifts', x))]);
plan.push(['catering_events', F.CATERING_EVENTS.map((x) => toRow('catering_events', x, { guest_id: null }))]);
plan.push(['beos', F.BEOS.map((x) => toRow('beos', x, { tenant_id: tid }))]);
plan.push(['event_payments', F.EVENT_PAYMENTS.map((x) => toRow('event_payments', x, { tenant_id: tid }))]);
plan.push(['segments', F.SEGMENTS.map((x) => toRow('segments', x))]);
plan.push(['campaigns', F.CAMPAIGNS.map((x) => toRow('campaigns', x))]);
plan.push(['activity_events', F.ACTIVITY_EVENTS.map((x) => toRow('activity_events', x))]);
plan.push(['integration_states', F.INTEGRATION_STATES.map((x) => toRow('integration_states', x, { tenant_id: tid }))]);
plan.push(['reviews', F.REVIEWS.map((x) => toRow('reviews', x))]);
// Live menu items from fixtures/menus-live.json via the menus-live.ts
// loader. (loc, menuSlug, slug) is unique across all items (verified),
// so the deterministic id doubles as the re-run conflict target.
plan.push(['menu_items_live', ML.getLiveMenuItems().map((it) => toRow('menu_items_live', {
  id: `mi_${it.loc}_${it.menuSlug}_${it.slug}`,
  loc: it.loc,
  menu: it.menu,
  menuSlug: it.menuSlug,
  section: it.section,
  name: it.name,
  description: it.desc,
  price: it.price,
  photo: it.photo,
  popular: it.popular,
  best: it.best,
  alcohol: it.alcohol,
  slug: it.slug,
}, { tenant_id: tid }))]);

const skipped = [
  ['guests', F.GUESTS.length, 'LIVE prod table with a different shape — never written by this script'],
  ['reservations', F.RESERVATIONS.length, 'FK to fixture guests (skipped above)'],
];

// ---- report ----
console.log(`[seed] project: ${PROJECT_REF} · tenant: ${T.slug} (${tid})`);
let total = 0;
for (const [table, rows] of plan) {
  total += rows.length;
  console.log(`[seed]   ${table.padEnd(20)} ${String(rows.length).padStart(4)} rows`);
}
for (const [table, n, why] of skipped) console.log(`[seed]   ${table.padEnd(20)} SKIP (${n} fixture rows) — ${why}`);
console.log(`[seed] total: ${total} rows across ${plan.length} tables`);

if (!apply) {
  const sample = insertSql(plan[0][0], plan[0][1]);
  console.log(`[seed] sample statement:\n${sample.split('\n').slice(0, 4).join('\n')} …`);
  console.log('[seed] DRY RUN — nothing sent. Re-run with --apply to insert.');
  process.exit(0);
}

// ---- apply via Management API ----
function readToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const file = join(homedir(), '.supabase', 'access-token');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  return null;
}
const token = readToken();
if (!token) {
  console.error('[seed] cannot apply without an access token (SUPABASE_ACCESS_TOKEN or ~/.supabase/access-token).');
  process.exit(1);
}

for (const [table, rows] of plan) {
  const sql = insertSql(table, rows);
  if (!sql) { console.log(`[seed] ${table}: nothing to insert`); continue; }
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    console.error(`[seed] ${table}: FAILED ${res.status}: ${(await res.text()).slice(0, 500)}`);
    process.exit(1);
  }
  console.log(`[seed] ${table}: inserted ${rows.length} rows (on conflict do nothing)`);
}
console.log('[seed] done.');
