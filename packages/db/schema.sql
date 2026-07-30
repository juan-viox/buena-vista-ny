-- ============================================================
-- VioX Restaurant OS — Postgres / Supabase schema
-- Mirrors packages/db/src/types.ts 1:1 (snake_case).
-- Multi-tenant: every table carries tenant_id and is protected
-- by RLS keyed off the JWT claim `tenant_id`
--   (auth.jwt() ->> 'tenant_id').
-- Push with:  supabase db push   (or psql -f schema.sql)
-- ============================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- Convenience: current tenant from the JWT (stable per request).
create or replace function public.current_tenant_id()
returns text
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'tenant_id', '')
$$;

-- ============================================================
-- Tenancy
-- ============================================================

create table if not exists public.tenants (
  id          text primary key default gen_random_uuid()::text,
  slug        text not null unique,
  name        text not null,
  -- TenantTheme
  theme_accent    text not null default '#C9995C',
  theme_primary   text not null default '#1E3A5F',
  theme_logo_text text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.locations (
  id         text primary key default gen_random_uuid()::text,
  tenant_id  text not null references public.tenants(id) on delete cascade,
  name       text not null,
  address    text not null,
  phone      text not null,
  timezone   text not null default 'America/New_York'
);

create table if not exists public.users (
  id           text primary key default gen_random_uuid()::text,
  tenant_id    text not null references public.tenants(id) on delete cascade,
  name         text not null,
  email        text not null,
  role         text not null check (role in ('owner','gm','chef','events','marketing','staff')),
  location_ids text[] not null default '{}', -- empty = all locations
  unique (tenant_id, email)
);

-- ============================================================
-- Inventory & COGS (MarginEdge parity)
-- ============================================================

create table if not exists public.vendors (
  id             text primary key default gen_random_uuid()::text,
  tenant_id      text not null references public.tenants(id) on delete cascade,
  name           text not null,
  category       text not null,
  account_number text,
  terms          text
);

create table if not exists public.inventory_items (
  id                 text primary key default gen_random_uuid()::text,
  tenant_id          text not null references public.tenants(id) on delete cascade,
  name               text not null,
  category           text not null,
  unit               text not null check (unit in ('lb','oz','kg','g','each','case','bottle','liter','gal','qt','dozen')),
  last_price         numeric(12,2) not null default 0,
  avg_price_30d      numeric(12,2) not null default 0,
  par_level          numeric(12,2) not null default 0,
  on_hand            numeric(12,2) not null default 0,
  primary_vendor_id  text references public.vendors(id) on delete set null
);

create table if not exists public.invoices (
  id             text primary key default gen_random_uuid()::text,
  tenant_id      text not null references public.tenants(id) on delete cascade,
  location_id    text not null references public.locations(id) on delete cascade,
  vendor_id      text not null references public.vendors(id) on delete restrict,
  invoice_number text not null,
  date           date not null,
  total          numeric(12,2) not null default 0,
  status         text not null default 'pending_review'
                 check (status in ('pending_review','approved','exported','disputed')),
  line_count     integer not null default 0,
  scanned        boolean not null default false, -- photo/PDF ingest
  unique (tenant_id, vendor_id, invoice_number)
);

create table if not exists public.invoice_lines (
  id               text primary key default gen_random_uuid()::text,
  tenant_id        text not null references public.tenants(id) on delete cascade, -- denormalized for RLS
  invoice_id       text not null references public.invoices(id) on delete cascade,
  item_id          text not null references public.inventory_items(id) on delete restrict,
  description      text not null default '',
  qty              numeric(12,3) not null,
  unit             text not null check (unit in ('lb','oz','kg','g','each','case','bottle','liter','gal','qt','dozen')),
  unit_price       numeric(12,4) not null,
  total            numeric(12,2) not null,
  price_change_pct numeric(8,2) not null default 0 -- vs trailing avg; drives price alerts
);

create table if not exists public.recipes (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null references public.tenants(id) on delete cascade,
  menu_item_name  text not null,
  menu_price      numeric(12,2) not null,
  category        text not null,
  plate_cost      numeric(12,2) not null default 0, -- computed sum of ingredients
  cost_pct        numeric(8,2) not null default 0,  -- plate_cost / menu_price * 100
  target_cost_pct numeric(8,2) not null default 28,
  unique (tenant_id, menu_item_name)
);

create table if not exists public.recipe_ingredients (
  id         text primary key default gen_random_uuid()::text,
  tenant_id  text not null references public.tenants(id) on delete cascade, -- denormalized for RLS
  recipe_id  text not null references public.recipes(id) on delete cascade,
  item_id    text not null references public.inventory_items(id) on delete restrict,
  item_name  text not null,
  qty        numeric(12,4) not null,
  unit       text not null check (unit in ('lb','oz','kg','g','each','case','bottle','liter','gal','qt','dozen')),
  cost       numeric(12,2) not null
);

create table if not exists public.inventory_counts (
  id            text primary key default gen_random_uuid()::text,
  tenant_id     text not null references public.tenants(id) on delete cascade,
  location_id   text not null references public.locations(id) on delete cascade,
  date          date not null,
  counted_by    text not null,
  total_value   numeric(12,2) not null default 0,
  status        text not null default 'in_progress' check (status in ('in_progress','finalized')),
  items_counted integer not null default 0
);

create table if not exists public.price_alerts (
  id           text primary key default gen_random_uuid()::text,
  tenant_id    text not null references public.tenants(id) on delete cascade,
  item_id      text not null references public.inventory_items(id) on delete cascade,
  item_name    text not null,
  vendor_name  text not null,
  old_price    numeric(12,4) not null,
  new_price    numeric(12,4) not null,
  change_pct   numeric(8,2) not null,
  date         date not null,
  acknowledged boolean not null default false
);

-- ============================================================
-- POS Ops & Sales (Toast parity)
-- ============================================================

create table if not exists public.daily_sales (
  id             text primary key default gen_random_uuid()::text,
  tenant_id      text not null references public.tenants(id) on delete cascade,
  location_id    text not null references public.locations(id) on delete cascade,
  date           date not null,
  net_sales      numeric(12,2) not null default 0,
  gross_sales    numeric(12,2) not null default 0,
  guest_count    integer not null default 0,
  check_count    integer not null default 0,
  avg_check      numeric(12,2) not null default 0,
  comps          numeric(12,2) not null default 0,
  voids          numeric(12,2) not null default 0,
  labor_cost     numeric(12,2) not null default 0,
  labor_pct      numeric(8,2) not null default 0,
  category_sales jsonb not null default '{}'::jsonb, -- {"Food": 8200, "Cocktails": 3100, ...}
  dayparts       jsonb not null default '{}'::jsonb, -- {"Lunch": 2800, "Dinner": 9400, "Late Night": 1300}
  unique (tenant_id, location_id, date)
);

create table if not exists public.menu_item_sales (
  id             text primary key default gen_random_uuid()::text,
  tenant_id      text not null references public.tenants(id) on delete cascade,
  location_id    text not null references public.locations(id) on delete cascade,
  period         text not null, -- "2026-07" month key
  menu_item_name text not null,
  category       text not null,
  qty_sold       integer not null default 0,
  net_sales      numeric(12,2) not null default 0,
  plate_cost     numeric(12,2) not null default 0,
  margin         numeric(12,2) not null default 0,
  quadrant       text not null check (quadrant in ('star','plow_horse','puzzle','dog')),
  unique (tenant_id, location_id, period, menu_item_name)
);

create table if not exists public.labor_shifts (
  id          text primary key default gen_random_uuid()::text,
  tenant_id   text not null references public.tenants(id) on delete cascade,
  location_id text not null references public.locations(id) on delete cascade,
  date        date not null,
  role        text not null,
  employee    text not null,
  hours       numeric(8,2) not null,
  wage        numeric(8,2) not null,
  cost        numeric(12,2) not null
);

-- ============================================================
-- Catering & Events (Caterease parity)
-- ============================================================

create table if not exists public.catering_events (
  id             text primary key default gen_random_uuid()::text,
  tenant_id      text not null references public.tenants(id) on delete cascade,
  location_id    text not null references public.locations(id) on delete cascade,
  guest_id       text, -- FK to guests added below (guests is defined later in the file)
  title          text not null,
  contact_name   text not null,
  contact_email  text not null,
  contact_phone  text not null,
  type           text not null check (type in ('private_dinner','corporate','birthday','wedding_rehearsal','buyout','offsite_catering')),
  stage          text not null default 'lead'
                 check (stage in ('lead','proposal','tasting','booked','beo_final','completed','lost')),
  event_date     timestamptz not null,
  party_size     integer not null default 0,
  space          text not null default 'Main Dining',
  budget         numeric(12,2) not null default 0,
  quoted_total   numeric(12,2) not null default 0,
  deposit_paid   boolean not null default false,
  deposit_amount numeric(12,2) not null default 0,
  menu_package   text not null default '',
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.beos (
  id            text primary key default gen_random_uuid()::text,
  tenant_id     text not null references public.tenants(id) on delete cascade, -- denormalized for RLS
  event_id      text not null references public.catering_events(id) on delete cascade,
  version       integer not null default 1,
  timeline      jsonb not null default '[]'::jsonb, -- [{"time":"18:00","item":"Doors"}]
  menu          jsonb not null default '[]'::jsonb, -- [{"course":"Main","items":[...]}]
  staffing      jsonb not null default '[]'::jsonb, -- [{"role":"Server","count":4}]
  rentals       text[] not null default '{}',
  av            text[] not null default '{}',
  dietary_notes text not null default '',
  status        text not null default 'draft' check (status in ('draft','sent','signed')),
  unique (tenant_id, event_id, version)
);

create table if not exists public.event_payments (
  id        text primary key default gen_random_uuid()::text,
  tenant_id text not null references public.tenants(id) on delete cascade, -- denormalized for RLS
  event_id  text not null references public.catering_events(id) on delete cascade,
  date      date not null,
  amount    numeric(12,2) not null,
  method    text not null check (method in ('card','ach','check','cash')),
  kind      text not null check (kind in ('deposit','balance','refund'))
);

-- ============================================================
-- CRM & Guest Marketing
-- ============================================================

create table if not exists public.guests (
  id                   text primary key default gen_random_uuid()::text,
  tenant_id            text not null references public.tenants(id) on delete cascade,
  name                 text not null,
  email                text not null,
  phone                text,
  tags                 text[] not null default '{}', -- GuestTag values
  visits               integer not null default 0,
  lifetime_spend       numeric(12,2) not null default 0,
  avg_spend            numeric(12,2) not null default 0,
  last_visit           date,
  favorite_location_id text references public.locations(id) on delete set null,
  favorite_items       text[] not null default '{}',
  birthday             text, -- "MM-DD"
  notes                text not null default '',
  source               text not null default 'pos' check (source in ('pos','reservation','newsletter','event','walk_in')),
  marketing_opt_in     boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (tenant_id, email)
);

-- Deferred FK: catering_events.guest_id → guests.id
alter table public.catering_events
  drop constraint if exists catering_events_guest_id_fkey;
alter table public.catering_events
  add constraint catering_events_guest_id_fkey
  foreign key (guest_id) references public.guests(id) on delete set null;

create table if not exists public.reservations (
  id          text primary key default gen_random_uuid()::text,
  tenant_id   text not null references public.tenants(id) on delete cascade,
  location_id text not null references public.locations(id) on delete cascade,
  guest_id    text not null references public.guests(id) on delete cascade,
  date        timestamptz not null,
  party_size  integer not null default 2,
  status      text not null default 'upcoming'
              check (status in ('upcoming','seated','completed','no_show','cancelled')),
  occasion    text,
  source      text not null default 'website' check (source in ('opentable','phone','walk_in','website'))
);

create table if not exists public.segments (
  id          text primary key default gen_random_uuid()::text,
  tenant_id   text not null references public.tenants(id) on delete cascade,
  name        text not null,
  description text not null default '',
  guest_count integer not null default 0,
  rules       text not null default '' -- human-readable rule summary
);

create table if not exists public.campaigns (
  id            text primary key default gen_random_uuid()::text,
  tenant_id     text not null references public.tenants(id) on delete cascade,
  name          text not null,
  channel       text not null check (channel in ('email','sms','whatsapp')),
  segment_id    text not null references public.segments(id) on delete restrict,
  status        text not null default 'draft' check (status in ('draft','scheduled','sent')),
  scheduled_for timestamptz,
  sent_at       timestamptz,
  -- stats: {sent, opened, clicked, reservations}
  stats         jsonb,
  subject       text,
  body          text not null default ''
);

-- ============================================================
-- Cross-cutting
-- ============================================================

create table if not exists public.activity_events (
  id        text primary key default gen_random_uuid()::text,
  tenant_id text not null references public.tenants(id) on delete cascade,
  at        timestamptz not null default now(),
  actor     text not null,
  module    text not null check (module in ('inventory','sales','events','crm','system')),
  message   text not null
);

create table if not exists public.integration_states (
  provider     text not null check (provider in ('toast','marginedge','caterease')),
  tenant_id    text not null references public.tenants(id) on delete cascade,
  status       text not null default 'awaiting_credentials'
               check (status in ('connected_demo','awaiting_credentials','connected_live','error')),
  last_sync_at timestamptz,
  detail       text not null default '',
  primary key (tenant_id, provider)
);

-- ============================================================
-- Indexes
-- ============================================================

create index if not exists idx_locations_tenant        on public.locations (tenant_id);
create index if not exists idx_users_tenant            on public.users (tenant_id);
create index if not exists idx_vendors_tenant          on public.vendors (tenant_id);
create index if not exists idx_items_tenant            on public.inventory_items (tenant_id);
create index if not exists idx_items_vendor            on public.inventory_items (primary_vendor_id);
create index if not exists idx_invoices_tenant_date    on public.invoices (tenant_id, date desc);
create index if not exists idx_invoices_vendor         on public.invoices (vendor_id);
create index if not exists idx_invoices_status         on public.invoices (tenant_id, status);
create index if not exists idx_invoice_lines_invoice   on public.invoice_lines (invoice_id);
create index if not exists idx_invoice_lines_item      on public.invoice_lines (item_id);
create index if not exists idx_recipes_tenant          on public.recipes (tenant_id);
create index if not exists idx_recipe_ing_recipe       on public.recipe_ingredients (recipe_id);
create index if not exists idx_counts_tenant_date      on public.inventory_counts (tenant_id, date desc);
create index if not exists idx_alerts_tenant_date      on public.price_alerts (tenant_id, date desc);
create index if not exists idx_daily_sales_tenant_date on public.daily_sales (tenant_id, date desc);
create index if not exists idx_daily_sales_loc_date    on public.daily_sales (location_id, date desc);
create index if not exists idx_mis_tenant_period       on public.menu_item_sales (tenant_id, period);
create index if not exists idx_shifts_tenant_date      on public.labor_shifts (tenant_id, date desc);
create index if not exists idx_events_tenant_stage     on public.catering_events (tenant_id, stage);
create index if not exists idx_events_tenant_date      on public.catering_events (tenant_id, event_date);
create index if not exists idx_beos_event              on public.beos (event_id);
create index if not exists idx_payments_event          on public.event_payments (event_id);
create index if not exists idx_guests_tenant           on public.guests (tenant_id);
create index if not exists idx_guests_tenant_lastvisit on public.guests (tenant_id, last_visit desc);
create index if not exists idx_reservations_tenant_dt  on public.reservations (tenant_id, date);
create index if not exists idx_reservations_guest      on public.reservations (guest_id);
create index if not exists idx_segments_tenant         on public.segments (tenant_id);
create index if not exists idx_campaigns_tenant        on public.campaigns (tenant_id, status);
create index if not exists idx_activity_tenant_at      on public.activity_events (tenant_id, at desc);

-- ============================================================
-- Row Level Security
-- Every table is tenant-scoped. The JWT minted for an app user
-- must carry a `tenant_id` claim; service-role connections
-- bypass RLS for admin/sync jobs.
-- ============================================================

alter table public.tenants            enable row level security;
alter table public.locations          enable row level security;
alter table public.users              enable row level security;
alter table public.vendors            enable row level security;
alter table public.inventory_items    enable row level security;
alter table public.invoices           enable row level security;
alter table public.invoice_lines      enable row level security;
alter table public.recipes            enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.inventory_counts   enable row level security;
alter table public.price_alerts       enable row level security;
alter table public.daily_sales        enable row level security;
alter table public.menu_item_sales    enable row level security;
alter table public.labor_shifts       enable row level security;
alter table public.catering_events    enable row level security;
alter table public.beos               enable row level security;
alter table public.event_payments     enable row level security;
alter table public.guests             enable row level security;
alter table public.reservations       enable row level security;
alter table public.segments           enable row level security;
alter table public.campaigns          enable row level security;
alter table public.activity_events    enable row level security;
alter table public.integration_states enable row level security;

-- Tenants: a user may read only their own tenant row.
drop policy if exists tenant_read on public.tenants;
create policy tenant_read on public.tenants
  for select using (id = (auth.jwt() ->> 'tenant_id'));

-- Everything else: full isolation on tenant_id for all commands.
-- (Per-role write restrictions layer on top in app logic.)
drop policy if exists tenant_isolation on public.locations;
create policy tenant_isolation on public.locations
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.users;
create policy tenant_isolation on public.users
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.vendors;
create policy tenant_isolation on public.vendors
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.inventory_items;
create policy tenant_isolation on public.inventory_items
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.invoices;
create policy tenant_isolation on public.invoices
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.invoice_lines;
create policy tenant_isolation on public.invoice_lines
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.recipes;
create policy tenant_isolation on public.recipes
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.recipe_ingredients;
create policy tenant_isolation on public.recipe_ingredients
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.inventory_counts;
create policy tenant_isolation on public.inventory_counts
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.price_alerts;
create policy tenant_isolation on public.price_alerts
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.daily_sales;
create policy tenant_isolation on public.daily_sales
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.menu_item_sales;
create policy tenant_isolation on public.menu_item_sales
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.labor_shifts;
create policy tenant_isolation on public.labor_shifts
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.catering_events;
create policy tenant_isolation on public.catering_events
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.beos;
create policy tenant_isolation on public.beos
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.event_payments;
create policy tenant_isolation on public.event_payments
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.guests;
create policy tenant_isolation on public.guests
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.reservations;
create policy tenant_isolation on public.reservations
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.segments;
create policy tenant_isolation on public.segments
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.campaigns;
create policy tenant_isolation on public.campaigns
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.activity_events;
create policy tenant_isolation on public.activity_events
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));

drop policy if exists tenant_isolation on public.integration_states;
create policy tenant_isolation on public.integration_states
  using (tenant_id = (auth.jwt() ->> 'tenant_id'))
  with check (tenant_id = (auth.jwt() ->> 'tenant_id'));
