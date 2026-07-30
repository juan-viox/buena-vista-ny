// ============================================================
// @viox/ui — number/date formatting helpers (VioX Command)
// All figures render tabular-nums in the UI; these keep them tight.
// ============================================================

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Currency. Whole dollars by default; values under $10k keep cents
 * when they carry real cents (e.g. invoice totals like $1,842.10).
 */
export function fmtUSD(n: number): string {
  const abs = Math.abs(n);
  const hasCents = Math.round(abs * 100) % 100 !== 0;
  const showCents = abs < 10_000 && hasCents;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
}

/** Compact currency for stat tiles: $940 → "$940", 12400 → "$12.4k", 1.28M → "$1.3M". */
export function fmtUSDk(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${trimZero((abs / 1_000_000).toFixed(1))}M`;
  if (abs >= 1_000) return `${sign}$${trimZero((abs / 1_000).toFixed(1))}k`;
  return fmtUSD(n);
}

/** 28.4 → "28.4%". Pass digits=0 for whole-number percents. */
export function fmtPct(n: number, digits = 1): string {
  return `${trimZero(n.toFixed(digits))}%`;
}

/** Signed percent for deltas: 4.2 → "+4.2%", -1.8 → "−1.8%". */
export function fmtSignedPct(n: number, digits = 1): string {
  const body = trimZero(Math.abs(n).toFixed(digits));
  if (n > 0) return `+${body}%`;
  if (n < 0) return `−${body}%`; // proper minus sign
  return `${body}%`;
}

/** Plain thousands-separated integer: 1481 → "1,481". */
export function fmtNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/**
 * "2026-07-29" | "2026-07-29T19:30:00" → "Jul 29".
 * Parses the ISO string lexically (no timezone shifting between
 * server render and client hydration).
 */
export function fmtDate(iso: string, withYear = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const base = `${MONTHS[Number(mo) - 1]} ${Number(d)}`;
  return withYear ? `${base}, ${y}` : base;
}

/** "2026-07-29T19:30:00" → "Jul 29, 7:30 PM". Date-only strings fall back to fmtDate. */
export function fmtDateTime(iso: string): string {
  const date = fmtDate(iso);
  const t = /T(\d{2}):(\d{2})/.exec(iso);
  if (!t) return date;
  let h = Number(t[1]);
  const min = t[2];
  const mer = h >= 12 ? 'PM' : 'AM';
  h = h % 12 === 0 ? 12 : h % 12;
  return `${date}, ${h}:${min} ${mer}`;
}

/**
 * Percent change from `previous` to `current`, one decimal.
 * trendPct(11200, 10000) → 12. Guards divide-by-zero.
 */
export function trendPct(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function trimZero(s: string): string {
  return s.replace(/\.0+$/, '');
}
