// ============================================================
// Integration adapter contract — one shape for every provider.
// In DEMO_MODE adapters serve fixture-backed data through the
// same method signatures the live connectors will use, so the
// app layer never changes when credentials arrive.
// ============================================================

import type {
  CateringEvent, DailySales, IntegrationProvider, IntegrationState,
  Invoice, InvoiceLine, LaborShift, MenuItemSales,
} from '@viox/db';

/** Inclusive ISO-date window for pull-style syncs. */
export interface SyncWindow {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

/** Uniform envelope returned by every sync method. */
export interface SyncResult<T> {
  provider: IntegrationProvider;
  /** ISO datetime the pull completed */
  pulledAt: string;
  count: number;
  records: T[];
  /** where the records came from (demo fixture vs live endpoint) */
  source: string;
}

/**
 * One adapter per provider. Methods are optional because each
 * provider covers a different slice of the domain:
 *   toast      → sales, labor, menu mix
 *   marginedge → invoices + lines (COGS)
 *   caterease  → catering events
 * `status()` is the only universally required method.
 */
export interface IntegrationAdapter {
  provider: IntegrationProvider;

  /** Connection state + human-readable description of what syncs. */
  status(): Promise<IntegrationState>;

  /** Daily sales rollups (Toast). */
  syncSales?(window?: SyncWindow): Promise<SyncResult<DailySales>>;

  /** Labor shifts / punches (Toast). */
  syncLabor?(window?: SyncWindow): Promise<SyncResult<LaborShift>>;

  /** Menu-item mix for a month key like "2026-07" (Toast). */
  syncMenuMix?(period: string): Promise<SyncResult<MenuItemSales>>;

  /** Vendor invoices (MarginEdge). */
  syncInvoices?(): Promise<SyncResult<Invoice>>;

  /** Line detail for one invoice (MarginEdge). */
  syncInvoiceLines?(invoiceId: string): Promise<SyncResult<InvoiceLine>>;

  /** Catering / event book of business (Caterease). */
  syncEvents?(): Promise<SyncResult<CateringEvent>>;
}
