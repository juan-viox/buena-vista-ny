// ============================================================
// Inventory & COGS fixtures (MarginEdge parity) — vendors,
// items, invoices + lines, recipes, counts, price alerts.
// Deterministic: invoice lines are generated with a seeded PRNG
// in a fixed order; "special" lines (the price spikes that feed
// PriceAlerts) are pinned explicitly.
// ============================================================

import type {
  ID, InventoryCount, InventoryItem, Invoice, InvoiceLine, InvoiceStatus,
  PriceAlert, Recipe, RecipeIngredient, Unit, Vendor,
} from '../types';
import { TENANT_ID, LOC_EV, LOC_HK } from './tenancy';
import { isoDaysAgo, mulberry32, nyc, round1, round2 } from './seed';

// ---------- Vendors (~14, NYC-plausible) ----------

function vendor(id: ID, name: string, category: string, accountNumber: string, terms: string): Vendor {
  return { id, tenantId: TENANT_ID, name, category, accountNumber, terms };
}

export const VENDORS: Vendor[] = [
  vendor('ven_baldor', 'Baldor Specialty Foods', 'Produce', 'BV-20941', 'Net 30'),
  vendor('ven_lancaster', 'Lancaster Farm Fresh Cooperative', 'Produce', 'LFC-1187', 'Net 15'),
  vendor('ven_blueribbon', 'Blue Ribbon Fish Co', 'Seafood', 'BRF-3327', 'Net 14'),
  vendor('ven_gotham', 'Gotham Seafood', 'Seafood', 'GS-0468', 'Net 14'),
  vendor('ven_lafrieda', 'Pat LaFrieda Meat Purveyors', 'Meat', 'PLF-7712', 'Net 21'),
  vendor('ven_dartagnan', "D'Artagnan", 'Meat', 'DA-5540', 'Net 30'),
  vendor('ven_chefswh', "Chef's Warehouse", 'Dry Goods', 'CW-88213', 'Net 30'),
  vendor('ven_latienda', 'La Tienda Imports', 'Dry Goods', 'LTI-0092', 'Net 30'),
  vendor('ven_regalis', 'Regalis Foods', 'Dry Goods', 'RF-2210', 'Net 15'),
  vendor('ven_sgws', "Southern Glazer's Wine & Spirits", 'Wine & Spirits', 'SG-441207', 'Net 30'),
  vendor('ven_empire', 'Empire Merchants', 'Wine & Spirits', 'EM-30559', 'Net 30'),
  vendor('ven_manhattanbeer', 'Manhattan Beer Distributors', 'Beverage', 'MB-6633', 'Net 15'),
  vendor('ven_bkroasting', 'Brooklyn Roasting Company', 'Beverage', 'BRC-901', 'Net 15'),
  vendor('ven_hudsondairy', 'Hudson Valley Dairy Collective', 'Dairy', 'HVD-274', 'Net 15'),
];

// ---------- Inventory items (~48) ----------

function item(
  id: ID, name: string, category: string, unit: Unit,
  lastPrice: number, avgPrice30d: number, parLevel: number, onHand: number, primaryVendorId: ID,
): InventoryItem {
  return { id, tenantId: TENANT_ID, name, category, unit, lastPrice, avgPrice30d, parLevel, onHand, primaryVendorId };
}

// LOW (onHand < parLevel): langoustines, octopus, limes, bomba rice, saffron, albariño (6 items).
export const INVENTORY_ITEMS: InventoryItem[] = [
  // Seafood
  item('i_langoustine', 'Langoustines', 'Seafood', 'lb', 28.50, 26.60, 25, 8, 'ven_blueribbon'),
  item('i_octopus', 'Spanish Octopus', 'Seafood', 'lb', 14.90, 13.30, 40, 22, 'ven_gotham'),
  item('i_mussels', 'PEI Mussels', 'Seafood', 'lb', 3.55, 3.28, 60, 84, 'ven_blueribbon'),
  item('i_calamari', 'Calamari (Tubes & Tentacles)', 'Seafood', 'lb', 6.80, 6.65, 35, 48, 'ven_blueribbon'),
  item('i_shrimp', 'Gulf Shrimp 16/20', 'Seafood', 'lb', 11.90, 11.75, 40, 52, 'ven_blueribbon'),
  item('i_mahi', 'Mahi Mahi Fillet', 'Seafood', 'lb', 12.40, 12.10, 25, 31, 'ven_gotham'),
  item('i_salmon', 'Faroe Island Salmon Fillet', 'Seafood', 'lb', 11.25, 11.05, 45, 58, 'ven_gotham'),
  item('i_seabass', 'Chilean Sea Bass Fillet', 'Seafood', 'lb', 34.20, 31.50, 20, 26, 'ven_gotham'),
  // Meat
  item('i_ossobuco', 'Ibérico Pork Osso Buco', 'Meat', 'lb', 6.95, 6.80, 40, 55, 'ven_lafrieda'),
  item('i_iberico', 'Ibérico Pork Secreto', 'Meat', 'lb', 19.50, 19.20, 15, 18, 'ven_dartagnan'),
  item('i_chorizo', 'Chorizo Cantimpalo', 'Meat', 'lb', 9.80, 9.60, 20, 27, 'ven_lafrieda'),
  item('i_chicken', 'Chicken Thighs (Bone-In)', 'Meat', 'lb', 2.65, 2.60, 60, 74, 'ven_lafrieda'),
  item('i_skirt', 'Prime Skirt Steak', 'Meat', 'lb', 11.60, 11.35, 25, 33, 'ven_lafrieda'),
  item('i_serrano', 'Serrano Ham (18-Month)', 'Meat', 'lb', 21.90, 21.60, 10, 12, 'ven_dartagnan'),
  // Produce
  item('i_malanga', 'Malanga', 'Produce', 'lb', 2.15, 2.05, 30, 41, 'ven_lancaster'),
  item('i_avocado', 'Hass Avocados (48ct)', 'Produce', 'case', 64.50, 58.10, 8, 11, 'ven_baldor'),
  item('i_lime', 'Persian Limes (200ct)', 'Produce', 'case', 45.80, 42.00, 6, 2, 'ven_baldor'),
  item('i_orange', 'Valencia Oranges (88ct)', 'Produce', 'case', 39.40, 38.60, 5, 7, 'ven_baldor'),
  item('i_lemon', 'Lemons (140ct)', 'Produce', 'case', 43.70, 43.20, 5, 6, 'ven_baldor'),
  item('i_onion', 'Spanish Onions', 'Produce', 'lb', 0.62, 0.60, 100, 135, 'ven_baldor'),
  item('i_garlic', 'Garlic (Peeled)', 'Produce', 'lb', 2.95, 2.90, 25, 30, 'ven_baldor'),
  item('i_tomato', 'Roma Tomatoes', 'Produce', 'lb', 1.85, 1.78, 60, 72, 'ven_baldor'),
  item('i_arugula', 'Baby Arugula', 'Produce', 'lb', 6.50, 6.40, 12, 15, 'ven_lancaster'),
  // Dairy
  item('i_manchego', 'Manchego DOP (12-Month)', 'Dairy', 'lb', 14.60, 14.30, 12, 16, 'ven_chefswh'),
  item('i_cream', 'Heavy Cream 40%', 'Dairy', 'qt', 4.35, 4.20, 24, 30, 'ven_hudsondairy'),
  item('i_butter', 'Unsalted Butter (AA)', 'Dairy', 'lb', 5.10, 4.62, 36, 44, 'ven_chefswh'),
  item('i_eggs', 'Eggs (Cage-Free)', 'Dairy', 'dozen', 3.45, 3.38, 30, 38, 'ven_hudsondairy'),
  // Dry Goods
  item('i_bomba', 'Bomba Rice (Calasparra)', 'Dry Goods', 'kg', 9.85, 9.70, 60, 34, 'ven_latienda'),
  item('i_saffron', 'Saffron Threads (La Mancha)', 'Dry Goods', 'oz', 92.00, 78.00, 6, 2, 'ven_latienda'),
  item('i_pimenton', 'Smoked Pimentón de la Vera', 'Dry Goods', 'lb', 8.45, 8.30, 8, 10, 'ven_latienda'),
  item('i_oliveoil', 'Extra Virgin Olive Oil (Picual)', 'Dry Goods', 'liter', 13.60, 13.25, 40, 48, 'ven_chefswh'),
  item('i_marcona', 'Marcona Almonds', 'Dry Goods', 'lb', 12.70, 12.45, 10, 13, 'ven_latienda'),
  item('i_squidink', 'Squid Ink', 'Dry Goods', 'oz', 3.95, 3.90, 24, 29, 'ven_latienda'),
  item('i_flour', 'All-Purpose Flour', 'Dry Goods', 'lb', 0.56, 0.55, 100, 120, 'ven_chefswh'),
  // Beverage (NA)
  item('i_espresso', 'Espresso Beans (Dark Roast)', 'Beverage', 'lb', 11.90, 11.70, 20, 24, 'ven_bkroasting'),
  item('i_tonic', 'Fever-Tree Tonic (24pk)', 'Beverage', 'case', 38.40, 38.00, 6, 8, 'ven_manhattanbeer'),
  item('i_topochico', 'Topo Chico (24pk)', 'Beverage', 'case', 27.80, 27.40, 6, 9, 'ven_manhattanbeer'),
  item('i_agave', 'Agave Syrup', 'Beverage', 'bottle', 8.95, 8.80, 12, 14, 'ven_empire'),
  // Wine
  item('i_rioja', 'Rioja Reserva (Viña Ardanza)', 'Wine', 'bottle', 15.60, 15.40, 36, 42, 'ven_sgws'),
  item('i_albarino', 'Albariño Rías Baixas (Pazo Señoráns)', 'Wine', 'bottle', 12.90, 12.70, 48, 19, 'ven_sgws'),
  item('i_cava', 'Cava Brut (Segura Viudas)', 'Wine', 'bottle', 10.30, 10.15, 30, 36, 'ven_sgws'),
  item('i_rosado', 'Garnacha Rosado', 'Wine', 'bottle', 9.65, 9.50, 24, 28, 'ven_sgws'),
  // Spirits
  item('i_mezcal', 'Mezcal Espadín (Del Maguey)', 'Spirits', 'bottle', 32.50, 32.00, 12, 15, 'ven_empire'),
  item('i_bourbon', 'Bourbon (Buffalo Trace)', 'Spirits', 'bottle', 26.80, 26.40, 12, 16, 'ven_empire'),
  item('i_reposado', 'Tequila Reposado (Siete Leguas)', 'Spirits', 'bottle', 29.40, 29.00, 10, 12, 'ven_empire'),
  item('i_brandy', 'Spanish Brandy (Cardenal Mendoza)', 'Spirits', 'bottle', 24.60, 24.30, 8, 10, 'ven_sgws'),
  item('i_gin', 'London Dry Gin (Fords)', 'Spirits', 'bottle', 18.70, 18.50, 10, 13, 'ven_empire'),
  // Beer
  item('i_estrella', 'Estrella Galicia (24pk)', 'Beer', 'case', 33.60, 33.20, 10, 14, 'ven_manhattanbeer'),
  item('i_ipa', 'Other Half IPA (24pk)', 'Beer', 'case', 42.20, 41.80, 8, 10, 'ven_manhattanbeer'),
];

const ITEM_BY_ID = new Map(INVENTORY_ITEMS.map((i) => [i.id, i]));

function mustItem(id: ID): InventoryItem {
  const found = ITEM_BY_ID.get(id);
  if (!found) throw new Error(`fixture error: unknown inventory item ${id}`);
  return found;
}

// ---------- Invoices + lines (26 across last 45 days) ----------

interface InvoiceSpec {
  id: ID;
  locationId: ID;
  vendorId: ID;
  invoiceNumber: string;
  daysAgo: number;
  status: InvoiceStatus;
  scanned: boolean;
  itemIds: ID[];
  /** pinned price-spike lines: itemId → unitPrice (feeds PriceAlerts) */
  overrides?: Record<string, number>;
}

const INVOICE_SPECS: InvoiceSpec[] = [
  // Baldor — produce, ~2×/week cadence
  { id: 'inv_bsf_1041', locationId: LOC_HK, vendorId: 'ven_baldor', invoiceNumber: 'BSF-104188', daysAgo: 39, status: 'approved', scanned: true, itemIds: ['i_avocado', 'i_lime', 'i_lemon', 'i_onion', 'i_garlic', 'i_tomato'] },
  { id: 'inv_bsf_1052', locationId: LOC_EV, vendorId: 'ven_baldor', invoiceNumber: 'BSF-105237', daysAgo: 32, status: 'approved', scanned: true, itemIds: ['i_avocado', 'i_lime', 'i_orange', 'i_onion', 'i_tomato'] },
  { id: 'inv_bsf_1077', locationId: LOC_HK, vendorId: 'ven_baldor', invoiceNumber: 'BSF-107719', daysAgo: 11, status: 'approved', scanned: true, itemIds: ['i_avocado', 'i_orange', 'i_lemon', 'i_onion', 'i_garlic', 'i_tomato'], overrides: { i_avocado: 64.50 } },
  { id: 'inv_bsf_1093', locationId: LOC_EV, vendorId: 'ven_baldor', invoiceNumber: 'BSF-109344', daysAgo: 4, status: 'pending_review', scanned: true, itemIds: ['i_lime', 'i_lemon', 'i_orange', 'i_garlic', 'i_tomato'], overrides: { i_lime: 45.80 } },
  // Blue Ribbon Fish — seafood
  { id: 'inv_brf_2201', locationId: LOC_HK, vendorId: 'ven_blueribbon', invoiceNumber: 'BRF-22014', daysAgo: 37, status: 'approved', scanned: true, itemIds: ['i_langoustine', 'i_mussels', 'i_calamari', 'i_shrimp'] },
  { id: 'inv_brf_2263', locationId: LOC_EV, vendorId: 'ven_blueribbon', invoiceNumber: 'BRF-22638', daysAgo: 17, status: 'approved', scanned: false, itemIds: ['i_mussels', 'i_calamari', 'i_shrimp', 'i_langoustine'] },
  { id: 'inv_brf_2291', locationId: LOC_HK, vendorId: 'ven_blueribbon', invoiceNumber: 'BRF-22911', daysAgo: 3, status: 'pending_review', scanned: true, itemIds: ['i_langoustine', 'i_mussels', 'i_calamari', 'i_shrimp'], overrides: { i_mussels: 3.55 } },
  // Gotham Seafood
  { id: 'inv_gs_5502', locationId: LOC_HK, vendorId: 'ven_gotham', invoiceNumber: 'GS-55023', daysAgo: 19, status: 'approved', scanned: true, itemIds: ['i_octopus', 'i_mahi', 'i_salmon', 'i_seabass'], overrides: { i_octopus: 14.55 } },
  { id: 'inv_gs_5544', locationId: LOC_EV, vendorId: 'ven_gotham', invoiceNumber: 'GS-55447', daysAgo: 26, status: 'approved', scanned: true, itemIds: ['i_octopus', 'i_mahi', 'i_salmon', 'i_seabass'] },
  { id: 'inv_gs_5581', locationId: LOC_HK, vendorId: 'ven_gotham', invoiceNumber: 'GS-55810', daysAgo: 5, status: 'pending_review', scanned: true, itemIds: ['i_octopus', 'i_salmon', 'i_seabass', 'i_mahi'], overrides: { i_octopus: 14.90, i_seabass: 34.20 } },
  // Pat LaFrieda — meat
  { id: 'inv_plf_7845', locationId: LOC_HK, vendorId: 'ven_lafrieda', invoiceNumber: 'PLF-78451', daysAgo: 41, status: 'approved', scanned: false, itemIds: ['i_ossobuco', 'i_chicken', 'i_skirt', 'i_chorizo'] },
  { id: 'inv_plf_7911', locationId: LOC_EV, vendorId: 'ven_lafrieda', invoiceNumber: 'PLF-79112', daysAgo: 21, status: 'approved', scanned: true, itemIds: ['i_ossobuco', 'i_chicken', 'i_chorizo', 'i_skirt'] },
  { id: 'inv_plf_7968', locationId: LOC_HK, vendorId: 'ven_lafrieda', invoiceNumber: 'PLF-79682', daysAgo: 8, status: 'disputed', scanned: true, itemIds: ['i_ossobuco', 'i_skirt', 'i_chicken', 'i_chorizo'] },
  // Chef's Warehouse — dairy + dry goods
  { id: 'inv_cw_8834', locationId: LOC_HK, vendorId: 'ven_chefswh', invoiceNumber: 'CW-883417', daysAgo: 43, status: 'approved', scanned: true, itemIds: ['i_manchego', 'i_butter', 'i_oliveoil', 'i_flour'] },
  { id: 'inv_cw_8871', locationId: LOC_EV, vendorId: 'ven_chefswh', invoiceNumber: 'CW-887102', daysAgo: 29, status: 'approved', scanned: true, itemIds: ['i_manchego', 'i_butter', 'i_oliveoil', 'i_flour'] },
  { id: 'inv_cw_8902', locationId: LOC_HK, vendorId: 'ven_chefswh', invoiceNumber: 'CW-890233', daysAgo: 8, status: 'approved', scanned: true, itemIds: ['i_butter', 'i_oliveoil', 'i_manchego', 'i_flour'], overrides: { i_butter: 5.10 } },
  { id: 'inv_cw_8940', locationId: LOC_EV, vendorId: 'ven_chefswh', invoiceNumber: 'CW-894016', daysAgo: 1, status: 'pending_review', scanned: true, itemIds: ['i_oliveoil', 'i_butter', 'i_flour', 'i_manchego'] },
  // La Tienda Imports — Spanish pantry
  { id: 'inv_lti_0341', locationId: LOC_HK, vendorId: 'ven_latienda', invoiceNumber: 'LTI-03412', daysAgo: 7, status: 'approved', scanned: true, itemIds: ['i_bomba', 'i_saffron', 'i_pimenton', 'i_squidink', 'i_marcona'], overrides: { i_saffron: 92.00 } },
  { id: 'inv_lti_0308', locationId: LOC_EV, vendorId: 'ven_latienda', invoiceNumber: 'LTI-03089', daysAgo: 23, status: 'approved', scanned: true, itemIds: ['i_bomba', 'i_pimenton', 'i_marcona', 'i_squidink'] },
  // Southern Glazer's — wine + brandy
  { id: 'inv_sg_4410', locationId: LOC_HK, vendorId: 'ven_sgws', invoiceNumber: 'SG-441892', daysAgo: 35, status: 'approved', scanned: false, itemIds: ['i_rioja', 'i_albarino', 'i_cava', 'i_rosado', 'i_brandy'] },
  { id: 'inv_sg_4432', locationId: LOC_EV, vendorId: 'ven_sgws', invoiceNumber: 'SG-443255', daysAgo: 14, status: 'approved', scanned: true, itemIds: ['i_rioja', 'i_albarino', 'i_cava', 'i_rosado'] },
  { id: 'inv_sg_4451', locationId: LOC_HK, vendorId: 'ven_sgws', invoiceNumber: 'SG-445108', daysAgo: 6, status: 'approved', scanned: true, itemIds: ['i_albarino', 'i_rioja', 'i_rosado', 'i_brandy'] },
  // Empire Merchants — spirits
  { id: 'inv_em_3055', locationId: LOC_EV, vendorId: 'ven_empire', invoiceNumber: 'EM-305591', daysAgo: 30, status: 'approved', scanned: false, itemIds: ['i_mezcal', 'i_bourbon', 'i_reposado', 'i_gin', 'i_agave'] },
  { id: 'inv_em_3078', locationId: LOC_HK, vendorId: 'ven_empire', invoiceNumber: 'EM-307822', daysAgo: 13, status: 'approved', scanned: true, itemIds: ['i_bourbon', 'i_mezcal', 'i_gin', 'i_agave'] },
  // Manhattan Beer — beer + mixers
  { id: 'inv_mb_6612', locationId: LOC_EV, vendorId: 'ven_manhattanbeer', invoiceNumber: 'MB-661204', daysAgo: 16, status: 'approved', scanned: true, itemIds: ['i_estrella', 'i_ipa', 'i_tonic', 'i_topochico'] },
  { id: 'inv_mb_6649', locationId: LOC_HK, vendorId: 'ven_manhattanbeer', invoiceNumber: 'MB-664918', daysAgo: 2, status: 'approved', scanned: true, itemIds: ['i_estrella', 'i_ipa', 'i_tonic', 'i_topochico'] },
];

/** Deterministic qty by unit — one PRNG stream, fixed call order. */
function qtyFor(unit: Unit, rnd: () => number): number {
  switch (unit) {
    case 'lb': return 8 + Math.round(rnd() * 28);
    case 'oz': return 2 + Math.round(rnd() * 8);
    case 'kg': return 12 + Math.round(rnd() * 20);
    case 'g': return 200 + Math.round(rnd() * 800);
    case 'each': return 6 + Math.round(rnd() * 18);
    case 'case': return 2 + Math.round(rnd() * 4);
    case 'bottle': return 12 + Math.round(rnd() * 24);
    case 'liter': return 6 + Math.round(rnd() * 12);
    case 'gal': return 2 + Math.round(rnd() * 4);
    case 'qt': return 10 + Math.round(rnd() * 14);
    case 'dozen': return 8 + Math.round(rnd() * 10);
  }
}

function buildInvoices(): { invoices: Invoice[]; linesByInvoice: Record<string, InvoiceLine[]> } {
  const rnd = mulberry32(0xbeba5eed);
  const invoices: Invoice[] = [];
  const linesByInvoice: Record<string, InvoiceLine[]> = {};

  for (const spec of INVOICE_SPECS) {
    const lines: InvoiceLine[] = [];
    let lineIdx = 0;
    for (const itemId of spec.itemIds) {
      const it = mustItem(itemId);
      const qty = qtyFor(it.unit, rnd);
      const pinned = spec.overrides?.[itemId];
      // organic jitter stays within ±3% so ONLY pinned lines cross the 8% alert bar
      const jitter = (rnd() - 0.5) * 0.06;
      const unitPrice = pinned !== undefined ? pinned : round2(it.avgPrice30d * (1 + jitter));
      const priceChangePct = round1((unitPrice / it.avgPrice30d - 1) * 100);
      lines.push({
        id: `${spec.id}_l${++lineIdx}`,
        invoiceId: spec.id,
        itemId,
        description: `${it.name} — ${it.unit}`,
        qty,
        unit: it.unit,
        unitPrice,
        total: round2(qty * unitPrice),
        priceChangePct,
      });
    }
    const total = round2(lines.reduce((s, l) => s + l.total, 0));
    invoices.push({
      id: spec.id,
      tenantId: TENANT_ID,
      locationId: spec.locationId,
      vendorId: spec.vendorId,
      invoiceNumber: spec.invoiceNumber,
      date: isoDaysAgo(spec.daysAgo),
      total,
      status: spec.status,
      lineCount: lines.length,
      scanned: spec.scanned,
    });
    linesByInvoice[spec.id] = lines;
  }
  // newest first — how an AP inbox reads
  invoices.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { invoices, linesByInvoice };
}

const built = buildInvoices();
export const INVOICES: Invoice[] = built.invoices;
export const INVOICE_LINES: Record<string, InvoiceLine[]> = built.linesByInvoice;

// ---------- Price alerts (6, fed by the pinned invoice lines) ----------

function alert(
  id: ID, itemId: ID, vendorName: string, oldPrice: number, newPrice: number,
  daysAgo: number, acknowledged: boolean,
): PriceAlert {
  const it = mustItem(itemId);
  return {
    id,
    tenantId: TENANT_ID,
    itemId,
    itemName: it.name,
    vendorName,
    oldPrice,
    newPrice,
    changePct: round1((newPrice / oldPrice - 1) * 100),
    date: isoDaysAgo(daysAgo),
    acknowledged,
  };
}

export const PRICE_ALERTS: PriceAlert[] = [
  alert('pa_saffron', 'i_saffron', 'La Tienda Imports', 78.00, 92.00, 7, false),   // +17.9%
  alert('pa_octopus', 'i_octopus', 'Gotham Seafood', 13.30, 14.90, 5, false),      // +12.0%
  alert('pa_avocado', 'i_avocado', 'Baldor Specialty Foods', 58.10, 64.50, 11, true), // +11.0%
  alert('pa_butter', 'i_butter', "Chef's Warehouse", 4.62, 5.10, 8, true),          // +10.4%
  alert('pa_lime', 'i_lime', 'Baldor Specialty Foods', 42.00, 45.80, 4, false),     // +9.0%
  alert('pa_seabass', 'i_seabass', 'Gotham Seafood', 31.50, 34.20, 5, false),       // +8.6%
];

// ---------- Recipes (12, matching the real menu) ----------

function ing(itemId: ID, qty: number, cost: number): RecipeIngredient {
  const it = mustItem(itemId);
  return { itemId, itemName: it.name, qty, unit: it.unit, cost: round2(cost) };
}

function recipe(
  id: ID, menuItemName: string, menuPrice: number, category: string,
  targetCostPct: number, ingredients: RecipeIngredient[],
): Recipe {
  const plateCost = round2(ingredients.reduce((s, i) => s + i.cost, 0));
  return {
    id,
    tenantId: TENANT_ID,
    menuItemName,
    menuPrice,
    category,
    ingredients,
    plateCost,
    costPct: round1((plateCost / menuPrice) * 100),
    targetCostPct,
  };
}

export const RECIPES: Recipe[] = [
  recipe('rcp_paella_bv', 'Paella Buenavista', 59, 'Mains', 28, [
    ing('i_bomba', 0.35, 3.45),
    ing('i_saffron', 0.03, 2.76),
    ing('i_langoustine', 0.22, 6.27),
    ing('i_mussels', 0.4, 1.42),
    ing('i_calamari', 0.25, 1.70),
    ing('i_chicken', 0.3, 0.80),
    ing('i_chorizo', 0.1, 0.98),
    ing('i_oliveoil', 0.05, 0.68),
    ing('i_tomato', 0.2, 0.37),
    ing('i_onion', 0.2, 0.12),
    ing('i_garlic', 0.04, 0.12),
  ]), // ~31.6% vs 28 target — saffron + langoustine spikes are squeezing it
  recipe('rcp_paella_negra', 'Paella Negra', 59, 'Mains', 28, [
    ing('i_bomba', 0.35, 3.45),
    ing('i_squidink', 1.5, 5.93),
    ing('i_calamari', 0.5, 3.40),
    ing('i_shrimp', 0.3, 3.57),
    ing('i_mussels', 0.3, 1.07),
    ing('i_oliveoil', 0.05, 0.68),
    ing('i_garlic', 0.05, 0.15),
    ing('i_onion', 0.2, 0.12),
    ing('i_tomato', 0.2, 0.37),
  ]),
  recipe('rcp_ceviche', 'Ceviche Limeño', 21, 'Starters', 26, [
    ing('i_mahi', 0.28, 3.47),
    ing('i_lime', 0.03, 1.37),
    ing('i_avocado', 0.015, 0.97),
    ing('i_onion', 0.1, 0.06),
  ]),
  recipe('rcp_pulpo', 'Pulpo a la Parrilla', 28, 'Starters', 28, [
    ing('i_octopus', 0.6, 8.94),
    ing('i_malanga', 0.3, 0.65),
    ing('i_pimenton', 0.02, 0.17),
    ing('i_oliveoil', 0.06, 0.82),
  ]), // ~37.7% — octopus +12% has this dish underwater vs target
  recipe('rcp_salmon', 'Salmon Barceloneta', 36, 'Mains', 28, [
    ing('i_salmon', 0.55, 6.19),
    ing('i_arugula', 0.1, 0.65),
    ing('i_butter', 0.1, 0.51),
    ing('i_lemon', 0.02, 0.87),
    ing('i_oliveoil', 0.04, 0.54),
    ing('i_tomato', 0.2, 0.37),
  ]),
  recipe('rcp_seabass', 'Chilean Sea Bass Mediterráneo', 42, 'Mains', 32, [
    ing('i_seabass', 0.45, 15.39),
    ing('i_tomato', 0.25, 0.46),
    ing('i_oliveoil', 0.05, 0.68),
    ing('i_garlic', 0.04, 0.12),
    ing('i_lemon', 0.015, 0.66),
  ]),
  recipe('rcp_ossobuco', 'Ossobuco de Cerdo Ibérico', 39, 'Mains', 28, [
    ing('i_ossobuco', 1.2, 8.34),
    ing('i_malanga', 0.4, 0.86),
    ing('i_onion', 0.3, 0.19),
    ing('i_tomato', 0.3, 0.56),
    ing('i_rioja', 0.15, 2.34),
    ing('i_butter', 0.1, 0.51),
    ing('i_garlic', 0.05, 0.15),
  ]),
  recipe('rcp_avocado_salad', 'Green Avocado Salad', 12, 'Starters', 25, [
    ing('i_avocado', 0.015, 0.97),
    ing('i_arugula', 0.12, 0.78),
    ing('i_marcona', 0.04, 0.51),
    ing('i_lime', 0.008, 0.37),
    ing('i_oliveoil', 0.02, 0.27),
  ]),
  recipe('rcp_flan', 'Flan de Caramelo', 11, 'Desserts', 22, [
    ing('i_eggs', 0.25, 0.86),
    ing('i_cream', 0.3, 1.31),
    ing('i_orange', 0.01, 0.39),
  ]),
  recipe('rcp_churros', 'Churros con Chocolate', 12, 'Desserts', 22, [
    ing('i_flour', 0.3, 0.17),
    ing('i_butter', 0.1, 0.51),
    ing('i_eggs', 0.1, 0.35),
    ing('i_cream', 0.2, 0.87),
    ing('i_espresso', 0.02, 0.24),
  ]),
  recipe('rcp_smoked_of', 'BV Smoked Old Fashioned', 18, 'Cocktails', 20, [
    ing('i_bourbon', 0.1, 2.68),
    ing('i_agave', 0.02, 0.18),
    ing('i_orange', 0.005, 0.20),
  ]), // ~17% — cocktails carry the margin
  recipe('rcp_sangria', 'Sangría Roja (Glass)', 14, 'Cocktails', 20, [
    ing('i_rioja', 0.1, 1.56),
    ing('i_brandy', 0.015, 0.37),
    ing('i_orange', 0.01, 0.39),
    ing('i_lemon', 0.008, 0.35),
    ing('i_agave', 0.02, 0.18),
  ]),
];

// ---------- Inventory counts (2 per location, latest finalized) ----------

export const INVENTORY_COUNTS: InventoryCount[] = [
  {
    id: 'cnt_hk_0727', tenantId: TENANT_ID, locationId: LOC_HK,
    date: isoDaysAgo(2), countedBy: 'Marisol Guzmán',
    totalValue: 18432.75, status: 'finalized', itemsCounted: 49,
  },
  {
    id: 'cnt_ev_0728', tenantId: TENANT_ID, locationId: LOC_EV,
    date: isoDaysAgo(1), countedBy: 'Dana Whitfield',
    totalValue: 14210.4, status: 'finalized', itemsCounted: 47,
  },
  {
    id: 'cnt_hk_0713', tenantId: TENANT_ID, locationId: LOC_HK,
    date: isoDaysAgo(16), countedBy: 'Rafael Ortega',
    totalValue: 17655.1, status: 'finalized', itemsCounted: 48,
  },
  {
    id: 'cnt_ev_0714', tenantId: TENANT_ID, locationId: LOC_EV,
    date: isoDaysAgo(15), countedBy: 'Dana Whitfield',
    totalValue: 13884.6, status: 'finalized', itemsCounted: 46,
  },
];

// Re-export a couple of helpers other fixture modules use for narrative strings.
export const INVOICE_DATE_OF = (id: ID): string => {
  const inv = INVOICES.find((i) => i.id === id);
  return inv ? inv.date : nyc(isoDaysAgo(0), '09:00');
};
