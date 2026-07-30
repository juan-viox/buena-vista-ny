'use client';

import * as React from 'react';
import type { CateringEvent, EventStage } from '@viox/db';
import { Badge, fmtDate, fmtUSDk } from '@viox/ui';

// ---------- board config ----------

const COLUMNS: { stage: EventStage; label: string; dot: string }[] = [
  { stage: 'lead', label: 'Lead', dot: 'var(--info)' },
  { stage: 'proposal', label: 'Proposal', dot: 'var(--warn)' },
  { stage: 'tasting', label: 'Tasting', dot: 'var(--orange)' },
  { stage: 'booked', label: 'Booked', dot: 'var(--good)' },
  { stage: 'beo_final', label: 'BEO Final', dot: 'var(--accent)' },
  { stage: 'completed', label: 'Completed', dot: 'var(--muted)' },
];

export interface BoardLocation {
  id: string;
  name: string;
  color: string;
}

export interface PipelineBoardProps {
  events: CateringEvent[];
  locations: BoardLocation[];
}

const valueOf = (e: CateringEvent) => e.quotedTotal || e.budget;

/** Drag-and-drop pipeline kanban — stage moves live in local state (demo). */
export default function PipelineBoard({ events, locations }: PipelineBoardProps) {
  const [stageOf, setStageOf] = React.useState<Record<string, EventStage>>(() =>
    Object.fromEntries(events.map((e) => [e.id, e.stage])),
  );
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overStage, setOverStage] = React.useState<EventStage | null>(null);

  const locOf = React.useMemo(
    () => new Map(locations.map((l) => [l.id, l])),
    [locations],
  );

  const moveTo = (stage: EventStage, ev: React.DragEvent) => {
    ev.preventDefault();
    const id = dragId ?? ev.dataTransfer.getData('text/plain');
    if (id && stageOf[id] && stageOf[id] !== stage) {
      setStageOf((prev) => ({ ...prev, [id]: stage }));
    }
    setDragId(null);
    setOverStage(null);
  };

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-4">
          {locations.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
              {l.name}
            </span>
          ))}
        </div>
        <span className="text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">
          Drag cards between stages · demo state
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((col) => {
          const cards = events
            .filter((e) => stageOf[e.id] === col.stage)
            .sort((a, b) => (a.eventDate < b.eventDate ? -1 : 1));
          const total = cards.reduce((s, e) => s + valueOf(e), 0);
          const isOver = overStage === col.stage && dragId !== null;

          return (
            <div
              key={col.stage}
              onDragOver={(ev) => {
                ev.preventDefault();
                ev.dataTransfer.dropEffect = 'move';
                if (overStage !== col.stage) setOverStage(col.stage);
              }}
              onDragLeave={() =>
                setOverStage((s) => (s === col.stage ? null : s))
              }
              onDrop={(ev) => moveTo(col.stage, ev)}
              className={`flex w-[272px] shrink-0 flex-col rounded-xl border bg-[var(--panel2)] transition-colors ${
                isOver ? 'border-[rgba(201,153,92,.55)] bg-[rgba(201,153,92,.05)]' : 'border-[var(--border)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: col.dot }} />
                  <span className="truncate text-[11px] font-medium uppercase tracking-[.12em] text-[var(--muted)]">
                    {col.label}
                  </span>
                  <span className="rounded-full border border-[var(--border)] bg-white/[.03] px-1.5 text-[10px] tabular-nums text-[var(--muted)]">
                    {cards.length}
                  </span>
                </div>
                <span className="shrink-0 text-xs font-medium tabular-nums text-[var(--text)]">
                  {total > 0 ? fmtUSDk(total) : '—'}
                </span>
              </div>

              <div className="flex min-h-[120px] flex-col gap-2 p-2">
                {cards.map((e) => {
                  const l = locOf.get(e.locationId);
                  return (
                    <article
                      key={e.id}
                      draggable
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData('text/plain', e.id);
                        ev.dataTransfer.effectAllowed = 'move';
                        setDragId(e.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverStage(null);
                      }}
                      className={`cursor-grab rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[0_1px_0_rgba(255,255,255,.03)_inset] transition-opacity active:cursor-grabbing ${
                        dragId === e.id ? 'opacity-40' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: l?.color ?? 'var(--muted)' }}
                          title={l?.name}
                        />
                        <a
                          href={`/events/${e.id}`}
                          className="min-w-0 text-sm font-medium leading-snug text-[var(--text)] transition-colors hover:text-[var(--accent)]"
                        >
                          {e.title}
                        </a>
                      </div>
                      <div className="mt-1.5 text-xs text-[var(--muted)]">
                        {fmtDate(e.eventDate)} · {e.partySize} guests
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[var(--muted)]">{e.space}</div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold tabular-nums text-[var(--text)]">
                          {valueOf(e) > 0 ? fmtUSDk(valueOf(e)) : 'No quote'}
                        </span>
                        {e.depositPaid ? (
                          <Badge tone="good">Dep {fmtUSDk(e.depositAmount)}</Badge>
                        ) : stageOf[e.id] === 'booked' || stageOf[e.id] === 'beo_final' ? (
                          <Badge tone="warn">Deposit due</Badge>
                        ) : (
                          <Badge tone="muted">No deposit</Badge>
                        )}
                      </div>
                    </article>
                  );
                })}
                {cards.length === 0 && (
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--muted)]">
                    {isOver ? 'Release to move here' : 'No deals in this stage'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
