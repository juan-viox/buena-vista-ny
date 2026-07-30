// ============================================================
// @viox/integrations — provider adapters (Toast, MarginEdge,
// Caterease). Demo-mode today; the same interfaces go live once
// credentials arrive (see docs/integrations.md).
// ============================================================

export type { IntegrationAdapter, SyncResult, SyncWindow } from './types';
export { createToastAdapter } from './toast';
export { createMarginEdgeAdapter } from './marginedge';
export { createCatereaseAdapter } from './caterease';

// Slack team-collaboration adapter
export {
  isSlackConfigured,
  verifySlackSignature,
  postSlackMessage,
  stripMention,
  parseAgentFromText,
} from './slack';
export type { PostSlackMessageInput, PostSlackMessageResult, ParsedAgentText } from './slack';

// Twilio SMS adapter
export { isSmsConfigured, normalizePhone, sendSms } from './twilio-sms';
export type { SendSmsInput, SendSmsResult } from './twilio-sms';

// Resend email adapter
export { isEmailConfigured, sendEmail } from './resend-email';
export type { SendEmailInput, SendEmailResult } from './resend-email';

// Twilio WhatsApp adapter
export {
  isWhatsAppConfigured,
  validateTwilioSignature,
  twimlMessage,
  sendWhatsApp,
} from './twilio-whatsapp';
export type { SendWhatsAppInput, SendWhatsAppResult } from './twilio-whatsapp';

// Integration settings vault (encrypted per-tenant credentials)
export {
  DEFAULT_TENANT_SLUG,
  PROVIDER_ENV_MAP,
  knownSettingsProviders,
  knownSettingsKeys,
  isSettingsCryptoConfigured,
  isSettingsStoreConfigured,
  encryptSetting,
  decryptSetting,
  getIntegrationSetting,
  setIntegrationSetting,
  listIntegrationSettings,
  deleteIntegrationSetting,
} from './settings';
export type { SettingWriteResult, SettingListEntry } from './settings';

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
