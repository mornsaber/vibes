// Market model: origin–destination demand, class mix, reference fares,
// seasonality, cargo demand, traffic rights, and where rival airlines fly.

import { airportByCode, SINGLE_MARKETS } from '../data/airports.js';
import { classFareMultiplier } from '../data/aircraft.js';
import { RIVALS, RIVAL_TYPES, rivalById } from '../data/rivals.js';
import { distanceKm, pairKey, dayOfYear, clamp, yearOf } from './core.js';
import { regionDemand, eraFare } from '../data/eras.js';

// ---------------------------------------------------------------------------
// Fares

export const refFare = (d) => Math.round(25 + 0.28 * d ** 0.87);
export const refClassFare = (d, cls) => Math.round(refFare(d) * classFareMultiplier(cls, d));
export const refCargoRate = (d) => 0.45 + 0.00028 * d; // USD per kg
// Era-adjusted reference fare for the current game year.
export const fareNow = (state, d, cls) => Math.round(refClassFare(d, cls) * eraFare(yearOf(state.week)));

export const ELASTICITY = { F: 1.0, J: 1.4, W: 1.9, Y: 2.4, C: 1.8 };
export const OUTSIDE_OPTION = { F: 0.25, J: 0.25, W: 0.35, Y: 0.4, C: 0.35 };

// Beyond the fare travellers will tolerate, demand falls off a cliff.
// elasMult < 1 for flexible (business-style) buyers, > 1 for price-sensitive ones.
export function priceEffect(fare, ref, cls, biz = 1, elasMult = 1) {
  const ratio = Math.max(0.05, fare / ref);
  const ceiling = 1.05 + 0.15 * biz + (cls === 'J' || cls === 'F' ? 0.1 : 0) + (elasMult < 1 ? 0.15 : 0);
  return ratio ** -(ELASTICITY[cls] * elasMult) * Math.exp(-Math.max(0, ratio - ceiling) * 5);
}

// ---------------------------------------------------------------------------
// Revenue management: each cabin sells a flexible fare and (if the bucket is
// open) a cheaper advance-purchase fare. Price-sensitive travellers compare
// advance fares with the market's advance fares; flexible ones compare flex fares.

export const PRICE_SENSITIVE = { F: 0.1, J: 0.2, W: 0.45, Y: 0.65 };
export const MARKET_SPREAD = 0.3;
export const DEFAULT_RM = { spread: 0.3, advShare: 0.6, peak: 1.06, offpeak: 0.94 };
export const FLEX_ELASTICITY = 0.6;
export const ADV_ELASTICITY = 1.25;
// Share of a cabin's travellers who are price-sensitive on this market (business mix lowers it).
export const priceSensitiveShare = (cls, biz) => clamp(PRICE_SENSITIVE[cls] * (1.25 - 0.4 * biz), 0.03, 0.9);
// Fare multipliers that keep the cabin's average at the base fare when everyone buys their own bucket.
export const flexMult = (cls, spread) => 1 + spread * PRICE_SENSITIVE[cls];
export const advMult = (cls, spread) => 1 - spread * (1 - PRICE_SENSITIVE[cls]);
// Peak / off-peak multiplier for this week's seasonality.
export const seasonalFare = (rm, season) => (season > 1.04 ? rm.peak : season < 0.96 ? rm.offpeak : 1);

// ---------------------------------------------------------------------------
// Demand

function distanceFactor(d) {
  if (d < 250) return 0.12;
  if (d < 800) return 0.12 + (0.88 * (d - 250)) / 550;
  if (d <= 6000) return 1;
  return Math.max(0.5, 1 - (d - 6000) / 14000);
}

const marketCache = new Map();
// Weekly travellers in ONE direction across all airlines, before seasonality and macro.
export function baseMarket(a, b) {
  const k = pairKey(a, b);
  let m = marketCache.get(k);
  if (m !== undefined) return m;
  const A = airportByCode[a];
  const B = airportByCode[b];
  const mix = ((A.biz + B.biz) / 2) * 0.6 + ((A.tourism + B.tourism) / 2) * 0.4;
  const region = A.region === B.region ? 1.15 : 0.75;
  const domestic = A.country === B.country ? 1.2 : 1;
  m = 1180 * Math.sqrt(A.pop * B.pop) * mix * distanceFactor(distanceKm(a, b)) * region * domestic;
  marketCache.set(k, m);
  return m;
}

// Market size in the current game year (regional growth over the decades).
export function eraMarketFactor(state, a, b) {
  const y = yearOf(state.week);
  // Softened (square root) so earlier eras stay playable while growth still shifts east.
  return (regionDemand(airportByCode[a].region, y) * regionDemand(airportByCode[b].region, y)) ** 0.25;
}
export const marketNow = (state, a, b) => baseMarket(a, b) * eraMarketFactor(state, a, b);
export const cargoNow = (state, a, b) => cargoMarket(a, b) * eraMarketFactor(state, a, b);

// Share of travellers wanting each cabin.
export function classShares(a, b) {
  const A = airportByCode[a];
  const B = airportByCode[b];
  const biz = (A.biz + B.biz) / 2;
  const long = distanceKm(a, b) > 3000;
  const J = clamp(0.03 + 0.07 * (biz - 0.6), 0.015, 0.12) * (long ? 1.3 : 0.9);
  const F = long ? Math.max(0, 0.012 * (biz - 0.9)) : 0;
  const W = long ? 0.07 : 0.03;
  return { F, J, W, Y: 1 - F - J - W };
}

// Weekly tonnes of freight in one direction.
export function cargoMarket(a, b) {
  const A = airportByCode[a];
  const B = airportByCode[b];
  const d = distanceKm(a, b);
  const df = d < 500 ? 0.15 : d < 2500 ? 0.15 + (0.85 * (d - 500)) / 2000 : 1;
  return 40 * Math.sqrt(A.pop * B.pop) ** 0.9 * ((A.cargo + B.cargo) / 2) * df;
}

// Seasonality only changes week to week, so it is memoised for the current week.
let seasonWeek = -1;
const seasonMemo = new Map();
function airportSeason(code, week) {
  if (week !== seasonWeek) {
    seasonWeek = week;
    seasonMemo.clear();
  }
  let v = seasonMemo.get(code);
  if (v === undefined) seasonMemo.set(code, (v = airportSeasonRaw(code, week)));
  return v;
}
function airportSeasonRaw(code, week) {
  const ap = airportByCode[code];
  const peak = ap.lat >= 0 ? 196 : 15; // mid-July north, mid-January south
  const phase = (2 * Math.PI * (dayOfYear(week) - peak)) / 365;
  return 1 + 0.12 * ap.tourism * Math.cos(phase);
}

export function seasonality(a, b, week) {
  const doy = dayOfYear(week);
  const holiday = doy >= 350 || doy <= 3 ? 1.08 : 1;
  return ((airportSeason(a, week) + airportSeason(b, week)) / 2) * holiday;
}

// ---------------------------------------------------------------------------
// Traffic rights

const singleMarketOf = (country) => SINGLE_MARKETS.find((m) => m.includes(country));
// The European single aviation market (full cabotage) dates from April 1997.
export const SINGLE_MARKET_YEAR = 1997;
export function sameMarket(c1, c2, year = 9999) {
  if (c1 === c2) return true;
  if (year < SINGLE_MARKET_YEAR) return false;
  const m = singleMarketOf(c1);
  return !!m && m.includes(c2);
}

// Can the airline operate a->b at all, and does it need a fifth-freedom permit?
export function trafficRights(state, a, b) {
  const home = state.airline.home;
  const ca = airportByCode[a].country;
  const cb = airportByCode[b].country;
  const y = yearOf(state.week);
  const touchesHome = sameMarket(home, ca, y) || sameMarket(home, cb, y);
  if (touchesHome) {
    if (ca === cb && !sameMarket(home, ca, y)) return { ok: false, reason: 'Cabotage: you cannot fly domestic routes in another country' };
    if (sameMarket(home, ca, y) && sameMarket(home, cb, y)) return { ok: true, fifth: false };
  } else if (ca === cb) return { ok: false, reason: 'Cabotage: you cannot fly domestic routes in another country' };
  if (touchesHome) return { ok: true, fifth: false };
  const linked = state.routes.some((r) => {
    const homeEnd = sameMarket(home, airportByCode[r.a].country, y) || sameMarket(home, airportByCode[r.b].country, y);
    return homeEnd && [r.a, r.b].some((x) => x === a || x === b);
  });
  if (!linked) return { ok: false, reason: 'Neither airport is in your home market. Fifth-freedom routes must extend an existing route from home.' };
  return { ok: true, fifth: true };
}

export const FIFTH_FREEDOM_PERMIT = 3e6;

// ---------------------------------------------------------------------------
// Where rivals fly (static network derived from their hubs)

export const rivalDef = (state, id) => rivalById[id] ?? state.newRivals?.find((r) => r.id === id);

// Alliance membership is dynamic: founders join when an alliance forms, others
// join or leave over time (rivals[id].alliance overrides the historical roster).
export const ALLIANCE_FOUNDED = { 'Star Alliance': 1997, oneworld: 1999, SkyTeam: 2000 };
export function rivalAlliance(state, r) {
  const rs = state.rivals[r.id];
  if (rs && rs.alliance !== undefined) return rs.alliance;
  return r.alliance && yearOf(state.week) >= ALLIANCE_FOUNDED[r.alliance] ? r.alliance : null;
}

// Per-rival cache of nonstop markets, reset if the rival's base list changes.
const nonstopCache = new Map();
export function rivalFliesNonstop(rival, x, y) {
  let c = nonstopCache.get(rival.id);
  if (!c || c.hubs !== rival.hubs || c.n !== rival.hubs.length) nonstopCache.set(rival.id, (c = { hubs: rival.hubs, n: rival.hubs.length, map: new Map() }));
  const k = x < y ? x + y : y + x;
  let v = c.map.get(k);
  if (v !== undefined) return v;
  v = false;
  const t = RIVAL_TYPES[rival.type];
  const hx = rival.hubs.includes(x);
  const hy = rival.hubs.includes(y);
  const d = distanceKm(x, y);
  if ((hx || hy) && d >= 250 && d <= t.range) {
    const other = airportByCode[hx ? y : x];
    const minRunway = d > 5000 ? 2700 : 1700;
    if (other.runway >= minRunway) {
      if (rival.type === 'cargo') v = other.cargo >= 1.2 || (hx && hy);
      else v = (hx && hy) || baseMarket(x, y) >= t.minMarket || other.tier >= 3;
    }
  }
  c.map.set(k, v);
  return v;
}

const staticRivalCache = new Map();
// Rivals serving an O&D nonstop or with a one-stop connection over their hub.
export function staticRivals(a, b) {
  const k = pairKey(a, b);
  let list = staticRivalCache.get(k);
  if (list) return list;
  list = [];
  const d = distanceKm(a, b);
  for (const r of RIVALS) {
    if (rivalFliesNonstop(r, a, b)) {
      list.push({ id: r.id, nonstop: true });
      continue;
    }
    for (const h of r.hubs) {
      if (h === a || h === b) continue;
      if ((distanceKm(a, h) + distanceKm(h, b)) / d > 1.45) continue;
      if (rivalFliesNonstop(r, a, h) && rivalFliesNonstop(r, h, b)) {
        list.push({ id: r.id, nonstop: false, via: h });
        break;
      }
    }
  }
  staticRivalCache.set(k, list);
  return list;
}

// Per-turn context so repeated rivalsOn calls don't re-filter every startup.
export function rivalsContext(state, { memo = true } = {}) {
  const byAirport = new Map();
  for (const r of state.newRivals ?? []) {
    if (state.rivals[r.id]?.status !== 'active') continue;
    for (const h of r.hubs) {
      if (!byAirport.has(h)) byAirport.set(h, []);
      byAirport.get(h).push(r);
    }
  }
  const base = { byAirport, memo: null, views: new Map(), pow: Object.fromEntries(POW_CLASSES.map((c) => [c, new Map()])) };
  if (!memo) return base;
  // Fingerprint of everything rivalsOn reads from rival state (markets with live
  // adjustments are never cached). Results are reused while it is unchanged.
  let stamp = '';
  for (const id in state.rivals) {
    const r = state.rivals[id];
    stamp += `${id}:${r.status}:${r.fareIdx}:${r.capIdx}:${r.mergedInto ?? ''}:${r.fleet};`;
  }
  for (const r of state.newRivals ?? []) stamp += `${r.id}@${r.hubs.join(',')};`;
  let cached = rivalsMemo.get(state);
  if (!cached || cached.stamp !== stamp) rivalsMemo.set(state, (cached = { stamp, map: new Map() }));
  return { ...base, memo: cached.map };
}
const rivalsMemo = new WeakMap();

// Rivals currently competing on a pair, with the live market adjustments applied.
export function rivalsOn(state, a, b, ctx) {
  const k = pairKey(a, b);
  const adj = state.rivalMarkets[k];
  if (ctx?.memo && !adj) {
    let hit = ctx.memo.get(k);
    if (!hit) ctx.memo.set(k, (hit = rivalsOnUncached(state, a, b, k, adj, ctx)));
    return hit;
  }
  return rivalsOnUncached(state, a, b, k, adj, ctx ?? rivalsContext(state, { memo: false }));
}

function rivalsOnUncached(state, a, b, k, adj, ctx) {
  const out = [];
  const seen = new Set();
  for (const s of staticRivals(a, b)) {
    let id = s.id;
    let rs = state.rivals[id];
    // A merged airline's network is flown by its new owner.
    if (rs?.status === 'merged' && rs.mergedInto) {
      id = rs.mergedInto;
      rs = state.rivals[id];
    }
    const m = adj?.[id];
    if (!rs || rs.status !== 'active' || m?.exited || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, nonstop: s.nonstop, via: s.via, fare: rs.fareIdx * (m?.fare ?? 1), cap: rs.capIdx * (m?.cap ?? 1) });
  }
  // Startups only fly nonstop from their bases.
  for (const r of [...(ctx.byAirport.get(a) ?? []), ...(ctx.byAirport.get(b) ?? [])]) {
    const m = adj?.[r.id];
    if (seen.has(r.id) || m?.exited || !rivalFliesNonstop(r, a, b)) continue;
    const rs = state.rivals[r.id];
    seen.add(r.id);
    out.push({ id: r.id, nonstop: true, fare: rs.fareIdx * (m?.fare ?? 1), cap: rs.capIdx * (m?.cap ?? 1) * Math.min(1, rs.fleet / 40 + 0.3) });
  }
  if (adj) {
    for (const id in adj) {
      const m = adj[id];
      if (!m.entered || seen.has(id) || state.rivals[id]?.status !== 'active') continue;
      out.push({ id, nonstop: true, fare: state.rivals[id].fareIdx * (m.fare ?? 1), cap: state.rivals[id].capIdx * (m.cap ?? 1), entered: true });
    }
  }
  return out;
}

// Fast path for the weekly simulation: the per-rival part of rivalAppeal is the
// same on every market this week, so it is computed once per turn and the
// price term (a power) is memoised by fare ratio. Gives identical results.
const POW_CLASSES = ['F', 'J', 'W', 'Y', 'C'];
function rivalView(state, ctx, id) {
  let v = ctx.views.get(id);
  if (v) return v;
  const rival = rivalDef(state, id);
  const type = RIVAL_TYPES[rival.type];
  const partner = state.partners.codeshares.includes(rival.id) || (state.partners.alliance && rivalAlliance(state, rival) === state.partners.alliance) ? 0.5 : 1;
  const rep = 0.5 + (state.rivals[rival.id].rep ?? 60) / 100;
  v = { rival, type, cargo: rival.type === 'cargo', lcc: rival.type === 'lcc', premium: type.premium, k: partner * rep * type.quality * rival.quality, cw: rival.type === 'cargo' ? 1.3 : type.premium ? 0.5 : 0.15 };
  ctx.views.set(id, v);
  return v;
}
function powMemo(ctx, cls, ratio) {
  const m = ctx.pow[cls];
  let p = m.get(ratio);
  if (p === undefined) m.set(ratio, (p = Math.max(0.05, ratio) ** -ELASTICITY[cls]));
  return p;
}
export function rivalAppealFast(state, ctx, entry, cls, biz) {
  const v = rivalView(state, ctx, entry.id);
  const ratio = v.type.fare * entry.fare;
  if (cls === 'C') {
    const cliff = ratio > 1.2 ? Math.exp(-(ratio - 1.2) * 5) : 1; // priceEffect's ceiling at biz = 1
    return v.cw * entry.cap * powMemo(ctx, 'C', ratio) * cliff * (entry.nonstop ? 1 : 0.6);
  }
  if (v.cargo) return 0;
  if ((cls === 'J' || cls === 'F' || cls === 'W') && !v.premium) return cls === 'W' ? 0 : 0.05;
  if (cls === 'F' && v.lcc) return 0;
  const ceiling = 1.05 + 0.15 * biz + (cls === 'J' || cls === 'F' ? 0.1 : 0);
  const r = Math.max(0.05, ratio);
  const cliff = r > ceiling ? Math.exp(-(r - ceiling) * 5) : 1;
  return v.k * Math.min(1.6, entry.cap) * powMemo(ctx, cls, ratio) * cliff * (entry.nonstop ? (v.premium ? 1.4 : 1.2) : 0.45);
}

// How attractive a rival's offer is for one cabin on this pair.
export function rivalAppeal(state, entry, cls, biz) {
  const rival = rivalDef(state, entry.id);
  const type = RIVAL_TYPES[rival.type];
  if (cls === 'C') {
    const w = rival.type === 'cargo' ? 1.3 : type.premium ? 0.5 : 0.15;
    return w * entry.cap * priceEffect(type.fare * entry.fare, 1, 'C') * (entry.nonstop ? 1 : 0.6);
  }
  if (rival.type === 'cargo') return 0;
  if ((cls === 'J' || cls === 'F' || cls === 'W') && !type.premium) return cls === 'W' ? 0 : 0.05;
  if (cls === 'F' && rival.type === 'lcc') return 0;
  const partner = state.partners.codeshares.includes(rival.id) || (state.partners.alliance && rivalAlliance(state, rival) === state.partners.alliance) ? 0.5 : 1;
  const rep = 0.5 + (state.rivals[rival.id].rep ?? 60) / 100;
  return (
    partner *
    rep *
    type.quality *
    rival.quality *
    Math.min(1.6, entry.cap) *
    priceEffect(type.fare * entry.fare, 1, cls, biz) *
    // Incumbents run many daily frequencies; network carriers dominate their hubs.
    (entry.nonstop ? (type.premium ? 1.4 : 1.2) : 0.45)
  );
}
