# VioX Restaurant OS — Buena Vista (tenant #1)

Monorepo for Buena Vista Restaurant & Bar (buenavistany.com): cinematic marketing site + VioX AI OS (operator backend) + VioX CRM (guest & growth backend). White-label multi-tenant architecture — Buena Vista is tenant #1.

## Apps
| App | What | Deploy |
|---|---|---|
| `apps/site` | Cinematic marketing site (static, scroll-driven video hero) | buena-vista-ny.vercel.app |
| `apps/os` | **VioX AI OS** — inventory & COGS (MarginEdge parity), catering & events (Caterease parity), POS ops & sales (Toast parity), Claude copilot | Vercel (rootDirectory apps/os) |
| `apps/crm` | **VioX CRM** — guests, VIP list, reservations, segments, campaigns, event leads, Claude copilot | Vercel (rootDirectory apps/crm) |

## Packages
- `packages/db` — domain model (`types.ts`), `DataRepository` contract, demo fixtures driver, **Supabase-ready `schema.sql`** (multi-tenant + RLS)
- `packages/ui` — VioX Command design system (dark glass, tenant theming)
- `packages/agents` — Claude tool-use copilot core (10 ops tools over the repository)
- `packages/integrations` — Toast / MarginEdge / Caterease adapters (demo drivers now; live-API notes in `docs/integrations.md`)

## Modes
DEMO_MODE (default): runs entirely on the fixture dataset — no external services. Go-live: provision Supabase, `psql < packages/db/schema.sql`, set `NEXT_PUBLIC_SUPABASE_URL` + keys, implement the supabase driver behind `getRepository()`.

## Dev
```bash
pnpm install
pnpm dev            # turbo — all apps
pnpm --filter @viox/os dev
```

Built by VioX AI — cinematic-sites pipeline + multi-agent build (2026-07).
