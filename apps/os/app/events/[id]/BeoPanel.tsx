'use client';

import * as React from 'react';
import type { BEO, CateringEvent } from '@viox/db';
import { Badge, Card } from '@viox/ui';

export interface BeoPanelProps {
  event: CateringEvent;
  initialBeo: BEO | null;
}

/**
 * Banquet Event Order panel. Renders the structured BEO when one exists;
 * otherwise offers a locally-generated draft built from the event's menu
 * package. All actions are demo-local — nothing persists.
 */
export default function BeoPanel({ event, initialBeo }: BeoPanelProps) {
  const [beo, setBeo] = React.useState<BEO | null>(initialBeo);
  const [notice, setNotice] = React.useState<string | null>(null);

  const send = () => {
    if (!beo) return;
    setBeo({ ...beo, status: 'sent' });
    setNotice(`BEO v${beo.version} emailed to ${event.contactName} for signature (demo).`);
  };

  const markSigned = () => {
    if (!beo) return;
    setBeo({ ...beo, status: 'signed' });
    setNotice(`BEO v${beo.version} marked signed — kitchen and floor copies released (demo).`);
  };

  const generate = () => {
    setBeo(buildDraft(event));
    setNotice(`Draft assembled from the ${event.menuPackage} package — review, then send for signature.`);
  };

  if (!beo) {
    return (
      <Card kicker="Banquet Event Order" title="No BEO on file">
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel2)] px-6 py-12 text-center">
          <DocIcon />
          <p className="max-w-sm text-sm text-[var(--muted)]">
            This event doesn&apos;t have a Banquet Event Order yet. Generate a working draft from the{' '}
            <span className="text-[var(--text)]">{event.menuPackage}</span> package — timeline, courses,
            staffing, and rentals scaled to {event.partySize} guests.
          </p>
          <button
            type="button"
            onClick={generate}
            className="mt-1 rounded-lg border border-[rgba(201,153,92,.5)] bg-[rgba(201,153,92,.14)] px-4 py-2 text-sm font-medium text-[var(--accent)] transition-colors hover:bg-[rgba(201,153,92,.24)]"
          >
            Generate BEO draft
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      kicker="Banquet Event Order"
      title={
        <span className="inline-flex items-center gap-2">
          BEO v{beo.version}
          <Badge status={beo.status} />
        </span>
      }
      action={
        <div className="flex items-center gap-2">
          {beo.status === 'draft' && (
            <button
              type="button"
              onClick={send}
              className="rounded-lg border border-[rgba(201,153,92,.5)] bg-[rgba(201,153,92,.14)] px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[rgba(201,153,92,.24)]"
            >
              Send for signature
            </button>
          )}
          {beo.status === 'sent' && (
            <button
              type="button"
              onClick={markSigned}
              className="rounded-lg border border-[rgba(52,211,153,.4)] bg-[rgba(52,211,153,.1)] px-3 py-1.5 text-xs font-medium text-[var(--good)] transition-colors hover:bg-[rgba(52,211,153,.18)]"
            >
              Mark signed
            </button>
          )}
          {beo.status === 'signed' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--good)]">
              <CheckIcon /> Executed
            </span>
          )}
        </div>
      }
    >
      {notice && (
        <div className="mb-4 rounded-lg border border-[rgba(201,153,92,.35)] bg-[rgba(201,153,92,.07)] px-3 py-2 text-xs text-[var(--accent)]">
          {notice}
        </div>
      )}

      <div className="space-y-6">
        {/* ---------- service timeline ---------- */}
        <section>
          <SectionLabel>Service timeline</SectionLabel>
          <div className="overflow-hidden rounded-lg border border-[var(--border)]">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {beo.timeline.map((t, i) => (
                  <tr key={`${t.time}-${i}`} className={`border-b border-[var(--border)] last:border-0 ${i % 2 === 1 ? 'bg-[var(--panel2)]' : ''}`}>
                    <td className="w-20 whitespace-nowrap px-3 py-2 align-top text-xs font-medium tabular-nums text-[var(--accent)]">
                      {t.time}
                    </td>
                    <td className="px-3 py-2 text-sm leading-snug text-[var(--text)]">{t.item}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------- menu ---------- */}
        <section>
          <SectionLabel>Menu</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {beo.menu.map((course) => (
              <div key={course.course} className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3">
                <div className="text-[11px] font-medium uppercase tracking-[.12em] text-[var(--accent)]">
                  {course.course}
                </div>
                <ul className="mt-1.5 space-y-1">
                  {course.items.map((item) => (
                    <li key={item} className="text-sm leading-snug text-[var(--text)]">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- staffing ---------- */}
        <section>
          <SectionLabel>Staffing</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {beo.staffing.map((s) => (
              <span
                key={s.role}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-2.5 py-1.5 text-xs text-[var(--text)]"
              >
                <span className="font-semibold tabular-nums text-[var(--accent)]">{s.count}×</span>
                {s.role}
              </span>
            ))}
          </div>
        </section>

        {/* ---------- rentals + AV ---------- */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <section>
            <SectionLabel>Rentals</SectionLabel>
            <ListBlock items={beo.rentals} empty="No rentals required" />
          </section>
          <section>
            <SectionLabel>A/V & production</SectionLabel>
            <ListBlock items={beo.av} empty="No A/V requested" />
          </section>
        </div>

        {/* ---------- dietary ---------- */}
        <section>
          <SectionLabel>Dietary & allergy notes</SectionLabel>
          <div className="rounded-lg border border-[rgba(251,191,36,.3)] bg-[rgba(251,191,36,.06)] px-3 py-2.5 text-sm leading-relaxed text-[var(--text)]">
            {beo.dietaryNotes}
          </div>
        </section>
      </div>
    </Card>
  );
}

// ---------- draft generator (local, deterministic — demo only) ----------

const PACKAGE_MENUS: Record<string, { course: string; items: string[] }[]> = {
  'Paella Feast': [
    { course: 'Family-Style Tapas', items: ['Ceviche Limeño', 'Green Avocado Salad', 'Pulpo a la Parrilla'] },
    { course: 'Paella Feast', items: ['Paella Buenavista', 'Paella Negra'] },
    { course: 'Dessert', items: ['Churros con Chocolate', 'Flan de Caramelo'] },
  ],
  'Tapas Reception': [
    { course: 'Passed', items: ['Ceviche Limeño spoons', 'Serrano + Manchego montaditos', 'Croqueta bites'] },
    { course: 'Stations', items: ['Pulpo a la Parrilla', 'Salmon Barceloneta bites', 'Sangría + BV cocktail bar'] },
    { course: 'Dessert', items: ['Churros con Chocolate', 'Flan de Caramelo'] },
  ],
  'Plated Dinner': [
    { course: 'First', items: ['Green Avocado Salad', 'Ceviche Limeño'] },
    { course: 'Main (choice of)', items: ['Chilean Sea Bass Mediterráneo', 'Ossobuco de Cerdo Ibérico', 'Salmon Barceloneta'] },
    { course: 'Dessert', items: ['Flan de Caramelo', 'Churros con Chocolate'] },
  ],
  'Brunch Social': [
    { course: 'Family-Style', items: ['Green Avocado Salad', 'Tortilla Española', 'Huevos Rotos'] },
    { course: 'Mains', items: ['Salmon Barceloneta', 'Paella Buenavista'] },
    { course: 'Dessert + Bar', items: ['Churros con Chocolate', 'Bottomless sangría hour'] },
  ],
};

function buildDraft(event: CateringEvent): BEO {
  const t = /T(\d{2}):(\d{2})/.exec(event.eventDate);
  const startMin = t ? Number(t[1]) * 60 + Number(t[2]) : 19 * 60;
  const at = (offset: number) => {
    const m = (((startMin + offset) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };

  const isReception = event.menuPackage === 'Tapas Reception';
  const timeline: BEO['timeline'] = [
    { time: at(-120), item: `Room set complete — ${event.space} flipped per floor plan, place settings for ${event.partySize}` },
    { time: at(-30), item: 'Bar opens — sangría pitchers + BV cocktail list (smoked old fashioned cart on request)' },
    { time: at(0), item: isReception ? 'Doors — passed tapas begin, stations lit' : 'Guests seated; first course drops' },
    { time: at(45), item: isReception ? 'Stations refreshed; host remarks window' : 'Mains fired — paellas presented tableside where ordered' },
    { time: at(105), item: 'Dessert service + coffee' },
    { time: at(150), item: 'Event close-out; final head-count reconciliation with captain' },
  ];

  const staffing: BEO['staffing'] = [
    { role: 'Captain', count: Math.max(1, Math.round(event.partySize / 50)) },
    { role: 'Server', count: Math.max(2, Math.ceil(event.partySize / 12)) },
    { role: 'Bartender', count: Math.max(1, Math.ceil(event.partySize / 35)) },
    { role: 'Runner', count: Math.max(1, Math.ceil(event.partySize / 40)) },
  ];

  const rentals: string[] = ['Linen set — house navy + gold runners'];
  if (event.partySize >= 60) rentals.push(`Cocktail rounds (${Math.ceil(event.partySize / 10)})`);
  if (event.space === 'Full Buyout') rentals.push('Stage riser 8×8', 'Valet cones + signage');

  const av: string[] =
    event.partySize >= 40
      ? ['Wireless mic + small PA for remarks', 'House playlist — Spanish guitar, low']
      : ['House playlist — Spanish guitar, low'];

  return {
    id: `beo_draft_${event.id}`,
    eventId: event.id,
    version: 1,
    timeline,
    menu: PACKAGE_MENUS[event.menuPackage] ?? PACKAGE_MENUS['Plated Dinner'],
    staffing,
    rentals,
    av,
    dietaryNotes:
      'Final dietary + allergy counts due 7 days out. Kitchen flags: shellfish in signature paellas — dedicated pan available; gluten-free churros alternative on request.',
    status: 'draft',
  };
}

// ---------- tiny partials ----------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-medium uppercase tracking-[.12em] text-[var(--muted)]">{children}</div>
  );
}

function ListBlock({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) {
    return <div className="rounded-lg border border-dashed border-[var(--border)] px-3 py-2.5 text-xs text-[var(--muted)]">{empty}</div>;
  }
  return (
    <ul className="space-y-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm leading-snug text-[var(--text)]">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-[var(--muted)]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 3.5h7L18.5 8v12A1.5 1.5 0 0 1 17 21.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M14 3.5V8h4.5M8.5 12h7M8.5 15.5h7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m2.5 6.5 2.5 2.5 4.5-5.5" />
    </svg>
  );
}
