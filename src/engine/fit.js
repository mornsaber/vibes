// Fleet–route matching: quick economics for "which routes suit this aircraft?"
// and "which aircraft should fly (or be bought for) this route?". These are
// planning estimates — the weekly simulation decides what actually happens.

import { airportByCode, AIRPORTS } from '../data/airports.js';
import { AIRCRAFT, aircraftById, seatCount, inProduction, inService, CLASSES, familyOf } from '../data/aircraft.js';
import { clamp, sum, distanceKm, pairKey, yearOf, ok, fail } from './core.js';
import {
  marketNow, classShares, rivalsOn, rivalsContext, rivalAppeal, OUTSIDE_OPTION, fareNow, trafficRights, sameMarket, localCompetition,
} from './market.js';
import { typeOf, isDelivered, monthlyLeaseRate, weeklyFromMonthly, isFreighter, fleetFamilies, FAMILY_OVERHEAD } from './fleet.js';
import {
  blockHours, roundTripHours, weeklyHours, availableHours, scheduledHours, canOperate, maxFrequency, routeFreq, entryFreq,
  openRoute, noiseBanned, routeById, plannedCapacity, setSchedule, routeOpenCost,
} from './network.js';
import { MX_HR, NAV_KM, LANDING, serviceAppeal, marketingEffect } from './ops.js';
import { weeklySalary, cockpitCrew, cabinCrewPerFlight, PILOT_HOURS, CABIN_HOURS, RESERVE } from './staff.js';
import { SERVICE, SERVICE_IDS } from '../data/business.js';
import { eraDistribution } from '../data/eras.js';
import { carbonCost } from './regulation.js';
import { effectiveFuelPrice } from './finance.js';
import { autoAssign, spill } from './advisor.js';

const TARGET_LF = 0.85;
const AGE_MX = 1.15; // a typical mid-life airframe

// Weekly passengers (both directions) you'd likely win on a market at
// reference fares with `freq` weekly round trips, and their average fare.
// Derived, never saved: one rival context and capture estimates per week.
// Estimates feed display and the autopilot's start-of-turn decisions only, so a
// rival change later in the same week can't make a reloaded game diverge.
const estCache = new WeakMap();
function estimates(state) {
  let c = estCache.get(state);
  if (!c || c.week !== state.week) estCache.set(state, (c = { week: state.week, ctx: rivalsContext(state), map: new Map() }));
  return c;
}

export function estimateCapture(state, a, b, freq = 7) {
  const c = estimates(state);
  const key = `${a}|${b}|${freq}|${state.reputation.toFixed(2)}|${state.marketing}`;
  let hit = c.map.get(key);
  if (!hit) c.map.set(key, (hit = estimateCaptureUncached(state, a, b, freq, c.ctx)));
  return hit;
}

function estimateCaptureUncached(state, a, b, freq, ctx) {
  const d = distanceKm(a, b);
  const A = airportByCode[a];
  const B = airportByCode[b];
  const biz = (A.biz + B.biz) / 2;
  const rivals = rivalsOn(state, a, b, ctx);
  const shares = classShares(a, b);
  const market = marketNow(state, a, b);
  const fe = clamp(0.35 + 0.65 * Math.sqrt(freq / 14), 0.35, 1.5);
  const ours = (0.5 + state.reputation / 100) * serviceAppeal(state, d > 3000) * fe * marketingEffect(state);
  let pax = 0;
  let revenue = 0;
  for (const k of ['J', 'Y']) {
    const theirs = sum(rivals, (r) => rivalAppeal(state, r, k, biz)) + (d > 3000 ? 0.25 : 0.1) + localCompetition(state, a, b, k, ctx);
    const share = ours / (ours + theirs + OUTSIDE_OPTION[k]);
    const p = market * (k === 'Y' ? shares.Y + shares.W : shares.J + shares.F) * share * 2;
    pax += p;
    revenue += p * fareNow(state, d, k);
  }
  return { pax, revenue, fare: pax ? revenue / pax : fareNow(state, d, 'Y'), rivals: rivals.filter((r) => r.nonstop).length, d };
}

// Estimated weekly result of one aircraft (or a type) flying `freq` round
// trips on a→b, carrying up to `demand` passengers (both directions) at
// `fare`. Mirrors the weekly simulation's cost lines; crew is costed at the
// marginal salary of the crews this flying needs.
export function tripEconomics(state, type, { a, b, distance }, { freq, demand, fare, seats, config = type.config, ownership }) {
  const d = distance ?? distanceKm(a, b);
  const A = airportByCode[a];
  const B = airportByCode[b];
  const year = yearOf(state.week);
  const bh = blockHours(type, d);
  const flights = freq * 2;
  const hours = flights * bh;
  const capacity = seats * flights;
  const pax = Math.min(capacity * TARGET_LF, demand);
  const lf = capacity ? pax / capacity : 0;
  const fee = (A.fee + B.fee) / 2;
  const intl = !sameMarket(A.country, B.country, year);
  const hubEnds = [a, b].filter((x) => state.hubs.some((h) => h.code === x)).length;
  const fuelKg = flights * type.burn * d * (0.92 + 0.1 * lf);
  const fuel = fuelKg * effectiveFuelPrice(state);
  const ticket = pax * fare;
  const svcHour = sum(SERVICE_IDS.filter((k) => !SERVICE[k].perPax), (k) => SERVICE[k].cost[state.service[k] - 1]);
  const svcPax = sum(SERVICE_IDS.filter((k) => SERVICE[k].perPax), (k) => SERVICE[k].cost[state.service[k] - 1]);
  const cockpit = type.cockpit ?? cockpitCrew(bh) + (type.fe ? 1 : 0);
  // Cockpits are half captains, half first officers.
  const pilotPay = (weeklySalary(state, 'pilots', 1) + weeklySalary(state, 'pilots', 2)) / 2;
  const crew = hours * RESERVE * ((cockpit * pilotPay) / PILOT_HOURS + (cabinCrewPerFlight(config) * weeklySalary(state, 'cabin', 1)) / CABIN_HOURS);
  const costs = {
    fuel,
    maintenance: hours * MX_HR[type.mx] * AGE_MX,
    airport: flights * LANDING[type.mx] * fee + pax * ((6.5 + (intl ? 10 : 0)) * fee + (year >= 2002 ? 5 : year >= 1990 ? 2 : 0)) + pax * (hubEnds === 2 ? 2.5 : hubEnds === 1 ? 4.5 : 7),
    navigation: flights * d * NAV_KM[type.mx],
    service: pax * (svcHour * bh + svcPax),
    distribution: ticket * eraDistribution(year),
    delays: 0.12 * pax * 14,
    carbon: carbonCost(state, { a, b }, fuelKg, fuel).total,
    crew,
    ownership,
  };
  const cost = sum(Object.values(costs));
  const revenue = ticket + pax * 6; // tickets plus ancillaries
  return { freq, seats, pax, lf, revenue, cost, costs, profit: revenue - cost };
}

const ownershipOf = (state, ac) => (ac.owned ? ((ac.acquiredPrice || typeOf(ac).price * 0.5) * 0.9) / 1300 : weeklyFromMonthly(ac.lease.monthly));

// Demand still available to an extra aircraft on an existing route, and its fare.
function routeOpportunity(state, route, freq) {
  const l = route.last;
  if (routeFreq(state, route) > 0 && l?.paxTotal) {
    const fare = l.ticket / l.paxTotal;
    // Spill, plus a little stimulation from extra frequency.
    return { demand: spill(route) + l.paxTotal * 0.05 * Math.min(1, freq / 7), fare };
  }
  // Not flown yet (or no results yet): estimated capture less seats already scheduled.
  const total = routeFreq(state, route) + freq;
  const est = estimateCapture(state, route.a, route.b, total);
  const cap = plannedCapacity(state, route);
  const scheduled = (cap.F + cap.J + cap.W + cap.Y) * 2 * 0.85;
  return { demand: Math.max(0, est.pax - scheduled), fare: est.fare };
}

// ---------------------------------------------------------------------------
// Routes for one aircraft

// newOnly: skip your existing routes. asIfFree: size new-route ideas as though
// the aircraft had all its hours free (for planning a reassignment).
export function routesForAircraft(state, ac, { limit = 10, includeNew = true, newOnly = false, asIfFree = false } = {}) {
  const type = typeOf(ac);
  if (isFreighter(type)) return [];
  const seats = seatCount(ac.config);
  const own = ownershipOf(state, ac);
  const spare = asIfFree ? availableHours(state, ac) : availableHours(state, ac) - scheduledHours(state, ac);
  const out = [];
  for (const r of newOnly ? [] : state.routes) {
    const flying = entryFreq(ac, r.id);
    const can = canOperate(state, ac, r);
    if (!can.ok) continue;
    const max = maxFrequency(state, ac, r) - flying;
    if (max < 1) continue;
    const opp = routeOpportunity(state, r, max);
    // Size the frequency to the demand, not just the aircraft's free hours.
    const freq = clamp(Math.ceil(opp.demand / 2 / Math.max(1, seats * TARGET_LF)), 1, max);
    const share = (freq * roundTripHours(type, r.distance)) / Math.max(1, weeklyHours(type));
    const e = tripEconomics(state, type, r, { freq, demand: opp.demand, fare: opp.fare, seats, ownership: own * share });
    out.push({ kind: 'existing', routeId: r.id, a: r.a, b: r.b, distance: r.distance, ...e, served: routeFreq(state, r) > 0 });
  }
  if (includeNew && spare > 4) {
    for (const hub of state.hubs) {
      for (const ap of AIRPORTS) {
        const b = ap.code;
        if (b === hub.code || state.routes.some((r) => pairKey(r.a, r.b) === pairKey(hub.code, b))) continue;
        const d = distanceKm(hub.code, b);
        if (d < 300 || d > type.range || ap.runway < type.runway || airportByCode[hub.code].runway < type.runway) continue;
        if (noiseBanned(state, type, { a: hub.code, b })) continue;
        if (!trafficRights(state, hub.code, b).ok) continue;
        const max = Math.floor(spare / roundTripHours(type, d));
        if (max < 3) continue;
        const est = estimateCapture(state, hub.code, b, Math.min(max, 14));
        const freq = clamp(Math.ceil(est.pax / 2 / Math.max(1, seats * TARGET_LF)), 3, Math.min(max, 14));
        const share = (freq * roundTripHours(type, d)) / Math.max(1, weeklyHours(type));
        const e = tripEconomics(state, type, { a: hub.code, b, distance: d }, { freq, demand: est.pax, fare: est.fare, seats, ownership: own * share });
        out.push({ kind: 'new', a: hub.code, b, distance: d, ...e, served: false });
      }
    }
  }
  // Keep the best of each kind so new-route ideas don't crowd out your own routes.
  const best = (kind) => out.filter((x) => x.kind === kind).sort((x, y) => y.profit - x.profit).slice(0, limit);
  return [...best('existing'), ...best('new')].sort((x, y) => y.profit - x.profit);
}

// Put the aircraft on a suggestion (opening the route first if it's new).
export function assignSuggestion(state, acId, s) {
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac) return fail('No such aircraft');
  let route = s.routeId ? routeById(state, s.routeId) : state.routes.find((r) => pairKey(r.a, r.b) === pairKey(s.a, s.b));
  if (!route) {
    const res = openRoute(state, s.a, s.b);
    if (!res.ok) return res;
    route = res.route;
  }
  const current = entryFreq(ac, route.id);
  const res = autoAssign(state, ac, route, current + Math.max(1, Math.round(s.freq)), current);
  return res.ok ? ok({ message: `${ac.reg} now flies ${route.a}–${route.b} ${entryFreq(ac, route.id)}× a week.` }) : res;
}

// Best existing route (or, failing that, a new one) for an idle aircraft.
export function autoAssignAircraft(state, acId) {
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac) return fail('No such aircraft');
  const best = routesForAircraft(state, ac, { limit: 8 });
  for (const s of best.filter((x) => x.kind === 'existing')) if (s.profit > 0 && assignSuggestion(state, acId, s).ok) return ok({ message: `${ac.reg} assigned to ${s.a}–${s.b}.` });
  for (const s of best) if (s.profit > 0 && assignSuggestion(state, acId, s).ok) return ok({ message: `${ac.reg} assigned to ${s.a}–${s.b}.` });
  return fail('No route looks profitable for this aircraft right now');
}

// Assign every idle aircraft (one-off, regardless of the autopilot setting).
export function autoAssignIdle(state) {
  const idle = state.fleet.filter((a) => isDelivered(state, a) && !a.schedule.length && !a.contractHours && !a.retired && !a.grounded && !isFreighter(typeOf(a)));
  let n = 0;
  for (const ac of idle) if (autoAssignAircraft(state, ac.id).ok) n += 1;
  return n ? ok({ message: `Assigned ${n} of ${idle.length} idle aircraft.` }) : fail(idle.length ? 'No profitable routes found for the idle aircraft' : 'No idle aircraft');
}

// ---------------------------------------------------------------------------
// Bulk assignment for a selection of aircraft.

const selected = (state, ids) => state.fleet.filter((a) => ids.includes(a.id));

// Each selected aircraft with spare hours goes to its best route.
export function bulkAutoAssign(state, ids) {
  const list = selected(state, ids).filter((ac) => isDelivered(state, ac) && !ac.retired && !isFreighter(typeOf(ac)));
  let n = 0;
  for (const ac of list) {
    if (availableHours(state, ac) - scheduledHours(state, ac) < 4) continue;
    if (autoAssignAircraft(state, ac.id).ok) n += 1;
  }
  return n ? ok({ message: `Assigned ${n} of ${list.length} selected aircraft.` }) : fail('None of the selected aircraft found a profitable route');
}

// Put every selected aircraft on one route, each flying up to `freq` (or as much as it can).
export function bulkAssignRoute(state, ids, routeId, freq = 0) {
  const r = routeById(state, routeId);
  if (!r) return fail('Pick a route');
  const list = selected(state, ids);
  let n = 0;
  const why = new Map();
  for (const ac of list) {
    const can = canOperate(state, ac, r);
    if (!can.ok) {
      why.set(can.error, (why.get(can.error) ?? 0) + 1);
      continue;
    }
    const current = entryFreq(ac, r.id);
    const room = maxFrequency(state, ac, r);
    const add = Math.min(room, freq > 0 ? freq : room);
    if (add < 1) {
      why.set('No spare hours', (why.get('No spare hours') ?? 0) + 1);
      continue;
    }
    const res = autoAssign(state, ac, r, current + add, current);
    if (res.ok) n += 1;
    else why.set(res.error, (why.get(res.error) ?? 0) + 1);
  }
  const note = [...why].map(([k, v]) => `${v}: ${k}`).join('; ');
  return n ? ok({ message: `${n} of ${list.length} aircraft now fly ${r.a}–${r.b}.${note ? ` Skipped — ${note}.` : ''}` }) : fail(note || 'Nothing assigned');
}

// Add your spare aircraft to a route one at a time, re-estimating after each,
// while the next one still looks profitable.
export function fillRoute(state, routeId, { max = 10, ids = null } = {}) {
  const r = routeById(state, routeId);
  if (!r) return fail('No such route');
  const added = [];
  for (let i = 0; i < max; i++) {
    // Each aircraft joins once; the next pick is re-estimated with it flying.
    const best = aircraftForRoute(state, r, { limit: 40 }).own.find((x) => x.profit > 0 && !added.includes(x.reg) && (!ids || ids.includes(x.acId)));
    if (!best || !assignSuggestion(state, best.acId, { routeId: r.id, freq: best.freq }).ok) break;
    added.push(best.reg);
  }
  return added.length ? ok({ message: `Added ${added.length} aircraft to ${r.a}–${r.b}: ${added.join(', ')}.` }) : fail('None of your spare aircraft would make money on this route');
}

// New route ideas for a set of aircraft (one of each type speaks for the
// rest), merged by city pair, best estimated weekly result per aircraft first.
export function newRouteIdeas(state, ids, { limit = 12 } = {}) {
  const pool = (ids?.length ? state.fleet.filter((a) => ids.includes(a.id)) : state.fleet).filter((a) => !a.retired && !isFreighter(typeOf(a)));
  const byType = new Map();
  for (const ac of pool) if (!byType.has(ac.type)) byType.set(ac.type, ac);
  const ideas = new Map();
  for (const ac of byType.values()) {
    for (const e of routesForAircraft(state, ac, { newOnly: true, asIfFree: true, limit: 15 })) {
      if (e.kind !== 'new') continue;
      const k = pairKey(e.a, e.b);
      const cur = ideas.get(k);
      if (!cur) ideas.set(k, { ...e, types: [ac.type], best: ac.type });
      else {
        cur.types.push(ac.type);
        if (e.profit > cur.profit) Object.assign(cur, { ...e, types: cur.types, best: ac.type });
      }
    }
  }
  // The best few for each type, so big jets don't crowd out ideas for the small ones.
  const per = Math.max(3, Math.ceil(limit / Math.max(1, byType.size)));
  const ranked = [...ideas.values()].filter((x) => x.profit > 0).sort((a, b) => b.profit - a.profit);
  const count = new Map();
  const keep = ranked.filter((x) => {
    const n = count.get(x.best) ?? 0;
    count.set(x.best, n + 1);
    return n < per;
  });
  return keep.slice(0, Math.max(limit, per * byType.size))
    .map((x) => ({ ...x, cost: routeOpenCost(state, x.a, x.b), able: pool.filter((ac) => x.types.includes(ac.type)).length }));
}

// Open a route and staff it from the given aircraft. With a target weekly
// frequency, assign just enough of them (spare hours first; with move, an
// aircraft without room leaves its current routes). Without one, add them one at
// a time while the next still looks profitable.
export function openAndAssign(state, a, b, ids = [], freq = 0, { move = false } = {}) {
  // Don't pay to launch a route none of the chosen aircraft can fly.
  const probe = { id: '_probe', a, b, distance: distanceKm(a, b) };
  const able = state.fleet.filter((x) => ids.includes(x.id) && isDelivered(state, x) && canOperate(state, x, probe).ok);
  if (ids.length && !able.length) {
    const first = state.fleet.find((x) => ids.includes(x.id));
    return fail(`None of the selected aircraft can fly ${a}–${b}${first ? `: ${canOperate(state, first, probe).error ?? 'not yet delivered'}` : ''}`);
  }
  const res = openRoute(state, a, b);
  if (!res.ok) return res;
  const r = res.route;
  if (!ids.length) return ok({ message: `Opened ${a}–${b}. Assign aircraft from the route page or let the autopilot do it.`, route: r });
  if (!freq) {
    const filled = fillRoute(state, r.id, { ids });
    return ok({ message: `Opened ${a}–${b}. ${filled.ok ? filled.message : 'None of the selected aircraft has spare hours that would pay there — assign some from the route page.'}`, route: r });
  }
  let left = freq;
  const used = [];
  for (const ac of [...able].sort((x, y) => maxFrequency(state, y, r) - maxFrequency(state, x, r))) {
    if (left <= 0) break;
    if (maxFrequency(state, ac, r) < Math.min(3, left)) {
      if (!move) continue;
      setSchedule(state, ac, []);
    }
    const add = Math.min(left, maxFrequency(state, ac, r));
    if (add < 1 || !autoAssign(state, ac, r, add).ok) continue;
    left -= entryFreq(ac, r.id);
    used.push(ac.reg);
  }
  return ok({ message: used.length ? `Opened ${a}–${b}: ${used.join(', ')} fl${used.length > 1 ? 'y' : 'ies'} ${freq - Math.max(0, left)}× a week.` : `Opened ${a}–${b}, but none of the selected aircraft had room.`, route: r });
}

export function bulkUnassign(state, ids) {
  let n = 0;
  for (const ac of selected(state, ids)) {
    if (!ac.schedule.length) continue;
    setSchedule(state, ac, []);
    n += 1;
  }
  return n ? ok({ message: `Cleared the schedules of ${n} aircraft.` }) : fail('None of the selected aircraft were scheduled');
}

// ---------------------------------------------------------------------------
// Aircraft for one route: your spare aircraft, and types you could acquire.

export function aircraftForRoute(state, route, { limit = 8 } = {}) {
  const year = yearOf(state.week);
  const own = [];
  for (const ac of state.fleet) {
    const type = typeOf(ac);
    if (isFreighter(type) || !canOperate(state, ac, route).ok) continue;
    const max = maxFrequency(state, ac, route) - entryFreq(ac, route.id);
    if (max < 1) continue;
    const seats = seatCount(ac.config);
    const opp = routeOpportunity(state, route, max);
    const freq = clamp(Math.ceil(opp.demand / 2 / Math.max(1, seats * TARGET_LF)), 1, max);
    const share = (freq * roundTripHours(type, route.distance)) / Math.max(1, weeklyHours(type));
    own.push({ source: 'fleet', acId: ac.id, reg: ac.reg, type: ac.type, ...tripEconomics(state, type, route, { freq, demand: opp.demand, fare: opp.fare, seats, ownership: ownershipOf(state, ac) * share }) });
  }
  const acquire = [];
  const shortRwy = Math.min(airportByCode[route.a].runway, airportByCode[route.b].runway);
  const families = new Set(fleetFamilies(state).map((f) => f.family));
  for (const type of AIRCRAFT) {
    if (isFreighter(type) || type.range < route.distance || type.runway > shortRwy || noiseBanned(state, type, route)) continue;
    const lease = state.market.leases.filter((o) => o.type === type.id).sort((a, b) => a.lead - b.lead)[0];
    const used = state.market.used.filter((o) => o.type === type.id).sort((a, b) => a.price - b.price)[0];
    const orderable = inProduction(type, year) && year >= type.intro - 3;
    if (!lease && !used && !orderable) continue;
    const seats = seatCount(type.config);
    const max = Math.floor(weeklyHours(type) / roundTripHours(type, route.distance));
    if (max < 1) continue;
    const opp = routeOpportunity(state, route, max);
    const freq = clamp(Math.ceil(opp.demand / 2 / Math.max(1, seats * TARGET_LF)), 1, max);
    // Ownership: the market lease rate (lease offer if there is one).
    const weekly = weeklyFromMonthly(lease?.monthly ?? monthlyLeaseRate(state, type, used?.age ?? 3));
    // A type outside your current families brings its own overhead.
    const newFamily = state.fleet.length > 0 && !families.has(familyOf(type.id));
    const e = tripEconomics(state, type, route, { freq, demand: opp.demand, fare: opp.fare, seats, ownership: weekly + (newFamily ? FAMILY_OVERHEAD : 0) });
    acquire.push({
      source: 'market', type: type.id, ...e, maxFreq: max, newFamily,
      lease: lease ? { id: lease.id, lead: lease.lead, monthly: lease.monthly } : null,
      used: used ? { id: used.id, price: used.price, lead: used.lead } : null,
      order: orderable ? { lead: type.lead, price: type.price } : null,
    });
  }
  return {
    own: own.sort((a, b) => b.profit - a.profit).slice(0, limit),
    acquire: acquire.sort((a, b) => b.profit - a.profit).slice(0, limit),
  };
}

export { CLASSES, inService, sameMarket, aircraftById };
