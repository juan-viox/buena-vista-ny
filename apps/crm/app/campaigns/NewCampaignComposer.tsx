'use client';

import * as React from 'react';
import { Badge, Kicker, fmtNumber } from '@viox/ui';

export interface ComposerSegment {
  id: string;
  name: string;
  rules: string;
  guestCount: number;
}

type Channel = 'email' | 'sms' | 'whatsapp';

const CHANNELS: { id: Channel; label: string; hint: string }[] = [
  { id: 'email', label: 'Email', hint: 'Rich layout, best for invites and menus' },
  { id: 'sms', label: 'SMS', hint: '160 chars, 98% open in 3 minutes' },
  { id: 'whatsapp', label: 'WhatsApp', hint: 'Conversational, opt-in list only' },
];

const MERGE_TAGS = ['{{first_name}}', '{{favorite_item}}', '{{home_room}}', '{{last_visit}}'];

const DEFAULT_BODY =
  'Hola {{first_name}} — Chef Rafael is firing the {{favorite_item}} this weekend at {{home_room}}. Reply RESERVE and we’ll hold your table.';

/**
 * "New campaign" — 3-step composer demo (segment → channel → message).
 * Everything is local state; scheduling ends in a local scheduled card.
 */
export function NewCampaignComposer({ segments }: { segments: ComposerSegment[] }) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(1);
  const [segmentId, setSegmentId] = React.useState<string | null>(null);
  const [channel, setChannel] = React.useState<Channel | null>(null);
  const [name, setName] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState(DEFAULT_BODY);
  const [scheduled, setScheduled] = React.useState(false);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  const segment = segments.find((s) => s.id === segmentId) ?? null;

  const reset = () => {
    setStep(1);
    setSegmentId(null);
    setChannel(null);
    setName('');
    setSubject('');
    setBody(DEFAULT_BODY);
    setScheduled(false);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const insertMergeTag = (tag: string) => {
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => `${b} ${tag}`);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + tag + body.slice(end));
  };

  const canNext = step === 1 ? segmentId !== null : step === 2 ? channel !== null : body.trim().length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(212,164,55,.5)] bg-[rgba(212,164,55,.12)] px-3 py-1.5 text-xs font-semibold text-[var(--accent2)] transition-colors hover:bg-[rgba(212,164,55,.2)]"
      >
        <PlusIcon />
        New campaign
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="New campaign composer">
          <div className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl">
            {/* header */}
            <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
              <div>
                <Kicker>New campaign · demo composer</Kicker>
                <h3 className="mt-0.5 text-sm font-semibold text-[var(--text)]">
                  {scheduled ? 'Scheduled' : `Step ${step} of 3 — ${step === 1 ? 'Audience' : step === 2 ? 'Channel' : 'Message'}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close composer"
                className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--muted)] transition-colors hover:text-[var(--text)]"
              >
                <XIcon />
              </button>
            </div>

            {/* step dots */}
            {!scheduled && (
              <div className="flex items-center gap-1.5 px-5 pt-4">
                {[1, 2, 3].map((s) => (
                  <span
                    key={s}
                    className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-[var(--accent2)]' : 'bg-white/[.08]'}`}
                    aria-hidden
                  />
                ))}
              </div>
            )}

            <div className="px-5 py-4">
              {scheduled ? (
                <ScheduledSummary
                  name={name || suggestedName(segment?.name, channel)}
                  segment={segment}
                  channel={channel}
                  subject={subject}
                  body={body}
                  onDone={close}
                />
              ) : step === 1 ? (
                <div className="space-y-2">
                  {segments.map((s) => {
                    const active = s.id === segmentId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSegmentId(s.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                          active
                            ? 'border-[rgba(212,164,55,.5)] bg-[rgba(212,164,55,.08)]'
                            : 'border-[var(--border)] bg-[var(--panel2)] hover:border-[rgba(168,196,229,.3)]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className={`truncate text-sm font-medium ${active ? 'text-[var(--accent2)]' : 'text-[var(--text)]'}`}>
                            {s.name}
                          </div>
                          <div className="truncate text-[11px] text-[var(--muted)]">{s.rules}</div>
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">
                          {fmtNumber(s.guestCount)} guests
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : step === 2 ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {CHANNELS.map((c) => {
                    const active = c.id === channel;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setChannel(c.id)}
                        className={`rounded-lg border px-3.5 py-3 text-left transition-colors ${
                          active
                            ? 'border-[rgba(212,164,55,.5)] bg-[rgba(212,164,55,.08)]'
                            : 'border-[var(--border)] bg-[var(--panel2)] hover:border-[rgba(168,196,229,.3)]'
                        }`}
                      >
                        <div className={`text-sm font-semibold ${active ? 'text-[var(--accent2)]' : 'text-[var(--text)]'}`}>
                          {c.label}
                        </div>
                        <div className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">{c.hint}</div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block">
                    <Kicker>Campaign name</Kicker>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={suggestedName(segment?.name, channel)}
                      className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[rgba(212,164,55,.5)] focus:outline-none"
                    />
                  </label>
                  {channel === 'email' && (
                    <label className="block">
                      <Kicker>Subject line</Kicker>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Your table is calling, {{first_name}}"
                        className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[rgba(212,164,55,.5)] focus:outline-none"
                      />
                    </label>
                  )}
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <Kicker>Message</Kicker>
                      <span className="text-[11px] tabular-nums text-[var(--muted)]">{body.length} chars</span>
                    </div>
                    <textarea
                      ref={bodyRef}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={4}
                      className="mt-1.5 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-sm leading-relaxed text-[var(--text)] focus:border-[rgba(212,164,55,.5)] focus:outline-none"
                    />
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-[var(--muted)]">Merge tags:</span>
                      {MERGE_TAGS.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => insertMergeTag(tag)}
                          className="rounded-full border border-[var(--border)] bg-white/[.03] px-2 py-0.5 font-mono text-[10px] text-[var(--muted)] transition-colors hover:border-[rgba(212,164,55,.45)] hover:text-[var(--accent2)]"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* footer */}
            {!scheduled && (
              <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-4">
                <button
                  type="button"
                  onClick={() => (step === 1 ? close() : setStep(step - 1))}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                >
                  {step === 1 ? 'Cancel' : '← Back'}
                </button>
                <div className="flex items-center gap-3">
                  {segment && step > 1 && (
                    <span className="hidden text-[11px] text-[var(--muted)] sm:inline">
                      {segment.name} · {fmtNumber(segment.guestCount)} guests
                      {channel ? ` · ${CHANNELS.find((c) => c.id === channel)?.label}` : ''}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={!canNext}
                    onClick={() => (step < 3 ? setStep(step + 1) : setScheduled(true))}
                    className="rounded-lg border border-[rgba(212,164,55,.5)] bg-[rgba(212,164,55,.12)] px-4 py-1.5 text-xs font-semibold text-[var(--accent2)] transition-colors hover:bg-[rgba(212,164,55,.2)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {step < 3 ? 'Continue →' : 'Schedule for tomorrow 10:00 AM'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function suggestedName(segmentName?: string, channel?: Channel | null): string {
  if (!segmentName) return 'Untitled campaign';
  return `${segmentName.split('—')[0].trim()} — ${channel === 'sms' ? 'SMS' : channel === 'whatsapp' ? 'WhatsApp' : 'Email'} blast`;
}

function ScheduledSummary({
  name,
  segment,
  channel,
  subject,
  body,
  onDone,
}: {
  name: string;
  segment: ComposerSegment | null;
  channel: Channel | null;
  subject: string;
  body: string;
  onDone: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 rounded-lg border border-[rgba(52,211,153,.3)] bg-[rgba(52,211,153,.06)] px-4 py-3">
        <CheckIcon />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--text)]">{name}</div>
          <div className="text-xs text-[var(--muted)]">
            {segment?.name ?? '—'} · {fmtNumber(segment?.guestCount ?? 0)} recipients ·{' '}
            {CHANNELS.find((c) => c.id === channel)?.label ?? '—'}
          </div>
        </div>
        <Badge status="scheduled" className="ml-auto shrink-0" />
      </div>

      <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-3">
        {subject && <div className="mb-1.5 text-sm font-medium text-[var(--text)]">{subject}</div>}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)]">{body}</p>
      </div>

      <p className="mt-3 text-[11px] text-[var(--muted)]">
        Demo composer — the schedule lives in this browser only. In production this queues to the send worker with
        per-guest merge-tag rendering and quiet-hours guardrails.
      </p>

      <button
        type="button"
        onClick={onDone}
        className="mt-4 w-full rounded-lg border border-[rgba(212,164,55,.5)] bg-[rgba(212,164,55,.12)] px-4 py-2 text-xs font-semibold text-[var(--accent2)] transition-colors hover:bg-[rgba(212,164,55,.2)]"
      >
        Done
      </button>
    </div>
  );
}

/* ---------- icons ---------- */

function PlusIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M6 2v8M2 6h8" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-[var(--good)]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="10" cy="10" r="7.5" />
      <path d="m6.8 10.2 2.2 2.2 4.2-4.6" />
    </svg>
  );
}
