// Weekly operations: turn the schedule into flights actually operated, build
// the origin–destination itineraries the network offers (nonstop and one-stop
// connections over hubs), compete for passengers and freight cabin by cabin,
// allocate seats leg by leg, and produce route-level revenue and costs.

import { airportByCode } from '../data/airports.js';
import { CLASSES } from '../data/aircraft.js';
import { SERVICE, SERVICE_IDS } from '../data/business.js';
import { rivalById } from '../data/rivals.js';
import { clamp, sum, distanceKm, randNormal, pairKey, yearOf } from './core.js';
import { eraDistribution } from '../data/eras.js';
import {
  marketNow, classShares, cargoNow, seasonality, fareNow, refCargoRate,
  priceEffect, rivalsOn, rivalAppeal, OUTSIDE_OPTION, sameMarket, rivalDef,
} from './market.js';
import { typeOf, isOperational, isFreighter, fuelFactor, productQuality, ageYears } from './fleet.js';
import { blockHours, roundTripHours, availableHours, scheduledHours, isHub, BANK_QUALITY, utilization, noiseBanned } from './network.js';
import { dispatchReliability } from './maintenance.js';
import { crewFactor, cockpitCrew, cabinCrewPerFlight } from './staff.js';
import { airspaceFuelMult, tickShockRegions } from './safety.js';

const MX_HR = { tiny: 120, small: 350, narrow: 550, wide: 1300, jumbo: 2000 };
const NAV_KM = { tiny: 0.1, small: 0.35, narrow: 0.7, wide: 1.4, jumbo: 2.0 };
const LANDING = { tiny: 120, small: 600, narrow: 1500, wide: 4500, jumbo: 7000 };
const ALL = [...CLASSES, 'C'];

// Appeal of the cabin product given service standards (long flights magnify catering/comfort).
export function serviceAppeal(state, longHaul) {
  let a = 1;
  for (const k of SERVICE_IDS) {
    const v = SERVICE[k].appeal[state.service[k] - 1];
    a *= (k === 'catering' || k === 'comfort') && !longHaul ? v ** 0.5 : v;
  }
  return a;
}

export function marketingEffect(state) {
  const scale = 60e3 * Math.sqrt(Math.max(1, state.routes.length));
  return 1 + 0.3 * (1 - Math.exp(-state.marketing / scale));
}

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
    cost: { fuel: 0, maintenance: 0, navigation: 0, landing: 0, paxFees: 0, handling: 0, service: 0, distribution: 0, delays: 0, crewTravel: 0, codeshare: 0 },
    crewHours: 0, acHours: {}, otp: 0.9, share: 0, quality: 1,
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
  for (const r of state.routes) legs[r.id] = { route: r, s: emptyStats(), cap: { F: 0, J: 0, W: 0, Y: 0, C: 0 }, entries: [] };

  // 1. Flights actually operated.
  for (const ac of state.fleet) {
    ac.lastHours = 0;
    ac.lastFlights = 0;
    if (!isOperational(state, ac) || !ac.schedule.length) continue;
    const type = typeOf(ac);
    const sched = scheduledHours(state, ac);
    const scale = sched > 0 ? Math.min(1, availableHours(state, ac) / sched) : 0;
    const factor = scale * cf * dispatchReliability(ac) * (state.typeRestrictions[ac.type]?.factor ?? 1);
    for (const s of ac.schedule) {
      const leg = legs[s.routeId];
      if (!leg || noiseBanned(state, type, leg.route)) continue;
      const eff = s.freq * factor * disruption(state, leg.route);
      const d = leg.route.distance;
      const bh = blockHours(type, d);
      for (const c of CLASSES) leg.cap[c] += eff * (ac.config[c] || 0);
      leg.cap.C += eff * type.cargoT * 1000 * (isFreighter(type) ? 1 : 0.6);
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
    for (const code of [route.a, route.b]) if (airportByCode[code].slots === 2) otp *= 0.96;
    s.otp = clamp(otp + randNormal(state) * 0.015, 0.4, 0.99);
    s.quality = pq * (0.85 + 0.15 * (s.otp / 0.85));
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
        const q = BANK_QUALITY[hub.bank] * (1 - (detour - 1) * 1.2);
        if (!prev || q > prev.q) best.set(k, { a: x, b: y, d, legs: [spokes[i], spokes[j]], via: hub.code, q });
      }
    }
  }
  flows.push(...best.values());

  // 3. Demand capture per itinerary and cabin.
  const marketing = marketingEffect(state);
  const rep = 0.5 + state.reputation / 100;
  for (const f of flows) {
    const A = airportByCode[f.a];
    const B = airportByCode[f.b];
    const biz = (A.biz + B.biz) / 2;
    const long = f.d > 3000;
    const season = seasonality(f.a, f.b, state.week) * macro * tickShockRegions(state, f.a, f.b);
    const shares = classShares(f.a, f.b);
    const rivals = rivalsOn(state, f.a, f.b);
    const svc = serviceAppeal(state, long);
    const boost = partnerBoost(state, f.a, f.b, long) * (state.brandShock?.mult ?? 1);
    const freq = Math.min(...f.legs.map((l) => l.s.freq));
    const quality = Math.min(...f.legs.map((l) => l.s.quality));
    const connect = f.via ? 0.5 * f.q : 1;
    const noise = clamp(1 + randNormal(state) * 0.05, 0.85, 1.15);
    const lounge = state.hubs.some((h) => h.lounge && (h.code === f.a || h.code === f.b || h.code === f.via));
    f.demand = {};
    f.fare = {};
    for (const c of ALL) {
      f.demand[c] = 0;
      if (f.legs.some((l) => l.cap[c] <= 0) || freq <= 0) continue;
      let ours;
      let market;
      const generic = long ? 0.25 : 0.1;
      if (c === 'C') {
        const idx = sum(f.legs, (l) => l.route.cargoIdx) / f.legs.length;
        f.fare.C = refCargoRate(f.d) * idx;
        ours = priceEffect(idx, 1, 'C') * freqEffect(freq) * rep * connect * (0.85 + 0.15 * quality);
        market = cargoNow(state, f.a, f.b) * 1000 * macro;
      } else {
        const ref = fareNow(state, f.d, c);
        const idx = sum(f.legs, (l) => l.route.fares[c] / fareNow(state, l.route.distance, c)) / f.legs.length;
        f.fare[c] = f.via ? ref * idx : f.legs[0].route.fares[c];
        const premium = (c === 'J' || c === 'F') && lounge ? 1.06 : 1;
        ours = priceEffect(f.fare[c], ref, c, biz) * quality * svc * rep * freqEffect(freq) * marketing * boost * connect * premium;
        market = marketNow(state, f.a, f.b) * shares[c] * season;
      }
      const theirs = sum(rivals, (r) => rivalAppeal(state, r, c, biz)) + generic;
      const share = ours / (ours + theirs + OUTSIDE_OPTION[c]);
      f.demand[c] = market * share * noise;
      if (c === 'Y') f.share = share;
    }
  }

  // 4. Allocate capacity: nonstop passengers first, connections share what is left.
  const used = new Map(Object.values(legs).map((l) => [l, { F: 0, J: 0, W: 0, Y: 0, C: 0 }]));
  for (const f of flows) {
    if (f.via) continue;
    f.carried = {};
    for (const c of ALL) {
      const leg = f.legs[0];
      f.carried[c] = Math.min(f.demand[c], leg.cap[c]);
      used.get(leg)[c] += f.carried[c];
      if (c !== 'C') leg.s.demand[c] += f.demand[c];
    }
    f.legs[0].s.share = f.share ?? 0;
  }
  const connDemand = new Map(Object.values(legs).map((l) => [l, { F: 0, J: 0, W: 0, Y: 0, C: 0 }]));
  for (const f of flows) if (f.via) for (const l of f.legs) for (const c of ALL) connDemand.get(l)[c] += f.demand[c];
  for (const f of flows) {
    if (!f.via) continue;
    f.carried = {};
    for (const c of ALL) {
      const factor = Math.min(...f.legs.map((l) => {
        const want = connDemand.get(l)[c];
        return want > 0 ? clamp((l.cap[c] - used.get(l)[c]) / want, 0, 1) : 0;
      }));
      f.carried[c] = f.demand[c] * factor;
    }
    for (const l of f.legs) for (const c of ALL) used.get(l)[c] += f.carried[c];
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
        l.s.revenue[c] += pax * f.fare[c] * prorate;
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
    const fee = (A.fee + B.fee) / 2;
    const intl = A.country !== B.country;
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
      s.cost.fuel += flights * type.burn * route.distance * reroute * fuelFactor(state, ac) * fuelPrice * (0.92 + 0.1 * lf);
      s.cost.maintenance += hours * MX_HR[mx] * (1 + ageYears(state, ac) * 0.03) * lineMx;
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
    s.cost.handling = paxTotal * (hubEnds === 2 ? 3 : hubEnds === 1 ? 6 : 9) + s.cargoKg * 0.12;
    s.cost.service = paxTotal * (svcPerHour * bhAvg + svcPerPax) + premiumPax * svcPerHour * bhAvg * 1.5;
    const ticket = sum(CLASSES, (k) => s.revenue[k]);
    s.ancillary += (s.revenue.Y + s.revenue.W) * baggage + paxTotal * 4;
    s.cost.distribution = ticket * eraDistribution(yearOf(state.week));
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
