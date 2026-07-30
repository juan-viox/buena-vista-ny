import * as React from 'react';
import { notFound } from 'next/navigation';
import { getRepository } from '@viox/db';
import type { CateringEvent, EventPayment, EventStage } from '@viox/db';
import {
  Badge,
  Card,
  DataTable,
  PageHeader,
  fmtDate,
  fmtDateTime,
  fmtUSD,
  statusLabel,
  type Column,
} from '@viox/ui';
import BeoPanel from './BeoPanel';

const STEPS: EventStage[] = ['lead', 'proposal', 'tasting', 'booked', 'beo_final', 'completed'];

const METHOD_LABELS: Record<EventPayment['method'], string> = {
  card: 'Card',
  ach: 'ACH',
  check: 'Check',
  cash: 'Cash',
};

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = getRepository();
  const [events, locations] = await Promise.all([repo.getCateringEvents(), repo.getLocations()]);

  const event = events.find((e) => e.id === id);
  if (!event) notFound();

  const [beo, payments] = await Promise.all([repo.getBEO(event.id), repo.getEventPayments(event.id)]);
  const location = locations.find((l) => l.id === event.locationId);

  const paid = payments.reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0);
  const balance = Math.max(0, event.quotedTotal - paid);
  const sortedPayments = [...payments].sort((a, b) => (a.date < b.date ? -1 : 1));

  const paymentColumns: Column<EventPayment>[] = [
    { key: 'date', header: 'Date', render: (p) => fmtDate(p.date) },
    { key: 'kind', header: 'Kind', render: (p) => <Badge status={p.kind === 'refund' ? 'disputed' : p.kind === 'deposit' ? 'approved' : 'sent'}>{statusLabel(p.kind)}</Badge> },
    { key: 'method', header: 'Method', render: (p) => METHOD_LABELS[p.method], cellClassName: 'text-[var(--muted)]' },
    { key: 'amount', header: 'Amount', numeric: true, render: (p) => (p.kind === 'refund' ? `−${fmtUSD(p.amount)}` : fmtUSD(p.amount)) },
  ];

  return (
    <>
      <PageHeader
        kicker={`Events · ${statusLabel(event.type)}`}
        title={event.title}
        subtitle={`${location?.name ?? 'Buena Vista'} · ${fmtDateTime(event.eventDate)} · ${event.partySize} guests · ${event.space}`}
        actions={
          <>
            <Badge status={event.stage} className="!px-2.5 !py-1" />
            <a
              href="/events"
              className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:border-[rgba(201,153,92,.4)]"
            >
              ← Pipeline
            </a>
          </>
        }
      />

      {/* ---------- stage stepper ---------- */}
      {event.stage === 'lost' ? (
        <Card>
          <div className="flex items-center gap-3">
            <Badge tone="bad">Lost</Badge>
            <p className="text-sm text-[var(--muted)]">{event.notes}</p>
          </div>
        </Card>
      ) : (
        <StageStepper current={event.stage} />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ---------- BEO ---------- */}
        <div className="lg:col-span-2">
          <BeoPanel event={event} initialBeo={beo} />
        </div>

        {/* ---------- contact + financials ---------- */}
        <div className="space-y-4">
          <Card kicker="Point of contact" title={event.contactName}>
            <dl className="space-y-2.5 text-sm">
              <ContactRow label="Email">
                <a href={`mailto:${event.contactEmail}`} className="text-[var(--text)] transition-colors hover:text-[var(--accent)]">
                  {event.contactEmail}
                </a>
              </ContactRow>
              <ContactRow label="Phone">{event.contactPhone}</ContactRow>
              <ContactRow label="Location">
                {location ? `${location.name} — ${location.address}` : '—'}
              </ContactRow>
              <ContactRow label="Menu package">{event.menuPackage}</ContactRow>
              <ContactRow label="Inquiry opened">{fmtDate(event.createdAt, true)}</ContactRow>
              <ContactRow label="Last touched">{fmtDate(event.updatedAt, true)}</ContactRow>
            </dl>
            <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 text-xs leading-relaxed text-[var(--muted)]">
              {event.notes}
            </div>
          </Card>

          <Card kicker="Financials" title="Quote & payments" flush>
            <div className="space-y-2.5 px-5 pb-4 text-sm">
              <FinRow label="Quoted total" value={event.quotedTotal > 0 ? fmtUSD(event.quotedTotal) : `${fmtUSD(event.budget)} est.`} strong />
              <FinRow
                label="Deposit"
                value={
                  event.depositPaid ? (
                    <span className="inline-flex items-center gap-2">
                      {fmtUSD(event.depositAmount)} <Badge tone="good">Paid</Badge>
                    </span>
                  ) : event.quotedTotal > 0 ? (
                    <Badge tone="warn">Not collected</Badge>
                  ) : (
                    <span className="text-[var(--muted)]">Pending quote</span>
                  )
                }
              />
              <FinRow label="Payments received" value={fmtUSD(paid)} />
              <div className="border-t border-[var(--border)] pt-2.5">
                <FinRow
                  label="Balance due"
                  value={
                    <span className={balance > 0 ? 'text-[var(--warn)]' : 'text-[var(--good)]'}>
                      {fmtUSD(balance)}
                    </span>
                  }
                  strong
                />
              </div>
            </div>
            {sortedPayments.length > 0 ? (
              <DataTable columns={paymentColumns} rows={sortedPayments} zebra={false} />
            ) : (
              <div className="border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--muted)]">
                No payments on file — deposit invoice goes out with the signed proposal.
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

// ---------- small server partials ----------

function StageStepper({ current }: { current: EventStage }) {
  const idx = STEPS.indexOf(current);
  return (
    <Card flush>
      <div className="overflow-x-auto">
        <ol className="flex min-w-[720px] items-center px-5 py-4">
          {STEPS.map((stage, i) => {
            const done = i < idx;
            const active = i === idx;
            return (
              <li key={stage} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums ${
                      done
                        ? 'border-[rgba(201,153,92,.5)] bg-[rgba(201,153,92,.15)] text-[var(--accent)]'
                        : active
                          ? 'border-[var(--accent)] bg-[var(--accent)] text-[#0B1120]'
                          : 'border-[var(--border)] bg-[var(--panel2)] text-[var(--muted)]'
                    }`}
                  >
                    {done ? <CheckIcon /> : i + 1}
                  </span>
                  <span
                    className={`whitespace-nowrap text-xs font-medium ${
                      active ? 'text-[var(--text)]' : done ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
                    }`}
                  >
                    {statusLabel(stage)}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <span
                    className={`mx-3 h-px flex-1 ${i < idx ? 'bg-[rgba(201,153,92,.45)]' : 'bg-[var(--border)]'}`}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}

function ContactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[11px] font-medium uppercase tracking-[.12em] text-[var(--muted)]">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[var(--text)]">{children}</dd>
    </div>
  );
}

function FinRow({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] font-medium uppercase tracking-[.12em] text-[var(--muted)]">{label}</span>
      <span className={`tabular-nums ${strong ? 'text-base font-semibold text-[var(--text)]' : 'text-sm text-[var(--text)]'}`}>
        {value}
      </span>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m2.5 6.5 2.5 2.5 4.5-5.5" />
    </svg>
  );
}
