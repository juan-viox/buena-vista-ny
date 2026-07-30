import * as React from 'react';
import { DEMO_TODAY, getRepository } from '@viox/db';
import type { CateringEvent } from '@viox/db';
import {
  Badge,
  Card,
  DataTable,
  Kicker,
  PageHeader,
  Stat,
  StatRow,
  fmtDate,
  fmtDateTime,
  fmtNumber,
  fmtUSD,
  fmtUSDk,
  statusLabel,
  type Column,
} from '@viox/ui';

export const dynamic = 'force-dynamic';

const INTAKE_STAGES = new Set<CateringEvent['stage']>(['lead', 'proposal']);

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = toIso.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

const TYPE_LABEL: Record<CateringEvent['type'], string> = {
  private_dinner: 'Private dinner',
  corporate: 'Corporate',
  birthday: 'Birthday',
  wedding_rehearsal: 'Wedding rehearsal',
  buyout: 'Buyout',
  offsite_catering: 'Offsite catering',
};

export default async function LeadsPage() {
  const repo = getRepository();
  const [events, locations] = await Promise.all([repo.getCateringEvents(), repo.getLocations()]);

  const locationNames = Object.fromEntries(locations.map((l) => [l.id, l.name]));
  const osBase = (process.env.NEXT_PUBLIC_OS_URL ?? '').replace(/\/$/, '');
  const osEventsUrl = osBase ? `${osBase}/events` : '#';

  const intake = events
    .filter((e) => INTAKE_STAGES.has(e.stage))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const leads = intake.filter((e) => e.stage === 'lead');
  const proposals = intake.filter((e) => e.stage === 'proposal');
  const pipelineValue = intake.reduce((sum, e) => sum + (e.quotedTotal > 0 ? e.quotedTotal : e.budget), 0);
  const quotedValue = proposals.reduce((sum, e) => sum + e.quotedTotal, 0);
  const newestLeadAge = leads.length > 0
    ? Math.min(...leads.map((e) => daysBetween(e.createdAt.slice(0, 10), DEMO_TODAY)))
    : 0;

  const columns: Column<CateringEvent>[] = [
    {
      key: 'title',
      header: 'Inquiry',
      render: (e) => (
        <div className="min-w-0 max-w-[300px]">
          <div className="truncate font-medium text-[var(--text)]">{e.title}</div>
          <div className="truncate text-xs text-[var(--muted)]">
            {e.contactName} · {e.contactEmail}
          </div>
        </div>
      ),
    },
    { key: 'type', header: 'Type', render: (e) => <Badge tone="muted">{TYPE_LABEL[e.type]}</Badge> },
    {
      key: 'eventDate',
      header: 'Event date',
      render: (e) => <span className="tabular-nums">{fmtDateTime(e.eventDate)}</span>,
    },
    {
      key: 'location',
      header: 'Room',
      cellClassName: 'text-[var(--muted)]',
      render: (e) => `${locationNames[e.locationId] ?? '—'} · ${e.space}`,
    },
    { key: 'partySize', header: 'Guests', numeric: true, render: (e) => fmtNumber(e.partySize) },
    {
      key: 'value',
      header: 'Est. value',
      numeric: true,
      render: (e) => (
        <span className="font-medium text-[var(--accent2)]">
          {fmtUSD(e.quotedTotal > 0 ? e.quotedTotal : e.budget)}
        </span>
      ),
    },
    {
      key: 'age',
      header: 'Age',
      numeric: true,
      cellClassName: 'text-[var(--muted)]',
      render: (e) => `${fmtNumber(daysBetween(e.createdAt.slice(0, 10), DEMO_TODAY))}d`,
    },
    { key: 'stage', header: 'Stage', render: (e) => <Badge status={e.stage} /> },
  ];

  return (
    <>
      <PageHeader
        kicker="Private dining & catering"
        title="Event Leads"
        subtitle="Fresh inquiries and open proposals captured from the website, phone and walk-ins — intake view for the marketing team."
        actions={<Badge tone="info">Demo data · today = {fmtDate(DEMO_TODAY, true)}</Badge>}
      />

      <StatRow cols={4}>
        <Stat
          label="Open intake"
          value={fmtNumber(intake.length)}
          hint={`${leads.length} new leads · ${proposals.length} proposals out`}
        />
        <Stat label="Pipeline value" value={fmtUSDk(pipelineValue)} highlight hint="Budgets + quotes, intake stages" />
        <Stat
          label="Proposals awaiting decision"
          value={fmtUSDk(quotedValue)}
          hint={`${proposals.length} quotes in market`}
        />
        <Stat
          label="Newest lead"
          value={newestLeadAge === 0 ? 'Today' : `${fmtNumber(newestLeadAge)}d ago`}
          hint="Respond within 24h to win"
        />
      </StatRow>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          flush
          kicker="Stage: lead & proposal"
          title="Intake list"
          action={<span>{intake.length} open</span>}
        >
          <DataTable
            columns={columns}
            rows={intake}
            emptyMessage="No open event leads — new inquiries land here automatically."
          />
        </Card>

        <Card
          kicker="Where leads go next"
          title="Full pipeline lives in VioX AI OS"
          className="border-[rgba(212,164,55,.28)]"
        >
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            This CRM view is the <span className="text-[var(--text)]">intake window</span>: brand-new leads and
            proposals the marketing team can chase. Once an inquiry moves to tasting, booking, BEO and payment, the
            events team runs it in <span className="text-[var(--text)]">VioX AI OS → Events</span> — the full
            Caterease-style pipeline with BEOs, staffing and deposits.
          </p>

          <div className="mt-4 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-3">
            <Kicker>Downstream stages (in the OS)</Kicker>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(['tasting', 'booked', 'beo_final', 'completed'] as const).map((s) => (
                <Badge key={s} status={s}>
                  {statusLabel(s)}
                </Badge>
              ))}
            </div>
          </div>

          <a
            href={osEventsUrl}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[rgba(212,164,55,.5)] bg-[rgba(212,164,55,.12)] px-3.5 py-2 text-xs font-semibold text-[var(--accent2)] transition-colors hover:bg-[rgba(212,164,55,.2)]"
          >
            Open VioX AI OS → Events
            <ExternalIcon />
          </a>
          {!osBase && (
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              Set <span className="font-mono">NEXT_PUBLIC_OS_URL</span> to deep-link the OS app.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 2.5H3a1 1 0 0 0-1 1V9a1 1 0 0 0 1 1h5.5a1 1 0 0 0 1-1V7" />
      <path d="M7 2h3v3M10 2 5.5 6.5" />
    </svg>
  );
}
