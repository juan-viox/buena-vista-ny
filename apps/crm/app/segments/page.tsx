import * as React from 'react';
import { DEMO_TODAY, getRepository } from '@viox/db';
import type { Guest, Segment } from '@viox/db';
import { Badge, PageHeader, Stat, StatRow, fmtDate, fmtNumber, fmtUSDk } from '@viox/ui';
import { SegmentCards, type SegmentCardData } from './SegmentCards';

export const dynamic = 'force-dynamic';

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Demo rule engine — mirrors the fixture segment definitions so counts,
 * previews and revenue stay consistent with what the fixtures report.
 */
function segmentMatcher(segment: Segment): (g: Guest) => boolean {
  switch (segment.id) {
    case 'seg_vip':
      return (g) => g.visits >= 10;
    case 'seg_big_spenders':
      return (g) => g.lifetimeSpend >= 2000;
    case 'seg_brunch':
      return (g) => g.tags.includes('brunch');
    case 'seg_event_hosts':
      return (g) => g.tags.includes('event_host');
    case 'seg_lapsed':
      return (g) => g.lastVisit < addDays(DEMO_TODAY, -90);
    case 'seg_birthday_aug':
      return (g) => (g.birthday ?? '').startsWith('08-');
    default:
      return () => false;
  }
}

export default async function SegmentsPage() {
  const repo = getRepository();
  const [segments, guests, campaigns] = await Promise.all([
    repo.getSegments(),
    repo.getGuests(),
    repo.getCampaigns(),
  ]);

  const cards: SegmentCardData[] = segments.map((seg) => {
    const matched = guests.filter(segmentMatcher(seg));
    const preview = [...matched].sort((a, b) => b.lifetimeSpend - a.lifetimeSpend).slice(0, 8);
    return {
      id: seg.id,
      name: seg.name,
      description: seg.description,
      rules: seg.rules,
      guestCount: matched.length > 0 ? matched.length : seg.guestCount,
      estRevenue: Math.round(matched.reduce((sum, g) => sum + g.avgSpend, 0)),
      lifetimeValue: matched.reduce((sum, g) => sum + g.lifetimeSpend, 0),
      guests: preview.map((g) => ({
        id: g.id,
        name: g.name,
        tags: g.tags,
        visits: g.visits,
        lifetimeSpend: g.lifetimeSpend,
        avgSpend: g.avgSpend,
        lastVisit: g.lastVisit,
      })),
    };
  });

  const totalTargetable = new Set(
    segments.flatMap((seg) => guests.filter(segmentMatcher(seg)).map((g) => g.id)),
  ).size;
  const totalEstRevenue = cards.reduce((sum, c) => sum + c.estRevenue, 0);
  const campaignsBySegment = campaigns.filter((c) => segments.some((s) => s.id === c.segmentId)).length;

  return (
    <>
      <PageHeader
        kicker="Audiences"
        title="Segments"
        subtitle="Living audiences computed from the guest book — every campaign targets one of these."
        actions={<Badge tone="info">Demo data · today = {fmtDate(DEMO_TODAY, true)}</Badge>}
      />

      <StatRow cols={4}>
        <Stat label="Segments" value={fmtNumber(segments.length)} hint="Rule-based, auto-refreshing" />
        <Stat
          label="Targetable guests"
          value={fmtNumber(totalTargetable)}
          hint={`of ${fmtNumber(guests.length)} on file (deduped)`}
        />
        <Stat
          label="Est. next-visit revenue"
          value={fmtUSDk(totalEstRevenue)}
          highlight
          hint="If each segment books one visit"
        />
        <Stat label="Campaigns attached" value={fmtNumber(campaignsBySegment)} hint="Sent, scheduled and drafts" />
      </StatRow>

      <SegmentCards segments={cards} />
    </>
  );
}
