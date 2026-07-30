// ============================================================
// MarginEdge adapter — demo mode.
// ============================================================

import { getRepository } from '@viox/db';
import type { IntegrationState, Invoice, InvoiceLine } from '@viox/db';
import type { IntegrationAdapter, SyncResult } from './types';

/**
 * MarginEdge adapter (invoices, products, food cost).
 *
 * ## Demo mode (current)
 * Serves the fixture AP inbox: 26 invoices over the last 45 days
 * (scanned + keyed), full line detail with price-change percentages,
 * which feed the price-alert and recipe-costing modules natively.
 *
 * ## Real integration path
 * MarginEdge has a straightforward **REST API**
 * (`https://api.marginedge.com/public`) authenticated with an
 * **API key** issued per company from the MarginEdge admin portal
 * (Settings → API Access; the key goes in the `X-API-KEY` header).
 *
 * 1. **Discovery** — `GET /restaurantUnits` maps their units to our
 *    `locations` (HK + EV), `GET /vendors` maps vendor ids.
 * 2. **Invoices** — `GET /orders?restaurantUnitId=…&statuses=…` pages
 *    through invoices ("orders" in ME parlance) incl. photo-captured
 *    ones; line detail via `GET /orders/{orderId}/lineItems` →
 *    `InvoiceLine` (their `unitPrice` + `priceChange` map 1:1).
 * 3. **Products & prices** — `GET /products` + `GET /categories` keep
 *    the inventory catalog, latest price and par data in sync;
 *    price-move webhooks are not offered, so we diff on each poll
 *    (hourly is plenty) and raise `PriceAlert`s ourselves.
 * 4. **Recipes** — ME exposes recipe costing via CSV export only;
 *    we keep recipe costing native (our `recipes` table) and refresh
 *    ingredient costs from `/products`.
 *
 * Credentials Juan collects from the client: the MarginEdge API key
 * and company id, plus confirmation both restaurant units are active
 * on a plan that includes API access.
 */
export function createMarginEdgeAdapter(tenantSlug = 'buena-vista'): IntegrationAdapter {
  const repo = getRepository(tenantSlug);

  return {
    provider: 'marginedge',

    async status(): Promise<IntegrationState> {
      const states = await repo.getIntegrations();
      const s = states.find((x) => x.provider === 'marginedge');
      return (
        s ?? {
          provider: 'marginedge',
          status: 'awaiting_credentials',
          detail: 'MarginEdge not configured for this tenant.',
        }
      );
    },

    async syncInvoices(): Promise<SyncResult<Invoice>> {
      const records = await repo.getInvoices();
      return {
        provider: 'marginedge',
        pulledAt: new Date().toISOString(),
        count: records.length,
        records,
        source: 'demo fixtures (live: MarginEdge GET /orders per restaurant unit)',
      };
    },

    async syncInvoiceLines(invoiceId: string): Promise<SyncResult<InvoiceLine>> {
      const records = await repo.getInvoiceLines(invoiceId);
      return {
        provider: 'marginedge',
        pulledAt: new Date().toISOString(),
        count: records.length,
        records,
        source: 'demo fixtures (live: MarginEdge GET /orders/{id}/lineItems)',
      };
    },
  };
}
