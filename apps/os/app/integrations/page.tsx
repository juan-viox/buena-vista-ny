import * as React from 'react';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Badge, Card, Kicker, PageHeader } from '@viox/ui';
import { ConnectionsHub, CopyButton } from './ConnectionsHub';

export const metadata: Metadata = {
  title: 'Connections — VioX AI OS',
};

/* ============================================================
   Connections (OS) — overview + setup.

   Top half: the configurable providers (WhatsApp/Twilio, Slack,
   Toast, MarginEdge, Stripe) as at-a-glance cards, each opening
   a guided setup panel (?setup=<slug>) with wizard steps, copy
   buttons for webhook URLs, and a masked credential form wired
   to /api/settings + /api/settings-test (ConnectionsHub).

   Bottom half: the already-live rack — channels running today on
   env-managed credentials (no forms), plus the webhook endpoints
   worth having on hand. Guides mirror docs/integrations-live.md.
   ============================================================ */

const VOICE_WEBHOOK = 'https://buena-vista-crm.vercel.app/api/voice/reservation';
const EMAIL_INBOUND = 'https://buena-vista-crm.vercel.app/api/email/inbound';

interface LiveService {
  name: string;
  monogram: string;
  detail: string;
  webhook?: { label: string; url: string };
}

const LIVE_SERVICES: LiveService[] = [
  {
    name: 'ElevenLabs Voice',
    monogram: 'EL',
    detail: 'Anfitrión answering the phone — reservation requests post into the CRM via the voice webhook.',
    webhook: { label: 'Voice webhook', url: VOICE_WEBHOOK },
  },
  {
    name: 'Twilio SMS',
    monogram: 'Tw',
    detail: 'Guest lifecycle texts from the pinned line (929) 410-5502 over the registered A2P 10DLC campaign.',
  },
  {
    name: 'Resend Email',
    monogram: 'R',
    detail: 'Branded lifecycle email — the SMS twin. Replies and delivery events land on the inbound webhook.',
    webhook: { label: 'Inbound webhook', url: EMAIL_INBOUND },
  },
  {
    name: 'Supabase',
    monogram: 'SB',
    detail: 'Reservations, message history, sms/email logs and the encrypted credential vault behind this page.',
  },
  {
    name: 'AI Models',
    monogram: 'AI',
    detail: 'Copilot + agents on OpenRouter / DeepSeek / Ollama — model routing configured per deployment.',
  },
];

export default function ConnectionsPage() {
  return (
    <>
      <PageHeader
        kicker="System · Connections"
        title="Connections"
        subtitle="Every integration is a plain REST API — save the keys once in the encrypted vault, test the connection live, and the OS and CRM read them everywhere."
        actions={<Badge tone="info">Encrypted tenant vault</Badge>}
      />

      {/* ---------- configurable providers: overview + setup panels ---------- */}
      <Suspense
        fallback={
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-44 rounded-xl border border-[var(--border)] bg-[var(--panel)]" />
            ))}
          </div>
        }
      >
        <ConnectionsHub />
      </Suspense>

      {/* ---------- already live — env-managed rack ---------- */}
      <Card
        kicker="Already live"
        title="Running today"
        action={<span>Managed via environment — no setup needed</span>}
        flush
      >
        <div className="grid grid-cols-1 divide-y divide-[var(--border)] md:grid-cols-2 md:divide-y-0 xl:grid-cols-5">
          {LIVE_SERVICES.map((svc) => (
            <div key={svc.name} className="flex flex-col gap-2 px-5 py-4 md:border-b md:border-[var(--border)] xl:border-b-0 xl:border-r xl:last:border-r-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(52,211,153,.35)] bg-[rgba(52,211,153,.08)] text-[11px] font-bold text-[var(--good)]"
                    aria-hidden
                  >
                    {svc.monogram}
                  </span>
                  <span className="truncate text-sm font-medium text-[var(--text)]">{svc.name}</span>
                </div>
                <Badge tone="good" className="shrink-0">
                  Live
                </Badge>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--muted)]">{svc.detail}</p>
              {svc.webhook && (
                <div className="mt-auto flex items-center gap-2">
                  <code className="min-w-0 truncate rounded border border-[var(--border)] bg-[var(--panel2)] px-2 py-1 text-[10px] text-[var(--text)]">
                    {svc.webhook.url}
                  </code>
                  <CopyButton value={svc.webhook.url} label="Copy" />
                </div>
              )}
              <span className="text-[10px] text-[var(--muted)]">Managed via environment.</span>
            </div>
          ))}
        </div>
      </Card>

      {/* ---------- how the vault works ---------- */}
      <Card kicker="Under the hood" title="How credentials are stored">
        <div className="grid grid-cols-1 gap-4 text-xs leading-relaxed text-[var(--muted)] sm:grid-cols-3">
          <div>
            <Kicker className="mb-1.5">Encrypted at rest</Kicker>
            Values are AES-256-GCM encrypted server-side into the tenant vault (
            <code className="text-[var(--text)]">integration_settings</code>) — this page only ever reads back the
            last four characters as a hint.
          </div>
          <div>
            <Kicker className="mb-1.5">Env fallback</Kicker>
            Anything not saved here falls back to the deployment’s environment variables, so existing env-managed
            channels keep working untouched.
          </div>
          <div>
            <Kicker className="mb-1.5">Tested live</Kicker>
            Every test hits the provider’s cheapest authenticated endpoint from the server — secrets never reach the
            browser, only the status text does.
          </div>
        </div>
      </Card>
    </>
  );
}
