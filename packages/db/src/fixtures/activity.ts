// ============================================================
// Cross-cutting fixtures — the live activity feed (~30 events
// referencing real fixture records by name) and the three
// integration states (all connected_demo).
// ============================================================

import type { ActivityEvent, IntegrationState } from '../types';
import { TENANT_ID } from './tenancy';
import { isoDaysAgo, nyc } from './seed';

function act(
  id: string, daysAgo: number, time: string, actor: string,
  module: ActivityEvent['module'], message: string,
): ActivityEvent {
  return { id, tenantId: TENANT_ID, at: nyc(isoDaysAgo(daysAgo), time), actor, module, message };
}

export const ACTIVITY_EVENTS: ActivityEvent[] = [
  // today
  act('actv_01', 0, '09:42', 'Toast Sync', 'sales', "Yesterday's sales posted — Hell's Kitchen $15,912 net, East Village $11,204 net."),
  act('actv_02', 0, '09:05', 'System', 'inventory', 'Low-stock check: 6 items below par — Saffron Threads (2/6 oz) and Langoustines (8/25 lb) are critical.'),
  act('actv_03', 0, '08:30', 'Priya Raman', 'crm', 'Campaign "August Birthdays — Flan on Us" scheduled for Aug 1, 10:00 AM (6 guests).'),
  act('actv_04', 0, '07:58', 'MarginEdge Sync', 'inventory', "Invoice CW-894016 from Chef's Warehouse captured via scan — 4 lines, pending review."),
  // yesterday
  act('actv_05', 1, '22:41', 'Dana Whitfield', 'inventory', 'East Village inventory count finalized — $14,210.40 across 47 items.'),
  act('actv_06', 1, '18:12', 'Lucía Herrera', 'events', 'BEO v3 for "Banco Continental Board Dinner" signed by Isabel Fuentes.'),
  act('actv_07', 1, '16:05', 'Marisol Guzmán', 'inventory', 'Invoice MB-664918 from Manhattan Beer Distributors approved — $947.10.'),
  act('actv_08', 1, '14:30', 'Priya Raman', 'crm', 'Segment "Lapsed — 90 Days" refreshed: 5 guests match.'),
  act('actv_09', 1, '11:20', 'Rafael Ortega', 'inventory', 'Price alert acknowledged: Unsalted Butter +10.4% (Chef\'s Warehouse).'),
  // 2 days ago
  act('actv_10', 2, '21:15', 'Marisol Guzmán', 'inventory', "Hell's Kitchen inventory count finalized — $18,432.75 across 49 items."),
  act('actv_11', 2, '19:48', 'Lucía Herrera', 'events', 'Tasting note logged for "Goldman Private Client Dinner" — old fashioned cart confirmed, add 1 bartender.'),
  act('actv_12', 2, '17:33', 'System', 'inventory', 'PRICE ALERT: Spanish Octopus +12.0% ($13.30 → $14.90/lb) on Gotham Seafood GS-55810.'),
  act('actv_13', 2, '17:33', 'System', 'inventory', 'PRICE ALERT: Chilean Sea Bass +8.6% ($31.50 → $34.20/lb) on Gotham Seafood GS-55810.'),
  act('actv_14', 2, '15:10', 'Christian Nuñez', 'events', 'Deposit reminder sent to Meridian Capital — proposal expires Friday.'),
  act('actv_15', 2, '10:05', 'Toast Sync', 'sales', 'Menu mix for July refreshed — Sangría Roja leads volume (1,430 sold MTD across locations).'),
  // 3 days ago
  act('actv_16', 3, '23:05', 'Dana Whitfield', 'sales', 'Late Night daypart hit $2,940 Friday at East Village — best since June.'),
  act('actv_17', 3, '18:40', 'Priya Raman', 'crm', 'Campaign "Late Night on 2nd Ave" attribution updated: 5 reservations booked from 12 sends.'),
  act('actv_18', 3, '14:22', 'Lucía Herrera', 'events', 'New lead: "Union Square Tech — Q4 Team Dinner" (24 guests, private room, Oct 8).'),
  act('actv_19', 3, '11:15', 'System', 'inventory', 'PRICE ALERT: Persian Limes +9.0% ($42.00 → $45.80/case) on Baldor BSF-109344.'),
  act('actv_20', 3, '09:50', 'Marisol Guzmán', 'inventory', 'Invoice BRF-22911 from Blue Ribbon Fish Co flagged for review — mussels price variance.'),
  // 4 days ago
  act('actv_21', 4, '20:10', 'Rafael Ortega', 'inventory', 'Recipe "Pulpo a la Parrilla" recosted — plate cost now $10.58 (37.8% vs 28% target) after octopus increase.'),
  act('actv_22', 4, '16:45', 'Lucía Herrera', 'events', 'Cardoza & Levine buyout: $8,000 deposit received via ACH. BEO v1 drafted.'),
  act('actv_23', 4, '13:30', 'Priya Raman', 'crm', 'Guest Rosa Alvarez crossed 16 visits — auto-tagged VIP.'),
  act('actv_24', 4, '10:12', 'Toast Sync', 'sales', 'Labor for last week posted — HK 27.6% avg, EV 28.9% avg of net.'),
  // 5-7 days ago
  act('actv_25', 5, '17:20', 'System', 'inventory', 'PRICE ALERT: Saffron Threads +17.9% ($78.00 → $92.00/oz) on La Tienda LTI-03412.'),
  act('actv_26', 5, '15:05', 'Lucía Herrera', 'events', 'Proposal sent: "Meridian Capital Summer Offsite Dinner" — $8,740 for 38 guests.'),
  act('actv_27', 6, '12:40', 'Christian Nuñez', 'system', 'Weekly owner digest emailed — sales, price alerts, and pipeline summary.'),
  act('actv_28', 6, '10:25', 'Priya Raman', 'crm', 'Win-back email "We Miss You" attributed its first reservation (Wanda Pierce, party of 2).'),
  act('actv_29', 7, '16:55', 'Marisol Guzmán', 'inventory', 'Disputed invoice PLF-79682 (Pat LaFrieda) — case of skirt steak shorted; credit memo requested.'),
  act('actv_30', 7, '09:15', 'Caterease Import', 'events', 'Event pipeline imported — 16 events, $86,000 total pipeline value.'),
];

export const INTEGRATION_STATES: IntegrationState[] = [
  {
    provider: 'toast',
    status: 'connected_demo',
    lastSyncAt: nyc(isoDaysAgo(0), '06:05'),
    detail: 'Demo dataset mirrors a nightly Toast export: 90 days of net sales, checks, category + daypart splits, menu mix, and labor punches for both locations. Live mode streams the same data via the Toast partner API (OAuth) with order/labor webhooks.',
  },
  {
    provider: 'marginedge',
    status: 'connected_demo',
    lastSyncAt: nyc(isoDaysAgo(0), '05:40'),
    detail: 'Demo dataset mirrors a MarginEdge account: 26 scanned/keyed invoices, 48-item catalog with price history, recipe costing, and price-move alerts. Live mode polls the MarginEdge REST API (API key) for invoices, products, and vendor price changes.',
  },
  {
    provider: 'caterease',
    status: 'connected_demo',
    lastSyncAt: nyc(isoDaysAgo(1), '23:30'),
    detail: 'Demo dataset mirrors a Caterease book of business: 16 events across all stages with BEOs and payments. Caterease has no public API — live mode ingests scheduled CSV/report exports (or migrates the book entirely into VioX Events).',
  },
];
