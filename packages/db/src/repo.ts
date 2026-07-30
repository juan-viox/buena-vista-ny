// ============================================================
// DataRepository — the single data-access contract.
// Drivers: demo (in-memory fixtures, default) | supabase (later:
// set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and
// implement createSupabaseRepository against schema.sql).
// All methods are async so drivers can swap without app changes.
// ============================================================

import type {
  ActivityEvent, BEO, Campaign, CateringEvent, DailySales, EventPayment,
  Guest, ID, IntegrationState, InventoryCount, InventoryItem, Invoice,
  InvoiceLine, LaborShift, Location, MenuItemSales, PriceAlert, Recipe,
  Reservation, Segment, Tenant, User,
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

  // cross-cutting
  getActivity(limit?: number): Promise<ActivityEvent[]>;
  getIntegrations(): Promise<IntegrationState[]>;
}

export type DriverKind = 'demo' | 'supabase';

/**
 * Returns the repository for a tenant. DEMO_MODE (default) serves
 * the Buena Vista fixture dataset from ./fixtures.
 */
export function getRepository(tenantSlug = 'buena-vista'): DataRepository {
  const driver: DriverKind = process.env.NEXT_PUBLIC_SUPABASE_URL ? 'supabase' : 'demo';
  if (driver === 'supabase') {
    // Placeholder: swap in createSupabaseRepository(tenantSlug) once a
    // Supabase project is provisioned (schema.sql is ready to push).
    throw new Error('Supabase driver not wired yet — unset NEXT_PUBLIC_SUPABASE_URL to run in DEMO_MODE.');
  }
  // Lazy import keeps fixtures out of any future supabase-only bundle.
  const { createDemoRepository } = require('./demo') as typeof import('./demo');
  return createDemoRepository(tenantSlug);
}
