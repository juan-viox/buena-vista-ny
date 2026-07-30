// ============================================================
// Supabase driver — implements DataRepository via PostgREST
// (plain fetch, no SDK; server-only env: SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY). Column names follow schema.sql
// (snake_case) and are mapped to the camelCase domain types.
//
// RESILIENCE CONTRACT: every method is wrapped — on a fetch
// failure OR an empty result set it warns once (per method) and
// serves the demo repository's result instead, so a partially
// pushed/seeded database can never blank a dashboard.
//
// MERGE CONTRACT (getGuests / getReservations): the LIVE capture
// tables (`guests`, `reservation_requests`) are keyed by
// tenant_slug and have their own shapes (see apps/crm/lib/
// reservations.ts). Demo fixtures stay the base dataset and any
// live rows are appended, mapped best-effort into the domain
// shape with their capture source preserved — so real captured
// guests appear alongside the demo CRM data.
// ============================================================

import type { DataRepository, DateRange } from './repo';
import type {
  ActivityEvent, BEO, Campaign, CateringEvent, DailySales, EventPayment,
  Guest, ID, IntegrationState, InventoryCount, InventoryItem, Invoice,
  InvoiceLine, LaborShift, Location, MenuItemSales, PriceAlert, Recipe,
  RecipeIngredient, Reservation, Review, Segment, Tenant, Unit, User, Vendor,
} from './types';
import { createDemoRepository } from './demo';

type Row = Record<string, unknown>;

// ---------- PostgREST target (server-only env) ----------

interface SupabaseTarget {
  base: string;
  headers: Record<string, string>;
}

function supabaseTarget(): SupabaseTarget | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {
    base: `${url.replace(/\/+$/, '')}/rest/v1`,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  };
}

// ---------- coercion helpers (PostgREST json → domain) ----------

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const opt = (v: unknown): string | undefined => (v === null || v === undefined ? undefined : String(v));
const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};
const b = (v: unknown): boolean => v === true || v === 'true' || v === 't' || v === 1;
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
const numRec = (v: unknown): Record<string, number> => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = n(val);
  return out;
};
const jsonArr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const enc = encodeURIComponent;

// ---------- warn-once bookkeeping ----------

const warned = new Set<string>();
function warnOnce(method: string, reason: string): void {
  if (warned.has(method)) return;
  warned.add(method);
  console.warn(`[db/supabase] ${method}: ${reason} — serving demo fixture data instead.`);
}

// ---------- row mappers (schema.sql snake_case → camelCase) ----------

function mapTenant(r: Row): Tenant {
  return {
    id: s(r.id),
    slug: s(r.slug),
    name: s(r.name),
    theme: { accent: s(r.theme_accent), primary: s(r.theme_primary), logoText: s(r.theme_logo_text) },
    createdAt: s(r.created_at),
  };
}

function mapLocation(r: Row): Location {
  return { id: s(r.id), tenantId: s(r.tenant_id), name: s(r.name), address: s(r.address), phone: s(r.phone), timezone: s(r.timezone) };
}

function mapUser(r: Row): User {
  return { id: s(r.id), tenantId: s(r.tenant_id), name: s(r.name), email: s(r.email), role: s(r.role) as User['role'], locationIds: arr(r.location_ids) };
}

function mapVendor(r: Row): Vendor {
  return { id: s(r.id), tenantId: s(r.tenant_id), name: s(r.name), category: s(r.category), accountNumber: opt(r.account_number), terms: opt(r.terms) };
}

function mapInventoryItem(r: Row): InventoryItem {
  return {
    id: s(r.id), tenantId: s(r.tenant_id), name: s(r.name), category: s(r.category),
    unit: s(r.unit) as Unit, lastPrice: n(r.last_price), avgPrice30d: n(r.avg_price_30d),
    parLevel: n(r.par_level), onHand: n(r.on_hand), primaryVendorId: s(r.primary_vendor_id),
  };
}

function mapInvoice(r: Row): Invoice {
  return {
    id: s(r.id), tenantId: s(r.tenant_id), locationId: s(r.location_id), vendorId: s(r.vendor_id),
    invoiceNumber: s(r.invoice_number), date: s(r.date), total: n(r.total),
    status: s(r.status) as Invoice['status'], lineCount: n(r.line_count), scanned: b(r.scanned),
  };
}

function mapInvoiceLine(r: Row): InvoiceLine {
  return {
    id: s(r.id), invoiceId: s(r.invoice_id), itemId: s(r.item_id), description: s(r.description),
    qty: n(r.qty), unit: s(r.unit) as Unit, unitPrice: n(r.unit_price), total: n(r.total),
    priceChangePct: n(r.price_change_pct),
  };
}

function mapRecipeIngredient(r: Row): RecipeIngredient {
  return { itemId: s(r.item_id), itemName: s(r.item_name), qty: n(r.qty), unit: s(r.unit) as Unit, cost: n(r.cost) };
}

function mapRecipe(r: Row, ingredients: RecipeIngredient[]): Recipe {
  return {
    id: s(r.id), tenantId: s(r.tenant_id), menuItemName: s(r.menu_item_name), menuPrice: n(r.menu_price),
    category: s(r.category), ingredients, plateCost: n(r.plate_cost), costPct: n(r.cost_pct),
    targetCostPct: n(r.target_cost_pct),
  };
}

function mapInventoryCount(r: Row): InventoryCount {
  return {
    id: s(r.id), tenantId: s(r.tenant_id), locationId: s(r.location_id), date: s(r.date),
    countedBy: s(r.counted_by), totalValue: n(r.total_value),
    status: s(r.status) as InventoryCount['status'], itemsCounted: n(r.items_counted),
  };
}

function mapPriceAlert(r: Row): PriceAlert {
  return {
    id: s(r.id), tenantId: s(r.tenant_id), itemId: s(r.item_id), itemName: s(r.item_name),
    vendorName: s(r.vendor_name), oldPrice: n(r.old_price), newPrice: n(r.new_price),
    changePct: n(r.change_pct), date: s(r.date), acknowledged: b(r.acknowledged),
  };
}

function mapDailySales(r: Row): DailySales {
  return {
    id: s(r.id), tenantId: s(r.tenant_id), locationId: s(r.location_id), date: s(r.date),
    netSales: n(r.net_sales), grossSales: n(r.gross_sales), guestCount: n(r.guest_count),
    checkCount: n(r.check_count), avgCheck: n(r.avg_check), comps: n(r.comps), voids: n(r.voids),
    laborCost: n(r.labor_cost), laborPct: n(r.labor_pct),
    categorySales: numRec(r.category_sales), dayparts: numRec(r.dayparts),
  };
}

function mapMenuItemSales(r: Row): MenuItemSales {
  return {
    id: s(r.id), tenantId: s(r.tenant_id), locationId: s(r.location_id), period: s(r.period),
    menuItemName: s(r.menu_item_name), category: s(r.category), qtySold: n(r.qty_sold),
    netSales: n(r.net_sales), plateCost: n(r.plate_cost), margin: n(r.margin),
    quadrant: s(r.quadrant) as MenuItemSales['quadrant'],
  };
}

function mapLaborShift(r: Row): LaborShift {
  return {
    id: s(r.id), tenantId: s(r.tenant_id), locationId: s(r.location_id), date: s(r.date),
    role: s(r.role), employee: s(r.employee), hours: n(r.hours), wage: n(r.wage), cost: n(r.cost),
  };
}

function mapCateringEvent(r: Row): CateringEvent {
  return {
    id: s(r.id), tenantId: s(r.tenant_id), locationId: s(r.location_id), guestId: opt(r.guest_id),
    title: s(r.title), contactName: s(r.contact_name), contactEmail: s(r.contact_email),
    contactPhone: s(r.contact_phone), type: s(r.type) as CateringEvent['type'],
    stage: s(r.stage) as CateringEvent['stage'], eventDate: s(r.event_date), partySize: n(r.party_size),
    space: s(r.space), budget: n(r.budget), quotedTotal: n(r.quoted_total),
    depositPaid: b(r.deposit_paid), depositAmount: n(r.deposit_amount), menuPackage: s(r.menu_package),
    notes: s(r.notes), createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}

function mapBEO(r: Row): BEO {
  return {
    id: s(r.id), eventId: s(r.event_id), version: n(r.version),
    timeline: jsonArr<{ time: string; item: string }>(r.timeline),
    menu: jsonArr<{ course: string; items: string[] }>(r.menu),
    staffing: jsonArr<{ role: string; count: number }>(r.staffing),
    rentals: arr(r.rentals), av: arr(r.av), dietaryNotes: s(r.dietary_notes),
    status: s(r.status) as BEO['status'],
  };
}

function mapEventPayment(r: Row): EventPayment {
  return {
    id: s(r.id), eventId: s(r.event_id), date: s(r.date), amount: n(r.amount),
    method: s(r.method) as EventPayment['method'], kind: s(r.kind) as EventPayment['kind'],
  };
}

function mapSegment(r: Row): Segment {
  return { id: s(r.id), tenantId: s(r.tenant_id), name: s(r.name), description: s(r.description), guestCount: n(r.guest_count), rules: s(r.rules) };
}

function mapCampaign(r: Row): Campaign {
  const stats = r.stats && typeof r.stats === 'object' && !Array.isArray(r.stats)
    ? (r.stats as Campaign['stats'])
    : undefined;
  return {
    id: s(r.id), tenantId: s(r.tenant_id), name: s(r.name),
    channel: s(r.channel) as Campaign['channel'], segmentId: s(r.segment_id),
    status: s(r.status) as Campaign['status'], scheduledFor: opt(r.scheduled_for),
    sentAt: opt(r.sent_at), stats, subject: opt(r.subject), body: s(r.body),
  };
}

function mapReview(r: Row): Review {
  return {
    id: s(r.id), tenantId: s(r.tenant_id), platform: s(r.platform) as Review['platform'],
    author: s(r.author), rating: n(r.rating) as Review['rating'], text: s(r.text), date: s(r.date),
    replied: b(r.replied), replyText: opt(r.reply_text), dishMentions: arr(r.dish_mentions),
  };
}

function mapActivityEvent(r: Row): ActivityEvent {
  return { id: s(r.id), tenantId: s(r.tenant_id), at: s(r.at), actor: s(r.actor), module: s(r.module) as ActivityEvent['module'], message: s(r.message) };
}

function mapIntegrationState(r: Row): IntegrationState {
  return {
    provider: s(r.provider) as IntegrationState['provider'],
    status: s(r.status) as IntegrationState['status'],
    lastSyncAt: opt(r.last_sync_at), detail: s(r.detail),
  };
}

// ---------- live-capture mappers (tenant_slug-keyed tables) ----------

/** Best-effort map of a LIVE `guests` capture row into the Guest shape.
 *  The capture source ('voice' | 'whatsapp' | 'web' | 'newsletter' | …)
 *  is preserved verbatim so dashboards can show the real channel. */
function mapLiveGuest(r: Row, tenantId: string): Guest {
  const created = opt(r.created_at);
  const lastVisit = opt(r.last_visit) ?? created ?? '';
  return {
    id: s(r.id),
    tenantId,
    name: opt(r.name) ?? 'Guest',
    email: opt(r.email) ?? '',
    phone: opt(r.phone),
    tags: ['new'],
    visits: n(r.visits),
    lifetimeSpend: n(r.lifetime_spend),
    avgSpend: n(r.avg_spend),
    lastVisit: lastVisit.slice(0, 10),
    favoriteLocationId: opt(r.favorite_location_id) ?? '',
    favoriteItems: arr(r.favorite_items),
    birthday: opt(r.birthday),
    notes: opt(r.notes) ?? '',
    source: (opt(r.source) ?? 'walk_in') as Guest['source'],
    marketingOptIn: b(r.marketing_opt_in),
    createdAt: created ?? '',
  };
}

/** 'hells-kitchen' ⇄ "Hell's Kitchen" — apostrophes dropped, then kebab. */
function locSlug(name: string): string {
  return name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const LIVE_RES_STATUS: Record<string, Reservation['status']> = {
  new: 'upcoming', contacted: 'upcoming', confirmed: 'upcoming', upcoming: 'upcoming',
  seated: 'seated', completed: 'completed', done: 'completed',
  cancelled: 'cancelled', canceled: 'cancelled', declined: 'cancelled', no_show: 'no_show',
};

/** Best-effort map of a LIVE `reservation_requests` row into the Reservation shape. */
function mapLiveReservation(r: Row, tenantId: string, locations: Location[]): Reservation {
  const locText = opt(r.location) ?? '';
  const match = locations.find((l) => locSlug(l.name) === locSlug(locText));
  const date = opt(r.requested_date);
  const time = opt(r.requested_time);
  const when = date
    ? (time && /^\d{1,2}:\d{2}/.test(time) ? `${date}T${time.length === 4 ? `0${time}` : time}` : date)
    : (opt(r.created_at) ?? '');
  const partySize = n(r.party_size);
  const channel = opt(r.channel) ?? 'web';
  return {
    id: s(r.id),
    tenantId,
    locationId: match?.id ?? locations[0]?.id ?? '',
    guestId: opt(r.guest_id) ?? '',
    date: when,
    partySize: partySize > 0 ? partySize : 2,
    status: LIVE_RES_STATUS[(opt(r.status) ?? 'new').toLowerCase()] ?? 'upcoming',
    occasion: opt(r.occasion),
    source: channel === 'voice' ? 'phone' : 'website',
  };
}

// ---------- repository ----------

/**
 * PostgREST-backed DataRepository for one tenant. Ops tables are
 * keyed by tenant_id (resolved once from the tenant slug); the live
 * capture tables are keyed by tenant_slug directly.
 */
export function createSupabaseRepository(tenantSlug = 'buena-vista'): DataRepository {
  // Demo repository is the resilience fallback + the merge base.
  // Lazy so a future non-fixture tenant only pays for it when needed.
  let demoRepo: DataRepository | null = null;
  const demo = (): DataRepository => (demoRepo ??= createDemoRepository(tenantSlug));

  /** GET /rest/v1/{table}?{query} → rows, or null on any failure. */
  async function select(table: string, query: string): Promise<Row[] | null> {
    const target = supabaseTarget();
    if (!target) return null;
    try {
      const res = await fetch(`${target.base}/${table}?${query}`, { headers: target.headers, cache: 'no-store' });
      if (!res.ok) return null;
      const rows = (await res.json()) as unknown;
      return Array.isArray(rows) ? (rows as Row[]) : null;
    } catch {
      return null;
    }
  }

  // Tenant id for the ops tables, resolved from the slug and cached on
  // success only (a transient failure must not poison later requests).
  let cachedTenantId: string | null = null;
  async function tenantId(): Promise<string> {
    if (cachedTenantId) return cachedTenantId;
    const rows = await select('tenants', `select=id&slug=eq.${enc(tenantSlug)}&limit=1`);
    const id = rows && rows.length > 0 ? opt(rows[0].id) : undefined;
    if (id) {
      cachedTenantId = id;
      return id;
    }
    try {
      return (await demo().getTenant()).id;
    } catch {
      return '';
    }
  }

  /** Tenant-scoped select with the standard fallback contract:
   *  fetch failure OR empty result → warn once + demo result. */
  async function listOrDemo<T>(
    method: string,
    table: string,
    extraQuery: string,
    map: (r: Row) => T,
    fallback: () => Promise<T[]>,
  ): Promise<T[]> {
    try {
      const tid = await tenantId();
      const rows = await select(table, `select=*&tenant_id=eq.${enc(tid)}${extraQuery}`);
      if (rows && rows.length > 0) return rows.map(map);
      warnOnce(method, rows ? `no ${table} rows for tenant "${tenantSlug}"` : `${table} fetch failed`);
    } catch (err) {
      warnOnce(method, `error reading ${table}: ${String(err)}`);
    }
    return fallback();
  }

  const rangeQuery = (range?: DateRange): string =>
    range ? `&date=gte.${enc(range.from)}&date=lte.${enc(range.to)}` : '';

  return {
    // ---- tenancy ----
    async getTenant(): Promise<Tenant> {
      try {
        const rows = await select('tenants', `select=*&slug=eq.${enc(tenantSlug)}&limit=1`);
        if (rows && rows.length > 0) return mapTenant(rows[0]);
        warnOnce('getTenant', rows ? `tenant "${tenantSlug}" not found` : 'tenants fetch failed');
      } catch (err) {
        warnOnce('getTenant', `error reading tenants: ${String(err)}`);
      }
      return demo().getTenant();
    },
    async getLocations(): Promise<Location[]> {
      return listOrDemo('getLocations', 'locations', '&order=name.asc', mapLocation, () => demo().getLocations());
    },
    async getUsers(): Promise<User[]> {
      return listOrDemo('getUsers', 'users', '&order=name.asc', mapUser, () => demo().getUsers());
    },

    // ---- inventory & COGS ----
    async getVendors(): Promise<Vendor[]> {
      return listOrDemo('getVendors', 'vendors', '&order=name.asc', mapVendor, () => demo().getVendors());
    },
    async getInventoryItems(): Promise<InventoryItem[]> {
      return listOrDemo('getInventoryItems', 'inventory_items', '&order=name.asc', mapInventoryItem, () => demo().getInventoryItems());
    },
    async getInvoices(): Promise<Invoice[]> {
      return listOrDemo('getInvoices', 'invoices', '&order=date.desc', mapInvoice, () => demo().getInvoices());
    },
    async getInvoiceLines(invoiceId: ID): Promise<InvoiceLine[]> {
      try {
        const rows = await select('invoice_lines', `select=*&invoice_id=eq.${enc(invoiceId)}&order=id.asc`);
        if (rows && rows.length > 0) return rows.map(mapInvoiceLine);
        warnOnce('getInvoiceLines', rows ? 'no invoice_lines rows' : 'invoice_lines fetch failed');
      } catch (err) {
        warnOnce('getInvoiceLines', `error reading invoice_lines: ${String(err)}`);
      }
      return demo().getInvoiceLines(invoiceId);
    },
    async getRecipes(): Promise<Recipe[]> {
      try {
        const tid = await tenantId();
        const [recipes, ingredients] = await Promise.all([
          select('recipes', `select=*&tenant_id=eq.${enc(tid)}&order=menu_item_name.asc`),
          select('recipe_ingredients', `select=*&tenant_id=eq.${enc(tid)}`),
        ]);
        if (recipes && recipes.length > 0 && ingredients) {
          const byRecipe = new Map<string, RecipeIngredient[]>();
          for (const row of ingredients) {
            const key = s(row.recipe_id);
            const list = byRecipe.get(key) ?? [];
            list.push(mapRecipeIngredient(row));
            byRecipe.set(key, list);
          }
          return recipes.map((r) => mapRecipe(r, byRecipe.get(s(r.id)) ?? []));
        }
        warnOnce('getRecipes', recipes && ingredients ? 'no recipes rows' : 'recipes/recipe_ingredients fetch failed');
      } catch (err) {
        warnOnce('getRecipes', `error reading recipes: ${String(err)}`);
      }
      return demo().getRecipes();
    },
    async getInventoryCounts(): Promise<InventoryCount[]> {
      return listOrDemo('getInventoryCounts', 'inventory_counts', '&order=date.desc', mapInventoryCount, () => demo().getInventoryCounts());
    },
    async getPriceAlerts(): Promise<PriceAlert[]> {
      return listOrDemo('getPriceAlerts', 'price_alerts', '&order=change_pct.desc', mapPriceAlert, () => demo().getPriceAlerts());
    },

    // ---- POS ops & sales ----
    async getDailySales(range?: DateRange): Promise<DailySales[]> {
      return listOrDemo('getDailySales', 'daily_sales', `${rangeQuery(range)}&order=date.asc`, mapDailySales, () => demo().getDailySales(range));
    },
    async getMenuItemSales(period: string): Promise<MenuItemSales[]> {
      return listOrDemo('getMenuItemSales', 'menu_item_sales', `&period=eq.${enc(period)}`, mapMenuItemSales, () => demo().getMenuItemSales(period));
    },
    async getLaborShifts(range?: DateRange): Promise<LaborShift[]> {
      return listOrDemo('getLaborShifts', 'labor_shifts', `${rangeQuery(range)}&order=date.asc`, mapLaborShift, () => demo().getLaborShifts(range));
    },

    // ---- catering & events ----
    async getCateringEvents(): Promise<CateringEvent[]> {
      return listOrDemo('getCateringEvents', 'catering_events', '&order=event_date.asc', mapCateringEvent, () => demo().getCateringEvents());
    },
    async getBEO(eventId: ID): Promise<BEO | null> {
      try {
        const rows = await select('beos', `select=*&event_id=eq.${enc(eventId)}&order=version.desc&limit=1`);
        if (rows && rows.length > 0) return mapBEO(rows[0]);
        warnOnce('getBEO', rows ? 'no beos rows' : 'beos fetch failed');
      } catch (err) {
        warnOnce('getBEO', `error reading beos: ${String(err)}`);
      }
      return demo().getBEO(eventId);
    },
    async getEventPayments(eventId: ID): Promise<EventPayment[]> {
      try {
        const rows = await select('event_payments', `select=*&event_id=eq.${enc(eventId)}&order=date.asc`);
        if (rows && rows.length > 0) return rows.map(mapEventPayment);
        warnOnce('getEventPayments', rows ? 'no event_payments rows' : 'event_payments fetch failed');
      } catch (err) {
        warnOnce('getEventPayments', `error reading event_payments: ${String(err)}`);
      }
      return demo().getEventPayments(eventId);
    },

    // ---- CRM ----
    // MERGE: demo fixtures are the base; LIVE captured guests
    // (tenant_slug-keyed table written by the voice/WhatsApp/web
    // concierges) are appended, newest data included best-effort.
    async getGuests(): Promise<Guest[]> {
      const base = await demo().getGuests();
      try {
        const rows = await select('guests', `select=*&tenant_slug=eq.${enc(tenantSlug)}&limit=500`);
        if (rows === null) {
          warnOnce('getGuests', 'live guests fetch failed — serving demo fixtures only');
          return base;
        }
        const tid = base[0]?.tenantId ?? tenantSlug;
        const baseIds = new Set(base.map((g) => g.id));
        const live = rows.map((r) => mapLiveGuest(r, tid)).filter((g) => g.id && !baseIds.has(g.id));
        return [...base, ...live];
      } catch (err) {
        warnOnce('getGuests', `error reading live guests: ${String(err)}`);
        return base;
      }
    },
    // MERGE: demo fixtures + LIVE reservation_requests mapped
    // best-effort into the Reservation shape.
    async getReservations(): Promise<Reservation[]> {
      const base = await demo().getReservations();
      try {
        const rows = await select('reservation_requests', `select=*&tenant_slug=eq.${enc(tenantSlug)}&limit=500`);
        if (rows === null) {
          warnOnce('getReservations', 'live reservation_requests fetch failed — serving demo fixtures only');
          return base;
        }
        const locations = await demo().getLocations();
        const tid = base[0]?.tenantId ?? tenantSlug;
        const baseIds = new Set(base.map((r) => r.id));
        const live = rows.map((r) => mapLiveReservation(r, tid, locations)).filter((r) => r.id && !baseIds.has(r.id));
        return [...base, ...live];
      } catch (err) {
        warnOnce('getReservations', `error reading live reservation_requests: ${String(err)}`);
        return base;
      }
    },
    async getSegments(): Promise<Segment[]> {
      return listOrDemo('getSegments', 'segments', '&order=name.asc', mapSegment, () => demo().getSegments());
    },
    async getCampaigns(): Promise<Campaign[]> {
      return listOrDemo('getCampaigns', 'campaigns', '&order=name.asc', mapCampaign, () => demo().getCampaigns());
    },
    async getReviews(): Promise<Review[]> {
      return listOrDemo('getReviews', 'reviews', '&order=date.desc', mapReview, () => demo().getReviews());
    },

    // ---- cross-cutting ----
    async getActivity(limit = 30): Promise<ActivityEvent[]> {
      return listOrDemo('getActivity', 'activity_events', `&order=at.desc&limit=${limit}`, mapActivityEvent, () => demo().getActivity(limit));
    },
    async getIntegrations(): Promise<IntegrationState[]> {
      return listOrDemo('getIntegrations', 'integration_states', '&order=provider.asc', mapIntegrationState, () => demo().getIntegrations());
    },
  };
}
