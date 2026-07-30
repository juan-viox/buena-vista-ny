// ============================================================
// Toast POS adapter — demo mode.
// ============================================================

import { getRepository } from '@viox/db';
import type { DailySales, IntegrationState, LaborShift, MenuItemSales } from '@viox/db';
import type { IntegrationAdapter, SyncResult, SyncWindow } from './types';

/**
 * Toast POS adapter.
 *
 * ## Demo mode (current)
 * Serves the Buena Vista fixture dataset through the exact method
 * signatures the live connector will use: 90 days of daily sales
 * rollups per location (category + daypart splits), monthly menu
 * mix, and labor shifts.
 *
 * ## Real integration path
 * Toast exposes a **partner API** (`https://ws-api.toasttab.com`)
 * gated by the Toast partner program:
 *
 * 1. **Auth** — OAuth2 client-credentials against
 *    `/authentication/v1/authentication/login` using the partner
 *    `clientId`/`clientSecret`; the returned bearer token is scoped
 *    per restaurant via the `Toast-Restaurant-External-ID` header
 *    (one GUID per location — HK and EV each have one).
 * 2. **Pull endpoints** —
 *    `/orders/v2/ordersBulk` (checks, items, discounts, voids),
 *    `/labor/v1/timeEntries` (punches → LaborShift),
 *    `/labor/v1/employees`, `/menus/v2/menus` (menu + price sync),
 *    `/reporting` aggregates for day-level rollups.
 * 3. **Webhooks** — subscribe to `orders.*` and `labor.*` topics so
 *    sales land in near-real-time instead of nightly polling; verify
 *    with the webhook signing secret.
 * 4. **Mapping** — Toast `restaurantGuid` → `locations.id`,
 *    salesCategories → `DailySales.categorySales`, dayparts derived
 *    from `openedDate` service-period config, menu item GUIDs →
 *    `MenuItemSales.menuItemName` (join on our recipe table).
 *
 * Credentials Juan collects from the client: Toast Web admin access
 * to approve the partner connection, the restaurant GUIDs for both
 * locations, and (if using the standard API instead of a partnership)
 * a Toast "API access" add-on purchase on their plan.
 */
export function createToastAdapter(tenantSlug = 'buena-vista'): IntegrationAdapter {
  const repo = getRepository(tenantSlug);

  return {
    provider: 'toast',

    async status(): Promise<IntegrationState> {
      const states = await repo.getIntegrations();
      const s = states.find((x) => x.provider === 'toast');
      return (
        s ?? {
          provider: 'toast',
          status: 'awaiting_credentials',
          detail: 'Toast not configured for this tenant.',
        }
      );
    },

    async syncSales(window?: SyncWindow): Promise<SyncResult<DailySales>> {
      const records = await repo.getDailySales(window);
      return {
        provider: 'toast',
        pulledAt: new Date().toISOString(),
        count: records.length,
        records,
        source: 'demo fixtures (live: Toast /orders/v2/ordersBulk + reporting rollups)',
      };
    },

    async syncLabor(window?: SyncWindow): Promise<SyncResult<LaborShift>> {
      const records = await repo.getLaborShifts(window);
      return {
        provider: 'toast',
        pulledAt: new Date().toISOString(),
        count: records.length,
        records,
        source: 'demo fixtures (live: Toast /labor/v1/timeEntries)',
      };
    },

    async syncMenuMix(period: string): Promise<SyncResult<MenuItemSales>> {
      const records = await repo.getMenuItemSales(period);
      return {
        provider: 'toast',
        pulledAt: new Date().toISOString(),
        count: records.length,
        records,
        source: 'demo fixtures (live: Toast menus v2 + item-level sales export)',
      };
    },
  };
}
