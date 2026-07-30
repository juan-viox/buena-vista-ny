import * as React from 'react';
import { DEMO_TODAY, getRepository } from '@viox/db';
import { Badge, PageHeader, Stat, StatRow, fmtDate, fmtNumber, fmtUSD, fmtUSDk } from '@viox/ui';
import { GuestsExplorer } from './GuestsExplorer';

export const dynamic = 'force-dynamic';

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export default async function GuestsPage() {
  const repo = getRepository();
  const [guests, locations] = await Promise.all([repo.getGuests(), repo.getLocations()]);

  const locationNames = Object.fromEntries(locations.map((l) => [l.id, l.name]));

  const vips = guests.filter((g) => g.tags.includes('vip'));
  const lapsedCutoff = addDays(DEMO_TODAY, -90);
  const lapsed = guests.filter((g) => g.lastVisit < lapsedCutoff);
  const active30 = guests.filter((g) => g.lastVisit >= addDays(DEMO_TODAY, -30));
  const bookValue = guests.reduce((sum, g) => sum + g.lifetimeSpend, 0);
  const avgLifetime = guests.length > 0 ? bookValue / guests.length : 0;

  return (
    <>
      <PageHeader
        kicker="Guest book"
        title="Guests"
        subtitle="Every diner the OS knows across both rooms — searchable, taggable and ready to segment."
        actions={<Badge tone="info">Demo data · today = {fmtDate(DEMO_TODAY, true)}</Badge>}
      />

      <StatRow cols={5}>
        <Stat label="Guests on file" value={fmtNumber(guests.length)} hint={`${fmtNumber(active30.length)} visited in the last 30 days`} />
        <Stat label="VIPs" value={fmtNumber(vips.length)} hint="10+ visits or hand-flagged" />
        <Stat label="Lapsed 90d+" value={fmtNumber(lapsed.length)} hint="Win-back candidates" />
        <Stat label="Avg lifetime spend" value={fmtUSD(Math.round(avgLifetime))} hint="Per guest, all time" />
        <Stat label="Guest-book value" value={fmtUSDk(bookValue)} highlight hint="Total lifetime spend on file" />
      </StatRow>

      <GuestsExplorer guests={guests} locationNames={locationNames} />
    </>
  );
}
