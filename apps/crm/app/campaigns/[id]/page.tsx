import * as React from 'react';
import { notFound } from 'next/navigation';
import { DEMO_TODAY, getRepository } from '@viox/db';
import type { Campaign } from '@viox/db';
import {
  Badge,
  Card,
  EmptyState,
  Kicker,
  PageHeader,
  ProgressBar,
  Stat,
  StatRow,
  fmtDate,
  fmtDateTime,
  fmtNumber,
  fmtPct,
} from '@viox/ui';

export const dynamic = 'force-dynamic';

const CHANNEL_LABEL: Record<Campaign['channel'], string> = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = getRepository();
  const [campaigns, segments] = await Promise.all([repo.getCampaigns(), repo.getSegments()]);

  const campaign = campaigns.find((c) => c.id === id);
  if (!campaign) notFound();

  const segment = segments.find((s) => s.id === campaign.segmentId);
  const stats = campaign.stats;
  const openRate = stats && stats.sent > 0 ? (stats.opened / stats.sent) * 100 : 0;
  const clickRate = stats && stats.sent > 0 ? (stats.clicked / stats.sent) * 100 : 0;
  const bookRate = stats && stats.sent > 0 ? (stats.reservations / stats.sent) * 100 : 0;

  return (
    <>
      <PageHeader
        kicker={<a href="/campaigns" className="transition-colors hover:text-[var(--accent2)]">← Campaigns</a>}
        title={campaign.name}
        subtitle={
          <>
            {CHANNEL_LABEL[campaign.channel]} to {segment?.name ?? campaign.segmentId}
            {campaign.sentAt
              ? ` · sent ${fmtDateTime(campaign.sentAt)}`
              : campaign.scheduledFor
                ? ` · scheduled ${fmtDateTime(campaign.scheduledFor)}`
                : ' · draft'}
          </>
        }
        actions={
          <>
            <Badge tone="muted">{CHANNEL_LABEL[campaign.channel]}</Badge>
            <Badge status={campaign.status} />
          </>
        }
      />

      {stats && (
        <StatRow cols={4}>
          <Stat label="Delivered" value={fmtNumber(stats.sent)} hint={`to ${segment?.name ?? 'segment'}`} />
          <Stat label="Open rate" value={fmtPct(openRate, 0)} hint={`${fmtNumber(stats.opened)} opened`} />
          <Stat label="Click rate" value={fmtPct(clickRate, 0)} hint={`${fmtNumber(stats.clicked)} clicked`} />
          <Stat
            label="Reservations"
            value={fmtNumber(stats.reservations)}
            highlight
            hint={`${fmtPct(bookRate, 0)} of recipients booked`}
          />
        </StatRow>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" kicker="Creative" title="Message preview">
          <MessagePreview campaign={campaign} />
        </Card>

        <div className="space-y-4">
          <Card kicker="Audience" title={segment?.name ?? 'Segment'}>
            {segment ? (
              <>
                <p className="text-sm leading-relaxed text-[var(--muted)]">{segment.description}</p>
                <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs">
                  <span className="font-mono text-[var(--muted)]">{segment.rules}</span>
                  <span className="font-medium tabular-nums text-[var(--accent2)]">
                    {fmtNumber(segment.guestCount)} guests
                  </span>
                </div>
                <a
                  href="/segments"
                  className="mt-3 inline-block text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--accent2)]"
                >
                  View segment →
                </a>
              </>
            ) : (
              <p className="text-xs text-[var(--muted)]">Segment no longer exists.</p>
            )}
          </Card>

          <Card kicker="Conversion" title="Performance funnel">
            {stats ? (
              <div className="space-y-4">
                <ProgressBar label="Delivered" valueLabel={fmtNumber(stats.sent)} value={100} tone="accent" />
                <ProgressBar
                  label="Opened"
                  valueLabel={`${fmtNumber(stats.opened)} · ${fmtPct(openRate, 0)}`}
                  value={openRate}
                  tone="accent"
                />
                <ProgressBar
                  label="Clicked"
                  valueLabel={`${fmtNumber(stats.clicked)} · ${fmtPct(clickRate, 0)}`}
                  value={clickRate}
                  tone="warn"
                />
                <ProgressBar
                  label="Reserved"
                  valueLabel={`${fmtNumber(stats.reservations)} · ${fmtPct(bookRate, 0)}`}
                  value={bookRate}
                  tone="good"
                />
              </div>
            ) : (
              <EmptyState
                title={campaign.status === 'scheduled' ? 'Not sent yet' : 'Draft'}
                message={
                  campaign.status === 'scheduled' && campaign.scheduledFor
                    ? `Performance lands here after the ${fmtDateTime(campaign.scheduledFor)} send.`
                    : 'Finish the draft and schedule it to start tracking opens, clicks and reservations.'
                }
              />
            )}
          </Card>

          <Card kicker="Timing" title="Schedule">
            <dl className="space-y-2.5 text-sm">
              <TimingRow label="Status" value={<Badge status={campaign.status} />} />
              {campaign.sentAt && <TimingRow label="Sent" value={fmtDateTime(campaign.sentAt)} />}
              {campaign.scheduledFor && <TimingRow label="Scheduled for" value={fmtDateTime(campaign.scheduledFor)} />}
              {!campaign.sentAt && !campaign.scheduledFor && <TimingRow label="Send" value="Not scheduled" />}
              <TimingRow label="Demo today" value={fmtDate(DEMO_TODAY, true)} />
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

/* ---------- message preview by channel ---------- */

function MessagePreview({ campaign }: { campaign: Campaign }) {
  if (campaign.channel === 'email') {
    return (
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel2)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <Kicker>Subject</Kicker>
          <div className="mt-1 text-sm font-semibold text-[var(--text)]">
            {campaign.subject ?? '(no subject)'}
          </div>
          <div className="mt-1 text-[11px] text-[var(--muted)]">
            Buena Vista Restaurant &amp; Bar &lt;hola@buenavistany.com&gt;
          </div>
        </div>
        <div className="px-4 py-4">
          <p className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
            {campaign.body}
          </p>
          <div className="mt-4 inline-flex rounded-lg border border-[rgba(212,164,55,.5)] bg-[rgba(212,164,55,.12)] px-4 py-2 text-xs font-semibold text-[var(--accent2)]">
            Reserve a table
          </div>
          <p className="mt-4 border-t border-[var(--border)] pt-3 text-[10px] leading-relaxed text-[var(--muted)]">
            536 9th Ave, New York, NY · 88 2nd Ave, New York, NY · Unsubscribe
          </p>
        </div>
      </div>
    );
  }

  const isWhatsApp = campaign.channel === 'whatsapp';
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-5">
      <div className="mx-auto max-w-sm">
        <div className="mb-2 text-center text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">
          {isWhatsApp ? 'WhatsApp' : 'SMS'} · {DEMO_TODAY ? fmtDate(DEMO_TODAY) : ''}
        </div>
        <div
          className={`rounded-2xl rounded-tl-sm border px-4 py-3 text-sm leading-relaxed text-[var(--text)] ${
            isWhatsApp
              ? 'border-[rgba(52,211,153,.3)] bg-[rgba(52,211,153,.07)]'
              : 'border-[var(--border)] bg-white/[.05]'
          }`}
        >
          <p className="whitespace-pre-wrap">{campaign.body}</p>
        </div>
        <div className="mt-2 text-[11px] text-[var(--muted)]">
          From {isWhatsApp ? 'Buena Vista (verified business)' : '(646) 555-0100'} · merge tags render per guest
        </div>
      </div>
    </div>
  );
}

function TimingRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="text-xs font-medium tabular-nums text-[var(--text)]">{value}</dd>
    </div>
  );
}
