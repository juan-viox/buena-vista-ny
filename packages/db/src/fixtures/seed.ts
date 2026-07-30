// ============================================================
// Deterministic helpers for the Buena Vista demo dataset.
// The demo "today" anchor is 2026-07-29. All fixture dates are
// derived from that anchor so the dataset is stable across runs.
// No Math.random anywhere — a tiny seeded PRNG (mulberry32)
// generates the "organic" jitter, always in the same order.
// ============================================================

export const DEMO_TODAY = '2026-07-29';

/** UTC midnight of the demo anchor date. */
const ANCHOR_UTC = Date.UTC(2026, 6, 29); // months are 0-based → July

const DAY_MS = 86_400_000;

/** ISO date (YYYY-MM-DD) `n` days before the demo anchor. */
export function isoDaysAgo(n: number): string {
  return new Date(ANCHOR_UTC - n * DAY_MS).toISOString().slice(0, 10);
}

/** ISO date (YYYY-MM-DD) `n` days after the demo anchor. */
export function isoDaysAhead(n: number): string {
  return new Date(ANCHOR_UTC + n * DAY_MS).toISOString().slice(0, 10);
}

/** Day of week (0=Sun … 6=Sat) for `n` days before the anchor. */
export function dowDaysAgo(n: number): number {
  return new Date(ANCHOR_UTC - n * DAY_MS).getUTCDay();
}

/** Month number (1-12) for `n` days before the anchor. */
export function monthDaysAgo(n: number): number {
  return new Date(ANCHOR_UTC - n * DAY_MS).getUTCMonth() + 1;
}

/** Day of month (1-31) for `n` days before the anchor. */
export function domDaysAgo(n: number): number {
  return new Date(ANCHOR_UTC - n * DAY_MS).getUTCDate();
}

/** New York local datetime string for a fixture date + time. */
export function nyc(dateIso: string, time: string): string {
  return `${dateIso}T${time}:00-04:00`; // EDT during the demo window
}

/** Tiny seeded PRNG — deterministic, fast, good enough for demo jitter. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
