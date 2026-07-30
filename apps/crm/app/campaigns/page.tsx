import * as React from 'react';
import { DEMO_TODAY, getRepository } from '@viox/db';
import type { Campaign } from '@viox/db';
import {
  Badge,
  Card,
  DataTable,
  PageHeader,
  Stat,
  StatRow,
  fmtDate,
  fmtDateTime,
  fmtNumber,
  fmtPct,
  type Column,
} from '@viox/ui';
import { NewCampaignComposer } from './NewCampaignComposer';

export const dynamic = 'force-dynamic';

const CHANNEL_LABEL: Record<Campaign['channel'], string> = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

export default async function CampaignsPage() {
  const repo = getRepository();
  const [campaigns, segments] = await Promise.all([repo.getCampaigns(), repo.getSegments()]);

  const segmentName = (id: string) => segments.find((s) => s.id === id)?.name ?? id;

  const sent = campaigns.filter((c) => c.status === 'sent' && c.stats);
  const scheduled = campaigns.filter((c) => c.status === 'scheduled');
  const drafts = campaigns.filter((c) => c.status === 'draft');

  const totalSent = sent.reduce((sum, c) => sum + (c.stats?.sent ?? 0), 0);
  const totalOpened = sent.reduce((sum, c) => sum + (c.stats?.opened ?? 0), 0);
  const totalReservations = sent.reduce((sum, c) => sum + (c.stats?.reservations ?? 0), 0);
  const openRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0;

  const order: Record<Campaign['status'], number> = { sent: 0, scheduled: 1, draft: 2 };
  const rows = [...campaigns].sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    const ka = a.sentAt ?? a.scheduledFor ?? '';
    const kb = b.sentAt ?? b.scheduledFor ?? '';
    return ka < kb ? 1 : -1;
  });

  const rate = (part?: number, total?: number) =>
    part !== undefined && total ? fmtPct((part / total) * 100, 0) : '—';

  const columns: Column<Campaign>[] = [
    {
      key: 'name',
      header: 'Campaign',
      render: (c) => (
        <div className="min-w-0 max-w-[320px]">
          <div className="truncate font-medium text-[var(--text)]">{c.name}</div>
          <div className="truncate text-xs text-[var(--muted)]">{segmentName(c.segmentId)}</div>
        </div>
      ),
    },
    { key: 'channel', header: 'Channel', render: (c) => <Badge tone="muted">{CHANNEL_LABEL[c.channel]}</Badge> },
    { key: 'status', header: 'Status', render: (c) => <Badge status={c.status} /> },
    {
      key: 'when',
      header: 'Sent / scheduled',
      cellClassName: 'text-[var(--muted)]',
      render: (c) => {
        const at = c.sentAt ?? c.scheduledFor;
        return at ? fmtDateTime(at) : '—';
      },
    },
    { key: 'sent', header: 'Sent', numeric: true, render: (c) => (c.stats ? fmtNumber(c.stats.sent) : '—') },
    { key: 'opened', header: 'Open', numeric: true, render: (c) => rate(c.stats?.opened, c.stats?.sent) },
    { key: 'clicked', header: 'Click', numeric: true, render: (c) => rate(c.stats?.clicked, c.stats?.sent) },
    {
      key: 'reservations',
      header: 'Res.',
      numeric: true,
      render: (c) =>
        c.stats ? (
          <span className="font-medium text-[var(--accent2)]">{fmtNumber(c.stats.reservations)}</span>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <>
      <PageHeader
        kicker="Guest marketing"
        title="Campaigns"
        subtitle="Email, SMS and WhatsApp sends against living segments — every send tracks back to reservations."
        actions={
          <>
            <Badge tone="info">Demo data · today = {fmtDate(DEMO_TODAY, true)}</Badge>
            <NewCampaignComposer
              segments={segments.map((s) => ({
                id: s.id,
                name: s.name,
                rules: s.rules,
                guestCount: s.guestCount,
              }))}
            />
          </>
        }
      />

      <StatRow cols={4}>
        <Stat
          label="Campaigns"
          value={fmtNumber(campaigns.length)}
          hint={`${sent.length} sent · ${scheduled.length} scheduled · ${drafts.length} drafts`}
        />
        <Stat label="Messages delivered" value={fmtNumber(totalSent)} hint="Across sent campaigns" />
        <Stat label="Avg open rate" value={fmtPct(openRate, 0)} hint={`${fmtNumber(totalOpened)} opens`} />
        <Stat
          label="Attributed reservations"
          value={fmtNumber(totalReservations)}
          highlight
          hint="Booked from campaign links & replies"
        />
      </StatRow>

      <Card
        flush
        kicker="All channels"
        title="Campaign log"
        action={<span>{rows.length} campaigns</span>}
      >
        <DataTable
          columns={columns}
          rows={rows}
          onRowHref={(c) => `/campaigns/${c.id}`}
          emptyMessage="No campaigns yet — hit New campaign to draft the first one."
        />
      </Card>
    </>
  );
}
