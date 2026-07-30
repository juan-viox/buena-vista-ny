// ============================================================
// DataRepository — the single data-access contract.
// Drivers: demo (in-memory fixtures, default) | supabase
// (./supabase.ts — PostgREST against schema.sql; needs
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and USE_SUPABASE_DATA
// flipped on; falls back to demo fixtures per method).
// All methods are async so drivers can swap without app changes.
// ============================================================

import type {
  ActivityEvent, BEO, Campaign, CateringEvent, DailySales, EventPayment,
  Guest, ID, IntegrationState, InventoryCount, InventoryItem, Invoice,
  InvoiceLine, LaborShift, Location, MenuItemSales, PriceAlert, Recipe,
  Reservation, Review, Segment, Tenant, User,
} from './types';

export interface DateRange { from: string; to: string } // ISO dates inclusive

export interface DataRepository {
  // tenancy
  getTenant(): Promise<Tenant>;
  getLocations(): Promise<Location[]>;
  getUsers(): Promise<User[]>;

  // inventory & COGS
  getVendors(): Promise<import('./types').Vendor[]>;
  getInventoryItems(): Promise<InventoryItem[]>;
  getInvoices(): Promise<Invoice[]>;
  getInvoiceLines(invoiceId: ID): Promise<InvoiceLine[]>;
  getRecipes(): Promise<Recipe[]>;
  getInventoryCounts(): Promise<InventoryCount[]>;
  getPriceAlerts(): Promise<PriceAlert[]>;

  // POS ops & sales
  getDailySales(range?: DateRange): Promise<DailySales[]>;
  getMenuItemSales(period: string): Promise<MenuItemSales[]>; // "2026-07"
  getLaborShifts(range?: DateRange): Promise<LaborShift[]>;

  // catering & events
  getCateringEvents(): Promise<CateringEvent[]>;
  getBEO(eventId: ID): Promise<BEO | null>;
  getEventPayments(eventId: ID): Promise<EventPayment[]>;

  // CRM
  getGuests(): Promise<Guest[]>;
  getReservations(): Promise<Reservation[]>;
  getSegments(): Promise<Segment[]>;
  getCampaigns(): Promise<Campaign[]>;
  /** Reviews across Google / Yelp / OpenTable / TripAdvisor, newest first. */
  getReviews(): Promise<Review[]>;

  // cross-cutting
  getActivity(limit?: number): Promise<ActivityEvent[]>;
  getIntegrations(): Promise<IntegrationState[]>;
}

export type DriverKind = 'demo' | 'supabase';

/**
 * Returns the repository for a tenant. DEMO_MODE (default) serves
 * the Buena Vista fixture dataset from ./fixtures.
 *
 * Driver switch: USE_SUPABASE_DATA=1|true|yes (the documented data
 * flip — see docs/OPERATIONS.md §4 Phase 3). Deliberately NOT keyed
 * off NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL: those are set for
 * auth and the live capture tables long before the dashboards flip,
 * and must never change read behavior on their own.
 */
export function getRepository(tenantSlug = 'buena-vista'): DataRepository {
  const flag = (process.env.USE_SUPABASE_DATA ?? '').toLowerCase();
  const driver: DriverKind = flag === '1' || flag === 'true' || flag === 'yes' ? 'supabase' : 'demo';
  if (driver === 'supabase') {
    // PostgREST driver (packages/db/src/supabase.ts). Push + seed the ops
    // tables first (scripts/push-schema.mjs, scripts/seed.mjs); any table
    // that is missing or empty falls back to demo fixtures per method.
    const { createSupabaseRepository } = require('./supabase') as typeof import('./supabase');
    return createSupabaseRepository(tenantSlug);
  }
  // Lazy import keeps fixtures out of any future supabase-only bundle.
  const { createDemoRepository } = require('./demo') as typeof import('./demo');
  return createDemoRepository(tenantSlug);
}
