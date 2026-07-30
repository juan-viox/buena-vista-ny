// ============================================================
// Catering & events fixtures (Caterease parity) — a 16-event
// pipeline across every stage, BEOs for the finalized events,
// and deposit/balance payments for booked+ stages.
// ============================================================

import type { BEO, CateringEvent, EventPayment, EventStage, EventType, ID } from '../types';
import { TENANT_ID, LOC_EV, LOC_HK } from './tenancy';
import { isoDaysAgo, nyc } from './seed';

interface EventSeed {
  id: ID;
  locationId: ID;
  guestId?: ID;
  title: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  type: EventType;
  stage: EventStage;
  eventDate: string;
  partySize: number;
  space: string;
  budget: number;
  quotedTotal: number;
  depositPaid: boolean;
  depositAmount: number;
  menuPackage: string;
  notes: string;
  createdDaysAgo: number;
  updatedDaysAgo: number;
}

function ev(s: EventSeed): CateringEvent {
  return {
    id: s.id,
    tenantId: TENANT_ID,
    locationId: s.locationId,
    guestId: s.guestId,
    title: s.title,
    contactName: s.contactName,
    contactEmail: s.contactEmail,
    contactPhone: s.contactPhone,
    type: s.type,
    stage: s.stage,
    eventDate: s.eventDate,
    partySize: s.partySize,
    space: s.space,
    budget: s.budget,
    quotedTotal: s.quotedTotal,
    depositPaid: s.depositPaid,
    depositAmount: s.depositAmount,
    menuPackage: s.menuPackage,
    notes: s.notes,
    createdAt: nyc(isoDaysAgo(s.createdDaysAgo), '10:15'),
    updatedAt: nyc(isoDaysAgo(s.updatedDaysAgo), '16:40'),
  };
}

export const CATERING_EVENTS: CateringEvent[] = [
  // ---- Leads (3) ----
  ev({
    id: 'evt_ust_q4', locationId: LOC_EV, title: 'Union Square Tech — Q4 Team Dinner',
    contactName: 'Priyanka Shah', contactEmail: 'pshah@unionsqtech.com', contactPhone: '(917) 555-0164',
    type: 'corporate', stage: 'lead', eventDate: nyc('2026-10-08', '19:00'), partySize: 24,
    space: 'Private Room', budget: 4200, quotedTotal: 0, depositPaid: false, depositAmount: 0,
    menuPackage: 'Plated Dinner', notes: 'Came in via website form. Wants a quote for a 3-course plated dinner with sangría pairing.',
    createdDaysAgo: 2, updatedDaysAgo: 2,
  }),
  ev({
    id: 'evt_restrepo_quince', locationId: LOC_HK, title: 'Quinceañera Inquiry — Familia Restrepo',
    contactName: 'Gloria Restrepo', contactEmail: 'gloria.restrepo@gmail.com', contactPhone: '(646) 555-0132',
    type: 'birthday', stage: 'lead', eventDate: nyc('2026-09-26', '17:00'), partySize: 60,
    space: 'Main Dining', budget: 7800, quotedTotal: 0, depositPaid: false, depositAmount: 0,
    menuPackage: 'Paella Feast', notes: 'Phone inquiry. Needs DJ space and a dessert table; considering us vs a Queens hall.',
    createdDaysAgo: 5, updatedDaysAgo: 3,
  }),
  ev({
    id: 'evt_nyu_mixer', locationId: LOC_EV, title: 'NYU Alumni Fall Mixer',
    contactName: 'Damon Ricks', contactEmail: 'damon.ricks@alumni.nyu.edu', contactPhone: '(212) 555-0189',
    type: 'corporate', stage: 'lead', eventDate: nyc('2026-09-18', '18:30'), partySize: 45,
    space: 'Main Dining', budget: 5200, quotedTotal: 0, depositPaid: false, depositAmount: 0,
    menuPackage: 'Tapas Reception', notes: 'Wants passed tapas + 2hr open bar tier. Budget conscious — offer the Tuesday rate.',
    createdDaysAgo: 8, updatedDaysAgo: 6,
  }),
  // ---- Proposal (3) ----
  ev({
    id: 'evt_meridian_offsite', locationId: LOC_HK, title: 'Meridian Capital Summer Offsite Dinner',
    contactName: 'Tom Okafor', contactEmail: 'tokafor@meridiancap.com', contactPhone: '(212) 555-0142',
    type: 'corporate', stage: 'proposal', eventDate: nyc('2026-08-20', '19:30'), partySize: 38,
    space: 'Private Room', budget: 9500, quotedTotal: 8740, depositPaid: false, depositAmount: 0,
    menuPackage: 'Plated Dinner', notes: 'Proposal sent 7/24: 3-course plated + wine pairing at $230/head. Decision expected this week.',
    createdDaysAgo: 14, updatedDaysAgo: 5,
  }),
  ev({
    id: 'evt_sofia_40', locationId: LOC_EV, guestId: 'g_sofia_delgado', title: 'Sofia Delgado 40th Birthday',
    contactName: 'Sofia Delgado', contactEmail: 'sofia.delgado@me.com', contactPhone: '(917) 555-0117',
    type: 'birthday', stage: 'proposal', eventDate: nyc('2026-09-12', '20:00'), partySize: 32,
    space: 'Main Dining', budget: 5500, quotedTotal: 5120, depositPaid: false, depositAmount: 0,
    menuPackage: 'Paella Feast', notes: 'Regular guest (VIP). Wants the back dining room, family-style paellas + churros tower.',
    createdDaysAgo: 12, updatedDaysAgo: 4,
  }),
  ev({
    id: 'evt_vamos_launch', locationId: LOC_HK, title: 'Vamos Media Product Launch Reception',
    contactName: 'Alejandra Cruz', contactEmail: 'alejandra@vamosmedia.co', contactPhone: '(347) 555-0175',
    type: 'corporate', stage: 'proposal', eventDate: nyc('2026-09-03', '18:00'), partySize: 75,
    space: 'Main Dining', budget: 14000, quotedTotal: 12750, depositPaid: false, depositAmount: 0,
    menuPackage: 'Tapas Reception', notes: 'Press + influencer reception. Needs step-and-repeat wall, AV for a 10-min presentation.',
    createdDaysAgo: 18, updatedDaysAgo: 7,
  }),
  // ---- Tasting (2) ----
  ev({
    id: 'evt_alvarezkim_rehearsal', locationId: LOC_HK, title: 'Alvarez–Kim Wedding Rehearsal Dinner',
    contactName: 'Marta Alvarez', contactEmail: 'marta.alvarez.k@gmail.com', contactPhone: '(201) 555-0126',
    type: 'wedding_rehearsal', stage: 'tasting', eventDate: nyc('2026-10-02', '18:30'), partySize: 44,
    space: 'Private Room', budget: 10500, quotedTotal: 9680, depositPaid: false, depositAmount: 0,
    menuPackage: 'Plated Dinner', notes: 'Tasting booked 8/5, 6pm — both families attending. Two vegetarian, one shellfish allergy.',
    createdDaysAgo: 24, updatedDaysAgo: 2,
  }),
  ev({
    id: 'evt_goldman_dinner', locationId: LOC_HK, guestId: 'g_daniel_rosen', title: 'Goldman Private Client Dinner',
    contactName: 'Daniel Rosen', contactEmail: 'daniel.rosen@gs.com', contactPhone: '(212) 555-0158',
    type: 'private_dinner', stage: 'tasting', eventDate: nyc('2026-09-10', '19:00'), partySize: 18,
    space: 'Private Room', budget: 4600, quotedTotal: 4140, depositPaid: false, depositAmount: 0,
    menuPackage: 'Plated Dinner', notes: 'Tasting 8/1 at noon. Wants smoked old fashioned cart tableside — confirm bar staffing.',
    createdDaysAgo: 20, updatedDaysAgo: 1,
  }),
  // ---- Booked (4) ----
  ev({
    id: 'evt_hudson_dental', locationId: LOC_EV, title: 'Hudson Dental Partners Holiday Preview',
    contactName: 'Renee Caldwell', contactEmail: 'rcaldwell@hudsondental.com', contactPhone: '(929) 555-0148',
    type: 'corporate', stage: 'booked', eventDate: nyc('2026-10-22', '19:00'), partySize: 55,
    space: 'Main Dining', budget: 10500, quotedTotal: 9900, depositPaid: true, depositAmount: 2500,
    menuPackage: 'Tapas Reception', notes: 'Deposit received 7/18. BEO draft due by 9/22. AV: wireless mic + playlist via house system.',
    createdDaysAgo: 30, updatedDaysAgo: 11,
  }),
  ev({
    id: 'evt_ravelo_brunch', locationId: LOC_EV, guestId: 'g_carmen_ravelo', title: 'Ravelo Family Reunion Brunch',
    contactName: 'Carmen Ravelo', contactEmail: 'carmen.ravelo@yahoo.com', contactPhone: '(718) 555-0193',
    type: 'private_dinner', stage: 'booked', eventDate: nyc('2026-08-16', '11:30'), partySize: 40,
    space: 'Main Dining', budget: 5000, quotedTotal: 4600, depositPaid: true, depositAmount: 1200,
    menuPackage: 'Brunch Social', notes: 'Family-style brunch + bottomless sangría hour. Abuela turns 80 — flan with candles at 1pm.',
    createdDaysAgo: 26, updatedDaysAgo: 9,
  }),
  ev({
    id: 'evt_stellar_influencer', locationId: LOC_HK, title: 'Stellar Beauty Influencer Dinner',
    contactName: 'Jade Winters', contactEmail: 'jade@stellarbeauty.com', contactPhone: '(646) 555-0171',
    type: 'corporate', stage: 'booked', eventDate: nyc('2026-08-27', '19:30'), partySize: 28,
    space: 'Private Room', budget: 7000, quotedTotal: 6440, depositPaid: true, depositAmount: 2000,
    menuPackage: 'Plated Dinner', notes: 'Content-forward: candle-lit table, branded menus, cava tower on arrival. Photographer 6:30pm.',
    createdDaysAgo: 22, updatedDaysAgo: 6,
  }),
  ev({
    id: 'evt_cardoza_buyout', locationId: LOC_HK, title: 'Cardoza & Levine LLP Full Buyout',
    contactName: 'Miguel Cardoza', contactEmail: 'mcardoza@cardozalevine.com', contactPhone: '(212) 555-0110',
    type: 'buyout', stage: 'booked', eventDate: nyc('2026-10-15', '18:00'), partySize: 120,
    space: 'Full Buyout', budget: 30000, quotedTotal: 28000, depositPaid: true, depositAmount: 8000,
    menuPackage: 'Paella Feast', notes: 'Firm anniversary — full HK buyout. Live flamenco trio 8-10pm, valet arranged by client. BEO v1 drafted.',
    createdDaysAgo: 34, updatedDaysAgo: 3,
  }),
  // ---- BEO final (2) ----
  ev({
    id: 'evt_banco_board', locationId: LOC_HK, title: 'Banco Continental Board Dinner',
    contactName: 'Isabel Fuentes', contactEmail: 'ifuentes@bancocontinental.com', contactPhone: '(212) 555-0104',
    type: 'corporate', stage: 'beo_final', eventDate: nyc('2026-08-06', '19:00'), partySize: 22,
    space: 'Private Room', budget: 6500, quotedTotal: 6160, depositPaid: true, depositAmount: 2000,
    menuPackage: 'Plated Dinner', notes: 'BEO v3 signed. Board chair is gluten-free; sommelier pull list confirmed (Rioja Reserva vertical).',
    createdDaysAgo: 41, updatedDaysAgo: 1,
  }),
  ev({
    id: 'evt_isabela_bday', locationId: LOC_EV, guestId: 'g_isabela_marte', title: 'Isabela Marte Birthday — Paella Feast',
    contactName: 'Isabela Marte', contactEmail: 'isabela.marte@gmail.com', contactPhone: '(917) 555-0139',
    type: 'birthday', stage: 'beo_final', eventDate: nyc('2026-08-09', '19:30'), partySize: 36,
    space: 'Main Dining', budget: 5200, quotedTotal: 4680, depositPaid: true, depositAmount: 1500,
    menuPackage: 'Paella Feast', notes: 'BEO v2 sent for signature. Mariachi surprise at 9pm staged from the kitchen corridor.',
    createdDaysAgo: 28, updatedDaysAgo: 2,
  }),
  // ---- Completed (1) ----
  ev({
    id: 'evt_portela_tasting', locationId: LOC_EV, title: 'Portela Wines Trade Tasting',
    contactName: 'Nuno Portela', contactEmail: 'nuno@portelawines.pt', contactPhone: '(551) 555-0122',
    type: 'corporate', stage: 'completed', eventDate: nyc(isoDaysAgo(12), '15:00'), partySize: 50,
    space: 'Main Dining', budget: 7500, quotedTotal: 7250, depositPaid: true, depositAmount: 2500,
    menuPackage: 'Tapas Reception', notes: 'Ran 3-6pm before dinner service. Balance settled same day. Great feedback — wants spring date.',
    createdDaysAgo: 55, updatedDaysAgo: 12,
  }),
  // ---- Lost (1) ----
  ev({
    id: 'evt_kessler_party', locationId: LOC_EV, title: 'Kessler PR Summer Party',
    contactName: 'Bree Kessler', contactEmail: 'bree@kesslerpr.com', contactPhone: '(646) 555-0155',
    type: 'corporate', stage: 'lost', eventDate: nyc('2026-08-21', '18:00'), partySize: 65,
    space: 'Main Dining', budget: 11000, quotedTotal: 9750, depositPaid: false, depositAmount: 0,
    menuPackage: 'Tapas Reception', notes: 'Went with a rooftop venue for the view. Asked to keep us in mind for the winter party.',
    createdDaysAgo: 38, updatedDaysAgo: 15,
  }),
];

// ---------- BEOs (2 beo_final + the buyout draft) ----------

export const BEOS: BEO[] = [
  {
    id: 'beo_banco_v3',
    eventId: 'evt_banco_board',
    version: 3,
    timeline: [
      { time: '17:30', item: 'Room set complete — boardroom rounds, place cards per seating chart' },
      { time: '18:30', item: 'Bar opens: cava + smoked old fashioned cart' },
      { time: '19:00', item: 'Guests seated; amuse (ceviche spoon) drops' },
      { time: '19:25', item: 'First course fired' },
      { time: '20:10', item: 'Mains fired — paella presented tableside, then plated' },
      { time: '21:15', item: 'Dessert + Cardenal Mendoza pour; chair toast' },
      { time: '22:00', item: 'Coffee service; cars called' },
    ],
    menu: [
      { course: 'Passed', items: ['Ceviche Limeño spoons', 'Manchego + Marcona bites'] },
      { course: 'First', items: ['Green Avocado Salad', 'Pulpo a la Parrilla (supplement)'] },
      { course: 'Main', items: ['Paella Buenavista (tableside)', 'Chilean Sea Bass Mediterráneo (GF chair)'] },
      { course: 'Dessert', items: ['Flan de Caramelo', 'Churros con Chocolate'] },
    ],
    staffing: [
      { role: 'Captain', count: 1 },
      { role: 'Server', count: 3 },
      { role: 'Bartender', count: 1 },
      { role: 'Runner', count: 1 },
    ],
    rentals: ['Boardroom rounds (2× 96")', 'Gold-rim charger plates (24)'],
    av: ['Wireless lav mic', 'House playlist — flamenco jazz, low'],
    dietaryNotes: 'Board chair strictly gluten-free (dedicated fryer for churros alt). One pescatarian.',
    status: 'signed',
  },
  {
    id: 'beo_isabela_v2',
    eventId: 'evt_isabela_bday',
    version: 2,
    timeline: [
      { time: '18:45', item: 'Family arrival; sangría pitchers pre-set' },
      { time: '19:30', item: 'Seating; tapas boards drop family-style' },
      { time: '20:15', item: 'Paella Feast service (3× Buenavista, 2× Negra pans)' },
      { time: '21:00', item: 'Mariachi enters from kitchen corridor — “Las Mañanitas”' },
      { time: '21:20', item: 'Churros tower + candle; group photo on banquette' },
      { time: '23:00', item: 'Event close; DJ handoff to regular late-night floor' },
    ],
    menu: [
      { course: 'Family-Style Tapas', items: ['Ceviche Limeño', 'Green Avocado Salad', 'Pulpo a la Parrilla'] },
      { course: 'Paella Feast', items: ['Paella Buenavista', 'Paella Negra'] },
      { course: 'Dessert', items: ['Churros tower', 'Flan de Caramelo'] },
    ],
    staffing: [
      { role: 'Captain', count: 1 },
      { role: 'Server', count: 4 },
      { role: 'Bartender', count: 2 },
    ],
    rentals: ['Churros tower stand', 'Table runner set — marigold'],
    av: ['Mariachi trio (client-booked) — staging in kitchen corridor 20:45'],
    dietaryNotes: 'Two shellfish allergies at table 4 — chicken/chorizo paella pan dedicated.',
    status: 'sent',
  },
  {
    id: 'beo_cardoza_v1',
    eventId: 'evt_cardoza_buyout',
    version: 1,
    timeline: [
      { time: '16:00', item: 'Restaurant closes to public; flip to reception layout' },
      { time: '17:30', item: 'Flamenco trio soundcheck; valet cones placed on 9th Ave' },
      { time: '18:00', item: 'Doors — cava tower + passed tapas' },
      { time: '19:15', item: 'Partner remarks (mic at bar); paella pans staged' },
      { time: '19:45', item: 'Paella Feast stations open (4 stations)' },
      { time: '21:00', item: 'Dessert buffet + coffee; trio second set' },
      { time: '23:00', item: 'Last call; breakdown begins' },
    ],
    menu: [
      { course: 'Passed', items: ['Ceviche spoons', 'Serrano + Manchego montaditos', 'Croqueta bites'] },
      { course: 'Stations', items: ['Paella Buenavista', 'Paella Negra', 'Whole-roasted salmon carving'] },
      { course: 'Dessert Buffet', items: ['Churros con Chocolate', 'Flan de Caramelo', 'Fruit + Marcona brittle'] },
    ],
    staffing: [
      { role: 'Captain', count: 2 },
      { role: 'Server', count: 8 },
      { role: 'Bartender', count: 4 },
      { role: 'Station Chef', count: 4 },
      { role: 'Runner', count: 3 },
    ],
    rentals: ['Cava tower glassware (140)', 'Cocktail rounds (10)', 'Stage riser 8×8 for trio'],
    av: ['PA + 2 wireless mics', 'Uplighting — amber wash (12 units)'],
    dietaryNotes: 'Firm-provided allergy list pending (due 10/1). Plan one vegetarian paella pan.',
    status: 'draft',
  },
];

// ---------- Payments (deposits for booked+, balance for completed) ----------

function pay(id: ID, eventId: ID, date: string, amount: number, method: EventPayment['method'], kind: EventPayment['kind']): EventPayment {
  return { id, eventId, date, amount, method, kind };
}

export const EVENT_PAYMENTS: EventPayment[] = [
  pay('pay_hudson_dep', 'evt_hudson_dental', isoDaysAgo(11), 2500, 'ach', 'deposit'),
  pay('pay_ravelo_dep', 'evt_ravelo_brunch', isoDaysAgo(9), 1200, 'card', 'deposit'),
  pay('pay_stellar_dep', 'evt_stellar_influencer', isoDaysAgo(6), 2000, 'card', 'deposit'),
  pay('pay_cardoza_dep', 'evt_cardoza_buyout', isoDaysAgo(19), 8000, 'ach', 'deposit'),
  pay('pay_banco_dep', 'evt_banco_board', isoDaysAgo(27), 2000, 'ach', 'deposit'),
  pay('pay_isabela_dep', 'evt_isabela_bday', isoDaysAgo(16), 1500, 'card', 'deposit'),
  pay('pay_portela_dep', 'evt_portela_tasting', isoDaysAgo(41), 2500, 'ach', 'deposit'),
  pay('pay_portela_bal', 'evt_portela_tasting', isoDaysAgo(12), 4750, 'card', 'balance'),
];
