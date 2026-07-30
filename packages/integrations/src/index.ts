// ============================================================
// @viox/integrations — provider adapters (Toast, MarginEdge,
// Caterease). Demo-mode today; the same interfaces go live once
// credentials arrive (see docs/integrations.md).
// ============================================================

export type { IntegrationAdapter, SyncResult, SyncWindow } from './types';
export { createToastAdapter } from './toast';
export { createMarginEdgeAdapter } from './marginedge';
export { createCatereaseAdapter } from './caterease';

import type { IntegrationProvider } from '@viox/db';
import type { IntegrationAdapter } from './types';
import { createToastAdapter } from './toast';
import { createMarginEdgeAdapter } from './marginedge';
import { createCatereaseAdapter } from './caterease';

/** All adapters for a tenant, keyed by provider. */
export function getIntegrationAdapters(
  tenantSlug = 'buena-vista',
): Record<IntegrationProvider, IntegrationAdapter> {
  return {
    toast: createToastAdapter(tenantSlug),
    marginedge: createMarginEdgeAdapter(tenantSlug),
    caterease: createCatereaseAdapter(tenantSlug),
  };
}
