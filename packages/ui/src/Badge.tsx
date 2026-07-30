import * as React from 'react';

export type BadgeTone = 'good' | 'warn' | 'bad' | 'info' | 'muted' | 'accent';

const TONE_CLASSES: Record<BadgeTone, string> = {
  good: 'text-[var(--good)] border-[rgba(52,211,153,.35)] bg-[rgba(52,211,153,.08)]',
  warn: 'text-[var(--warn)] border-[rgba(251,191,36,.35)] bg-[rgba(251,191,36,.08)]',
  bad: 'text-[var(--bad)] border-[rgba(248,113,113,.35)] bg-[rgba(248,113,113,.08)]',
  info: 'text-[var(--info)] border-[rgba(126,178,245,.35)] bg-[rgba(126,178,245,.08)]',
  muted: 'text-[var(--muted)] border-[var(--border)] bg-white/[.03]',
  accent: 'text-[var(--accent)] border-[rgba(201,153,92,.4)] bg-[rgba(201,153,92,.08)]',
};

/** Domain status → tone presets (invoices, events, menu quadrants, CRM tags…). */
const STATUS_TONES: Record<string, BadgeTone> = {
  // invoices / integrations / counts
  approved: 'good',
  exported: 'good',
  pending_review: 'warn',
  disputed: 'bad',
  in_progress: 'warn',
  finalized: 'good',
  connected_demo: 'info',
  connected_live: 'good',
  awaiting_credentials: 'warn',
  error: 'bad',
  // events pipeline
  lead: 'info',
  proposal: 'warn',
  tasting: 'warn',
  booked: 'good',
  beo_final: 'accent',
  completed: 'good',
  lost: 'bad',
  draft: 'muted',
  sent: 'good',
  signed: 'good',
  scheduled: 'info',
  // reservations
  upcoming: 'info',
  seated: 'good',
  no_show: 'bad',
  cancelled: 'bad',
  // menu engineering quadrants
  star: 'good',
  plow_horse: 'warn',
  puzzle: 'info',
  dog: 'bad',
  // guest tags
  vip: 'accent',
  regular: 'good',
  big_spender: 'accent',
  event_host: 'info',
  brunch: 'info',
  wine_club: 'info',
  birthday_month: 'warn',
  lapsed: 'bad',
  new: 'good',
};

const STATUS_LABELS: Record<string, string> = {
  pending_review: 'Pending review',
  beo_final: 'BEO final',
  no_show: 'No-show',
  plow_horse: 'Plow horse',
  vip: 'VIP',
  big_spender: 'Big spender',
  event_host: 'Event host',
  wine_club: 'Wine club',
  birthday_month: 'Birthday month',
  connected_demo: 'Demo sync',
  connected_live: 'Live',
  awaiting_credentials: 'Awaiting creds',
  in_progress: 'In progress',
};

export function statusTone(status: string): BadgeTone {
  return STATUS_TONES[status] ?? 'muted';
}

export function statusLabel(status: string): string {
  const preset = STATUS_LABELS[status];
  if (preset) return preset;
  const words = status.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface BadgeProps {
  /** Explicit tone. Ignored when `status` is provided. */
  tone?: BadgeTone;
  /** Domain status string — tone + label derived automatically. */
  status?: string;
  children?: React.ReactNode;
  className?: string;
}

/** Small bordered pill. Use `status` for domain values, `tone` for custom text. */
export function Badge({ tone, status, children, className = '' }: BadgeProps) {
  const resolvedTone: BadgeTone = status ? statusTone(status) : (tone ?? 'muted');
  const content = children ?? (status ? statusLabel(status) : null);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 ${TONE_CLASSES[resolvedTone]} ${className}`}
    >
      {content}
    </span>
  );
}
