'use client';

import * as React from 'react';
import type { Review, ReviewPlatform } from '@viox/db';
import { Badge, EmptyState, fmtDate, type BadgeTone } from '@viox/ui';

const PLATFORM_LABEL: Record<ReviewPlatform, string> = {
  google: 'Google',
  yelp: 'Yelp',
  opentable: 'OpenTable',
  tripadvisor: 'TripAdvisor',
};

const PLATFORM_TONE: Record<ReviewPlatform, BadgeTone> = {
  google: 'info',
  yelp: 'bad',
  opentable: 'warn',
  tripadvisor: 'good',
};

type PlatformFilter = 'all' | ReviewPlatform;
type RatingFilter = 'all' | '5' | '4' | 'critical';

const PLATFORM_FILTERS: { id: PlatformFilter; label: string }[] = [
  { id: 'all', label: 'All platforms' },
  { id: 'google', label: 'Google' },
  { id: 'yelp', label: 'Yelp' },
  { id: 'opentable', label: 'OpenTable' },
  { id: 'tripadvisor', label: 'TripAdvisor' },
];

const RATING_FILTERS: { id: RatingFilter; label: string }[] = [
  { id: 'all', label: 'All ratings' },
  { id: '5', label: '5★' },
  { id: '4', label: '4★' },
  { id: 'critical', label: '≤3★ critical' },
];

/** Per-review local reply-drafting state (browser only — demo). */
interface DraftState {
  drafting?: boolean;
  draft?: string;
  error?: string;
  markedReplied?: boolean;
}

/**
 * Filterable review stream with per-review "Draft AI reply":
 * posts the review to /api/copilot scoped to Vega (Growth &
 * Campaigns) and drops the draft into an editable textarea.
 * "Mark replied" is local state — production would push the
 * reply back through the platform's owner API.
 */
export function ReviewStream({ reviews }: { reviews: Review[] }) {
  const [platform, setPlatform] = React.useState<PlatformFilter>('all');
  const [rating, setRating] = React.useState<RatingFilter>('all');
  const [unrepliedOnly, setUnrepliedOnly] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Record<string, DraftState>>({});

  const patch = (id: string, next: Partial<DraftState>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));

  const isReplied = (r: Review) => r.replied || Boolean(drafts[r.id]?.markedReplied);

  const filtered = reviews.filter((r) => {
    if (platform !== 'all' && r.platform !== platform) return false;
    if (rating === '5' && r.rating !== 5) return false;
    if (rating === '4' && r.rating !== 4) return false;
    if (rating === 'critical' && r.rating > 3) return false;
    if (unrepliedOnly && isReplied(r)) return false;
    return true;
  });

  const draftReply = async (review: Review) => {
    patch(review.id, { drafting: true, error: undefined });
    const prompt = [
      `Draft a warm, on-brand reply from Buena Vista Restaurant & Bar to this ${PLATFORM_LABEL[review.platform]} review.`,
      '',
      `Reviewer: ${review.author}`,
      `Rating: ${review.rating}/5`,
      `Review: "${review.text}"`,
      '',
      'Guidelines: thank them by name, reference something specific they mentioned, keep it 2-4 sentences, a touch of Spanish warmth is on-brand. For critical reviews, own the miss plainly and offer a concrete make-good. Sign off as "— Christian & the Buena Vista team".',
      'Respond with the reply text only — no preamble, no quotes.',
    ].join('\n');
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], agentId: 'vega' }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) throw new Error(data.error ?? `Copilot returned ${res.status}`);
      patch(review.id, { drafting: false, draft: data.reply.trim() });
    } catch (err) {
      patch(review.id, {
        drafting: false,
        error: err instanceof Error ? err.message : 'Could not reach the copilot.',
      });
    }
  };

  return (
    <div>
      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] px-5 pb-3">
        {PLATFORM_FILTERS.map((f) => (
          <FilterPill key={f.id} active={platform === f.id} onClick={() => setPlatform(f.id)}>
            {f.label}
          </FilterPill>
        ))}
        <span className="mx-1 h-4 w-px bg-[var(--border)]" aria-hidden />
        {RATING_FILTERS.map((f) => (
          <FilterPill key={f.id} active={rating === f.id} onClick={() => setRating(f.id)}>
            {f.label}
          </FilterPill>
        ))}
        <span className="mx-1 h-4 w-px bg-[var(--border)]" aria-hidden />
        <FilterPill active={unrepliedOnly} onClick={() => setUnrepliedOnly((v) => !v)}>
          Needs reply
        </FilterPill>
        <span className="ml-auto text-[11px] tabular-nums text-[var(--muted)]">
          {filtered.length} of {reviews.length}
        </span>
      </div>

      {/* stream */}
      {filtered.length === 0 ? (
        <div className="px-5 py-6">
          <EmptyState
            title="No reviews match these filters"
            message="Clear a filter or two — the stream covers all four platforms."
          />
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {filtered.map((r) => (
            <ReviewRow
              key={r.id}
              review={r}
              state={drafts[r.id] ?? {}}
              replied={isReplied(r)}
              onDraft={() => void draftReply(r)}
              onEditDraft={(text) => patch(r.id, { draft: text })}
              onMarkReplied={() => patch(r.id, { markedReplied: true })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- single review ---------- */

function ReviewRow({
  review,
  state,
  replied,
  onDraft,
  onEditDraft,
  onMarkReplied,
}: {
  review: Review;
  state: DraftState;
  replied: boolean;
  onDraft: () => void;
  onEditDraft: (text: string) => void;
  onMarkReplied: () => void;
}) {
  const replyText = review.replyText ?? (state.markedReplied ? state.draft : undefined);

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={PLATFORM_TONE[review.platform]}>{PLATFORM_LABEL[review.platform]}</Badge>
        <span className="text-sm font-medium text-[var(--text)]">{review.author}</span>
        <Stars rating={review.rating} />
        <span className="text-[11px] text-[var(--muted)]">{fmtDate(review.date)}</span>
        <span className="ml-auto">
          {replied ? <Badge tone="good">Replied</Badge> : <Badge tone="warn">Needs reply</Badge>}
        </span>
      </div>

      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text)]">{review.text}</p>

      {review.dishMentions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {review.dishMentions.map((dish) => (
            <span
              key={dish}
              className="rounded-full border border-[rgba(201,153,92,.35)] bg-[rgba(201,153,92,.07)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]"
            >
              {dish}
            </span>
          ))}
        </div>
      )}

      {/* reply zone */}
      {replied && replyText ? (
        <div className="mt-3 max-w-3xl rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">
            Reply from Buena Vista
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)]">{replyText}</p>
        </div>
      ) : !replied ? (
        <div className="mt-3 max-w-3xl">
          {state.draft === undefined ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onDraft}
                disabled={state.drafting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(212,164,55,.5)] bg-[rgba(212,164,55,.12)] px-3 py-1.5 text-xs font-semibold text-[var(--accent2)] transition-colors hover:bg-[rgba(212,164,55,.2)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SparkIcon />
                {state.drafting ? 'Vega is drafting…' : 'Draft AI reply'}
              </button>
              {state.error && <span className="text-[11px] text-[var(--bad)]">{state.error}</span>}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">
                  Vega&apos;s draft — edit before sending
                </span>
                <button
                  type="button"
                  onClick={onDraft}
                  disabled={state.drafting}
                  className="text-[11px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--accent2)] disabled:opacity-50"
                >
                  {state.drafting ? 'Redrafting…' : 'Redraft'}
                </button>
              </div>
              <textarea
                value={state.draft}
                onChange={(e) => onEditDraft(e.target.value)}
                rows={4}
                className="mt-1.5 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-sm leading-relaxed text-[var(--text)] focus:border-[rgba(212,164,55,.5)] focus:outline-none"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onMarkReplied}
                  disabled={state.draft.trim().length === 0}
                  className="rounded-lg border border-[rgba(212,164,55,.5)] bg-[rgba(212,164,55,.12)] px-3 py-1.5 text-xs font-semibold text-[var(--accent2)] transition-colors hover:bg-[rgba(212,164,55,.2)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Mark replied
                </button>
                <span className="text-[11px] text-[var(--muted)]">
                  Demo — production posts this through the platform&apos;s reply API.
                </span>
                {state.error && <span className="text-[11px] text-[var(--bad)]">{state.error}</span>}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-xs leading-none tracking-[.08em]" aria-label={`${rating} out of 5 stars`}>
      <span className="text-[var(--accent2)]">{'★'.repeat(rating)}</span>
      <span className="text-[var(--muted)] opacity-40">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? 'border-[rgba(212,164,55,.5)] bg-[rgba(212,164,55,.12)] text-[var(--accent2)]'
          : 'border-[var(--border)] bg-white/[.03] text-[var(--muted)] hover:text-[var(--text)]'
      }`}
    >
      {children}
    </button>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 2.5 9.2 6 12.8 7.2 9.2 8.4 8 12 6.8 8.4 3.2 7.2 6.8 6 8 2.5Z" />
      <path d="M12.8 11.2l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6Z" />
    </svg>
  );
}
