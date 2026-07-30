import * as React from 'react';
import { DEMO_TODAY, REVIEW_PLATFORM_STATS, getRepository } from '@viox/db';
import type { ReviewPlatform, ReviewPlatformStat } from '@viox/db';
import { Badge, Card, PageHeader, Stat, StatRow, fmtDate, fmtNumber, fmtPct } from '@viox/ui';
import { ReviewStream } from './ReviewStream';

export const dynamic = 'force-dynamic';

const PLATFORM_LABEL: Record<ReviewPlatform, string> = {
  google: 'Google',
  yelp: 'Yelp',
  opentable: 'OpenTable',
  tripadvisor: 'TripAdvisor',
};

export default async function ReviewsPage() {
  const repo = getRepository();
  const reviews = await repo.getReviews();

  // Overall rating = platform ratings weighted by lifetime review counts.
  const lifetimeCount = REVIEW_PLATFORM_STATS.reduce((s, p) => s + p.reviewCount, 0);
  const overall =
    lifetimeCount > 0
      ? REVIEW_PLATFORM_STATS.reduce((s, p) => s + p.rating * p.reviewCount, 0) / lifetimeCount
      : 0;

  const monthStart = `${DEMO_TODAY.slice(0, 7)}-01`;
  const thisMonth = reviews.filter((r) => r.date >= monthStart).length;

  const replied = reviews.filter((r) => r.replied).length;
  const unreplied = reviews.length - replied;
  const responseRate = reviews.length > 0 ? (replied / reviews.length) * 100 : 0;

  return (
    <>
      <PageHeader
        kicker="Reputation"
        title="Reviews"
        subtitle="Every Google, Yelp, OpenTable and TripAdvisor review in one stream — with Vega drafting warm, on-brand replies."
        actions={<Badge tone="info">Demo data · today = {fmtDate(DEMO_TODAY, true)}</Badge>}
      />

      <StatRow cols={4}>
        <Stat
          label="Overall rating"
          value={`${overall.toFixed(1)} ★`}
          highlight
          hint={`Weighted across ${fmtNumber(lifetimeCount)} lifetime reviews`}
        />
        <Stat label="Reviews this month" value={fmtNumber(thisMonth)} hint="All platforms, July" />
        <Stat
          label="Response rate"
          value={fmtPct(responseRate, 0)}
          hint={`${fmtNumber(replied)} replied · ${fmtNumber(unreplied)} in queue`}
        />
        <Stat label="Avg response time" value="1.6 days" hint="Target < 48 hrs on critical reviews" />
      </StatRow>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {REVIEW_PLATFORM_STATS.map((p) => (
          <PlatformCard key={p.platform} stat={p} />
        ))}
      </div>

      <Card
        className="mt-3"
        flush
        kicker="All platforms"
        title="Review stream"
        action={<span>{reviews.length} recent reviews</span>}
      >
        <ReviewStream reviews={reviews} />
      </Card>
    </>
  );
}

/* ---------- platform summary card ---------- */

function PlatformCard({ stat }: { stat: ReviewPlatformStat }) {
  const trendColor =
    stat.trend > 0 ? 'text-[var(--good)]' : stat.trend < 0 ? 'text-[var(--bad)]' : 'text-[var(--muted)]';
  const trendLabel =
    stat.trend > 0 ? `+${stat.trend.toFixed(1)}` : stat.trend < 0 ? stat.trend.toFixed(1) : '±0.0';
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">
          {PLATFORM_LABEL[stat.platform]}
        </span>
        <span className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${trendColor}`}>
          <TrendArrow dir={stat.trend > 0 ? 'up' : stat.trend < 0 ? 'down' : 'flat'} />
          {trendLabel}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold leading-none tracking-tight tabular-nums text-[var(--text)]">
          {stat.rating.toFixed(1)}
        </span>
        <StarMeter rating={stat.rating} />
      </div>
      <div className="mt-1.5 text-xs text-[var(--muted)]">{fmtNumber(stat.reviewCount)} reviews · 90-day trend</div>
    </div>
  );
}

function StarMeter({ rating }: { rating: number }) {
  return (
    <span className="text-sm leading-none tracking-[.1em]" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      <span className="text-[var(--accent2)]">{'★'.repeat(Math.round(rating))}</span>
      <span className="text-[var(--muted)] opacity-40">{'★'.repeat(5 - Math.round(rating))}</span>
    </span>
  );
}

function TrendArrow({ dir }: { dir: 'up' | 'down' | 'flat' }) {
  if (dir === 'flat') {
    return (
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
        <path d="M2.5 6h7" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 12 12"
      className={`h-3 w-3 ${dir === 'up' ? '' : 'rotate-180'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9.5v-7M2.8 5.7 6 2.5l3.2 3.2" />
    </svg>
  );
}
