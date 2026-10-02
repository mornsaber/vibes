// Aviation regulation: bilateral air service agreements and open-skies deals,
// foreign-ownership limits, and (modern era) carbon pricing and sustainable
// aviation fuel mandates.

import { airportByCode, COUNTRIES, SINGLE_MARKETS } from '../data/airports.js';
import { clamp, sum, ok, fail, pairKey, yearOf, rand, pick, log } from './core.js';
import { sameMarket } from './market.js';

const on = (state) => state.settings?.regulation !== 'off';

// Real open-skies agreements (approximate years). 'EU' expands to the single market.
const HISTORIC_OPEN = [
  ['US', 'NL', 1992], ['US', 'CA', 1995], ['US', 'DE', 1996], ['US', 'SG', 1997], ['US', 'NZ', 1997], ['US', 'KR', 1998],
  ['US', 'AE', 1999], ['US', 'QA', 2001], ['US', 'EU', 2008], ['US', 'GB', 2008], ['US', 'AU', 2008], ['US', 'JP', 2010],
  ['US', 'BR', 2011], ['US', 'MX', 2016], ['EU', 'CA', 2009], ['EU', 'GB', 2021], ['EU', 'QA', 2021], ['AU', 'NZ', 1996],
  ['GB', 'IE', 1988], ['SG', 'AU', 2003], ['AE', 'GB', 2002], ['IN', 'AE', 2015],
];
const EU = SINGLE_MARKETS[0];
const expand = (c) => (c === 'EU' ? EU : [c]);

export function historicOpenSkies(ca, cb, year) {
  for (const [x, y, from] of HISTORIC_OPEN) {
    if (year < from) continue;
    const X = expand(x);
    const Y = expand(y);
    if ((X.includes(ca) && Y.includes(cb)) || (X.includes(cb) && Y.includes(ca))) return true;
  }
  return false;
}

// Weekly frequencies one airline may fly between two countries under a bilateral.
export const bilateralCap = (year) => (year < 1978 ? 14 : year < 1992 ? 28 : 42);

export function treatyFor(state, ca, cb) {
  const year = yearOf(state.week);
  if (ca === cb) return { kind: 'domestic', cap: Infinity, label: 'Domestic' };
  if (sameMarket(ca, cb, year)) return { kind: 'single', cap: Infinity, label: 'Single aviation market' };
  if (!on(state)) return { kind: 'open', cap: Infinity, label: 'Unregulated' };
  if (historicOpenSkies(ca, cb, year) || (state.regulation?.openSkies ?? []).includes(pairKey(ca, cb))) return { kind: 'open', cap: Infinity, label: 'Open skies' };
  const cap = bilateralCap(year);
  return { kind: 'bilateral', cap, label: `Bilateral: ${cap} weekly frequencies per airline` };
}

const countriesOf = (route) => [airportByCode[route.a].country, airportByCode[route.b].country];

// Frequencies we already fly between this pair of countries (peak season).
export function bilateralUse(state, ca, cb) {
  const k = pairKey(ca, cb);
  let n = 0;
  for (const r of state.routes) {
    const [x, y] = countriesOf(r);
    if (pairKey(x, y) !== k) continue;
    const by = { summer: 0, winter: 0 };
    for (const ac of state.fleet) for (const e of ac.schedule) if (e.routeId === r.id) for (const se of ['summer', 'winter']) if (!e.season || e.season === 'all' || e.season === se) by[se] += e.freq;
    n += Math.max(by.summer, by.winter);
  }
  return n;
}

export function bilateralCheck(state, route, added) {
  const [ca, cb] = countriesOf(route);
  const t = treatyFor(state, ca, cb);
  if (!Number.isFinite(t.cap)) return ok();
  const used = bilateralUse(state, ca, cb);
  // `added` has already been applied to the schedule by the caller.
  if (used > t.cap) return fail(`The ${COUNTRIES[ca]}–${COUNTRIES[cb]} air service agreement allows ${t.cap} weekly frequencies; you would fly ${used}. Wait for open skies.`);
  return ok({ used, cap: t.cap, added });
}

// ---------------------------------------------------------------------------
// Yearly: governments sign open-skies deals and relax ownership rules.

export function regulationYearly(state) {
  if (!on(state)) return;
  const year = yearOf(state.week);
  const reg = (state.regulation ??= { openSkies: [], foreignCap: 0.25, notes: [] });
  const home = state.airline.home;
  if (year >= 1992 && rand(state) < 0.3) {
    const flown = [...new Set(state.routes.flatMap((r) => countriesOf(r)))].filter((c) => !sameMarket(c, home, year));
    const pool = flown.length ? flown : Object.keys(COUNTRIES).filter((c) => c !== home);
    const other = pick(state, pool);
    const k = pairKey(home, other);
    if (other && !reg.openSkies.includes(k) && !historicOpenSkies(home, other, year)) {
      reg.openSkies.push(k);
      log(state, `OPEN SKIES: ${COUNTRIES[home]} and ${COUNTRIES[other]} sign an open-skies agreement — no more caps on flights between them.`, 'good', 'regulation');
    }
  }
  if (reg.foreignCap < 0.49 && year >= 2005 && rand(state) < 0.12) {
    reg.foreignCap = 0.49;
    log(state, 'Ownership rules relaxed: foreign investors may now hold up to 49% of an airline. Bigger cross-border stakes are possible.', 'info', 'regulation');
  }
  for (const [y, text] of [[2012, 'The EU Emissions Trading Scheme now covers flights within Europe: airlines must buy allowances for their CO₂.'], [2021, 'CORSIA begins: international flights must offset emissions growth.'], [2025, 'ReFuelEU: flights departing Europe must use a rising share of sustainable aviation fuel.']]) {
    if (year === y && !reg.notes.includes(y)) {
      reg.notes.push(y);
      log(state, text, 'warn', 'regulation');
    }
  }
}

export const foreignStakeCap = (state) => (on(state) ? state.regulation?.foreignCap ?? 0.25 : 0.49);

// ---------------------------------------------------------------------------
// Carbon costs per leg (constant 2027 dollars).

const lerpTable = (table, year) => {
  if (year <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [y1, v1] = table[i];
    const [y0, v0] = table[i - 1];
    if (year <= y1) return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
  }
  const [yl, vl] = table[table.length - 1];
  return vl + (year - yl) * 3;
};
const ETS = [[2012, 10], [2017, 8], [2019, 28], [2021, 60], [2023, 90], [2027, 95]];
const CORSIA = [[2021, 6], [2027, 15]];
const SAF = [[2025, 0.02], [2030, 0.06], [2035, 0.2], [2050, 0.7]];
export const CO2_PER_KG_FUEL = 3.16;

export const etsPrice = (year) => (year >= 2012 ? lerpTable(ETS, year) : 0);
export const corsiaPrice = (year) => (year >= 2021 ? lerpTable(CORSIA, year) : 0);
export const safShare = (year) => (year >= 2025 ? Math.min(0.7, lerpTable(SAF, year)) : 0);

// fuelKg and fuelCost are for all flights of the leg this week.
export function carbonCost(state, route, fuelKg, fuelCost) {
  if (!on(state)) return { ets: 0, corsia: 0, saf: 0, total: 0, co2: fuelKg * CO2_PER_KG_FUEL };
  const year = yearOf(state.week);
  const A = airportByCode[route.a];
  const B = airportByCode[route.b];
  const co2t = (fuelKg * CO2_PER_KG_FUEL) / 1000;
  const eu = [A, B].filter((x) => x.region === 'EU').length;
  const ets = eu === 2 ? co2t * etsPrice(year) : 0;
  const corsia = !ets && A.country !== B.country ? co2t * 0.5 * corsiaPrice(year) : 0;
  // SAF costs ~2.5× fossil kerosene; mandated on departures from Europe.
  const saf = (eu / 2) * safShare(year) * fuelCost * 1.5;
  return { ets, corsia, saf, total: ets + corsia + saf, co2: co2t * 1000 };
}

export const carbonPolicies = (state) => {
  const y = yearOf(state.week);
  return { ets: etsPrice(y), corsia: corsiaPrice(y), saf: safShare(y) };
};

export { clamp, sum };
