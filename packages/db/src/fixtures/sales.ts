// ============================================================
// POS ops & sales fixtures (Toast parity) — 90 days of daily
// sales per location, menu-item mix for Jun/Jul 2026, and the
// last 7 days of labor shifts. All generated deterministically
// from a seeded PRNG with realistic weekday / seasonal shape:
//   • Hell's Kitchen ~ $14.5k/day, lunch + pre-theater engine
//   • East Village   ~ $11k/day, late-night Fri/Sat to 2AM
//   • July heat dip (Jul 12–19) softens both rooms ~10%
// ============================================================

import type { DailySales, ID, LaborShift, MenuItemSales } from '../types';
import { TENANT_ID, LOC_EV, LOC_HK } from './tenancy';
import { dowDaysAgo, isoDaysAgo, monthDaysAgo, domDaysAgo, mulberry32, round2 } from './seed';

// ---------- Daily sales (90 days × 2 locations = 180 rows) ----------

interface LocProfile {
  locationId: ID;
  key: string;
  base: number;                 // average day, USD net
  dowMult: number[];            // Sun..Sat multipliers (avg ≈ 1)
  spendPerGuest: number;
  categories: [string, number][]; // fractions; last one absorbs remainder
  dayparts: (dow: number) => [string, number][];
}

const HK: LocProfile = {
  locationId: LOC_HK,
  key: 'hk',
  base: 14500,
  //          Sun   Mon   Tue   Wed   Thu   Fri   Sat
  dowMult: [0.85, 0.72, 0.88, 1.06, 1.10, 1.22, 1.20], // Wed matinee + weekend theater crush
  spendPerGuest: 58,
  categories: [['Food', 0.60], ['Cocktails', 0.18], ['Wine', 0.12], ['Beer', 0.05], ['NA Bev', 0]],
  dayparts: (dow) => {
    if (dow === 0 || dow === 6) {
      // weekend brunch + pre-theater
      return [['Brunch', dow === 0 ? 0.34 : 0.28], ['Pre-Theater', 0.20], ['Dinner', 0]];
    }
    return [['Lunch', 0.28], ['Pre-Theater', 0.24], ['Dinner', 0]];
  },
};

const EV: LocProfile = {
  locationId: LOC_EV,
  key: 'ev',
  base: 11000,
  //          Sun   Mon   Tue   Wed   Thu   Fri   Sat
  dowMult: [0.92, 0.62, 0.82, 0.95, 1.05, 1.32, 1.36], // Mon slow, Fri/Sat runs to 2AM
  spendPerGuest: 47,
  categories: [['Food', 0.52], ['Cocktails', 0.26], ['Wine', 0.08], ['Beer', 0.09], ['NA Bev', 0]],
  dayparts: (dow) => {
    if (dow === 0) return [['Brunch', 0.36], ['Dinner', 0.58], ['Late Night', 0]];
    if (dow === 5 || dow === 6) return [['Lunch', 0.12], ['Dinner', 0.62], ['Late Night', 0]];
    return [['Lunch', 0.18], ['Dinner', 0.74], ['Late Night', 0]];
  },
};

/** Split `net` into named buckets; the last bucket absorbs rounding remainder. */
function splitWhole(net: number, parts: [string, number][]): Record<string, number> {
  const out: Record<string, number> = {};
  let used = 0;
  for (let i = 0; i < parts.length - 1; i++) {
    const [name, frac] = parts[i];
    const v = Math.round(net * frac);
    out[name] = v;
    used += v;
  }
  out[parts[parts.length - 1][0]] = net - used;
  return out;
}

function buildDailySales(): DailySales[] {
  const rnd = mulberry32(0x0729beef);
  const rows: DailySales[] = [];

  for (const p of [HK, EV]) {
    for (let off = 89; off >= 0; off--) {
      const date = isoDaysAgo(off);
      const dow = dowDaysAgo(off);
      const month = monthDaysAgo(off);
      const dom = domDaysAgo(off);

      let seasonal = month === 5 ? 1.02 : month === 6 ? 1.05 : 0.97;
      if (month === 7 && dom >= 12 && dom <= 19) seasonal *= 0.90; // July heat wave dip

      const noise = 1 + (rnd() - 0.5) * 0.12;
      const netSales = Math.round(p.base * p.dowMult[dow] * seasonal * noise);

      const comps = round2(netSales * (0.008 + rnd() * 0.007));
      const voids = round2(netSales * (0.002 + rnd() * 0.003));
      const grossSales = round2(netSales + comps + voids);

      const guestCount = Math.round(netSales / (p.spendPerGuest + (rnd() - 0.5) * 6));
      const checkCount = Math.max(1, Math.round(guestCount / 1.9));
      const avgCheck = round2(netSales / checkCount);

      // busier nights run leaner labor; slow Mondays creep toward 31%
      const pct = Math.min(31, Math.max(26, 29 - (p.dowMult[dow] - 1) * 6 + (rnd() - 0.5) * 1.6));
      const laborCost = round2((netSales * pct) / 100);
      const laborPct = round2((laborCost / netSales) * 100);

      rows.push({
        id: `ds_${p.key}_${date}`,
        tenantId: TENANT_ID,
        locationId: p.locationId,
        date,
        netSales,
        grossSales,
        guestCount,
        checkCount,
        avgCheck,
        comps,
        voids,
        laborCost,
        laborPct,
        categorySales: splitWhole(netSales, p.categories),
        dayparts: splitWhole(netSales, p.dayparts(dow)),
      });
    }
  }
  return rows;
}

export const DAILY_SALES: DailySales[] = buildDailySales();

// ---------- Menu-item sales (periods 2026-07 and 2026-06) ----------

type Quadrant = MenuItemSales['quadrant'];

interface MixSpec {
  name: string;
  category: string;
  price: number;
  plateCost: number;
  /** [HK qty, EV qty] for July; June scales ~+6% (pre-heat-wave) */
  qtyJul: [number, number];
  /** [HK quadrant, EV quadrant] */
  quadrant: [Quadrant, Quadrant];
}

const MIX: MixSpec[] = [
  { name: 'Paella Buenavista', category: 'Mains', price: 59, plateCost: 18.67, qtyJul: [328, 236], quadrant: ['star', 'star'] },
  { name: 'Paella Negra', category: 'Mains', price: 59, plateCost: 18.74, qtyJul: [176, 148], quadrant: ['puzzle', 'puzzle'] },
  { name: 'Ceviche Limeño', category: 'Starters', price: 21, plateCost: 5.87, qtyJul: [402, 366], quadrant: ['star', 'plow_horse'] },
  { name: 'Pulpo a la Parrilla', category: 'Starters', price: 28, plateCost: 10.58, qtyJul: [289, 204], quadrant: ['plow_horse', 'puzzle'] },
  { name: 'Salmon Barceloneta', category: 'Mains', price: 36, plateCost: 9.13, qtyJul: [244, 189], quadrant: ['plow_horse', 'plow_horse'] },
  { name: 'Chilean Sea Bass Mediterráneo', category: 'Mains', price: 42, plateCost: 17.31, qtyJul: [158, 96], quadrant: ['puzzle', 'puzzle'] },
  { name: 'Ossobuco de Cerdo Ibérico', category: 'Mains', price: 39, plateCost: 12.95, qtyJul: [187, 121], quadrant: ['puzzle', 'dog'] },
  { name: 'Green Avocado Salad', category: 'Starters', price: 12, plateCost: 2.90, qtyJul: [356, 312], quadrant: ['plow_horse', 'plow_horse'] },
  { name: 'Flan de Caramelo', category: 'Desserts', price: 11, plateCost: 2.56, qtyJul: [149, 118], quadrant: ['dog', 'dog'] },
  { name: 'Churros con Chocolate', category: 'Desserts', price: 12, plateCost: 2.14, qtyJul: [231, 208], quadrant: ['plow_horse', 'plow_horse'] },
  { name: 'BV Smoked Old Fashioned', category: 'Cocktails', price: 18, plateCost: 3.06, qtyJul: [412, 486], quadrant: ['star', 'star'] },
  { name: 'Sangría Roja (Glass)', category: 'Cocktails', price: 14, plateCost: 2.85, qtyJul: [688, 742], quadrant: ['star', 'star'] },
];

function buildMenuItemSales(): MenuItemSales[] {
  const rows: MenuItemSales[] = [];
  const locs: [ID, string, number][] = [[LOC_HK, 'hk', 0], [LOC_EV, 'ev', 1]];
  const periods: [string, number][] = [['2026-07', 1], ['2026-06', 1.06]];

  for (const [period, scale] of periods) {
    for (const spec of MIX) {
      for (const [locationId, key, li] of locs) {
        const qtySold = Math.round(spec.qtyJul[li] * scale);
        // ~2% of tickets carry comps/discounts
        const netSales = round2(qtySold * spec.price * 0.98);
        const margin = round2(netSales - qtySold * spec.plateCost);
        rows.push({
          id: `mis_${key}_${period}_${spec.name.toLowerCase().replace(/[^a-z]+/g, '_')}`,
          tenantId: TENANT_ID,
          locationId,
          period,
          menuItemName: spec.name,
          category: spec.category,
          qtySold,
          netSales,
          plateCost: spec.plateCost,
          margin,
          quadrant: spec.quadrant[li],
        });
      }
    }
  }
  return rows;
}

export const MENU_ITEM_SALES: MenuItemSales[] = buildMenuItemSales();

// ---------- Labor shifts (last 7 days, both locations, ~42 rows) ----------

interface Roster { role: string; wage: number; people: string[] }

const HK_ROSTER: Roster[] = [
  { role: 'Server', wage: 11.0, people: ['Alexis Romero', 'Tyler Chen', 'Camila Duarte'] },
  { role: 'Bartender', wage: 12.0, people: ['Marcus Bell', 'Ivy Santana'] },
  { role: 'Line Cook', wage: 23.5, people: ['Óscar Peña', 'Denny Kim', 'Wilfredo Cruz'] },
];

const EV_ROSTER: Roster[] = [
  { role: 'Server', wage: 11.0, people: ['Jordan Ellis', 'Naomi Feld', 'Luis Paredes'] },
  { role: 'Bartender', wage: 12.0, people: ['Kiki Alonso', 'Theo Marsh'] },
  { role: 'Line Cook', wage: 23.5, people: ['Ramón Ibarra', 'Petra Novak'] },
];

function buildLaborShifts(): LaborShift[] {
  const rnd = mulberry32(0x1ab0f00d);
  const rows: LaborShift[] = [];
  let n = 0;

  const locs: [ID, Roster[]][] = [[LOC_HK, HK_ROSTER], [LOC_EV, EV_ROSTER]];
  for (let off = 6; off >= 0; off--) {
    const date = isoDaysAgo(off);
    const dow = dowDaysAgo(off);
    for (const [locationId, roster] of locs) {
      for (const r of roster) {
        const employee = r.people[(off + n) % r.people.length];
        // Fri/Sat close later — especially the EV 2AM crew
        const late = (dow === 5 || dow === 6) && locationId === LOC_EV ? 1.5 : 0;
        const hours = round2(5.5 + rnd() * 3 + late);
        rows.push({
          id: `shift_${++n}`,
          tenantId: TENANT_ID,
          locationId,
          date,
          role: r.role,
          employee,
          hours,
          wage: r.wage,
          cost: round2(hours * r.wage),
        });
      }
    }
  }
  return rows;
}

export const LABOR_SHIFTS: LaborShift[] = buildLaborShifts();
