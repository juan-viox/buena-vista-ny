// ============================================================
// Demo driver — implements DataRepository against the in-memory
// Buena Vista fixture dataset (see ./fixtures). Deterministic:
// the same data on every run, anchored to demo "today"
// 2026-07-29. Swappable for createSupabaseRepository later
// without any app-layer changes (see schema.sql).
// ============================================================

import type { DataRepository, DateRange } from './repo';
import type {
  ActivityEvent, BEO, Campaign, CateringEvent, DailySales, EventPayment,
  Guest, ID, IntegrationState, InventoryCount, InventoryItem, Invoice,
  InvoiceLine, LaborShift, Location, MenuItemSales, PriceAlert, Recipe,
  Reservation, Segment, Tenant, User, Vendor,
} from './types';
import {
  ACTIVITY_EVENTS, BEOS, CAMPAIGNS, CATERING_EVENTS, DAILY_SALES,
  EVENT_PAYMENTS, GUESTS, INTEGRATION_STATES, INVENTORY_COUNTS,
  INVENTORY_ITEMS, INVOICE_LINES, INVOICES, LABOR_SHIFTS, LOCATIONS,
  MENU_ITEM_SALES, PRICE_ALERTS, RECIPES, RESERVATIONS, SEGMENTS,
  TENANT, USERS, VENDORS,
} from './fixtures';

/** Inclusive ISO-date range filter (YYYY-MM-DD string compare is safe). */
function inRange(dateIso: string, range?: DateRange): boolean {
  if (!range) return true;
  const day = dateIso.slice(0, 10);
  return day >= range.from && day <= range.to;
}

/**
 * Creates the demo repository. Only the `buena-vista` tenant ships
 * fixtures today; additional demo tenants would register their own
 * dataset here keyed by slug.
 */
export function createDemoRepository(tenantSlug = 'buena-vista'): DataRepository {
  if (tenantSlug !== 'buena-vista') {
    throw new Error(`No demo fixtures for tenant "${tenantSlug}" — only "buena-vista" is seeded.`);
  }

  return {
    // ---- tenancy ----
    async getTenant(): Promise<Tenant> {
      return TENANT;
    },
    async getLocations(): Promise<Location[]> {
      return LOCATIONS;
    },
    async getUsers(): Promise<User[]> {
      return USERS;
    },

    // ---- inventory & COGS ----
    async getVendors(): Promise<Vendor[]> {
      return VENDORS;
    },
    async getInventoryItems(): Promise<InventoryItem[]> {
      return INVENTORY_ITEMS;
    },
    async getInvoices(): Promise<Invoice[]> {
      return INVOICES;
    },
    async getInvoiceLines(invoiceId: ID): Promise<InvoiceLine[]> {
      return INVOICE_LINES[invoiceId] ?? [];
    },
    async getRecipes(): Promise<Recipe[]> {
      return RECIPES;
    },
    async getInventoryCounts(): Promise<InventoryCount[]> {
      return [...INVENTORY_COUNTS].sort((a, b) => (a.date < b.date ? 1 : -1));
    },
    async getPriceAlerts(): Promise<PriceAlert[]> {
      return [...PRICE_ALERTS].sort((a, b) => b.changePct - a.changePct);
    },

    // ---- POS ops & sales ----
    async getDailySales(range?: DateRange): Promise<DailySales[]> {
      return DAILY_SALES.filter((d) => inRange(d.date, range));
    },
    async getMenuItemSales(period: string): Promise<MenuItemSales[]> {
      return MENU_ITEM_SALES.filter((m) => m.period === period);
    },
    async getLaborShifts(range?: DateRange): Promise<LaborShift[]> {
      return LABOR_SHIFTS.filter((s) => inRange(s.date, range));
    },

    // ---- catering & events ----
    async getCateringEvents(): Promise<CateringEvent[]> {
      return CATERING_EVENTS;
    },
    async getBEO(eventId: ID): Promise<BEO | null> {
      return BEOS.find((b) => b.eventId === eventId) ?? null;
    },
    async getEventPayments(eventId: ID): Promise<EventPayment[]> {
      return EVENT_PAYMENTS.filter((p) => p.eventId === eventId);
    },

    // ---- CRM ----
    async getGuests(): Promise<Guest[]> {
      return GUESTS;
    },
    async getReservations(): Promise<Reservation[]> {
      return RESERVATIONS;
    },
    async getSegments(): Promise<Segment[]> {
      return SEGMENTS;
    },
    async getCampaigns(): Promise<Campaign[]> {
      return CAMPAIGNS;
    },

    // ---- cross-cutting ----
    async getActivity(limit = 30): Promise<ActivityEvent[]> {
      return [...ACTIVITY_EVENTS]
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .slice(0, limit);
    },
    async getIntegrations(): Promise<IntegrationState[]> {
      return INTEGRATION_STATES;
    },
  };
}
