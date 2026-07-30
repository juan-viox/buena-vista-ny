// ============================================================
// Caterease adapter — demo mode.
// ============================================================

import { getRepository } from '@viox/db';
import type { CateringEvent, IntegrationState } from '@viox/db';
import type { IntegrationAdapter, SyncResult } from './types';

/**
 * Caterease adapter (catering & events book of business).
 *
 * ## Demo mode (current)
 * Serves the fixture pipeline: 16 events across every stage
 * (lead → proposal → tasting → booked → BEO final → completed/lost)
 * with BEOs and deposit/balance payments.
 *
 * ## Real integration path
 * Caterease ships **no public REST API** — desktop/hosted editions
 * expose data only through its report writer and scheduled exports.
 * The pragmatic path, in order of preference:
 *
 * 1. **Scheduled CSV/Excel export import** — Caterease's "Marketing
 *    Tools → Export" (or a saved report) can run on a schedule and
 *    drop Event, Sub-Event, and Payment exports to a folder/email.
 *    We ingest those files (SFTP drop or email-to-webhook), keyed on
 *    the Caterease event number → `CateringEvent.id`, and map:
 *    Event Status → `stage`, Theme/Category → `type`, Room → `space`,
 *    Financials → `quotedTotal` / `depositAmount`, payments sheet →
 *    `EventPayment` rows.
 * 2. **One-time migration (recommended)** — export the full book once
 *    and move day-forward event management into VioX Events (this
 *    module already covers pipeline, BEOs, and payments natively),
 *    keeping Caterease read-only during the cutover month.
 * 3. **Horizon option** — Caterease (now part of Total Party Planner)
 *    offers database access on enterprise plans; if the client has
 *    that tier we can read the SQL views directly.
 *
 * Credentials/things Juan collects from the client: a Caterease user
 * with report/export rights, the export schedule destination (email
 * or SFTP), and a one-time full export (Events + Payments + Menus)
 * for the initial backfill.
 */
export function createCatereaseAdapter(tenantSlug = 'buena-vista'): IntegrationAdapter {
  const repo = getRepository(tenantSlug);

  return {
    provider: 'caterease',

    async status(): Promise<IntegrationState> {
      const states = await repo.getIntegrations();
      const s = states.find((x) => x.provider === 'caterease');
      return (
        s ?? {
          provider: 'caterease',
          status: 'awaiting_credentials',
          detail: 'Caterease not configured for this tenant.',
        }
      );
    },

    async syncEvents(): Promise<SyncResult<CateringEvent>> {
      const records = await repo.getCateringEvents();
      return {
        provider: 'caterease',
        pulledAt: new Date().toISOString(),
        count: records.length,
        records,
        source: 'demo fixtures (live: scheduled Caterease CSV export ingest)',
      };
    },
  };
}
