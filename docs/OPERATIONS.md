# Buena Vista — Operations Runbook

The single reference for running, demoing, and going live with the Buena Vista
platform. Channel-by-channel wiring detail lives in
[`integrations-live.md`](./integrations-live.md); this document is the map on
top of it: architecture, every flag, the scheduled jobs, the go-live checklist,
the client demo script, and what to do when something breaks.

---

## 1. Architecture map

Three Next.js apps + shared packages in one pnpm/turbo monorepo, one Supabase
project, and four guest channels.

```
                      ┌─────────────────────────────────────────────┐
                      │        Supabase (saxhlzmgsrqsjhknkurc)      │
                      │  LIVE tables: guests, reservation_requests, │
                      │  waitlist, sms_log, email_log,              │
                      │  whatsapp_messages   (+ GoTrue auth)        │
                      └───────────────▲───────────────▲─────────────┘
                                      │               │
   Guests                             │               │
   ──────                             │               │
   Voice (ElevenLabs Anfitrión) ──►  CRM  ◄── WhatsApp (Twilio)
   Web reservation form ──────────►  apps/crm        buena-vista-crm.vercel.app
   SMS replies / email replies ───►   │
                                      │  reservation inbox · waitlist · guests
                                      │  campaigns · automations · reviews
                                      │
   Owner & managers                  OS   buena-vista-os.vercel.app
   ───────────────                  apps/os
   Slack (@BuenaVista OS + digests)   │  sales · inventory · food cost · labor
   Morning briefing email (Resend)    │  events/BEOs · menus · AI copilot team
                                      │
   Public                           SITE  buena-vista-ny.vercel.app
   ──────                          apps/site (static, cinematic scroll site)
```

| Piece | What it is | Deploy |
|---|---|---|
| `apps/site` | Cinematic marketing site (static) | `buena-vista-ny.vercel.app` |
| `apps/os` | Back-of-house OS: sales, inventory/COGS, labor, events, menus, AI copilot + Slack | `buena-vista-os.vercel.app` |
| `apps/crm` | Guest CRM: reservation inbox, waitlist, guests, campaigns, automations, reviews, channel webhooks | `buena-vista-crm.vercel.app` |
| `packages/db` | Domain types + `DataRepository` contract; demo fixtures (anchored to 2026-07-29) and the Supabase driver switch | — |
| `packages/agents` | Copilot tool belt + agent registry (Mise, Ledger, Sala, Turno, Fiesta, Vega, Anfitrión) | — |
| `packages/integrations` | Plain-fetch adapters: Slack, Twilio SMS/WhatsApp, Resend email, Toast/MarginEdge/Caterease stubs | — |
| `packages/ui` | Shared VioX Command design tokens + components (dark/light vars) | — |

**Data model rule:** every app talks to data only through
`getRepository()` (`packages/db`). Demo mode serves deterministic fixtures;
the Supabase driver swaps in behind the same interface — app code never
changes. The six LIVE tables above are already in production use by the
webhook routes (voice/WhatsApp/SMS/email capture) even while dashboards run
on fixtures. **Never drop or rename them.**

---

## 2. Environment flags — the complete list

**Golden rule (flag-off safety):** with *no* env vars set, both apps run
exactly as the demo — fixture data, no auth gate, forms and sends fall back
gracefully. Every flag below is additive. Flip them one at a time, verify,
move on.

### Core switches

| Var | App(s) | What it does |
|---|---|---|
| `USE_SUPABASE_DATA` | OS + CRM | `1`/`true` flips `getRepository()` from demo fixtures to the live Supabase driver, and anchors "today" to the real calendar (America/New_York) instead of the demo date 2026-07-29. Off = demo fixtures. |
| `AUTH_REQUIRED` | OS + CRM | `1` turns on the login gate (Supabase GoTrue magic-link sessions via `/api/auth/*`; demo cookie allows read-only walkthroughs). Off = apps open, exactly as today. |
| `CRON_SECRET` | OS + CRM | Set it and Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on every scheduled cron invocation; the cron-target routes accept it. Also gates manual curl access to those routes. |
| `NEXT_PUBLIC_SUPABASE_URL` | OS + CRM | Note: presence of this var is treated by `getRepository()` as the driver switch — set it only when going live on data. Prefer `SUPABASE_URL` for server-side integrations. |

### Data + auth (Supabase project `saxhlzmgsrqsjhknkurc`)

| Var | App(s) | What |
|---|---|---|
| `SUPABASE_URL` | OS + CRM | `https://saxhlzmgsrqsjhknkurc.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | OS + CRM | Server-side key — webhook capture, logs, briefing counts. Never expose client-side. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | OS + CRM | GoTrue auth (magic links) when `AUTH_REQUIRED=1`. |

### Scheduled ops + email

| Var | App(s) | What |
|---|---|---|
| `BRIEFING_TO` | OS | Morning-briefing recipient. Default `juan@viox.ai`. |
| `RESEND_API_KEY` | OS + CRM | Resend key (`re_…`) — briefing email (OS) + guest lifecycle email (CRM). |
| `EMAIL_FROM` | OS + CRM | e.g. `Buena Vista Concierge <concierge@viox.ai>` |
| `EMAIL_REPLY_TO` | OS + CRM | Optional default reply-to (e.g. `juan@viox.ai`). |
| `RESEND_WEBHOOK_SECRET` | CRM | `whsec_…` — verifies inbound Resend webhooks (`/api/email/inbound`). |
| `VIOX_CRON_SECRET` | OS | Legacy digest gate (`?secret=`). Still accepted; `CRON_SECRET` is the go-forward gate. |

### Channels

| Var | App(s) | What |
|---|---|---|
| `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` / `SLACK_CHANNEL_ID` | OS | AI team in Slack + digests (see integrations-live.md §1). |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | CRM | SMS + WhatsApp sending and signature validation. |
| `TWILIO_SMS_FROM` / `TWILIO_MESSAGING_SERVICE_SID` | CRM | Pinned SMS sender `+1 (929) 410-5502` riding the registered A2P campaign. |
| `TWILIO_WHATSAPP_FROM` | CRM | Approved WhatsApp sender. |
| `VOICE_WEBHOOK_SECRET` | CRM | Gates `/api/voice/reservation`, `/api/sms/send`, and manual `/api/automations/run` POSTs (`x-viox-secret`). |
| `ANTHROPIC_API_KEY` (or `COPILOT_MODEL` + provider key) | OS + CRM | The copilot/agent model. Without it, copilot degrades gracefully. |

---

## 3. Scheduled ops (Vercel crons)

Defined in `apps/os/vercel.json` and `apps/crm/vercel.json`. Vercel invokes
each path by GET and — once `CRON_SECRET` is set on the project — sends
`Authorization: Bearer <CRON_SECRET>` automatically.

| App | Path | Schedule (UTC) | ET | What it does |
|---|---|---|---|---|
| OS | `/api/briefing/daily` | `0 11 * * *` (daily 11:00) | 7:00am | Owner's morning briefing: yesterday's sales vs prior + last week (both rooms), food-cost flag, low stock, today + next-7d events, unreplied reviews, last-24h live CRM counts. Emails via Resend to `BRIEFING_TO`, always returns JSON. |
| OS | `/api/slack/digest?agent=mise` | `5 11 * * *` (daily 11:05) | 7:05am | Mise (inventory) digest to Slack: low stock + price alerts. |
| OS | `/api/slack/digest?agent=fiesta` | `10 11 * * *` (daily 11:10) | 7:10am | Fiesta (events) digest to Slack: pipeline + next events. |
| CRM | `/api/automations/run?automation=birthday` | `0 12 * * 1` (Mondays 12:00) | Mon 8:00am | Birthday-automation **dry run** — composes previews + audience without sending. Scheduled GET runs are hard-coded dry-run; only a manual, secret-gated POST can send (and live sends only ever hit the test-user allowlist). |

Notes:

- **Without `CRON_SECRET`:** briefing + digest run open (demo/preview mode,
  same as today); the automations cron GET returns 401 (no configured secret
  matches) — nothing fires. Flag-off remains safe on both sides.
- Cron schedules note: ET times above assume EDT (UTC−4). In winter (EST)
  the same UTC crons land an hour earlier ET-wise at 6:00/6:05/6:10am.
- Vercel Hobby plan allows limited cron jobs per account (daily-only,
  loose timing). The OS project declares 3 — if the team is on Hobby, keep
  `/api/briefing/daily` and drop the digests (or fire them from any external
  scheduler with `?secret=`).
- Manual trigger (same routes, any time):

```bash
# Briefing (JSON always; email when Resend env present)
curl -s "https://buena-vista-os.vercel.app/api/briefing/daily" -H "Authorization: Bearer $CRON_SECRET"

# One agent digest
curl -s "https://buena-vista-os.vercel.app/api/slack/digest?agent=mise" -H "Authorization: Bearer $CRON_SECRET"

# Birthday automation dry run
curl -s "https://buena-vista-crm.vercel.app/api/automations/run?automation=birthday" -H "Authorization: Bearer $CRON_SECRET"
```

---

## 4. Go-live checklist

Work top-to-bottom; each block is independently shippable. Full wiring
detail per channel: [`integrations-live.md`](./integrations-live.md).

### Phase 0 — accounts & keys collected
- [ ] Supabase project keys (URL, service-role, anon)
- [ ] Twilio: Account SID, auth token, SMS number + Messaging Service (A2P), WhatsApp sender approved
- [ ] Resend: API key, webhook secret; domain `buenavistany.com` verified (until then sends ride `viox.ai`)
- [ ] Slack app installed in client workspace (bot token, signing secret, channel ID)
- [ ] ElevenLabs Anfitrión agent + Twilio voice number pointed at it
- [ ] `ANTHROPIC_API_KEY` on both Vercel projects

### Phase 1 — channels live (already built; env-only)
- [ ] CRM: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `VOICE_WEBHOOK_SECRET` → voice capture live
- [ ] CRM: `TWILIO_*` → WhatsApp concierge + guest SMS lifecycle live
- [ ] CRM: `RESEND_*` + `EMAIL_*` → guest email lifecycle + inbound replies live
- [ ] OS: `SLACK_*` → AI team in Slack live
- [ ] Smoke test each (§6 below)

### Phase 2 — scheduled ops
- [ ] Set `CRON_SECRET` (same value) on **both** Vercel projects
- [ ] OS: set `BRIEFING_TO` (defaults to juan@viox.ai) + Resend env (if not already)
- [ ] Redeploy both apps → confirm crons appear under Vercel → Project → Settings → Cron Jobs
- [ ] Next morning: briefing email arrived, digests posted, Monday dry-run logged

### Phase 3 — live data + auth (the big flip)
- [ ] Backfill/seed the operational tables in Supabase (schema mirrors `packages/db/src/types.ts`)
- [ ] Set `USE_SUPABASE_DATA=1` on OS + CRM → verify dashboards read live rows
- [ ] Set `AUTH_REQUIRED=1` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` → verify magic-link login + demo cookie
- [ ] Re-run the §6 smoke tests end-to-end
- [ ] Hand credentials + this runbook to the client team

### Rollback
Any phase rolls back by unsetting its env vars and redeploying — the apps
return to the prior behavior. No code changes, no data loss (live tables
keep accumulating regardless).

---

## 5. Client demo script — the 10-minute walkthrough

The demo runs entirely on fixtures — no env needed — except the live-channel
moments (voice/SMS), which use the wired test numbers. Standing rule: test
sends go only to the approved test users, never to fixture guests.

**Minute 0–1 — The site.** Open `buena-vista-ny.vercel.app`. Scroll the
cinematic hero. "This is what guests see. Everything else I'm about to show
you is what *you* see."

**Minute 1–3 — The call.** Call the concierge line (Twilio voice number →
ElevenLabs Anfitrión). Book a table for tonight, bilingual if you like —
give a name, party size, time, phone. Hang up.

**Minute 3–4 — Watch it land.** Open `buena-vista-crm.vercel.app/reservations`.
The request from the call is sitting in the live inbox — name, party, time,
source "voice". "No human touched this."

**Minute 4–5 — Confirm → SMS.** Click Confirm. The guest's phone buzzes:
branded confirmation text from the restaurant's own number (and a branded
email if an address was captured). Show `/inbox` for the message trail.

**Minute 5–7 — The guest brain.** Open `/guests` — tags, visits, lifetime
spend, favorite dishes. Open `/segments` and `/campaigns` — "Paella
Wednesdays to your VIPs, one click." Open `/automations` — birthday +
win-back playbooks with dry-run previews. Open `/reviews` — every platform,
one stream, reply drafts.

**Minute 7–9 — The back office (OS).** Open `buena-vista-os.vercel.app`.
Sales dashboard (both rooms, dayparts, labor %). Inventory: low-stock and
price alerts. Menu performance: stars vs dogs, plate costs vs target.
Events: pipeline → BEO. Then open the copilot and ask, "how were sales
yesterday?" — answer in seconds, from the same data.

**Minute 9–10 — The morning ritual.** Show the briefing email (or hit
`/api/briefing/daily` and show the JSON): "Every morning at 7, this is in
your inbox — yesterday's numbers, what's low, who's coming, what needs a
reply. And the specialist digests hit your Slack right after. You start the
day already caught up."

Close: "Site, phone, WhatsApp, SMS, email, CRM, inventory, events, AI team —
one system, one login, live today."

---

## 6. Incident basics

**First move, always:** Vercel → Project → Logs (Functions) for the failing
route. Every route logs its errors with a `[route-name]` prefix.

| Symptom | Likely cause | Fix |
|---|---|---|
| Voice/WhatsApp books but nothing in CRM inbox | Missing `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, or Supabase down/paused (free tier pauses after inactivity) | Check env, then Supabase dashboard → restore/unpause. Capture routes fail soft — the call still completed; re-enter the reservation manually. |
| Guest SMS not arriving | Twilio env missing, number/campaign issue, or guest replied STOP | Check `sms_log` rows (`status`), then Twilio console → Messaging logs. Route reports `smsSent:false` without breaking the flow. |
| Briefing/digest didn't fire | Cron not registered (no `crons` in the deployed vercel.json), or 401 (secret mismatch) | Vercel → Settings → Cron Jobs → recent invocations; re-run manually with the curl commands in §3. |
| Briefing email missing but JSON fine | Resend env absent/invalid, or Resend outage | Route returns `email.error` in its JSON; check Resend dashboard → Logs. |
| Slack bot silent | Token revoked/scopes, or events URL failing signature check | `/api/slack/events` returns 503 without env; re-verify signing secret; reinstall app if scopes changed. |
| Copilot replies with an error | No `ANTHROPIC_API_KEY` / provider outage / rate limit | Set key or wait; everything non-AI keeps working. |
| Dashboards suddenly empty or erroring after a flip | `USE_SUPABASE_DATA` / `NEXT_PUBLIC_SUPABASE_URL` set but tables not seeded | Unset the flag (instant rollback to fixtures), seed, re-flip. |
| 401s everywhere on cron routes | `CRON_SECRET` rotated on one project but not the other, or curl without header | Set the same value on both projects; redeploy. |

**Escalation order:** Vercel function logs → provider dashboard (Supabase /
Twilio / Resend / Slack / ElevenLabs / Anthropic) → redeploy previous build
(Vercel → Deployments → Promote) → unset the newest flag (rollback rule §4).

**Secrets hygiene:** rotate `CRON_SECRET` / `VOICE_WEBHOOK_SECRET` by setting
the new value on Vercel + the caller (ElevenLabs tool header, schedulers) in
the same change window. Keys live only in Vercel env — never in the repo.
