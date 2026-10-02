// Market model: origin–destination demand, class mix, reference fares,
// seasonality, cargo demand, traffic rights, and where rival airlines fly.

import { airportByCode, SINGLE_MARKETS } from '../data/airports.js';
import { classFareMultiplier } from '../data/aircraft.js';
import { RIVALS, RIVAL_TYPES, rivalById } from '../data/rivals.js';
import { distanceKm, pairKey, dayOfYear, clamp } from './core.js';

// ---------------------------------------------------------------------------
// Fares

export const refFare = (d) => Math.round(25 + 0.28 * d ** 0.87);
export const refClassFare = (d, cls) => Math.round(refFare(d) * classFareMultiplier(cls, d));
export const refCargoRate = (d) => 0.45 + 0.00028 * d; // USD per kg

export const ELASTICITY = { F: 1.0, J: 1.4, W: 1.9, Y: 2.4, C: 1.8 };
export const OUTSIDE_OPTION = { F: 0.25, J: 0.25, W: 0.35, Y: 0.4, C: 0.35 };

// Beyond the fare travellers will tolerate, demand falls off a cliff.
export function priceEffect(fare, ref, cls, biz = 1) {
  const ratio = Math.max(0.05, fare / ref);
  const ceiling = 1.05 + 0.15 * biz + (cls === 'J' || cls === 'F' ? 0.1 : 0);
  return ratio ** -ELASTICITY[cls] * Math.exp(-Math.max(0, ratio - ceiling) * 5);
}

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
  m = 1100 * Math.sqrt(A.pop * B.pop) * mix * distanceFactor(distanceKm(a, b)) * region * domestic;
  marketCache.set(k, m);
  return m;
}

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

function airportSeason(code, week) {
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
export function sameMarket(c1, c2) {
  if (c1 === c2) return true;
  const m = singleMarketOf(c1);
  return !!m && m.includes(c2);
}

// Can the airline operate a->b at all, and does it need a fifth-freedom permit?
export function trafficRights(state, a, b) {
  const home = state.airline.home;
  const ca = airportByCode[a].country;
  const cb = airportByCode[b].country;
  const touchesHome = sameMarket(home, ca) || sameMarket(home, cb);
  if (touchesHome) {
    if (ca === cb && !sameMarket(home, ca)) return { ok: false, reason: 'Cabotage: you cannot fly domestic routes in another country' };
    return { ok: true, fifth: false };
  }
  if (ca === cb) return { ok: false, reason: 'Cabotage: you cannot fly domestic routes in another country' };
  const linked = state.routes.some((r) => {
    const homeEnd = sameMarket(home, airportByCode[r.a].country) || sameMarket(home, airportByCode[r.b].country);
    return homeEnd && [r.a, r.b].some((x) => x === a || x === b);
  });
  if (!linked) return { ok: false, reason: 'Neither airport is in your home market. Fifth-freedom routes must extend an existing route from home.' };
  return { ok: true, fifth: true };
}

export const FIFTH_FREEDOM_PERMIT = 3e6;

// ---------------------------------------------------------------------------
// Where rivals fly (static network derived from their hubs)

const nonstopCache = new Map();
export function rivalFliesNonstop(rival, x, y) {
  const k = `${rival.id}|${pairKey(x, y)}`;
  let v = nonstopCache.get(k);
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
  nonstopCache.set(k, v);
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

// Rivals currently competing on a pair, with the live market adjustments applied.
export function rivalsOn(state, a, b) {
  const k = pairKey(a, b);
  const adj = state.rivalMarkets[k] || {};
  const out = [];
  for (const s of staticRivals(a, b)) {
    const rs = state.rivals[s.id];
    const m = adj[s.id];
    if (!rs || rs.status !== 'active' || m?.exited) continue;
    out.push({ ...s, fare: rs.fareIdx * (m?.fare ?? 1), cap: rs.capIdx * (m?.cap ?? 1) });
  }
  for (const [id, m] of Object.entries(adj)) {
    if (!m.entered || out.some((x) => x.id === id) || state.rivals[id]?.status !== 'active') continue;
    out.push({ id, nonstop: true, fare: state.rivals[id].fareIdx * (m.fare ?? 1), cap: state.rivals[id].capIdx * (m.cap ?? 1), entered: true });
  }
  return out;
}

// How attractive a rival's offer is for one cabin on this pair.
export function rivalAppeal(state, entry, cls, biz) {
  const rival = rivalById[entry.id];
  const type = RIVAL_TYPES[rival.type];
  if (cls === 'C') {
    const w = rival.type === 'cargo' ? 1.3 : type.premium ? 0.5 : 0.15;
    return w * entry.cap * priceEffect(type.fare * entry.fare, 1, 'C') * (entry.nonstop ? 1 : 0.6);
  }
  if (rival.type === 'cargo') return 0;
  if ((cls === 'J' || cls === 'F' || cls === 'W') && !type.premium) return cls === 'W' ? 0 : 0.05;
  if (cls === 'F' && rival.type === 'lcc') return 0;
  const partner = state.partners.codeshares.includes(rival.id) || (state.partners.alliance && rival.alliance === state.partners.alliance) ? 0.5 : 1;
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
