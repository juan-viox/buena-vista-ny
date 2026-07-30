// ============================================================
// @viox/agents — the AI team registry. Seven named specialists
// that sit on top of the copilot tool belt. Pure data: the OS
// and CRM apps render rosters/detail pages from this, and the
// copilot route can scope tool access per agent.
// Recent outputs cite REAL fixture numbers (anchor 2026-07-29).
// ============================================================

export interface AgentDef {
  id: string;
  name: string;
  tagline: string;
  description: string;
  app: 'os' | 'crm' | 'both';
  color: string;
  monogram: string;
  model: string;
  tools: string[];
  samplePrompts: string[];
  recentOutputs: { title: string; at: string; body: string }[];
  voice?: { provider: 'elevenlabs'; agentId: string; label: string; status: string };
}

export const AGENTS: AgentDef[] = [
  {
    id: 'mise',
    name: 'Mise',
    tagline: 'Inventory & Procurement',
    description:
      'Watches every count against par, drafts reorders before the weekend push, and triages vendor price alerts so nothing gets 86\'d mid-service. Mise knows which vendor carries each item, what you paid last time, and when a price move deserves a call to the rep instead of a blind reorder.',
    app: 'os',
    color: '#34D399',
    monogram: 'M',
    model: 'claude-sonnet-5',
    tools: ['getLowStockItems', 'getPriceAlerts', 'getFoodCostOverview'],
    samplePrompts: [
      'What do I need to reorder before Friday?',
      'Which price alerts are still open?',
      'Are we going to run out of anything for the paella stations?',
      'What did purchasing run over the last 30 days?',
    ],
    recentOutputs: [
      {
        title: 'Reorder draft — 6 items at or below par',
        at: '2026-07-29T06:40:00-04:00',
        body: 'Langoustines 8 lb on hand vs par 25 — Blue Ribbon Fish (Net 14). Persian Limes 2 cases vs par 6 — Baldor. Saffron 2 oz vs par 6 — hold: La Tienda just moved it +17.9%. Bomba rice 34 kg vs par 60, Spanish Octopus 22 lb vs par 40, Albariño 19 btl vs par 48. Paella Buenavista and the sangría program both touch this list — get the seafood order in today.',
      },
      {
        title: 'Price-alert triage — 4 open, 2 need action',
        at: '2026-07-28T16:15:00-04:00',
        body: 'Saffron (La Tienda) $78.00 → $92.00/oz, +17.9% — biggest open move; ask for the 8-oz tier or spec a blend for staff meal paella. Spanish Octopus (Gotham) $13.30 → $14.90/lb, +12.0% — Pulpo is already over target, flag to Ledger. Persian Limes +9.0% and Chilean Sea Bass +8.6% are seasonal; acknowledge and watch.',
      },
      {
        title: 'Weekend depletion check — seafood is the pinch',
        at: '2026-07-27T18:30:00-04:00',
        body: 'At current mix (Ceviche 768/mo, Pulpo 493/mo across both rooms) langoustine and octopus on-hand will not clear Saturday service. Mussels, shrimp and calamari are comfortably above par. Recommended add to the Blue Ribbon order: +20 lb langoustines; Gotham: +25 lb octopus.',
      },
    ],
  },
  {
    id: 'ledger',
    name: 'Ledger',
    tagline: 'Cost Analyst',
    description:
      'Runs plate costs against target every time an invoice lands, re-costs recipes when a vendor moves a price, and points at the exact dish where margin is leaking. Ledger speaks in points over target and dollars recovered — not vibes — and always names the one change worth making first.',
    app: 'os',
    color: '#FBBF24',
    monogram: 'L',
    model: 'claude-sonnet-5',
    tools: ['getFoodCostOverview', 'getMenuEngineering', 'getPriceAlerts'],
    samplePrompts: [
      "What's driving food cost up this month?",
      'Which dishes are furthest over their target cost?',
      'Re-cost the paella after the saffron price move',
      'Where is the fastest margin recovery?',
    ],
    recentOutputs: [
      {
        title: 'Worst offenders — sea bass is 9.2 pts over target',
        at: '2026-07-29T07:05:00-04:00',
        body: 'Chilean Sea Bass Mediterráneo: plate $17.31 on a $42 menu price = 41.2% vs 32% target (+9.2 pts) — Gotham moved fillet to $34.20/lb. Pulpo a la Parrilla: 37.8% vs 28% (+9.8 pts) after octopus +12%. Paella Buenavista: 31.6% vs 28% — saffron + langoustine spikes. Fastest point back: raise sea bass to $46 or trim the portion 1 oz.',
      },
      {
        title: 'July margin ledger — paella still pays the rent',
        at: '2026-07-28T14:50:00-04:00',
        body: 'Paella Buenavista is July\'s margin leader: 564 pans, ~$22.1k margin across both rooms. Cocktails carry the blend — Smoked Old Fashioned runs 17% cost, Sangría ~20% on 1,430 glasses. Flan is a dog in both rooms (149 HK / 118 EV) — candidate for a brunch-only slot or a re-plate.',
      },
      {
        title: 'Recipe re-cost queue after price alerts',
        at: '2026-07-27T20:10:00-04:00',
        body: 'Queued re-costs from open alerts: Paella Buenavista (saffron $92/oz → plate +$0.42), Pulpo (octopus $14.90/lb → plate +$0.96), Sea Bass Mediterráneo (fillet $34.20/lb → plate +$1.22). Net effect if unaddressed: ~1.1 pts on blended food cost for August.',
      },
    ],
  },
  {
    id: 'sala',
    name: 'Sala',
    tagline: 'Sales & Menu Analyst',
    description:
      'Reads the two rooms like a floor manager reads a book: daypart mix, check averages, category trends, and the menu-engineering matrix. Sala compares Hell\'s Kitchen\'s pre-theater engine against East Village\'s 2 AM Fridays and tells you which quadrant every dish actually lives in.',
    app: 'os',
    color: '#7EB2F5',
    monogram: 'S',
    model: 'claude-sonnet-5',
    tools: ['getSalesSummary', 'getMenuEngineering'],
    samplePrompts: [
      'How did we do last week vs the prior week?',
      "Compare Hell's Kitchen and East Village this month",
      'Which menu items are puzzles worth pushing?',
      'What daypart is growing fastest?',
    ],
    recentOutputs: [
      {
        title: 'Weekly read — both rooms, 7 days',
        at: '2026-07-29T06:30:00-04:00',
        body: "Hell's Kitchen ran ~$14.5k/day with Wed–Sat carrying (pre-theater ~24% of weekday net). East Village ~$11k/day — Friday and Saturday to 2 AM are its engine (Sat multiplier ~1.36), Monday is the soft spot. The mid-July heat-wave dip (7/12–7/19, ~-10%) is fully recovered.",
      },
      {
        title: 'Menu matrix — July',
        at: '2026-07-28T15:40:00-04:00',
        body: 'Stars: Paella Buenavista, Smoked Old Fashioned, Sangría Roja (1,430 glasses), Ceviche Limeño (HK). Puzzles: Paella Negra and Sea Bass in both rooms — high margin, low pull; worth a server push and better menu placement. Dogs: Flan in both rooms; Ossobuco is a dog in EV but a puzzle in HK — consider making it an HK exclusive.',
      },
      {
        title: 'Location split — cocktails behave differently downtown',
        at: '2026-07-27T19:20:00-04:00',
        body: 'EV runs 26% of net through cocktails vs 18% at HK; HK holds a wine edge (12% vs 8%) on the Rioja list. Smoked Old Fashioned actually sells harder in EV (486 vs 412 in July) — late-night crowd. Sangría is the volume king in both rooms.',
      },
    ],
  },
  {
    id: 'turno',
    name: 'Turno',
    tagline: 'Labor & Scheduling',
    description:
      'Holds the line on labor percent: watches daily labor against the 29% target, flags the shifts that crept, and calls out overtime risk before payroll does. Turno knows the EV close crew runs late on Fridays and that slow Mondays are where the percentage quietly dies.',
    app: 'os',
    color: '#FB923C',
    monogram: 'T',
    model: 'claude-sonnet-5',
    tools: ['getSalesSummary'],
    samplePrompts: [
      'Where is labor running vs target this week?',
      'Which days went over 29%?',
      'Is the EV late-night crew creating overtime risk?',
    ],
    recentOutputs: [
      {
        title: 'Labor watch — 7-day read vs 29% target',
        at: '2026-07-29T07:20:00-04:00',
        body: 'Blended labor is holding in the 28–29% band. Busy Fri/Sat run leanest (~26–27%); Monday crept toward 31% in both rooms — the same slow-Monday pattern as the last four weeks. Recommendation: trim one server shift from the Monday floor at EV (Mon multiplier 0.62, softest day of the week).',
      },
      {
        title: 'Overtime flag — EV close crew',
        at: '2026-07-28T09:45:00-04:00',
        body: 'EV Fri/Sat closes add ~1.5 hrs per shift for the 2 AM crew (bartenders + line). Kiki Alonso and Ramón Ibarra are trending toward the top of the hours band this week. No OT breach yet — rotate Theo Marsh onto one weekend close to keep it that way.',
      },
    ],
  },
  {
    id: 'fiesta',
    name: 'Fiesta',
    tagline: 'Events Coordinator',
    description:
      'Runs the private-events book end to end: chases proposals before they cool, drafts BEOs from the menu packages, and keeps deposits and signatures moving. Fiesta reads the pipeline the way a catering director does — by date, by dollars, and by what is unsigned.',
    app: 'both',
    color: '#F472B6',
    monogram: 'F',
    model: 'claude-sonnet-5',
    tools: ['getEventPipelineSummary', 'getUpcomingEvents'],
    samplePrompts: [
      'Which events need BEOs signed?',
      'What proposals are waiting on a decision?',
      "What's committed in the next 30 days?",
      'Draft the run-of-show for the next buyout',
    ],
    recentOutputs: [
      {
        title: 'BEO board — Banco signed, Isabela out for signature',
        at: '2026-07-29T08:10:00-04:00',
        body: 'Banco Continental Board Dinner (8/6, 22 guests, $6,160): BEO v3 SIGNED — chair is gluten-free, dedicated churros fryer confirmed, Rioja Reserva vertical pulled. Isabela Marte Paella Feast (8/9, 36 guests, $4,680): BEO v2 sent, awaiting signature — mariachi stages from the kitchen corridor at 9pm, two shellfish allergies at table 4. Cardoza & Levine full buyout (10/15, 120 guests, $28,000): BEO v1 still in draft; allergy list due 10/1.',
      },
      {
        title: 'Pipeline pulse — $57.6k open, $21.9k landing in 30 days',
        at: '2026-07-28T17:25:00-04:00',
        body: 'Open pipeline (leads/proposals/tastings): ~$57.6k across 8 events. Committed next 30 days: 4 events, $21,880 — Banco 8/6, Isabela 8/9, Ravelo brunch 8/16, Stellar Beauty 8/27. All committed deposits are in. Hottest follow-up: Meridian Capital offsite ($8,740, decision expected this week) — Tom Okafor got the proposal 7/24.',
      },
      {
        title: 'Follow-up queue — 3 calls to make today',
        at: '2026-07-27T16:05:00-04:00',
        body: '1) Meridian Capital — proposal aging 5 days, nudge Tom Okafor before the week closes. 2) Alvarez–Kim rehearsal dinner — confirm the 8/5 6pm tasting headcount (both families attending). 3) Vamos Media launch ($12,750, 75 pax) — AV walk-through still unscheduled; needs the step-and-repeat wall spec.',
      },
    ],
  },
  {
    id: 'concierge',
    name: 'Anfitrión',
    tagline: 'Voice Concierge',
    description:
      'The house voice: answers phone calls and web chats in English and Spanish, handles hours/menu/location questions for both rooms, and captures reservation requests with the guest\'s name, party size and occasion — pushed straight into VioX CRM via webhook. When a caller is a known regular, Anfitrión greets them like one.',
    app: 'both',
    color: '#C9995C',
    monogram: 'A',
    model: 'claude-haiku-5',
    tools: ['searchGuests', 'getGuestProfile'],
    samplePrompts: [
      'What did the concierge capture today?',
      'Look up the guest who just called about a birthday',
      'Which regulars have upcoming reservations?',
    ],
    recentOutputs: [
      {
        title: 'Reservation captured — party of 4, tonight 8pm (web)',
        at: '2026-07-29T11:35:00-04:00',
        body: 'Web widget chat, Spanish. Guest: Sofia Delgado — recognized as VIP / event host (22 visits, $5.3k lifetime). Request: 4 covers tonight 8:00pm, East Village. Pushed to CRM → Reservations. Note attached: her 40th-birthday proposal ($5,120) is still open in the pipeline — Fiesta pinged.',
      },
      {
        title: 'Call handled — birthday inquiry routed to Events',
        at: '2026-07-28T19:50:00-04:00',
        body: 'Inbound call, English/Spanish mix, 3m 40s. New contact asking about a quinceañera for ~60 guests in September at Hell\'s Kitchen. Captured name + callback number, quoted the Paella Feast package range, created CRM contact and tagged event_host lead. Handed to Fiesta with notes: needs DJ space + dessert table.',
      },
      {
        title: 'Overnight web sessions — 6 chats, 2 reservation requests',
        at: '2026-07-28T07:55:00-04:00',
        body: 'Between close and open: 6 web-widget conversations on buena-vista-ny.vercel.app. 2 reservation requests captured to CRM (both EV late-night Friday), 3 hours/menu questions answered bilingually, 1 caller asked for the private-dining page and got the events link. Zero handoffs required.',
      },
    ],
    voice: {
      provider: 'elevenlabs',
      agentId: 'agent_9001kyr4x889fzsrxn1a42vw64hx',
      label: 'Web widget live on buena-vista-ny.vercel.app',
      status: 'live — reservation capture wired to CRM',
    },
  },
  {
    id: 'vega',
    name: 'Vega',
    tagline: 'Growth & Campaigns',
    description:
      'Builds the segments, writes the sends, and tracks what actually put covers in seats. Vega runs the win-back list, the birthday pushes and the VIP previews — and reports campaign performance in reservations driven, not opens. Every draft cites the segment it targets and the table math behind it.',
    app: 'crm',
    color: '#2DD4BF',
    monogram: 'V',
    model: 'claude-sonnet-5',
    tools: ['searchGuests', 'getCampaignPerformance', 'getGuestProfile'],
    samplePrompts: [
      'Who are our lapsed VIPs worth a win-back?',
      'How did the last three campaigns perform?',
      'Draft the August birthday push',
      'Build a segment for late-night regulars',
    ],
    recentOutputs: [
      {
        title: 'Campaign scorecard — VIP email keeps winning',
        at: '2026-07-29T09:15:00-04:00',
        body: '"Paella Wednesdays — VIP Preview" (email, VIP 10+ visits): 10 sent, 80% open, 50% click, 4 reservations — best performer. "Late Night on 2nd Ave" (SMS, Big Spenders): 12 sent, 6 clicks, 5 reservations. "We Miss You" win-back: 5 sent, 3 opens, 1 reservation — worth a second touch with a sangría offer. Total driven: 10 reservations across 3 sends.',
      },
      {
        title: 'Win-back shortlist — 5 lapsed, Wanda Pierce leads',
        at: '2026-07-28T13:30:00-04:00',
        body: 'Lapsed 90+ days: 5 guests. Wanda Pierce tops the list — 11 visits, $2,760 lifetime, was a monthly regular through spring (last in 104 days ago, favorite: Paella Buenavista). Then Bobby Ferrell ($1,050, smoked old fashioned guy) and Gustavo Lima ($720, Paella Negra). Draft ready: personal note + welcome-back sangría, send from Christian.',
      },
      {
        title: 'August birthday push — scheduled and loaded',
        at: '2026-07-27T15:45:00-04:00',
        body: '"August Birthdays — Flan on Us" scheduled for 8/1 10:00am to the 6-guest birthday segment (Carmen 8/2, Isabela 8/9, Marcus 8/15, Alina 8/23, Jun 8/27, Naomi 8/30). Isabela already has her paella feast booked 8/9 — suppressing her from the send. Brunch Sangría Hour SMS follows 8/2 to 8 brunch regulars.',
      },
    ],
  },
];

export function getAgent(id: string): AgentDef | undefined {
  return AGENTS.find((a) => a.id === id);
}
