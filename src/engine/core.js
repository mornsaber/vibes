// Shared primitives: random numbers, calendar, geography, logging, formatting.

import { airportByCode } from '../data/airports.js';

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const sum = (list, f = (x) => x) => list.reduce((s, x) => s + f(x), 0);
export const fail = (error) => ({ ok: false, error });
export const ok = (extra = {}) => ({ ok: true, ...extra });

// ---------------------------------------------------------------------------
// Random numbers (mulberry32). The state lives in the save so games replay.

export function rand(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function randNormal(state) {
  const u = Math.max(rand(state), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand(state));
}
export const randInt = (state, lo, hi) => lo + Math.floor(rand(state) * (hi - lo + 1));
export const pick = (state, list) => list[Math.floor(rand(state) * list.length)];
export function weightedPick(state, list, weight) {
  const total = sum(list, weight);
  let r = rand(state) * total;
  for (const x of list) if ((r -= weight(x)) <= 0) return x;
  return list[list.length - 1];
}

export function newId(state, prefix) {
  return `${prefix}${state.nextId++}`;
}

// ---------------------------------------------------------------------------
// Calendar. Weeks are absolute: week 0 starts Monday 4 January 1960.

const START = Date.UTC(1960, 0, 4);
const DAY = 86400000;
// First Monday on or after 1 January of a year.
export const weekOfYearStart = (year) => Math.max(0, Math.ceil((Date.UTC(year, 0, 1) - START) / (7 * DAY)));
export const elapsed = (state) => state.week - state.startWeek;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const dateOf = (week) => new Date(START + week * 7 * DAY);
export function dateLabel(week) {
  const d = dateOf(week);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export const monthKey = (week) => {
  const d = dateOf(week);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};
export const monthLabel = (key) => `${MONTHS[key % 12]} ${Math.floor(key / 12)}`;
export const quarterKey = (week) => Math.floor(monthKey(week) / 3);
export const quarterLabel = (key) => `Q${(key % 4) + 1} ${Math.floor(key / 4)}`;
export const yearOf = (week) => dateOf(week).getUTCFullYear();
export const dayOfYear = (week) => {
  const d = dateOf(week);
  return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY);
};

export const TIME_UNITS = {
  week: { label: 'Week', key: (w) => w },
  month: { label: 'Month', key: monthKey },
  quarter: { label: 'Quarter', key: quarterKey },
  year: { label: 'Year', key: yearOf },
};

// Number of weeks until the calendar unit rolls over (at least one).
export function weeksInUnit(week, unit) {
  if (unit === 'week') return 1;
  const key = TIME_UNITS[unit].key;
  let n = 1;
  while (key(week + n) === key(week)) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Geography

const distCache = new Map();
export function distanceKm(a, b) {
  let row = distCache.get(a);
  if (!row) distCache.set(a, (row = new Map()));
  let d = row.get(b);
  if (d !== undefined) return d;
  const ca = airportByCode[a];
  const cb = airportByCode[b];
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(cb.lat - ca.lat) / 2) ** 2 + Math.cos(r(ca.lat)) * Math.cos(r(cb.lat)) * Math.sin(r(cb.lon - ca.lon) / 2) ** 2;
  d = Math.round(6371 * 2 * Math.asin(Math.sqrt(h)));
  row.set(b, d);
  return d;
}

export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// ---------------------------------------------------------------------------

export function log(state, text, tone = 'info', category = 'general') {
  state.log.unshift({ week: state.week, text, tone, category });
  if (state.log.length > 400) state.log.length = 400;
}

// The engine keeps every amount in constant 2027 dollars; money is displayed in
// the nominal dollars of the current game year using this price level.
let PRICE_LEVEL = 1;
export const setPriceLevel = (p) => (PRICE_LEVEL = Number.isFinite(p) && p > 0 ? p : 1);
export const priceLevel = () => PRICE_LEVEL;
export const cents = (x) => `$${(x * PRICE_LEVEL).toFixed(2)}`;

export function money(x, digits) {
  if (!Number.isFinite(x)) return '$–';
  x *= PRICE_LEVEL;
  const sign = x < 0 ? '-' : '';
  const v = Math.abs(x);
  if (v >= 1e9) return `${sign}$${(v / 1e9).toFixed(digits ?? 2)}B`;
  if (v >= 1e6) return `${sign}$${(v / 1e6).toFixed(digits ?? 1)}M`;
  if (v >= 1e3) return `${sign}$${(v / 1e3).toFixed(digits ?? 0)}K`;
  return `${sign}$${v.toFixed(0)}`;
}
