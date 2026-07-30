# Buena Vista — Live Channel Setup (Slack · WhatsApp · Voice)

Wiring guide for the three live channels. All three routes are already built,
env-gated, and deployed with the apps — going live is configuration only.

| Channel | App | Route | Live when |
|---|---|---|---|
| Slack (AI Team in-channel + digests) | OS | `/api/slack/events`, `/api/slack/digest` | `SLACK_BOT_TOKEN` + `SLACK_SIGNING_SECRET` set |
| WhatsApp concierge (Anfitrión) | CRM | `/api/whatsapp/inbound` | `TWILIO_*` env set (runs open in demo without) |
| Voice concierge (ElevenLabs) | CRM | `/api/voice/reservation` | `VOICE_WEBHOOK_SECRET` set |

Base URLs: **OS** `https://buena-vista-os.vercel.app` · **CRM** `https://buena-vista-crm.vercel.app`

All routes run `runtime = 'nodejs'`, `dynamic = 'force-dynamic'` — no edge
runtime, no caching. AI replies need a copilot model key (`ANTHROPIC_API_KEY`
by default, or `COPILOT_MODEL` + that provider's key) on each app.

---

## 1. Slack — AI Team in Slack

### Webhook URLs
- Events receiver: `POST https://buena-vista-os.vercel.app/api/slack/events`
- Morning digest (cron): `GET|POST https://buena-vista-os.vercel.app/api/slack/digest?agent=<id>&secret=<VIOX_CRON_SECRET>[&channel=C…]`
  - `agent` one of: `mise`, `ledger`, `sala`, `turno`, `fiesta`, `vega`

### Env vars (OS app on Vercel)
| Var | What |
|---|---|
| `SLACK_BOT_TOKEN` | `xoxb-…` bot token, needs `chat:write` |
| `SLACK_SIGNING_SECRET` | App credentials → Signing Secret (verifies every event) |
| `SLACK_CHANNEL_ID` | Optional default digest channel (`C…`) |
| `VIOX_CRON_SECRET` | Any random string — gates the digest route |

### Credential checklist (Slack app at api.slack.com/apps)
1. Create app "BuenaVista OS" in the client workspace.
2. **OAuth & Permissions → Bot Token Scopes**: `chat:write`, `app_mentions:read`, `im:history`, `im:read`, `im:write`. Install to workspace → copy the `xoxb-` token.
3. **Basic Information → Signing Secret** → copy.
4. **Event Subscriptions**: enable, set Request URL to the events route (it answers the `url_verification` challenge automatically once env is set). Subscribe to bot events: `app_mention`, `message.im`.
5. Invite the bot to the digest channel; copy the channel ID for `SLACK_CHANNEL_ID`.
6. Set the four env vars on the OS Vercel project → redeploy.
7. Schedule digests (Vercel cron or any scheduler) hitting the digest URL per agent each morning.

### Behavior
- `@BuenaVista OS what were sales yesterday?` → general copilot replies in-thread.
- Lead with `as mise …` / `@ledger …` to route to a specific specialist (aliases: `anfitrion`/`anfitrión` → concierge).
- Retries and duplicate `event_id`s are deduped; bot echoes ignored; failures ack 200 to avoid retry storms.
- Without Slack env: events route returns 503; digest route still returns `{ ok, posted: false, preview }` so digests are testable today.

---

## 2. WhatsApp — Anfitrión concierge

### Webhook URL
- `POST https://buena-vista-crm.vercel.app/api/whatsapp/inbound` (Twilio signs against exactly this URL — it is hard-coded in the route as `PUBLIC_URL`; update it if the domain changes)
- `GET` same path = no-auth health check (`{ ok, configured }`)

### Env vars (CRM app on Vercel)
| Var | What |
|---|---|
| `TWILIO_ACCOUNT_SID` | `AC…` from the Twilio console |
| `TWILIO_AUTH_TOKEN` | Auth token — enables `X-Twilio-Signature` validation (403 on mismatch); without it the route runs open in demo mode |
| `TWILIO_WHATSAPP_FROM` | Approved WhatsApp sender, e.g. `whatsapp:+1646…` |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Reservation capture + message history persistence |

### Credential checklist (Twilio console)
1. WhatsApp sender approved in **Messaging → Senders → WhatsApp senders** (Meta business verification + display name review).
2. On the sender, set **"When a message comes in"** → the inbound URL above, method `POST`.
3. Copy Account SID + Auth Token; set the env vars on the CRM Vercel project → redeploy.
4. Outbound/proactive sends use `sendWhatsApp()` (`@viox/integrations`) — freeform only inside the 24h session window; approved templates otherwise.

### Behavior
- Guest message → Anfitrión (concierge agent) answers <500 chars, EN/ES, both rooms.
- A second extraction pass detects a confirmed reservation and captures it into the CRM (same path as voice); reply is capped at 1500 chars (Twilio limit headroom).

---

## 3. Voice — ElevenLabs "Anfitrión" webhook

### Webhook URL
- `POST https://buena-vista-crm.vercel.app/api/voice/reservation`
- Auth: header `x-viox-secret: <VOICE_WEBHOOK_SECRET>` (401 otherwise)
- `GET` same path = no-auth health check

### Env vars (CRM app on Vercel)
| Var | What |
|---|---|
| `VOICE_WEBHOOK_SECRET` | Random string; must match the header the ElevenLabs tool sends |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Guest upsert + reservation storage |

### Credential checklist (ElevenLabs)
1. On the Anfitrión agent, add a webhook tool pointing at the URL above, method `POST`, header `x-viox-secret` = the secret.
2. Tool body fields: `guest_name` (required), `phone`, `email`, `party_size`, `requested_date` (YYYY-MM-DD), `requested_time`, `location` (`hells-kitchen` | `east-village`), `occasion`, `notes`, `marketing_opt_in`.
3. Set `VOICE_WEBHOOK_SECRET` on the CRM Vercel project → redeploy.
4. Point the Twilio voice number at the ElevenLabs agent (Twilio native integration in ElevenLabs).

---

## Master env checklist to collect from Juan

**OS (Vercel project `buena-vista-os`)**
- [ ] `SLACK_BOT_TOKEN` · [ ] `SLACK_SIGNING_SECRET` · [ ] `SLACK_CHANNEL_ID` · [ ] `VIOX_CRON_SECRET`
- [ ] `ANTHROPIC_API_KEY` (or `COPILOT_MODEL` + matching provider key)

**CRM (Vercel project `buena-vista-crm`)**
- [ ] `TWILIO_ACCOUNT_SID` · [ ] `TWILIO_AUTH_TOKEN` · [ ] `TWILIO_WHATSAPP_FROM`
- [ ] `VOICE_WEBHOOK_SECRET`
- [ ] `SUPABASE_URL` · [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `ANTHROPIC_API_KEY` (or `COPILOT_MODEL` + matching provider key)

Smoke after deploy:
```bash
curl -s https://buena-vista-crm.vercel.app/api/whatsapp/inbound        # {"ok":true,"configured":…}
curl -s https://buena-vista-crm.vercel.app/api/voice/reservation       # {"ok":true,"configured":…}
curl -s "https://buena-vista-os.vercel.app/api/slack/digest?agent=mise&secret=…"  # preview even without Slack env
```

---

## SMS lifecycle — guest texting (Twilio SMS)

Outbound guest SMS is live across the reservation and waitlist flows. Rendering,
sending, and logging all live in `apps/crm/lib/sms-workflows.ts`
(`renderSms` → `sendSms` via `@viox/integrations` → best-effort `sms_log` insert).
Every send is failure-safe: an SMS problem never breaks a capture flow or an
API route — callers just report `smsSent: false`.

### Sender

- **From number:** `+1 (929) 410-5502` (`TWILIO_SMS_FROM`) — pinned so guests
  always see the same number.
- **Messaging Service:** `TWILIO_MESSAGING_SERVICE_SID` (`MG…`) is passed on
  every send *alongside* `From`, so each message rides the registered **A2P 10DLC
  campaign** attached to the Messaging Service while keeping the pinned sender.
  Both env vars are already set on the CRM Vercel project.
- First-touch events (`request_received`, `waitlist_joined`) append
  "Reply STOP to opt out." — Twilio handles STOP/START suppression at the
  Messaging Service level.

### Events

| Event | Fired by | Trigger | Copy gist |
|---|---|---|---|
| `request_received` | `captureReservation` (voice + WhatsApp concierge) | Reservation request stored with a phone on file | "¡Gracias! We received your request — the team will confirm shortly." + opt-out |
| `reservation_confirmed` | `PATCH /api/reservations/[id]` `action: confirm` | Host confirms in the CRM inbox | "¡Confirmado! Your table is set…" |
| `reservation_updated` | `PATCH /api/reservations/[id]` `action: modify` | Host edits date/time/party/location (post-update values render) | "¡Listo! Your reservation is updated…" |
| `reservation_declined` | `PATCH /api/reservations/[id]` `action: decline` | Host declines the request | "Lo sentimos… call us and we'll find a time." |
| `waitlist_joined` | `POST /api/waitlist` | Walk-in added at the host stand with a phone | "You're on the waitlist — current wait about N min." + opt-out |
| `table_ready` | `PATCH /api/waitlist/[id]` `action: table_ready` | Host taps "Table ready" (row → `notified`) | "Your table is ready! See the host within 10 minutes." |
| `order_update` | `POST /api/sms/send` (ops/manual) | Free-form update with `ctx.custom` | "Hola — update from Buena Vista: …" |

Notes:
- SMS fires **only when a phone is on file**; UI notes distinguish
  "SMS sent ✓" / "Saved — SMS not sent" / "no phone on file".
- Location context (`hells-kitchen` / `east-village`) brands the copy and adds
  the right call-back number — HK `(212) 388-5040`, EV `(929) 220-0547`.
- Copy is clamped to ≤320 chars (2 SMS segments max).

### Trigger route (`/api/sms/send`)

Internal workflow trigger for the CRM UI, voice tools, and ops scripts.
Auth: `x-viox-secret: <VOICE_WEBHOOK_SECRET>` (same gate as the voice webhook).

```bash
curl -s https://buena-vista-crm.vercel.app/api/sms/send   # {"ok":true,"configured":…} health check
curl -s -X POST https://buena-vista-crm.vercel.app/api/sms/send \
  -H 'content-type: application/json' -H "x-viox-secret: $VOICE_WEBHOOK_SECRET" \
  -d '{"to":"+12125550134","event":"order_update","ctx":{"guestName":"María","location":"hells-kitchen","custom":"your paella is ready for pickup"}}'
```

### Audit trail

Every attempt (sent **and** failed) writes a row to Supabase `sms_log`
(`tenant_slug, to_phone, body, kind, ref_id, twilio_sid, status, created_at`)
with `ref_id` pointing at the `reservation_requests` / `waitlist` row that
triggered it. The write is best-effort and never blocks the send path.
