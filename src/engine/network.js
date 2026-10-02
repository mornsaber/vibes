// Routes, airport slots, and aircraft scheduling (which aircraft fly which
// routes how many times a week).

import { airportByCode } from '../data/airports.js';
import { CLASSES } from '../data/aircraft.js';
import { clamp, fail, ok, newId, log, money, distanceKm, sum, randInt } from './core.js';
import { refClassFare, trafficRights, sameMarket, FIFTH_FREEDOM_PERMIT } from './market.js';
import { typeOf, isFreighter, isDelivered } from './fleet.js';

const TURN = { turboprop: 0.4, regional: 0.5, narrow: 0.75, wide: 1.5, jumbo: 2, freighter: 1.5 };

export const blockHours = (type, d) => d / type.speed + 0.5;
export const roundTripHours = (type, d) => 2 * (blockHours(type, d) + TURN[type.cat]);
export const weeklyHours = (type) => (['wide', 'jumbo', 'freighter'].includes(type.cat) ? 126 : 112);

export function availableHours(state, ac) {
  return Math.max(0, weeklyHours(typeOf(ac)) - ac.lostHours - (ac.contractHours || 0));
}

export function scheduledHours(state, ac) {
  return sum(ac.schedule, (s) => {
    const r = state.routes.find((x) => x.id === s.routeId);
    return r ? s.freq * roundTripHours(typeOf(ac), r.distance) : 0;
  });
}

export function utilization(state, ac) {
  const total = weeklyHours(typeOf(ac));
  return (scheduledHours(state, ac) + (ac.contractHours || 0)) / total;
}

export const routeById = (state, id) => state.routes.find((r) => r.id === id);
export const routeFreq = (state, route) => sum(state.fleet, (ac) => sum(ac.schedule.filter((s) => s.routeId === route.id), (s) => s.freq));
export const routeAircraft = (state, route) => state.fleet.filter((ac) => ac.schedule.some((s) => s.routeId === route.id));

export function stations(state) {
  const set = new Set(state.hubs.map((h) => h.code));
  for (const r of state.routes) {
    set.add(r.a);
    set.add(r.b);
  }
  return [...set];
}
export const isHub = (state, code) => state.hubs.some((h) => h.code === code);

// ---------------------------------------------------------------------------
// Routes

export function routeOpenCost(state, a, b) {
  const fee = (airportByCode[a].fee + airportByCode[b].fee) / 2;
  const rights = trafficRights(state, a, b);
  return 150e3 * fee + (airportByCode[a].country !== airportByCode[b].country ? 100e3 : 0) + (rights.fifth ? FIFTH_FREEDOM_PERMIT : 0);
}

export function openRoute(state, a, b) {
  if (!airportByCode[a] || !airportByCode[b]) return fail('Unknown airport');
  if (a === b) return fail('Pick two different airports');
  if (state.routes.some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a))) return fail('You already fly this route');
  const served = new Set(stations(state));
  if (!served.has(a) && !served.has(b)) return fail('One end of a new route must be an airport you already serve');
  const rights = trafficRights(state, a, b);
  if (!rights.ok) return fail(rights.reason);
  const d = distanceKm(a, b);
  if (d < 150) return fail('Too short — passengers would drive');
  const cost = routeOpenCost(state, a, b);
  if (state.cash < cost) return fail(`Launching this route costs ${money(cost)}`);
  state.cash -= cost;
  state.ledgerCapex.other += cost;
  const route = {
    id: newId(state, 'rt'),
    a,
    b,
    distance: d,
    openedWeek: state.week,
    fares: Object.fromEntries(CLASSES.map((c) => [c, refClassFare(d, c)])),
    cargoIdx: 1,
    fifth: rights.fifth,
    last: null,
    hist: [],
  };
  state.routes.push(route);
  log(state, `Launched ${a}–${b} (${d.toLocaleString()} km)${rights.fifth ? ' under a fifth-freedom permit' : ''}. Launch cost ${money(cost)}.`, 'info', 'network');
  return ok({ route });
}

export function closeRoute(state, routeId) {
  const route = routeById(state, routeId);
  if (!route) return fail('No such route');
  for (const ac of state.fleet) ac.schedule = ac.schedule.filter((s) => s.routeId !== routeId);
  state.routes = state.routes.filter((r) => r !== route);
  log(state, `Closed ${route.a}–${route.b}.`, 'bad', 'network');
  return ok();
}

export function setFare(state, routeId, cls, fare) {
  const route = routeById(state, routeId);
  if (!route) return fail('No such route');
  const ref = refClassFare(route.distance, cls);
  route.fares[cls] = Math.round(clamp(Number(fare) || ref, ref * 0.3, ref * 3));
  return ok({ fare: route.fares[cls] });
}

// Set every cabin to the same percentage of the market reference fare.
export function setPriceIndex(state, routeId, index) {
  const route = routeById(state, routeId);
  if (!route) return fail('No such route');
  for (const c of CLASSES) route.fares[c] = Math.round(refClassFare(route.distance, c) * clamp(Number(index), 0.3, 3));
  return ok();
}

export function setCargoRate(state, routeId, idx) {
  const route = routeById(state, routeId);
  if (!route) return fail('No such route');
  route.cargoIdx = clamp(Number(idx) || 1, 0.5, 2);
  return ok();
}

export const priceIndex = (route) => route.fares.Y / refClassFare(route.distance, 'Y');

// ---------------------------------------------------------------------------
// Slots at constrained airports (weekly round-trip slots)

export const SLOT_PRICE = { 1: 400e3, 2: 3e6 };

export function slotUse(state, code) {
  return sum(state.routes.filter((r) => r.a === code || r.b === code), (r) => routeFreq(state, r));
}

export function slotInfo(state, code) {
  const ap = airportByCode[code];
  if (!ap.slots) return null;
  const s = state.slots[code] ?? (state.slots[code] = { held: 0, pool: ap.slots === 2 ? 6 : 60 });
  return { ...s, used: slotUse(state, code), price: SLOT_PRICE[ap.slots] * ap.fee };
}

export function buySlots(state, code, n) {
  const info = slotInfo(state, code);
  if (!info) return fail(`${code} is not slot-controlled`);
  n = Math.max(1, Math.round(n));
  if (n > info.pool) return fail(`Only ${info.pool} slot pairs available at ${code} this month`);
  const cost = info.price * n;
  if (state.cash < cost) return fail(`${n} slot pair(s) at ${code} cost ${money(cost)}`);
  state.cash -= cost;
  state.ledgerCapex.slots += cost;
  state.slots[code].held += n;
  state.slots[code].pool -= n;
  log(state, `Acquired ${n} weekly slot pair(s) at ${code} for ${money(cost)}.`, 'info', 'network');
  return ok();
}

export function sellSlots(state, code, n) {
  const info = slotInfo(state, code);
  if (!info) return fail('Not slot-controlled');
  n = Math.min(Math.round(n), info.held - info.used);
  if (n <= 0) return fail('No unused slots to sell');
  const value = info.price * n * 0.8;
  state.slots[code].held -= n;
  state.slots[code].pool += n;
  state.cash += value;
  log(state, `Sold ${n} slot pair(s) at ${code} for ${money(value)}.`, 'info', 'network');
  return ok();
}

export function replenishSlots(state) {
  for (const [code, s] of Object.entries(state.slots)) {
    const level = airportByCode[code].slots;
    s.pool = Math.min(level === 2 ? 12 : 120, s.pool + (level === 2 ? randInt(state, 1, 3) : randInt(state, 10, 20)));
  }
}

// ---------------------------------------------------------------------------
// Scheduling

export function canOperate(state, ac, route) {
  const type = typeOf(ac);
  if (type.range < route.distance) return fail(`${type.name} range is ${type.range.toLocaleString()} km; route is ${route.distance.toLocaleString()} km`);
  for (const code of [route.a, route.b]) {
    if (airportByCode[code].runway < type.runway) return fail(`${code}'s runway (${airportByCode[code].runway} m) is too short for the ${type.name}`);
  }
  return ok();
}

export function maxFrequency(state, ac, route) {
  const type = typeOf(ac);
  const current = ac.schedule.find((s) => s.routeId === route.id)?.freq ?? 0;
  const free = availableHours(state, ac) - scheduledHours(state, ac) + current * roundTripHours(type, route.distance);
  return Math.max(0, Math.floor(free / roundTripHours(type, route.distance)));
}

export function setFrequency(state, acId, routeId, freq, { autoSlots = true } = {}) {
  const ac = state.fleet.find((a) => a.id === acId);
  const route = routeById(state, routeId);
  if (!ac || !route) return fail('Invalid aircraft or route');
  freq = Math.max(0, Math.round(Number(freq) || 0));
  const entry = ac.schedule.find((s) => s.routeId === routeId);
  const current = entry?.freq ?? 0;
  if (freq === 0) {
    ac.schedule = ac.schedule.filter((s) => s.routeId !== routeId);
    return ok();
  }
  const can = canOperate(state, ac, route);
  if (!can.ok) return can;
  const max = maxFrequency(state, ac, route);
  if (freq > max) return fail(`${ac.reg} only has time for ${max} round trips a week on this route`);
  // Slots for any added frequencies.
  const delta = freq - current;
  if (delta > 0) {
    for (const code of [route.a, route.b]) {
      const info = slotInfo(state, code);
      if (!info) continue;
      const short = info.used + delta - info.held;
      if (short > 0) {
        if (!autoSlots) return fail(`Need ${short} more slot pair(s) at ${code}`);
        const res = buySlots(state, code, short);
        if (!res.ok) return fail(`Slots: ${res.error}`);
      }
    }
  }
  if (entry) entry.freq = freq;
  else ac.schedule.push({ routeId, freq });
  return ok();
}

export function assignAircraft(state, acId, routeId) {
  const ac = state.fleet.find((a) => a.id === acId);
  const route = routeById(state, routeId);
  if (!ac || !route) return fail('Invalid aircraft or route');
  const can = canOperate(state, ac, route);
  if (!can.ok) return can;
  const max = maxFrequency(state, ac, route);
  if (max < 1) return fail(`${ac.reg} has no spare hours for this route`);
  return setFrequency(state, acId, routeId, max);
}

export function clearSchedule(state, acId) {
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac) return fail('No such aircraft');
  ac.schedule = [];
  return ok();
}

// Weekly seats each way by cabin, plus cargo kg, for a route (planned).
export function routeCapacity(state, route, { operating = false } = {}) {
  const cap = { F: 0, J: 0, W: 0, Y: 0, C: 0 };
  for (const ac of state.fleet) {
    if (operating && !isDelivered(state, ac)) continue;
    for (const s of ac.schedule) {
      if (s.routeId !== route.id) continue;
      const type = typeOf(ac);
      for (const c of CLASSES) cap[c] += s.freq * (ac.config[c] || 0);
      cap.C += s.freq * type.cargoT * 1000 * (isFreighter(type) ? 1 : 0.6);
    }
  }
  return cap;
}

// ---------------------------------------------------------------------------
// Hubs

export function hubOpenCost(code) {
  const ap = airportByCode[code];
  return 4e6 + ap.tier * 2e6 + ap.slots * 4e6;
}

export function openHub(state, code) {
  const ap = airportByCode[code];
  if (!ap) return fail('Unknown airport');
  if (isHub(state, code)) return fail('Already a hub');
  if (!sameMarket(state.airline.home, ap.country)) return fail('Hubs must be in your home market');
  const cost = hubOpenCost(code);
  if (state.cash < cost) return fail(`Opening a hub at ${code} costs ${money(cost)}`);
  state.cash -= cost;
  state.ledgerCapex.facilities += cost;
  state.hubs.push({ code, openedWeek: state.week, bank: 1, lounge: false, facilities: {} });
  if (ap.slots) state.slots[code] = { held: (state.slots[code]?.held ?? 0) + (ap.slots === 2 ? 14 : 35), pool: Math.max(state.slots[code]?.pool ?? 0, ap.slots === 2 ? 6 : 60) };
  log(state, `${ap.city} (${code}) is now a hub. Crews can be based here and passengers can connect.`, 'good', 'network');
  return ok();
}

export function upgradeHubBank(state, code) {
  const hub = state.hubs.find((h) => h.code === code);
  if (!hub) return fail('Not a hub');
  if (hub.bank >= 3) return fail('Already at the best connection structure');
  const cost = hub.bank === 1 ? 3e6 : 8e6;
  if (state.cash < cost) return fail(`Costs ${money(cost)}`);
  state.cash -= cost;
  state.ledgerCapex.facilities += cost;
  hub.bank += 1;
  log(state, `${code} hub upgraded to ${['', 'basic', 'banked', 'wave-optimised'][hub.bank]} connections.`, 'good', 'network');
  return ok();
}

export function buildLounge(state, code) {
  const hub = state.hubs.find((h) => h.code === code);
  if (!hub) return fail('Not a hub');
  if (hub.lounge) return fail('Already has a lounge');
  const cost = 6e6;
  if (state.cash < cost) return fail(`A lounge costs ${money(cost)}`);
  state.cash -= cost;
  state.ledgerCapex.facilities += cost;
  hub.lounge = true;
  log(state, `Opened a premium lounge at ${code}.`, 'good', 'network');
  return ok();
}

export const BANK_QUALITY = [0, 0.85, 1.0, 1.12];
