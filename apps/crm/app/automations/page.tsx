// ============================================================
// /automations — Popmenu-parity marketing automation playbooks.
// Server component: audiences + previews computed from the
// @viox/db fixtures through the shared engine (the same code
// the secret-gated /api/automations/run route executes), then
// handed to the client card grid for toggles + Run now.
// ============================================================

import * as React from 'react';
import { DEMO_TODAY, getRepository } from '@viox/db';
import { Badge, PageHeader, Stat, StatRow, fmtDate, fmtNumber } from '@viox/ui';
import { AUTOMATIONS, renderAutomationSms } from './engine';
import { AutomationCards, type AutomationCardData } from './AutomationCards';

export const dynamic = 'force-dynamic';

export default async function AutomationsPage() {
  const repo = getRepository();
  const [guests, reservations] = await Promise.all([repo.getGuests(), repo.getReservations()]);

  const cards: AutomationCardData[] = AUTOMATIONS.map((def) => {
    const audience = def.audience(guests, reservations);
    const sample = audience[0] ?? null;
    return {
      id: def.id,
      name: def.name,
      trigger: def.trigger,
      cadence: def.cadence,
      channels: [...def.channels],
      audience: audience.length,
      runnable: def.runnable,
      seededLastRun: def.seededLastRun,
      sampleGuest: sample ? sample.name : null,
      preview: sample ? renderAutomationSms(def, sample) : null,
    };
  });

  const optedIn = guests.filter((g) => g.marketingOptIn).length;
  const birthday = cards.find((c) => c.id === 'birthday');
  const winback = cards.find((c) => c.id === 'winback');
  const monthlyTouches = cards.reduce((sum, c) => sum + c.audience * c.channels.length, 0);

  return (
    <>
      <PageHeader
        kicker="Guest marketing"
        title="Automations"
        subtitle="Always-on playbooks that turn guest signals — birthdays, lapses, visits, walked waitlists — into branded SMS and email touches, automatically."
        actions={
          <>
            <Badge tone="info">Demo data · today = {fmtDate(DEMO_TODAY, true)}</Badge>
            <Badge tone="good">Live sends fenced to test users</Badge>
          </>
        }
      />

      <StatRow cols={4}>
        <Stat
          label="Playbooks"
          value={fmtNumber(cards.length)}
          hint={`${cards.filter((c) => c.runnable).length} runnable on demand`}
        />
        <Stat label="Opted-in guests" value={fmtNumber(optedIn)} hint={`of ${fmtNumber(guests.length)} in the CRM`} />
        <Stat
          label="Birthday audience"
          value={fmtNumber(birthday?.audience ?? 0)}
          highlight
          hint="August birthdays · flan on us"
        />
        <Stat
          label="Winback audience"
          value={fmtNumber(winback?.audience ?? 0)}
          hint={`Lapsed 60d+ · ~${fmtNumber(monthlyTouches)} touches/mo across playbooks`}
        />
      </StatRow>

      <AutomationCards cards={cards} />
    </>
  );
}
