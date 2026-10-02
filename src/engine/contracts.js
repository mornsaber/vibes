// Contract flying (charters and special operations), government route
// subsidies, and side businesses (ventures).

import { AIRPORTS, airportByCode } from '../data/airports.js';
import { seatCount } from '../data/aircraft.js';
import { CHARTER_TEMPLATES, SPECIAL_TEMPLATES, VENTURES, ROLES } from '../data/business.js';
import { clamp, fail, ok, rand, randInt, pick, newId, log, money, distanceKm, sum } from './core.js';
import { sameMarket } from './market.js';
import { typeOf, isOperational, isDelivered } from './fleet.js';
import { roundTripHours, blockHours, availableHours, scheduledHours, weeklyHours, stations, routeFreq } from './network.js';
import { wageIndex } from './staff.js';
import { facilityReady } from './maintenance.js';

// Rough cash cost of one round trip, used to price contracts and charge them.
export function roundTripCost(state, type, d) {
  const bh = blockHours(type, d);
  const fuel = 2 * type.burn * d * state.macro.fuel;
  const crew = 2 * bh * ((2 * ROLES.pilots.salary + 4 * ROLES.cabin.salary) / 52 / 15) * wageIndex(state);
  const mx = 2 * bh * { tiny: 120, small: 350, narrow: 550, wide: 1300, jumbo: 2000 }[type.mx];
  const fees = 2 * ({ tiny: 120, small: 600, narrow: 1500, wide: 4500, jumbo: 7000 }[type.mx] + d * { tiny: 0.1, small: 0.35, narrow: 0.7, wide: 1.4, jumbo: 2 }[type.mx]);
  const ownership = (type.price * 0.0075 * 12) / 52 / 6;
  return fuel + crew + mx + fees + ownership;
}

const CAT_FOR_SEATS = (seats) => (seats > 260 ? 'wide' : seats > 120 ? 'narrow' : 'regional');
const REF_TYPE = { commuter: { burn: 0.35, speed: 400, mx: 'tiny', price: 5e6 }, regional: { burn: 1.9, speed: 800, mx: 'small', price: 32e6 }, narrow: { burn: 2.6, speed: 830, mx: 'narrow', price: 55e6 }, wide: { burn: 7, speed: 900, mx: 'wide', price: 150e6 }, jumbo: { burn: 11, speed: 900, mx: 'jumbo', price: 190e6 }, turboprop: { burn: 0.9, speed: 510, mx: 'small', price: 27e6 }, freighter: { burn: 7, speed: 880, mx: 'wide', price: 150e6 } };

function homeAirports(state) {
  return AIRPORTS.filter((a) => sameMarket(state.airline.home, a.country));
}

// ---------------------------------------------------------------------------
// Offer generation (monthly)

export function generateOffers(state) {
  state.contracts.offers = state.contracts.offers.filter((o) => o.expiresWeek > state.week);
  const origins = [...new Set([...stations(state), ...homeAirports(state).filter((a) => a.tier >= 2).map((a) => a.code)])];
  if (!origins.length) return;

  for (let i = randInt(state, 2, 4); i > 0; i--) {
    const t = pick(state, CHARTER_TEMPLATES);
    const a = pick(state, origins);
    let dests = AIRPORTS.filter((x) => x.code !== a && distanceKm(a, x.code) > 500 && distanceKm(a, x.code) < 9000);
    if (t.leisure) dests = dests.filter((x) => x.tourism >= 1.5);
    if (t.dest) dests = dests.filter((x) => t.dest.includes(x.code));
    if (!dests.length) continue;
    const b = pick(state, dests).code;
    const d = distanceKm(a, b);
    const seats = Math.round(randInt(state, t.seats[0], t.seats[1]) / 10) * 10;
    const weeks = randInt(state, t.weeks[0], t.weeks[1]);
    const rt = randInt(state, t.rt[0], t.rt[1]);
    const cat = d > 6000 ? 'wide' : CAT_FOR_SEATS(seats);
    const weekly = roundTripCost(state, REF_TYPE[cat], d) * rt * t.rate * (0.95 + rand(state) * 0.15);
    state.contracts.offers.push({
      id: newId(state, 'co'), category: 'charter', kind: t.kind, client: pick(state, t.client), a, b, distance: d,
      seats, weeks, rt, weekly, rep: 1, startIn: randInt(state, 2, 6), expiresWeek: state.week + randInt(state, 3, 6), fullTime: false,
    });
  }

  for (let i = randInt(state, 1, 2); i > 0; i--) {
    const t = pick(state, SPECIAL_TEMPLATES);
    const weeks = randInt(state, t.weeks[0], t.weeks[1]);
    const cat = t.minCat.includes('wide') ? 'wide' : t.minCat[0] === 'freighter' ? 'freighter' : 'narrow';
    const hours = cat === 'wide' || cat === 'freighter' ? 90 : 70;
    const ref = REF_TYPE[cat];
    const weekly = (roundTripCost(state, ref, 3000) / (2 * (3000 / ref.speed + 0.5))) * hours * t.rate;
    state.contracts.offers.push({
      id: newId(state, 'co'), category: 'special', kind: t.kind, client: t.gov ? `Government of ${state.airline.homeName}` : pick(state, ['United Nations', 'International Red Cross', 'Global Assist Insurance', 'Partner airline', 'Major integrator']),
      desc: t.desc, minCat: t.minCat, needsJ: !!t.needsJ, weeks, weekly, rep: t.rep, startIn: randInt(state, 2, 5), expiresWeek: state.week + randInt(state, 3, 6), fullTime: true, hours,
    });
  }

  // Government subsidies for thin routes to small home-market airports.
  state.subsidies.offers = state.subsidies.offers.filter((o) => o.expiresWeek > state.week);
  const small = homeAirports(state).filter((x) => x.pop < 0.6 && !state.subsidies.active.some((s) => s.code === x.code) && !state.subsidies.offers.some((s) => s.code === x.code));
  if (small.length && rand(state) < 0.6) {
    const ap = pick(state, small);
    const minFreq = randInt(state, 3, 7);
    state.subsidies.offers.push({
      id: newId(state, 'so'), code: ap.code, minFreq, weeks: 104, weekly: Math.round((40e3 + minFreq * 18e3 + rand(state) * 40e3) / 1000) * 1000,
      expiresWeek: state.week + 8, program: ap.country === 'US' ? 'Essential Air Service' : 'Regional connectivity program',
    });
  }
}

// ---------------------------------------------------------------------------
// Accepting and running contracts

export function eligibleAircraft(state, offer) {
  return state.fleet.filter((ac) => contractFit(state, offer, ac).ok);
}

export function contractFit(state, offer, ac) {
  const type = typeOf(ac);
  if (!isDelivered(state, ac) && ac.deliveryWeek > state.week + offer.startIn) return fail('Not delivered in time');
  if (ac.contractFull) return fail('Already on a full-time contract');
  if (offer.category === 'charter') {
    if (type.cat === 'freighter') return fail('Passenger charter');
    if (seatCount(ac.config) < offer.seats) return fail(`Needs ${offer.seats}+ seats`);
    if (type.range < offer.distance) return fail('Insufficient range');
    if ([offer.a, offer.b].some((c) => airportByCode[c].runway < type.runway)) return fail('Runway too short');
    const need = offer.rt * roundTripHours(type, offer.distance);
    const free = weeklyHours(type) - scheduledHours(state, ac) - (ac.contractHours || 0);
    if (need > free) return fail(`Needs ${Math.round(need)} free hours a week (has ${Math.round(free)})`);
    return ok({ hours: need });
  }
  if (!offer.minCat.includes(type.cat)) return fail('Wrong aircraft category');
  if (offer.needsJ && !(ac.config.J > 0)) return fail('Needs a business cabin');
  if (ac.schedule.length || ac.contractHours) return fail('Must be free of scheduled flying');
  return ok({ hours: weeklyHours(type) });
}

export function acceptContract(state, offerId, acId) {
  const offer = state.contracts.offers.find((o) => o.id === offerId);
  const ac = state.fleet.find((a) => a.id === acId);
  if (!offer || !ac) return fail('Offer or aircraft not found');
  const fit = contractFit(state, offer, ac);
  if (!fit.ok) return fit;
  const c = { ...offer, aircraftId: ac.id, hours: fit.hours, startWeek: state.week + offer.startIn, endWeek: state.week + offer.startIn + offer.weeks, missed: 0, earned: 0 };
  state.contracts.active.push(c);
  state.contracts.offers = state.contracts.offers.filter((o) => o !== offer);
  log(state, `Signed a ${offer.kind.toLowerCase()} contract with ${offer.client}: ${money(offer.weekly)}/week for ${offer.weeks} weeks using ${ac.reg}.`, 'good', 'contracts');
  return ok();
}

export function cancelContract(state, contractId) {
  const c = state.contracts.active.find((x) => x.id === contractId);
  if (!c) return fail('No such contract');
  const penalty = c.weekly * 4;
  state.cash -= penalty;
  state.reputation = clamp(state.reputation - 2, 0, 100);
  state.contracts.active = state.contracts.active.filter((x) => x !== c);
  log(state, `Cancelled the ${c.kind.toLowerCase()} contract with ${c.client} (penalty ${money(penalty)}).`, 'bad', 'contracts');
  return ok();
}

// Before operations: reserve aircraft hours for running contracts.
export function reserveContractHours(state) {
  for (const ac of state.fleet) {
    ac.contractHours = 0;
    ac.contractFull = false;
  }
  for (const c of state.contracts.active) {
    if (c.startWeek > state.week) continue;
    const ac = state.fleet.find((a) => a.id === c.aircraftId);
    if (!ac) continue;
    ac.contractHours += c.hours;
    if (c.fullTime) ac.contractFull = true;
  }
}

// After operations: earn contract revenue and pay its flying costs.
export function contractsTick(state) {
  let revenue = 0;
  let cost = 0;
  for (const c of state.contracts.active) {
    if (c.startWeek > state.week) continue;
    const ac = state.fleet.find((a) => a.id === c.aircraftId);
    const flying = ac && isDelivered(state, ac) && !ac.grounded && !(ac.downtime && ac.downtime.untilWeek > state.week);
    if (!flying) {
      c.missed += 1;
      cost += c.weekly * 0.5;
      state.reputation = clamp(state.reputation - 0.5, 0, 100);
      if (c.missed === 1) log(state, `Contract with ${c.client} missed a week — no aircraft available. Penalties apply.`, 'bad', 'contracts');
    } else {
      revenue += c.weekly;
      c.earned += c.weekly;
      const type = typeOf(ac);
      const flyCost = c.category === 'charter' ? roundTripCost(state, type, c.distance) * c.rt : (roundTripCost(state, type, 3000) / (2 * (3000 / type.speed + 0.5))) * c.hours * 0.75;
      cost += flyCost;
      const hours = c.category === 'charter' ? c.rt * 2 * blockHours(type, c.distance) : c.hours * 0.6;
      ac.fh += hours;
      ac.lastHours = (ac.lastHours ?? 0) + hours;
    }
  }
  const finished = state.contracts.active.filter((c) => c.endWeek <= state.week);
  for (const c of finished) {
    state.reputation = clamp(state.reputation + (c.missed ? 0 : c.rep), 0, 100);
    log(state, `Completed the ${c.kind.toLowerCase()} contract for ${c.client}. Earned ${money(c.earned)}.`, 'good', 'contracts');
  }
  state.contracts.active = state.contracts.active.filter((c) => c.endWeek > state.week);
  return { revenue, cost };
}

// ---------------------------------------------------------------------------
// Subsidies

export function acceptSubsidy(state, offerId) {
  const o = state.subsidies.offers.find((x) => x.id === offerId);
  if (!o) return fail('Offer expired');
  state.subsidies.active.push({ ...o, startWeek: state.week, endWeek: state.week + o.weeks, missed: 0, paid: 0 });
  state.subsidies.offers = state.subsidies.offers.filter((x) => x !== o);
  log(state, `Won the ${o.program} contract for ${airportByCode[o.code].city}: ${money(o.weekly)}/week if you fly ${o.minFreq}+ round trips a week to a hub.`, 'good', 'contracts');
  return ok();
}

export function subsidyServed(state, s) {
  return Math.max(0, ...state.routes.filter((r) => (r.a === s.code || r.b === s.code) && state.hubs.some((h) => h.code === r.a || h.code === r.b)).map((r) => r.last?.freq ?? 0));
}

export function subsidiesTick(state) {
  let revenue = 0;
  for (const s of state.subsidies.active) {
    if (subsidyServed(state, s) >= s.minFreq * 0.8) {
      revenue += s.weekly;
      s.paid += s.weekly;
      s.missed = 0;
    } else if (state.week - s.startWeek > 8) {
      s.missed += 1;
    }
  }
  const broken = state.subsidies.active.filter((s) => s.missed >= 4);
  for (const s of broken) {
    state.cash -= 500e3;
    state.reputation = clamp(state.reputation - 3, 0, 100);
    log(state, `${s.program} contract for ${s.code} terminated for non-performance ($500K penalty).`, 'bad', 'contracts');
  }
  const done = state.subsidies.active.filter((s) => s.endWeek <= state.week);
  for (const s of done) log(state, `${s.program} contract for ${s.code} completed.`, 'good', 'contracts');
  state.subsidies.active = state.subsidies.active.filter((s) => !broken.includes(s) && !done.includes(s));
  return revenue;
}

// ---------------------------------------------------------------------------
// Ventures

export function ventureCost(state, key) {
  const v = VENTURES[key];
  const level = state.ventures[key]?.level ?? 0;
  return v.cost * 1.5 ** level;
}

export function investVenture(state, key) {
  const v = VENTURES[key];
  if (!v) return fail('Unknown venture');
  const cur = state.ventures[key];
  if (cur && cur.readyWeek > state.week) return fail('Already under construction');
  if ((cur?.level ?? 0) >= v.levels) return fail('Fully expanded');
  if (v.needs === 'hangar' && !state.hubs.some((h) => facilityReady(state, h, 'narrowHangar') || facilityReady(state, h, 'wideHangar'))) return fail('Needs a heavy maintenance hangar');
  const cost = ventureCost(state, key);
  if (state.cash < cost) return fail(`Costs ${money(cost)}`);
  state.cash -= cost;
  state.ledgerCapex.facilities += cost;
  state.ventures[key] = { level: (cur?.level ?? 0), pendingLevel: (cur?.level ?? 0) + 1, readyWeek: state.week + v.weeks };
  log(state, `Investing ${money(cost)} in ${v.name.toLowerCase()} (level ${(cur?.level ?? 0) + 1}). Ready in ${v.weeks} weeks.`, 'info', 'contracts');
  return ok();
}

export function venturesTick(state) {
  let revenue = 0;
  let cost = 0;
  for (const [key, v] of Object.entries(state.ventures)) {
    if (v.pendingLevel && v.readyWeek <= state.week) {
      v.level = v.pendingLevel;
      delete v.pendingLevel;
      log(state, `${VENTURES[key].name} level ${v.level} is open for business.`, 'good', 'contracts');
    }
    if (!v.level) continue;
    const def = VENTURES[key];
    let eff = 1;
    if (key === 'mro3p') eff = clamp(state.staffStatus?.engineers?.ratio ?? 1, 0, 1);
    if (key === 'handling') eff = clamp(state.staffStatus?.ground?.ratio ?? 1, 0, 1);
    const demand = 0.85 + 0.15 * state.macro.economy;
    revenue += def.revenue * v.level * eff * demand;
    cost += def.opex * v.level;
  }
  return { revenue, cost };
}
