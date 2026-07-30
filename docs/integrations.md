# VioX Restaurant OS — Integrations

How the three source systems (Toast, MarginEdge, Caterease) relate to the
platform, what runs natively today in demo mode, what flips to live sync when
credentials arrive, and exactly what to collect from the client.

The app layer never changes between modes: every screen reads through
`getRepository()` (`@viox/db`), and the `@viox/integrations` adapters expose
the same method signatures in demo and live mode. Going live is a
configuration event, not a rebuild.

| Provider | Demo status | Live transport | Effort to go live |
|---|---|---|---|
| Toast | `connected_demo` | Partner API (OAuth2) + webhooks | Low — approve partner connection |
| MarginEdge | `connected_demo` | REST API (API key) | Low — issue API key |
| Caterease | `connected_demo` | Scheduled CSV/report export (no public API) | Medium — export setup or one-time migration |

---

## Toast (POS — sales, labor, menu mix)

**What we replicate natively today**
- 90 days of daily sales per location: net/gross, guests, checks, average
  check, comps/voids, labor cost & %, category splits (Food / Cocktails /
  Wine / Beer / NA Bev), dayparts (Lunch, Pre-Theater, Dinner, Brunch,
  Late Night for East Village).
- Monthly menu-item mix with margin and menu-engineering quadrants
  (star / plow horse / puzzle / dog).
- Labor shifts by role and employee.

**What syncs live once creds arrive**
- Orders/checks stream via `orders.*` webhooks (near-real-time sales instead
  of the nightly rollup).
- Labor punches via `/labor/v1/timeEntries`; menu + price changes via
  `/menus/v2/menus`.
- Historical backfill via `/orders/v2/ordersBulk` per location GUID.

**Credential checklist for the client**
1. Toast Web admin login able to approve a partner/API connection
   (Toast → Integrations → browse & approve).
2. Restaurant GUIDs for both locations (Hell's Kitchen, East Village) —
   visible in Toast Web under each location's setup page.
3. Confirmation of API access on their Toast plan (standard API access is a
   paid add-on if not going through the partner program).
4. Sales category + daypart (service period) naming as configured in Toast,
   so category/daypart splits map 1:1.

---

## MarginEdge (invoices, food cost, price alerts)

**What we replicate natively today**
- AP inbox: 26 invoices over the last 45 days across 9 active vendors, with
  scanned-capture flags, review statuses (pending / approved / disputed) and
  full line detail.
- 48-item inventory catalog with last vs 30-day average price, par levels
  and on-hand counts (6 items currently below par).
- Price alerts on >8% moves (saffron +17.9%, octopus +12%, limes +9%, …).
- Recipe costing for the 12 core menu items (plate cost, cost % vs target).

**What syncs live once creds arrive**
- Invoices ("orders") + line items via `GET /orders` and
  `GET /orders/{id}/lineItems` per restaurant unit — including photo-captured
  invoices processed by MarginEdge's ingestion team.
- Product catalog + latest prices via `GET /products`; we diff prices on each
  poll (hourly) and raise `PriceAlert`s natively (ME has no price webhook).
- Vendors via `GET /vendors`.

**Credential checklist for the client**
1. MarginEdge API key (admin portal → Settings → API Access) and company id.
2. Confirmation both restaurant units are on a plan with API access enabled.
3. Vendor list export (one time) so we can align vendor ids/names.
4. Their category tree (food/bev categories) for clean COGS mapping.

---

## Caterease (catering & events)

**What we replicate natively today**
- Full pipeline: 16 events across lead → proposal → tasting → booked →
  BEO final → completed/lost, with party size, space, budget vs quote,
  deposits, and menu packages.
- BEOs (timeline, courses, staffing, rentals, AV, dietary notes) with
  draft/sent/signed states.
- Deposit and balance payments per event.

**What syncs live once creds arrive**
- Caterease has **no public API.** Live path is scheduled CSV/report exports
  (Events, Sub-Events, Payments) delivered to an SFTP drop or
  email-to-webhook address, ingested on arrival and keyed on the Caterease
  event number. Stage, room, financials and payments map onto our
  `CateringEvent` / `EventPayment` model.
- Recommended alternative: one-time full export, then run day-forward events
  natively in VioX Events (this module already covers everything Caterease
  was doing) with Caterease kept read-only during a one-month cutover.

**Credential checklist for the client**
1. A Caterease login with report-writer/export permissions.
2. Chosen export destination (SFTP credentials we provision, or the
   email-to-webhook address we issue) + export schedule (daily 11:30 PM).
3. One-time full historical export: Events + Payments + Menu packages.
4. Decision point for Christian: continuous CSV sync vs full migration into
   VioX Events (we recommend migration).

---

## Go-live sequence (per provider)

1. Client hands over the checklist items above → stored in the tenant vault.
2. Flip `IntegrationState.status` from `connected_demo` to
   `awaiting_credentials` → `connected_live` as each connector validates.
3. Backfill history (Toast 90 days, MarginEdge 45 days, Caterease full book),
   then enable incremental sync.
4. Fixtures stay available behind `DEMO_MODE` for sales demos — the Supabase
   driver (`schema.sql`, push-ready) takes over as the system of record.
