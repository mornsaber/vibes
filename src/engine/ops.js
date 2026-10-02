// Weekly operations: turn the schedule into flights actually operated, build
// the origin–destination itineraries the network offers (nonstop and one-stop
// connections over hubs), compete for passengers and freight cabin by cabin,
// allocate seats leg by leg, and produce route-level revenue and costs.

import { airportByCode } from '../data/airports.js';
import { CLASSES, productQ, defaultCabin } from '../data/aircraft.js';
import { SERVICE, SERVICE_IDS } from '../data/business.js';
import { rivalById } from '../data/rivals.js';
import { clamp, sum, distanceKm, randNormal, pairKey, yearOf } from './core.js';
import { eraDistribution } from '../data/eras.js';
import {
  marketNow, classShares, cargoNow, seasonality, fareNow, refCargoRate,
  priceEffect, rivalsOn, rivalAppeal, OUTSIDE_OPTION, sameMarket, rivalDef,
  priceSensitiveShare, flexMult, advMult, MARKET_SPREAD, DEFAULT_RM, FLEX_ELASTICITY, ADV_ELASTICITY, seasonalFare,
} from './market.js';
import { typeOf, isOperational, isFreighter, fuelFactor, productQuality, ageYears } from './fleet.js';
import { blockHours, roundTripHours, availableHours, scheduledHours, isHub, utilization, noiseBanned, activeSchedule, seasonOf, hubConnectionQuality, terminalLevel, TERMINAL_EFFECT, cargoCapacity } from './network.js';
import { brandOf, brandKind, brandRep, brandService, campaignEffect } from './brands.js';
import { carbonCost } from './regulation.js';
import { dispatchReliability } from './maintenance.js';
import { crewFactor, cockpitCrew, cabinCrewPerFlight } from './staff.js';
import { airspaceFuelMult, tickShockRegions } from './safety.js';

const MX_HR = { tiny: 120, small: 350, narrow: 550, wide: 1300, jumbo: 2000 };
const NAV_KM = { tiny: 0.1, small: 0.35, narrow: 0.7, wide: 1.4, jumbo: 2.0 };
const LANDING = { tiny: 120, small: 600, narrow: 1500, wide: 4500, jumbo: 7000 };
const ALL = [...CLASSES, 'C'];

// Appeal of the cabin product given service standards (long flights magnify catering/comfort).
export function serviceAppeal(state, longHaul, service = state.service) {
  let a = 1;
  for (const k of SERVICE_IDS) {
    const v = SERVICE[k].appeal[service[k] - 1];
    a *= (k === 'catering' || k === 'comfort') && !longHaul ? v ** 0.5 : v;
  }
  return a;
}

export function marketingEffect(state) {
  const scale = 60e3 * Math.sqrt(Math.max(1, state.routes.length));
  return 1 + 0.3 * (1 - Math.exp(-state.marketing / scale));
}

// Price-sensitive travellers who can't get an advance seat and buy up to flex instead.
export const BUY_UP = 0.3;

const freqEffect = (f) => clamp(0.35 + 0.65 * Math.sqrt(f / 14), 0.35, 1.5);

function partnerBoost(state, a, b, long) {
  let boost = 1;
  for (const id of state.partners.codeshares) {
    const r = rivalDef(state, id);
    if (r && (r.hubs.includes(a) || r.hubs.includes(b))) boost *= 1.12;
  }
  if (state.partners.alliance && long) boost *= 1.08;
  return boost;
}

function emptyStats() {
  return {
    flights: 0, hours: 0, seats: { F: 0, J: 0, W: 0, Y: 0 }, cargoCap: 0, freq: 0,
    pax: { F: 0, J: 0, W: 0, Y: 0 }, local: 0, connecting: 0, demand: { F: 0, J: 0, W: 0, Y: 0 }, spill: 0,
    cargoKg: 0, revenue: { F: 0, J: 0, W: 0, Y: 0 }, cargoRev: 0, ancillary: 0,
    adv: { F: 0, J: 0, W: 0, Y: 0 },
    cost: { fuel: 0, maintenance: 0, navigation: 0, landing: 0, paxFees: 0, handling: 0, service: 0, distribution: 0, delays: 0, crewTravel: 0, codeshare: 0, carbon: 0 },
    crewHours: 0, acHours: {}, otp: 0.9, share: 0, quality: 1, fuelKg: 0, co2: 0,
  };
}

function disruption(state, route) {
  let f = 1;
  for (const d of state.disruptions) if (d.codes.includes(route.a) || d.codes.includes(route.b)) f = Math.min(f, d.factor);
  return f;
}

export function simulateOperations(state, { fuelPrice, macro }) {
  const cf = crewFactor(state);
  const groundRatio = clamp(state.staffStatus?.ground?.ratio ?? 1, 0.5, 1);
  const legs = {};
  const season = seasonOf(state.week);
  for (const r of state.routes) legs[r.id] = { route: r, s: emptyStats(), cap: { F: 0, J: 0, W: 0, Y: 0, C: 0 }, pq: { F: 0, J: 0, W: 0, Y: 0 }, entries: [], brand: brandOf(state, r) };

  // 1. Flights actually operated.
  for (const ac of state.fleet) {
    ac.lastHours = 0;
    ac.lastFlights = 0;
    const plan = activeSchedule(state, ac, season);
    if (!isOperational(state, ac) || !plan.length) continue;
    const type = typeOf(ac);
    const sched = scheduledHours(state, ac, season);
    const scale = sched > 0 ? Math.min(1, availableHours(state, ac) / sched) : 0;
    const factor = scale * cf * dispatchReliability(ac) * (state.typeRestrictions[ac.type]?.factor ?? 1);
    const cabin = { ...defaultCabin(type), ...(ac.cabin ?? {}) };
    for (const s of plan) {
      const leg = legs[s.routeId];
      if (!leg || noiseBanned(state, type, leg.route)) continue;
      const eff = s.freq * factor * disruption(state, leg.route);
      const d = leg.route.distance;
      const bh = blockHours(type, d);
      for (const c of CLASSES) {
        leg.cap[c] += eff * (ac.config[c] || 0);
        leg.pq[c] += eff * (ac.config[c] || 0) * productQ(c, cabin[c], d > 3000);
      }
      leg.cap.C += eff * cargoCapacity(ac);
      leg.s.flights += eff * 2;
      leg.s.freq += eff;
      leg.s.hours += eff * 2 * bh;
      leg.s.acHours[ac.id] = (leg.s.acHours[ac.id] ?? 0) + eff * roundTripHours(type, d);
      leg.entries.push({ ac, type, eff, bh });
      ac.lastHours += eff * 2 * bh;
      ac.lastFlights += eff * 2;
      ac.fh += eff * 2 * bh;
      ac.cycles += eff * 2;
    }
  }
  for (const ac of state.fleet) ac.avgHours = (ac.avgHours ?? ac.lastHours) * 0.9 + ac.lastHours * 0.1;

  // Per-route product quality and punctuality.
  for (const leg of Object.values(legs)) {
    const { route, entries, s } = leg;
    if (!entries.length) continue;
    const w = sum(entries, (e) => e.eff) || 1;
    const rel = sum(entries, (e) => e.eff * e.ac.reliability) / w / 100;
    const util = sum(entries, (e) => e.eff * utilization(state, e.ac)) / w;
    const pq = sum(entries, (e) => e.eff * productQuality(e.ac) * (ageYears(state, e.ac) > 15 ? 0.95 : 1)) / w;
    let otp = 0.93 * (0.75 + 0.25 * rel) * (0.8 + 0.2 * groundRatio) * (util > 0.93 ? 0.94 : 1);
    for (const code of [route.a, route.b]) {
      if (airportByCode[code].slots === 2) otp *= 0.96;
      const hub = state.hubs.find((h) => h.code === code);
      if (hub?.banks) otp *= 1 - 0.025 * (hub.banks / 3) * hub.discipline;
      if (hub?.terminal) otp *= 1 + TERMINAL_EFFECT.otp * hub.terminal;
    }
    s.otp = clamp(otp + randNormal(state) * 0.015, 0.4, 0.99);
    s.quality = pq * (0.85 + 0.15 * (s.otp / 0.85));
    for (const c of CLASSES) leg.pq[c] = leg.cap[c] > 0 ? leg.pq[c] / leg.cap[c] : 1;
  }

  // 2. Itineraries we sell: every route, plus one-stop connections over hubs.
  const flows = [];
  const nonstop = new Map();
  for (const leg of Object.values(legs)) {
    const r = leg.route;
    nonstop.set(pairKey(r.a, r.b), leg);
    flows.push({ a: r.a, b: r.b, d: r.distance, legs: [leg], via: null });
  }
  const best = new Map();
  for (const hub of state.hubs) {
    const spokes = Object.values(legs).filter((l) => l.route.a === hub.code || l.route.b === hub.code);
    const hubWeekly = sum(spokes, (l) => l.s.freq);
    for (let i = 0; i < spokes.length; i++) {
      for (let j = i + 1; j < spokes.length; j++) {
        const x = spokes[i].route.a === hub.code ? spokes[i].route.b : spokes[i].route.a;
        const y = spokes[j].route.a === hub.code ? spokes[j].route.b : spokes[j].route.a;
        if (x === y) continue;
        const k = pairKey(x, y);
        if (nonstop.has(k)) continue;
        const d = distanceKm(x, y);
        if (d < 300) continue;
        const detour = (spokes[i].route.distance + spokes[j].route.distance) / d;
        if (detour > 1.5) continue;
        const prev = best.get(k);
        const q = hubConnectionQuality(hub, spokes[i].s.freq, spokes[j].s.freq, hubWeekly) * (1 - (detour - 1) * 1.2);
        if (!prev || q > prev.q) best.set(k, { a: x, b: y, d, legs: [spokes[i], spokes[j]], via: hub.code, q });
      }
    }
  }
  flows.push(...best.values());

  // 3. Demand capture per itinerary and cabin, split into flexible and
  //    price-sensitive (advance-purchase) travellers.
  const marketing = marketingEffect(state);
  for (const f of flows) {
    const A = airportByCode[f.a];
    const B = airportByCode[f.b];
    const biz = (A.biz + B.biz) / 2;
    const long = f.d > 3000;
    const rawSeason = seasonality(f.a, f.b, state.week);
    const season = rawSeason * macro * tickShockRegions(state, f.a, f.b);
    const shares = classShares(f.a, f.b);
    const rivals = rivalsOn(state, f.a, f.b);
    const lead = f.legs[0];
    const brand = lead.brand;
    const kind = brandKind(brand);
    const ka = kind.appeal ?? {};
    const rep = 0.5 + brandRep(state, brand) / 100;
    const svc = serviceAppeal(state, long, brandService(state, brand));
    const boost = partnerBoost(state, f.a, f.b, long) * (state.brandShock?.mult ?? 1);
    const camp = campaignEffect(state, brand.id, f.legs.some((l) => state.week - l.route.openedWeek < 26));
    const freq = Math.min(...f.legs.map((l) => l.s.freq));
    const quality = Math.min(...f.legs.map((l) => l.s.quality));
    const feeder = f.via && f.legs.some((l) => brandKind(l.brand).appeal?.connect) ? 1.08 : 1;
    const connect = f.via ? 0.5 * f.q * feeder : 1;
    const noise = clamp(1 + randNormal(state) * 0.05, 0.85, 1.15);
    const lounge = state.hubs.some((h) => h.lounge && (h.code === f.a || h.code === f.b || h.code === f.via));
    const terminal = 1 + TERMINAL_EFFECT.appeal * Math.max(...[f.a, f.b, f.via].filter(Boolean).map((c) => terminalLevel(state, c)));
    const rm = lead.route.rm ?? DEFAULT_RM;
    const sf = seasonalFare(rm, rawSeason);
    f.rm = rm;
    f.demand = {};
    f.dF = {};
    f.dA = {};
    f.fare = {};
    f.fareA = {};
    for (const c of ALL) {
      f.demand[c] = 0;
      f.dF[c] = 0;
      f.dA[c] = 0;
      if (f.legs.some((l) => l.cap[c] <= 0) || freq <= 0) continue;
      const generic = long ? 0.25 : 0.1;
      const theirs = sum(rivals, (r) => rivalAppeal(state, r, c, biz)) + generic + OUTSIDE_OPTION[c];
      if (c === 'C') {
        const idx = sum(f.legs, (l) => l.route.cargoIdx) / f.legs.length;
        f.fare.C = refCargoRate(f.d) * idx;
        const ours = priceEffect(idx, 1, 'C') * freqEffect(freq) * rep * connect * (0.85 + 0.15 * quality);
        f.dF.C = cargoNow(state, f.a, f.b) * 1000 * macro * (ours / (ours + theirs)) * noise;
        f.demand.C = f.dF.C;
        continue;
      }
      const ref = fareNow(state, f.d, c);
      const idx = sum(f.legs, (l) => l.route.fares[c] / fareNow(state, l.route.distance, c)) / f.legs.length;
      const base = f.via ? ref * idx : lead.route.fares[c];
      f.fare[c] = base * flexMult(c, rm.spread) * sf;
      f.fareA[c] = base * advMult(c, rm.spread) * sf * camp.advFare;
      const premium = (c === 'J' || c === 'F') ? (lounge ? 1.06 : 1) * (ka.premium ?? 1) * camp.premium : 1;
      const pq = Math.min(...f.legs.map((l) => l.pq[c] || 1));
      const common = quality * pq * svc * rep * freqEffect(freq) * marketing * boost * connect * premium * terminal * camp.all;
      const oursF = priceEffect(f.fare[c], ref * flexMult(c, MARKET_SPREAD), c, biz, FLEX_ELASTICITY) * common * (ka.flex ?? 1) * camp.flex;
      const oursA = priceEffect(f.fareA[c], ref * advMult(c, MARKET_SPREAD), c, biz, ADV_ELASTICITY) * common * (ka.adv ?? 1) * camp.adv;
      const market = marketNow(state, f.a, f.b) * shares[c] * season * noise;
      const ps = priceSensitiveShare(c, biz);
      f.dF[c] = market * (1 - ps) * (oursF / (oursF + theirs));
      f.dA[c] = market * ps * (oursA / (oursA + theirs));
      f.demand[c] = f.dF[c] + f.dA[c];
      if (c === 'Y') f.share = f.demand.Y / Math.max(1e-9, market);
    }
  }

  // 4. Allocate capacity: nonstop passengers first (advance buckets limited
  //    by revenue management, flexible travellers take what is left, some
  //    turned-away leisure travellers buy up), then connections share the rest.
  const used = new Map(Object.values(legs).map((l) => [l, { F: 0, J: 0, W: 0, Y: 0, C: 0 }]));
  for (const f of flows) {
    if (f.via) continue;
    f.cF = {};
    f.cA = {};
    const leg = f.legs[0];
    for (const c of ALL) {
      const cap = leg.cap[c];
      const adv = c === 'C' ? 0 : Math.min(f.dA[c], cap * clamp(f.rm.advShare, 0, 1));
      let flex = Math.min(f.dF[c], cap - adv);
      flex += Math.min((f.dA[c] - adv) * BUY_UP, cap - adv - flex);
      f.cA[c] = adv;
      f.cF[c] = Math.max(0, flex);
      used.get(leg)[c] += f.cA[c] + f.cF[c];
      if (c !== 'C') leg.s.demand[c] += f.demand[c];
    }
    leg.s.share = f.share ?? 0;
  }
  const connDemand = new Map(Object.values(legs).map((l) => [l, { F: 0, J: 0, W: 0, Y: 0, C: 0 }]));
  for (const f of flows) if (f.via) for (const l of f.legs) for (const c of ALL) connDemand.get(l)[c] += f.demand[c];
  for (const f of flows) {
    if (!f.via) continue;
    f.cF = {};
    f.cA = {};
    for (const c of ALL) {
      const factor = Math.min(...f.legs.map((l) => {
        const want = connDemand.get(l)[c];
        return want > 0 ? clamp((l.cap[c] - used.get(l)[c]) / want, 0, 1) : 0;
      }));
      f.cF[c] = f.dF[c] * factor;
      f.cA[c] = f.dA[c] * factor;
    }
    for (const l of f.legs) for (const c of ALL) used.get(l)[c] += f.cF[c] + f.cA[c];
  }
  for (const f of flows) {
    f.carried = {};
    for (const c of ALL) f.carried[c] = (f.cF[c] ?? 0) + (f.cA[c] ?? 0);
  }

  // 5. Revenue onto legs (connecting fares prorated by distance). Both directions.
  for (const f of flows) {
    const total = sum(f.legs, (l) => l.route.distance);
    for (const l of f.legs) {
      const prorate = f.via ? l.route.distance / total : 1;
      for (const c of CLASSES) {
        const pax = f.carried[c] * 2;
        if (!pax) continue;
        l.s.pax[c] += pax;
        l.s.adv[c] += f.cA[c] * 2;
        l.s.revenue[c] += 2 * (f.cF[c] * f.fare[c] + f.cA[c] * f.fareA[c]) * prorate;
        if (f.via) l.s.connecting += pax;
        else l.s.local += pax;
      }
      if (f.carried.C) {
        l.s.cargoKg += f.carried.C * 2;
        l.s.cargoRev += f.carried.C * 2 * f.fare.C * prorate;
      }
    }
  }

  // 6. Costs per leg.
  const baggage = SERVICE.baggage.ancillary[state.service.baggage - 1];
  const svcPerHour = sum(SERVICE_IDS.filter((k) => !SERVICE[k].perPax), (k) => SERVICE[k].cost[state.service[k] - 1]);
  const svcPerPax = sum(SERVICE_IDS.filter((k) => SERVICE[k].perPax), (k) => SERVICE[k].cost[state.service[k] - 1]);
  const lineMx = state.hubs.some((h) => h.facilities.line && h.facilities.line.readyWeek <= state.week) ? 0.85 : 1;
  for (const leg of Object.values(legs)) {
    const { route, s, entries } = leg;
    const A = airportByCode[route.a];
    const B = airportByCode[route.b];
    const fee = (A.fee * (1 - TERMINAL_EFFECT.fees * terminalLevel(state, route.a)) + B.fee * (1 - TERMINAL_EFFECT.fees * terminalLevel(state, route.b))) / 2;
    const kc = brandKind(leg.brand).cost ?? {};
    const camp = campaignEffect(state, leg.brand.id);
    const bSvc = brandService(state, leg.brand);
    const intl = !sameMarket(A.country, B.country, yearOf(state.week));
    const hubEnds = [route.a, route.b].filter((x) => isHub(state, x)).length;
    for (const k of CLASSES) {
      s.seats[k] = leg.cap[k] * 2;
      s.demand[k] = Math.max(s.demand[k] * 2, s.pax[k]);
    }
    s.cargoCap = leg.cap.C * 2;
    const paxTotal = sum(CLASSES, (k) => s.pax[k]);
    const seatTotal = sum(CLASSES, (k) => s.seats[k]);
    const lf = seatTotal ? paxTotal / seatTotal : 0;
    const reroute = airspaceFuelMult(state, route);
    for (const { ac, type, eff, bh } of entries) {
      const flights = eff * 2;
      const hours = flights * bh;
      const mx = type.mx;
      const fuelKg = flights * type.burn * route.distance * reroute * fuelFactor(state, ac) * (0.92 + 0.1 * lf);
      s.fuelKg += fuelKg;
      s.cost.fuel += fuelKg * fuelPrice;
      s.cost.maintenance += hours * MX_HR[mx] * (1 + ageYears(state, ac) * 0.03) * lineMx * (kc.maintenance ?? 1);
      s.cost.navigation += flights * route.distance * NAV_KM[mx];
      s.cost.landing += flights * LANDING[mx] * fee;
      const cockpit = type.cockpit ?? cockpitCrew(bh) + (type.fe ? 1 : 0);
      s.crewHours += hours * (cockpit + cabinCrewPerFlight(ac.config));
      // Crews overnight away from base when a rotation can't return the same day or no hub is involved.
      const overnight = !hubEnds || 2 * bh + 1 > 13;
      if (overnight) s.cost.crewTravel += eff * (cockpit + cabinCrewPerFlight(ac.config)) * 220;
      if (ac.upgrades.includes('wifi')) s.ancillary += 0.015 * sum(CLASSES, (k) => s.revenue[k]) * (eff / Math.max(s.freq, 1e-9));
    }
    const bhAvg = s.flights ? s.hours / s.flights : 0;
    const premiumPax = s.pax.J + s.pax.F;
    const year = yearOf(state.week);
    s.cost.paxFees = paxTotal * ((9 + (intl ? 12 : 0)) * fee + (year >= 2002 ? 6 : year >= 1990 ? 2 : 0));
    s.cost.handling = (paxTotal * (hubEnds === 2 ? 3 : hubEnds === 1 ? 6 : 9) + s.cargoKg * 0.12) * (kc.handling ?? 1);
    const perHour = bSvc === state.service ? svcPerHour : sum(SERVICE_IDS.filter((k) => !SERVICE[k].perPax), (k) => SERVICE[k].cost[bSvc[k] - 1]);
    const perPax = bSvc === state.service ? svcPerPax : sum(SERVICE_IDS.filter((k) => SERVICE[k].perPax), (k) => SERVICE[k].cost[bSvc[k] - 1]);
    s.cost.service = (paxTotal * (perHour * bhAvg + perPax + camp.perPax) + premiumPax * perHour * bhAvg * 1.5) * (kc.service ?? 1);
    const ticket = sum(CLASSES, (k) => s.revenue[k]);
    const bag = bSvc === state.service ? baggage : SERVICE.baggage.ancillary[bSvc.baggage - 1];
    s.ancillary += (s.revenue.Y + s.revenue.W) * bag + paxTotal * (4 + (brandKind(leg.brand).ancillary ?? 0));
    s.cost.distribution = ticket * eraDistribution(yearOf(state.week)) * (kc.distribution ?? 1);
    const carbon = carbonCost(state, route, s.fuelKg, s.cost.fuel);
    s.cost.carbon = carbon.total;
    s.co2 = carbon.co2;
    s.crewFactor = kc.crew ?? 1;
    const eu = sameMarket('FR', A.country) || sameMarket('FR', B.country) || A.country === 'GB' || B.country === 'GB';
    s.cost.delays = (1 - s.otp) * paxTotal * 14 * (eu ? 3 : 1);
    if (state.partners.codeshares.some((id) => rivalDef(state, id)?.hubs.some((h) => h === route.a || h === route.b))) s.cost.codeshare = ticket * 0.03;
    s.ticket = ticket;
    s.totalRevenue = ticket + s.cargoRev + s.ancillary;
    s.directCost = sum(Object.values(s.cost));
    s.contribution = s.totalRevenue - s.directCost;
    s.paxTotal = paxTotal;
    s.seatTotal = seatTotal;
    s.lf = lf;
    s.cargoLf = s.cargoCap ? s.cargoKg / s.cargoCap : 0;
    s.yield = paxTotal ? ticket / (paxTotal * route.distance) : 0;
  }

  return { legs, flows };
}
