// ============================================================
// CRM & guest-marketing fixtures — 48 guests, 30 reservations,
// 6 segments (counts computed from the guest list so they stay
// consistent), and 7 campaigns (3 sent / 2 scheduled / 2 draft).
// ============================================================

import type { Campaign, Guest, GuestTag, ID, Reservation, Segment } from '../types';
import { TENANT_ID, LOC_EV, LOC_HK } from './tenancy';
import { isoDaysAgo, isoDaysAhead, nyc, round2 } from './seed';

// ---------- Guests (48) ----------

interface GuestExtra {
  birthday?: string;
  notes?: string;
  optIn?: boolean;
  createdDaysAgo?: number;
}

function g(
  id: ID, name: string, email: string, phone: string | undefined, tags: GuestTag[],
  visits: number, lifetimeSpend: number, lastVisitDaysAgo: number, favoriteLocationId: ID,
  favoriteItems: string[], source: Guest['source'], extra: GuestExtra = {},
): Guest {
  const createdDaysAgo = extra.createdDaysAgo ?? Math.min(340, 40 + visits * 12);
  return {
    id,
    tenantId: TENANT_ID,
    name,
    email,
    phone,
    tags,
    visits,
    lifetimeSpend,
    avgSpend: round2(lifetimeSpend / Math.max(1, visits)),
    lastVisit: isoDaysAgo(lastVisitDaysAgo),
    favoriteLocationId,
    favoriteItems,
    birthday: extra.birthday,
    notes: extra.notes ?? '',
    source,
    marketingOptIn: extra.optIn ?? true,
    createdAt: nyc(isoDaysAgo(createdDaysAgo), '12:00'),
  };
}

export const GUESTS: Guest[] = [
  g('g_esteban_vargas', 'Esteban Vargas', 'esteban.vargas@gmail.com', '(917) 555-0201', ['vip', 'big_spender', 'wine_club'], 38, 9400, 3, LOC_HK, ['Paella Buenavista', 'Rioja Reserva'], 'pos', { notes: 'Table 12 regular — pre-theater Wednesdays. Knows Christian personally.' }),
  g('g_sofia_delgado', 'Sofia Delgado', 'sofia.delgado@me.com', '(917) 555-0117', ['vip', 'big_spender', 'event_host'], 22, 5310, 6, LOC_EV, ['Sangría Roja (Glass)', 'Ceviche Limeño'], 'reservation', { birthday: '09-14', notes: '40th birthday proposal in pipeline.' }),
  g('g_daniel_rosen', 'Daniel Rosen', 'daniel.rosen@gs.com', '(212) 555-0158', ['vip', 'big_spender', 'event_host'], 17, 6120, 9, LOC_HK, ['BV Smoked Old Fashioned', 'Chilean Sea Bass Mediterráneo'], 'event', { notes: 'Books quarterly client dinners. Prefers the private room.' }),
  g('g_carmen_ravelo', 'Carmen Ravelo', 'carmen.ravelo@yahoo.com', '(718) 555-0193', ['event_host', 'brunch', 'birthday_month'], 9, 1470, 13, LOC_EV, ['Churros con Chocolate', 'Sangría Roja (Glass)'], 'reservation', { birthday: '08-02', notes: 'Reunion brunch booked 8/16.' }),
  g('g_isabela_marte', 'Isabela Marte', 'isabela.marte@gmail.com', '(917) 555-0139', ['vip', 'event_host', 'birthday_month'], 11, 2140, 8, LOC_EV, ['Paella Negra', 'Sangría Roja (Glass)'], 'reservation', { birthday: '08-09', notes: 'Birthday paella feast 8/9 — BEO final.' }),
  g('g_marcus_webb', 'Marcus Webb', 'marcus.webb@outlook.com', '(646) 555-0210', ['regular', 'birthday_month'], 8, 1180, 11, LOC_HK, ['Pulpo a la Parrilla'], 'pos', { birthday: '08-15' }),
  g('g_alina_petrova', 'Alina Petrova', 'alina.petrova@gmail.com', '(347) 555-0222', ['regular', 'brunch', 'birthday_month'], 7, 830, 5, LOC_EV, ['Green Avocado Salad', 'Cava Brut'], 'newsletter', { birthday: '08-23' }),
  g('g_jun_park', 'Jun Park', 'jun.park@gmail.com', '(917) 555-0233', ['big_spender', 'birthday_month'], 6, 2210, 18, LOC_HK, ['Chilean Sea Bass Mediterráneo'], 'reservation', { birthday: '08-27' }),
  g('g_naomi_osei', 'Naomi Osei', 'naomi.osei@gmail.com', '(929) 555-0244', ['regular', 'birthday_month'], 5, 640, 21, LOC_EV, ['Ceviche Limeño'], 'walk_in', { birthday: '08-30' }),
  g('g_lucas_ferreira', 'Lucas Ferreira', 'lucas.ferreira@gmail.com', '(646) 555-0255', ['vip', 'big_spender'], 19, 4210, 4, LOC_EV, ['Paella Negra', 'Mezcal Espadín'], 'pos', { notes: 'Late-night Friday crew — always the corner banquette.' }),
  g('g_priya_natarajan', 'Priya Natarajan', 'priya.nat@gmail.com', '(917) 555-0266', ['vip', 'brunch'], 14, 1890, 7, LOC_EV, ['Churros con Chocolate', 'Sangría Roja (Glass)'], 'reservation'),
  g('g_owen_gallagher', 'Owen Gallagher', 'owen.gallagher@gmail.com', '(212) 555-0277', ['vip', 'big_spender', 'wine_club'], 26, 5870, 10, LOC_HK, ['Ossobuco de Cerdo Ibérico', 'Rioja Reserva'], 'pos'),
  g('g_mei_lin', 'Mei Lin', 'mei.lin@gmail.com', '(646) 555-0288', ['regular'], 6, 720, 15, LOC_HK, ['Salmon Barceloneta'], 'reservation'),
  g('g_andre_baptiste', 'André Baptiste', 'andre.baptiste@gmail.com', '(347) 555-0299', ['vip'], 12, 1760, 12, LOC_EV, ['BV Smoked Old Fashioned'], 'pos'),
  g('g_hannah_klein', 'Hannah Klein', 'hannah.klein@gmail.com', '(917) 555-0301', ['regular', 'brunch'], 9, 980, 6, LOC_EV, ['Green Avocado Salad', 'Cava Brut'], 'newsletter'),
  g('g_diego_fuentes', 'Diego Fuentes', 'diego.fuentes@gmail.com', '(929) 555-0312', ['big_spender'], 8, 2380, 24, LOC_HK, ['Paella Buenavista', 'Spanish Brandy'], 'reservation'),
  g('g_tasha_reid', 'Tasha Reid', 'tasha.reid@gmail.com', '(646) 555-0323', ['regular'], 4, 430, 29, LOC_EV, ['Sangría Roja (Glass)'], 'walk_in'),
  g('g_viktor_hansen', 'Viktor Hansen', 'viktor.hansen@gmail.com', '(917) 555-0334', ['big_spender', 'wine_club'], 7, 2050, 33, LOC_HK, ['Chilean Sea Bass Mediterráneo', 'Albariño'], 'reservation'),
  g('g_rosa_alvarez', 'Rosa Alvarez', 'rosa.alvarez@gmail.com', '(718) 555-0345', ['vip', 'brunch'], 16, 2020, 2, LOC_EV, ['Flan de Caramelo', 'Sangría Roja (Glass)'], 'pos', { notes: 'Sunday brunch fixture — party of 4, patio when open.' }),
  g('g_kwame_mensah', 'Kwame Mensah', 'kwame.mensah@gmail.com', '(347) 555-0356', ['regular'], 5, 610, 19, LOC_HK, ['Pulpo a la Parrilla'], 'pos'),
  g('g_julia_moretti', 'Julia Moretti', 'julia.moretti@gmail.com', '(917) 555-0367', ['vip', 'big_spender'], 13, 3140, 5, LOC_HK, ['Paella Buenavista', 'Cava Brut'], 'reservation'),
  g('g_samir_haddad', 'Samir Haddad', 'samir.haddad@gmail.com', '(646) 555-0378', ['regular'], 6, 690, 26, LOC_EV, ['Ceviche Limeño'], 'walk_in'),
  g('g_grace_okonkwo', 'Grace Okonkwo', 'grace.okonkwo@gmail.com', '(929) 555-0389', ['regular', 'brunch'], 7, 750, 9, LOC_EV, ['Churros con Chocolate'], 'newsletter'),
  g('g_tomas_herrera', 'Tomás Herrera', 'tomas.herrera@gmail.com', '(917) 555-0390', ['big_spender'], 9, 2670, 16, LOC_HK, ['Ossobuco de Cerdo Ibérico'], 'pos'),
  g('g_lena_fischer', 'Lena Fischer', 'lena.fischer@gmail.com', '(646) 555-0402', ['regular'], 3, 340, 35, LOC_HK, ['Salmon Barceloneta'], 'walk_in'),
  g('g_ray_delacruz', 'Ray De La Cruz', 'ray.delacruz@gmail.com', '(347) 555-0413', ['vip'], 15, 1980, 3, LOC_EV, ['Paella Negra', 'Mezcal Espadín'], 'pos'),
  g('g_amara_diallo', 'Amara Diallo', 'amara.diallo@gmail.com', '(917) 555-0424', ['regular'], 5, 560, 22, LOC_EV, ['Green Avocado Salad'], 'newsletter'),
  g('g_ben_tanaka', 'Ben Tanaka', 'ben.tanaka@gmail.com', '(929) 555-0435', ['regular'], 6, 810, 14, LOC_HK, ['BV Smoked Old Fashioned'], 'pos'),
  g('g_carla_mendes', 'Carla Mendes', 'carla.mendes@gmail.com', '(646) 555-0446', ['big_spender', 'event_host'], 10, 2890, 20, LOC_HK, ['Paella Buenavista', 'Rioja Reserva'], 'event', { notes: 'Hosted husband’s retirement dinner in March — 30 covers.' }),
  g('g_omar_shakir', 'Omar Shakir', 'omar.shakir@gmail.com', '(917) 555-0457', ['regular'], 4, 470, 31, LOC_EV, ['Pulpo a la Parrilla'], 'walk_in'),
  g('g_ingrid_solberg', 'Ingrid Solberg', 'ingrid.solberg@gmail.com', '(347) 555-0468', ['regular', 'wine_club'], 8, 1230, 8, LOC_HK, ['Albariño', 'Ceviche Limeño'], 'newsletter'),
  g('g_hector_ramos', 'Héctor Ramos', 'hector.ramos@gmail.com', '(718) 555-0479', ['regular'], 7, 940, 17, LOC_EV, ['Paella Buenavista'], 'pos'),
  g('g_yuki_sato', 'Yuki Sato', 'yuki.sato@gmail.com', '(917) 555-0480', ['regular', 'brunch'], 6, 680, 4, LOC_EV, ['Flan de Caramelo', 'Cava Brut'], 'reservation'),
  g('g_paul_ade', 'Paul Adeyemi', 'paul.adeyemi@gmail.com', '(646) 555-0491', ['big_spender'], 7, 2140, 27, LOC_HK, ['Chilean Sea Bass Mediterráneo'], 'reservation'),
  g('g_marta_kowalska', 'Marta Kowalska', 'marta.kowalska@gmail.com', '(929) 555-0503', ['regular'], 5, 590, 23, LOC_HK, ['Salmon Barceloneta'], 'newsletter'),
  g('g_leo_martinez', 'Leo Martinez', 'leo.martinez@gmail.com', '(347) 555-0514', ['vip'], 12, 1810, 6, LOC_EV, ['Sangría Roja (Glass)', 'Ceviche Limeño'], 'pos'),
  g('g_farah_aziz', 'Farah Aziz', 'farah.aziz@gmail.com', '(917) 555-0525', ['regular'], 3, 350, 40, LOC_EV, ['Green Avocado Salad'], 'walk_in'),
  g('g_nick_demarco', 'Nick DeMarco', 'nick.demarco@gmail.com', '(646) 555-0536', ['regular'], 6, 830, 12, LOC_HK, ['Ossobuco de Cerdo Ibérico'], 'pos'),
  // Lapsed (last visit > 90 days)
  g('g_wanda_pierce', 'Wanda Pierce', 'wanda.pierce@gmail.com', '(917) 555-0547', ['lapsed', 'big_spender'], 11, 2760, 104, LOC_HK, ['Paella Buenavista'], 'reservation', { notes: 'Was a monthly regular through the spring.' }),
  g('g_gustavo_lima', 'Gustavo Lima', 'gustavo.lima@gmail.com', '(347) 555-0558', ['lapsed'], 6, 720, 118, LOC_EV, ['Paella Negra'], 'pos'),
  g('g_elaine_wu', 'Elaine Wu', 'elaine.wu@gmail.com', '(929) 555-0569', ['lapsed'], 4, 510, 96, LOC_HK, ['Ceviche Limeño'], 'newsletter'),
  g('g_bobby_ferrell', 'Bobby Ferrell', 'bobby.ferrell@gmail.com', '(646) 555-0570', ['lapsed'], 8, 1050, 132, LOC_EV, ['BV Smoked Old Fashioned'], 'pos'),
  g('g_dina_castellanos', 'Dina Castellanos', 'dina.castellanos@gmail.com', '(917) 555-0581', ['lapsed', 'brunch'], 5, 640, 101, LOC_EV, ['Churros con Chocolate'], 'reservation'),
  // New (joined in the last few weeks)
  g('g_aiden_brooks', 'Aiden Brooks', 'aiden.brooks@gmail.com', '(347) 555-0592', ['new'], 1, 96, 5, LOC_HK, ['Paella Buenavista'], 'reservation', { createdDaysAgo: 5 }),
  g('g_valentina_ruiz', 'Valentina Ruiz', 'valentina.ruiz@gmail.com', '(917) 555-0604', ['new'], 2, 214, 2, LOC_EV, ['Sangría Roja (Glass)'], 'walk_in', { createdDaysAgo: 12 }),
  g('g_chris_donovan', 'Chris Donovan', 'chris.donovan@gmail.com', '(646) 555-0615', ['new'], 1, 88, 9, LOC_HK, ['Green Avocado Salad'], 'newsletter', { createdDaysAgo: 9 }),
  g('g_zara_ahmed', 'Zara Ahmed', 'zara.ahmed@gmail.com', '(929) 555-0626', ['new'], 2, 176, 4, LOC_EV, ['Ceviche Limeño'], 'reservation', { createdDaysAgo: 15 }),
  g('g_miles_johnson', 'Miles Johnson', 'miles.johnson@gmail.com', '(347) 555-0637', ['new'], 1, 132, 7, LOC_HK, ['Pulpo a la Parrilla'], 'walk_in', { createdDaysAgo: 7 }),
];

// ---------- Reservations (30 — past few weeks + next two weeks) ----------

function res(
  id: ID, locationId: ID, guestId: ID, dayOffset: number, time: string, partySize: number,
  status: Reservation['status'], source: Reservation['source'], occasion?: string,
): Reservation {
  const date = dayOffset < 0 ? isoDaysAgo(-dayOffset) : isoDaysAhead(dayOffset);
  return { id, tenantId: TENANT_ID, locationId, guestId, date: nyc(date, time), partySize, status, occasion, source };
}

export const RESERVATIONS: Reservation[] = [
  // past
  res('res_01', LOC_HK, 'g_esteban_vargas', -21, '18:00', 2, 'completed', 'opentable', 'pre-theater'),
  res('res_02', LOC_EV, 'g_lucas_ferreira', -19, '21:30', 4, 'completed', 'website'),
  res('res_03', LOC_HK, 'g_julia_moretti', -17, '19:30', 2, 'completed', 'opentable'),
  res('res_04', LOC_EV, 'g_rosa_alvarez', -16, '11:30', 4, 'completed', 'phone', 'brunch'),
  res('res_05', LOC_HK, 'g_diego_fuentes', -14, '20:00', 6, 'completed', 'opentable'),
  res('res_06', LOC_EV, 'g_priya_natarajan', -13, '12:00', 3, 'completed', 'website', 'brunch'),
  res('res_07', LOC_HK, 'g_owen_gallagher', -12, '18:30', 2, 'completed', 'opentable'),
  res('res_08', LOC_EV, 'g_ray_delacruz', -10, '22:00', 5, 'completed', 'walk_in', 'late night'),
  res('res_09', LOC_HK, 'g_tomas_herrera', -9, '19:00', 4, 'no_show', 'opentable'),
  res('res_10', LOC_EV, 'g_leo_martinez', -8, '20:30', 2, 'completed', 'website'),
  res('res_11', LOC_HK, 'g_mei_lin', -7, '18:00', 2, 'completed', 'opentable', 'pre-theater'),
  res('res_12', LOC_EV, 'g_yuki_sato', -6, '11:45', 2, 'completed', 'website', 'brunch'),
  res('res_13', LOC_HK, 'g_daniel_rosen', -5, '19:30', 6, 'completed', 'phone', 'client dinner'),
  res('res_14', LOC_EV, 'g_valentina_ruiz', -4, '21:00', 3, 'completed', 'walk_in'),
  res('res_15', LOC_HK, 'g_ben_tanaka', -3, '18:15', 2, 'cancelled', 'opentable'),
  res('res_16', LOC_EV, 'g_isabela_marte', -2, '19:30', 4, 'completed', 'website'),
  res('res_17', LOC_HK, 'g_esteban_vargas', -1, '18:00', 3, 'completed', 'opentable', 'pre-theater'),
  // today
  res('res_18', LOC_HK, 'g_aiden_brooks', 0, '18:00', 2, 'seated', 'opentable', 'pre-theater'),
  res('res_19', LOC_EV, 'g_sofia_delgado', 0, '20:00', 4, 'upcoming', 'website'),
  // next two weeks
  res('res_20', LOC_HK, 'g_julia_moretti', 1, '19:00', 2, 'upcoming', 'opentable', 'anniversary'),
  res('res_21', LOC_EV, 'g_rosa_alvarez', 3, '11:30', 5, 'upcoming', 'phone', 'brunch'),
  res('res_22', LOC_HK, 'g_owen_gallagher', 4, '18:30', 4, 'upcoming', 'opentable'),
  res('res_23', LOC_EV, 'g_carmen_ravelo', 4, '12:00', 6, 'upcoming', 'website', 'family brunch'),
  res('res_24', LOC_HK, 'g_jun_park', 6, '20:00', 2, 'upcoming', 'opentable', 'birthday'),
  res('res_25', LOC_EV, 'g_lucas_ferreira', 7, '21:30', 6, 'upcoming', 'website', 'late night'),
  res('res_26', LOC_HK, 'g_carla_mendes', 8, '19:00', 8, 'upcoming', 'phone'),
  res('res_27', LOC_EV, 'g_alina_petrova', 9, '11:30', 3, 'upcoming', 'website', 'brunch'),
  res('res_28', LOC_HK, 'g_daniel_rosen', 10, '19:30', 4, 'upcoming', 'phone', 'client dinner'),
  res('res_29', LOC_EV, 'g_isabela_marte', 11, '19:30', 36, 'upcoming', 'phone', 'birthday — paella feast'),
  res('res_30', LOC_HK, 'g_esteban_vargas', 13, '18:00', 2, 'upcoming', 'opentable', 'pre-theater'),
];

// ---------- Segments (counts derived from the guest list) ----------

const count = (fn: (x: Guest) => boolean) => GUESTS.filter(fn).length;

export const SEGMENTS: Segment[] = [
  {
    id: 'seg_vip', tenantId: TENANT_ID, name: 'VIP — 10+ Visits',
    description: 'Guests with 10 or more lifetime visits across either location.',
    guestCount: count((x) => x.visits >= 10), rules: 'visits ≥ 10',
  },
  {
    id: 'seg_big_spenders', tenantId: TENANT_ID, name: 'Big Spenders — $2k+',
    description: 'Lifetime spend of $2,000 or more.',
    guestCount: count((x) => x.lifetimeSpend >= 2000), rules: 'lifetimeSpend ≥ $2,000',
  },
  {
    id: 'seg_brunch', tenantId: TENANT_ID, name: 'Brunch Regulars',
    description: 'Guests who reliably book weekend brunch (tagged brunch).',
    guestCount: count((x) => x.tags.includes('brunch')), rules: "tag = 'brunch'",
  },
  {
    id: 'seg_event_hosts', tenantId: TENANT_ID, name: 'Event Hosts',
    description: 'Guests who have hosted or inquired about private events.',
    guestCount: count((x) => x.tags.includes('event_host')), rules: "tag = 'event_host'",
  },
  {
    id: 'seg_lapsed', tenantId: TENANT_ID, name: 'Lapsed — 90 Days',
    description: 'No visit in the last 90 days. Win-back candidates.',
    guestCount: count((x) => x.lastVisit < isoDaysAgo(90)), rules: 'lastVisit > 90 days ago',
  },
  {
    id: 'seg_birthday_aug', tenantId: TENANT_ID, name: 'Birthday This Month (Aug)',
    description: 'Guests with an August birthday — flan on us.',
    guestCount: count((x) => (x.birthday ?? '').startsWith('08-')), rules: "birthday month = '08'",
  },
];

// ---------- Campaigns (3 sent / 2 scheduled / 2 draft) ----------

export const CAMPAIGNS: Campaign[] = [
  {
    id: 'cmp_paella_wed', tenantId: TENANT_ID, name: 'Paella Wednesdays — VIP Preview',
    channel: 'email', segmentId: 'seg_vip', status: 'sent',
    sentAt: nyc(isoDaysAgo(21), '10:00'),
    stats: { sent: 10, opened: 8, clicked: 5, reservations: 4 },
    subject: 'You’re invited: Paella Wednesdays, one week early',
    body: 'Chef Rafael is opening the Paella Wednesdays series to our VIP table first. Reserve your pan — Buenavista or Negra — before we open it to everyone.',
  },
  {
    id: 'cmp_late_night_ev', tenantId: TENANT_ID, name: 'Late Night on 2nd Ave — Weekend Kickoff',
    channel: 'sms', segmentId: 'seg_big_spenders', status: 'sent',
    sentAt: nyc(isoDaysAgo(10), '16:30'),
    stats: { sent: 12, opened: 12, clicked: 6, reservations: 5 },
    body: 'BUENA VISTA EV: kitchen’s open till 2AM Fri + Sat. Smoked old fashioneds + paella negra after midnight. Reply RESERVE and we’ll hold the banquette.',
  },
  {
    id: 'cmp_winback', tenantId: TENANT_ID, name: 'We Miss You — Welcome Back Pour',
    channel: 'email', segmentId: 'seg_lapsed', status: 'sent',
    sentAt: nyc(isoDaysAgo(29), '09:30'),
    stats: { sent: 5, opened: 3, clicked: 2, reservations: 1 },
    subject: 'A sangría on us — it’s been a while',
    body: 'It’s been over three months and the corner table misses you. Show this email for a welcome-back sangría with any entrée through August.',
  },
  {
    id: 'cmp_aug_birthdays', tenantId: TENANT_ID, name: 'August Birthdays — Flan on Us',
    channel: 'email', segmentId: 'seg_birthday_aug', status: 'scheduled',
    scheduledFor: nyc(isoDaysAhead(3), '10:00'),
    subject: 'Your birthday flan is waiting',
    body: 'Happy birthday month! Book any table in August and the flan de caramelo (candle included) is on the house.',
  },
  {
    id: 'cmp_brunch_sangria', tenantId: TENANT_ID, name: 'Brunch Sangría Hour',
    channel: 'sms', segmentId: 'seg_brunch', status: 'scheduled',
    scheduledFor: nyc(isoDaysAhead(4), '11:00'),
    body: 'BUENA VISTA: Sangría Hour is back at weekend brunch — half-price pitchers 11:30-12:30, both locations. Reply BRUNCH to book.',
  },
  {
    id: 'cmp_masterclass', tenantId: TENANT_ID, name: 'Fall Paella Masterclass Invite',
    channel: 'email', segmentId: 'seg_event_hosts', status: 'draft',
    subject: 'Cook the Buenavista with Chef Rafael',
    body: 'DRAFT — Invite event hosts to a ticketed Saturday-afternoon paella masterclass in Hell’s Kitchen (12 seats, $145, includes lunch + sangría).',
  },
  {
    id: 'cmp_rioja_dinner', tenantId: TENANT_ID, name: 'Rioja Wine Dinner — Save the Date',
    channel: 'email', segmentId: 'seg_vip', status: 'draft',
    subject: 'Save the date: a night in Rioja',
    body: 'DRAFT — Five courses, five Riojas, one long table. September date TBC with Southern Glazer’s portfolio team.',
  },
];
