// Routes, airport slots, and aircraft scheduling (which aircraft fly which
// routes how many times a week).

import { airportByCode } from '../data/airports.js';
import { CLASSES } from '../data/aircraft.js';
import { clamp, fail, ok, newId, log, money, distanceKm, sum, randInt, yearOf, dateOf } from './core.js';
import { fareNow, trafficRights, sameMarket, FIFTH_FREEDOM_PERMIT } from './market.js';
import { typeOf, isFreighter, isDelivered } from './fleet.js';
import { bilateralCheck } from './regulation.js';

const TURN = { commuter: 0.3, prop: 0.75, sst: 2, turboprop: 0.4, regional: 0.5, narrow: 0.75, wide: 1.5, jumbo: 2, freighter: 1.5 };

export const blockHours = (type, d) => d / type.speed + 0.5;
export const roundTripHours = (type, d) => 2 * (blockHours(type, d) + TURN[type.cat]);
export const weeklyHours = (type) => (['wide', 'jumbo', 'freighter'].includes(type.cat) ? 126 : type.cat === 'commuter' ? 100 : 112);

// IATA-style seasons: summer April–October, winter November–March. Schedule
// entries without a season fly all year.
export const SEASONS = { summer: 'Summer (Apr–Oct)', winter: 'Winter (Nov–Mar)' };
export const seasonOf = (week) => {
  const m = dateOf(week).getUTCMonth();
  return m >= 3 && m <= 9 ? 'summer' : 'winter';
};
// ---------------------------------------------------------------------------
// Derived-data caches (never saved). Route lookups are rebuilt whenever the
// routes array changes; per-route frequencies whenever any schedule changes.
// All schedule edits go through setSchedule()/applyEntry(), which invalidate.

const caches = new WeakMap();
const cacheOf = (state) => {
  let c = caches.get(state);
  if (!c) caches.set(state, (c = {}));
  return c;
};
export function scheduleChanged(state) {
  const c = caches.get(state);
  if (c) c.freq = null;
}
// Identity changes whenever schedules change: a cheap memo key for derived views.
export const scheduleVersion = (state) => freqIndex(state);
export function setSchedule(state, ac, list) {
  ac.schedule = list;
  scheduleChanged(state);
}
function routeMap(state) {
  const c = cacheOf(state);
  if (c.routes !== state.routes || c.routeLen !== state.routes.length) {
    c.routes = state.routes;
    c.routeLen = state.routes.length;
    c.routeMap = new Map(state.routes.map((r) => [r.id, r]));
  }
  return c.routeMap;
}
function freqIndex(state) {
  const c = cacheOf(state);
  if (!c.freq || c.fleet !== state.fleet || c.fleetLen !== state.fleet.length) {
    const idx = new Map();
    for (const ac of state.fleet) {
      for (const e of ac.schedule) {
        let f = idx.get(e.routeId);
        if (!f) idx.set(e.routeId, (f = { summer: 0, winter: 0 }));
        if (!e.season || e.season === 'all') {
          f.summer += e.freq;
          f.winter += e.freq;
        } else f[e.season] += e.freq;
      }
    }
    c.freq = idx;
    c.fleet = state.fleet;
    c.fleetLen = state.fleet.length;
  }
  return c.freq;
}

export const inSeason = (entry, season) => !entry.season || entry.season === 'all' || entry.season === season;
export const activeSchedule = (state, ac, season = seasonOf(state.week)) => ac.schedule.filter((e) => inSeason(e, season));
export const isSeasonal = (ac) => ac.schedule.some((e) => e.season && e.season !== 'all');

// Waiting for connection banks costs aircraft time at disciplined banked hubs.
export function bankPenalty(state, ac) {
  let worst = 0;
  for (const e of ac.schedule) {
    const r = routeMap(state).get(e.routeId);
    if (!r) continue;
    for (const h of state.hubs) if (h.banks && (h.code === r.a || h.code === r.b)) worst = Math.max(worst, 0.06 * h.discipline);
  }
  return worst;
}

export function availableHours(state, ac) {
  return Math.max(0, weeklyHours(typeOf(ac)) * (1 - bankPenalty(state, ac)) - ac.lostHours - (ac.contractHours || 0));
}

const entryHours = (state, ac, e) => {
  const r = routeMap(state).get(e.routeId);
  return r ? e.freq * roundTripHours(typeOf(ac), r.distance) : 0;
};
// Hours in one season, or (no season) the busier of the two — the binding constraint.
export function scheduledHours(state, ac, season) {
  if (season) return sum(activeSchedule(state, ac, season), (e) => entryHours(state, ac, e));
  return Math.max(scheduledHours(state, ac, 'summer'), scheduledHours(state, ac, 'winter'));
}

export function utilization(state, ac, season = seasonOf(state.week)) {
  const total = weeklyHours(typeOf(ac));
  return (scheduledHours(state, ac, season) + (ac.contractHours || 0)) / total;
}

export const routeById = (state, id) => routeMap(state).get(id);
export const routeFreq = (state, route, season = seasonOf(state.week)) => freqIndex(state).get(route.id)?.[season] ?? 0;
export const peakFreq = (state, route) => Math.max(routeFreq(state, route, 'summer'), routeFreq(state, route, 'winter'));
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
    fares: Object.fromEntries(CLASSES.map((c) => [c, fareNow(state, d, c)])),
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
  for (const ac of state.fleet) if (ac.schedule.some((s) => s.routeId === routeId)) ac.schedule = ac.schedule.filter((s) => s.routeId !== routeId);
  scheduleChanged(state);
  state.routes = state.routes.filter((r) => r !== route);
  log(state, `Closed ${route.a}–${route.b}.`, 'bad', 'network');
  return ok();
}

export function setFare(state, routeId, cls, fare) {
  const route = routeById(state, routeId);
  if (!route) return fail('No such route');
  const ref = fareNow(state, route.distance, cls);
  route.fares[cls] = Math.round(clamp(Number(fare) || ref, ref * 0.3, ref * 3));
  return ok({ fare: route.fares[cls] });
}

// Set every cabin to the same percentage of the market reference fare.
export function setPriceIndex(state, routeId, index) {
  const route = routeById(state, routeId);
  if (!route) return fail('No such route');
  for (const c of CLASSES) route.fares[c] = Math.round(fareNow(state, route.distance, c) * clamp(Number(index), 0.3, 3));
  return ok();
}

export function setCargoRate(state, routeId, idx) {
  const route = routeById(state, routeId);
  if (!route) return fail('No such route');
  route.cargoIdx = clamp(Number(idx) || 1, 0.5, 2);
  return ok();
}

export const priceIndex = (state, route) => route.fares.Y / fareNow(state, route.distance, 'Y');

// ---------------------------------------------------------------------------
// Slots at constrained airports (weekly round-trip slots)

export const SLOT_PRICE = { 1: 400e3, 2: 3e6 };

// Slots are held for the busier season.
export function slotUse(state, code) {
  const at = state.routes.filter((r) => r.a === code || r.b === code);
  return Math.max(sum(at, (r) => routeFreq(state, r, 'summer')), sum(at, (r) => routeFreq(state, r, 'winter')));
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

// Chapter 2 (noisy first-generation) jets were banned in North America and Europe from 2002.
export function noiseBanned(state, type, route) {
  return type.noise === 2 && yearOf(state.week) >= 2002 && [route.a, route.b].some((c) => ['NA', 'EU'].includes(airportByCode[c].region));
}

export function canOperate(state, ac, route) {
  const type = typeOf(ac);
  if (noiseBanned(state, type, route)) return fail(`${type.name} is banned by Chapter 2 noise rules at ${route.a}/${route.b}`);
  if (type.range < route.distance) return fail(`${type.name} range is ${type.range.toLocaleString()} km; route is ${route.distance.toLocaleString()} km`);
  for (const code of [route.a, route.b]) {
    if (airportByCode[code].runway < type.runway) return fail(`${code}'s runway (${airportByCode[code].runway} m) is too short for the ${type.name}`);
  }
  return ok();
}

export function maxFrequency(state, ac, route, season = 'all') {
  const type = typeOf(ac);
  const rt = roundTripHours(type, route.distance);
  let free = Infinity;
  for (const se of season === 'all' ? ['summer', 'winter'] : [season]) {
    const other = sum(activeSchedule(state, ac, se).filter((e) => e.routeId !== route.id), (e) => entryHours(state, ac, e));
    free = Math.min(free, availableHours(state, ac) - other);
  }
  return Math.max(0, Math.floor(free / rt));
}

// Frequency of one aircraft on a route for a season ('all' = year-round).
export function entryFreq(ac, routeId, season = 'all') {
  const list = ac.schedule.filter((e) => e.routeId === routeId);
  if (season === 'all') return list.find((e) => !e.season || e.season === 'all')?.freq ?? Math.max(0, ...list.map((e) => e.freq));
  return list.find((e) => inSeason(e, season))?.freq ?? 0;
}

function applyEntry(state, ac, routeId, freq, season) {
  scheduleChanged(state);
  const mine = ac.schedule.filter((e) => e.routeId === routeId);
  ac.schedule = ac.schedule.filter((e) => e.routeId !== routeId);
  if (season === 'all') {
    if (freq > 0) ac.schedule.push({ routeId, freq });
    return;
  }
  const by = { summer: 0, winter: 0 };
  for (const e of mine) for (const se of ['summer', 'winter']) if (inSeason(e, se)) by[se] = e.freq;
  by[season] = freq;
  if (by.summer === by.winter) {
    if (by.summer > 0) ac.schedule.push({ routeId, freq: by.summer });
    return;
  }
  for (const se of ['summer', 'winter']) if (by[se] > 0) ac.schedule.push({ routeId, freq: by[se], season: se });
}

export function setFrequency(state, acId, routeId, freq, { autoSlots = true, season = 'all' } = {}) {
  const ac = state.fleet.find((a) => a.id === acId);
  const route = routeById(state, routeId);
  if (!ac || !route) return fail('Invalid aircraft or route');
  if (!['all', 'summer', 'winter'].includes(season)) return fail('Unknown season');
  freq = Math.max(0, Math.round(Number(freq) || 0));
  if (freq === 0) {
    applyEntry(state, ac, routeId, 0, season);
    return ok();
  }
  const can = canOperate(state, ac, route);
  if (!can.ok) return can;
  const max = maxFrequency(state, ac, route, season);
  if (freq > max) return fail(`${ac.reg} only has time for ${max} round trips a week on this route`);
  const before = ac.schedule.map((e) => ({ ...e }));
  const peakBefore = peakFreq(state, route);
  applyEntry(state, ac, routeId, freq, season);
  const delta = peakFreq(state, route) - peakBefore;
  const undo = (res) => {
    setSchedule(state, ac, before);
    return res;
  };
  if (delta > 0) {
    const treaty = bilateralCheck(state, route, delta);
    if (!treaty.ok) return undo(treaty);
    // Slots for any added frequencies.
    for (const code of [route.a, route.b]) {
      const info = slotInfo(state, code);
      if (!info) continue;
      const short = info.used - info.held;
      if (short > 0) {
        if (!autoSlots) return undo(fail(`Need ${short} more slot pair(s) at ${code}`));
        const res = buySlots(state, code, short);
        if (!res.ok) return undo(fail(`Slots: ${res.error}`));
      }
    }
  }
  return ok();
}

// Turn a year-round entry into identical summer and winter entries to edit separately.
export function splitSeasons(state, acId, routeId) {
  const ac = state.fleet.find((a) => a.id === acId);
  const e = ac?.schedule.find((x) => x.routeId === routeId && (!x.season || x.season === 'all'));
  if (!e) return fail('Nothing to split');
  setSchedule(state, ac, [...ac.schedule.filter((x) => x !== e), { routeId, freq: e.freq, season: 'summer' }, { routeId, freq: e.freq, season: 'winter' }]);
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
  setSchedule(state, ac, []);
  return ok();
}

// Weekly seats each way by cabin, plus cargo kg, for a route (planned).
export const cargoCapacity = (ac) => {
  const type = typeOf(ac);
  return type.cargoT * 1000 * (isFreighter(type) ? 1 : 0.6) + (ac.config.C || 0) * 1000;
};

export function routeCapacity(state, route, { operating = false, season = seasonOf(state.week) } = {}) {
  const cap = { F: 0, J: 0, W: 0, Y: 0, C: 0 };
  for (const ac of state.fleet) {
    if (operating && !isDelivered(state, ac)) continue;
    for (const s of activeSchedule(state, ac, season)) {
      if (s.routeId !== route.id) continue;
      for (const c of CLASSES) cap[c] += s.freq * (ac.config[c] || 0);
      cap.C += s.freq * cargoCapacity(ac);
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

export const newHub = (code, week) => ({ code, openedWeek: week, banks: 0, autoBanks: true, discipline: 0.6, lounge: false, facilities: {}, terminal: 0, terminalBuild: null });

export function openHub(state, code) {
  const ap = airportByCode[code];
  if (!ap) return fail('Unknown airport');
  if (isHub(state, code)) return fail('Already a hub');
  if (!sameMarket(state.airline.home, ap.country, yearOf(state.week))) return fail('Hubs must be in your home market');
  const cost = hubOpenCost(code);
  if (state.cash < cost) return fail(`Opening a hub at ${code} costs ${money(cost)}`);
  state.cash -= cost;
  state.ledgerCapex.facilities += cost;
  state.hubs.push(newHub(code, state.week));
  if (ap.slots) state.slots[code] = { held: (state.slots[code]?.held ?? 0) + (ap.slots === 2 ? 14 : 35), pool: Math.max(state.slots[code]?.pool ?? 0, ap.slots === 2 ? 6 : 60) };
  log(state, `${ap.city} (${code}) is now a hub. Crews can be based here and passengers can connect.`, 'good', 'network');
  return ok();
}

// ---------------------------------------------------------------------------
// Hub timetables: rolling (flights spread through the day) or connection
// banks (waves of arrivals then departures). Banks make connections quick and
// reliable when every spoke has a flight in each wave, at the cost of
// aircraft waiting time and peak congestion.

export const MAX_BANKS = 6;
export const RETIME_COST = 250e3;

// Weekly round trips at a hub (all spokes).
export const hubDepartures = (state, code) => sum(state.routes.filter((r) => r.a === code || r.b === code), (r) => r.last?.freq ?? routeFreq(state, r));

// Quality multiplier of a connection between two spokes with fA/fB weekly round trips.
export function hubConnectionQuality(hub, fA, fB, hubWeekly = 0) {
  if (!hub.banks) return 0.72 + 0.14 * Math.min(1, hubWeekly / 7 / 60);
  const daily = Math.min(fA, fB) / 7;
  const fill = Math.min(1, (daily * 2) / hub.banks) ** 0.5;
  return 0.74 + 0.36 * (0.55 + 0.45 * hub.discipline) * fill + 0.02 * Math.min(hub.banks, daily);
}

// The bank count a scheduler would pick: one wave per daily frequency of a typical spoke.
export function suggestedBanks(state, code) {
  const spokes = state.routes.filter((r) => r.a === code || r.b === code);
  if (spokes.length < 4) return 0;
  const daily = sum(spokes, (r) => routeFreq(state, r)) / spokes.length / 7;
  return clamp(Math.round(daily), 2, MAX_BANKS);
}

export function setHubTimetable(state, code, { banks, discipline, auto } = {}) {
  const hub = state.hubs.find((h) => h.code === code);
  if (!hub) return fail('Not a hub');
  if (auto != null) hub.autoBanks = !!auto;
  if (discipline != null) hub.discipline = clamp(Number(discipline), 0, 1);
  if (banks != null) {
    banks = clamp(Math.round(Number(banks)), 0, MAX_BANKS);
    hub.autoBanks = false;
    if (banks !== hub.banks) {
      if (state.cash < RETIME_COST) return fail(`Re-timing the hub costs ${money(RETIME_COST)}`);
      state.cash -= RETIME_COST;
      state.ledgerCapex.other += RETIME_COST;
      hub.banks = banks;
      log(state, `${code} re-timed to ${banks ? `${banks} connection banks a day` : 'a rolling schedule'}.`, 'info', 'network');
    }
  }
  return ok();
}

// Monthly: hubs on auto follow the suggested bank structure.
export function autoBankTick(state) {
  for (const hub of state.hubs) {
    if (!hub.autoBanks) continue;
    const want = suggestedBanks(state, hub.code);
    if (want !== hub.banks) {
      hub.banks = want;
      log(state, `Network planning re-timed ${hub.code} to ${want ? `${want} daily banks` : 'a rolling schedule'}.`, 'info', 'network');
    }
  }
}

export const hubWeeklyCost = (hub) => 60e3 + (hub.lounge ? 40e3 : 0) + hub.banks * 8e3 * (0.5 + hub.discipline) + (hub.terminal ?? 0) * 50e3;

// ---------------------------------------------------------------------------
// Terminal investment at hubs: cheaper handling, more slots, better appeal.

export const TERMINALS = [
  null,
  { name: 'Dedicated pier', cost: 40e6, weeks: 52 },
  { name: 'Own terminal', cost: 120e6, weeks: 78 },
  { name: 'Signature terminal', cost: 300e6, weeks: 104 },
];
export const TERMINAL_EFFECT = { fees: 0.08, slots: 15, appeal: 0.025, otp: 0.015 };
export const terminalLevel = (state, code) => state.hubs.find((h) => h.code === code)?.terminal ?? 0;
export function terminalCost(code, level) {
  const ap = airportByCode[code];
  return TERMINALS[level].cost * (0.7 + 0.15 * ap.tier) * (ap.slots === 2 ? 1.4 : 1);
}

export function buildTerminal(state, code) {
  const hub = state.hubs.find((h) => h.code === code);
  if (!hub) return fail('Terminals can only be built at hubs');
  if (hub.terminalBuild) return fail('Construction already under way');
  const level = (hub.terminal ?? 0) + 1;
  if (!TERMINALS[level]) return fail('Already a signature terminal');
  const cost = terminalCost(code, level);
  if (state.cash < cost) return fail(`${TERMINALS[level].name} at ${code} costs ${money(cost)}`);
  state.cash -= cost;
  state.ledgerCapex.facilities += cost;
  hub.terminalBuild = { level, readyWeek: state.week + TERMINALS[level].weeks };
  log(state, `Construction starts on a ${TERMINALS[level].name.toLowerCase()} at ${code} (${money(cost)}, ${TERMINALS[level].weeks} weeks).`, 'info', 'network');
  return ok();
}

export function terminalTick(state) {
  for (const hub of state.hubs) {
    const b = hub.terminalBuild;
    if (!b || b.readyWeek > state.week) continue;
    hub.terminal = b.level;
    hub.terminalBuild = null;
    const info = slotInfo(state, hub.code);
    if (info) state.slots[hub.code].held += TERMINAL_EFFECT.slots;
    log(state, `${TERMINALS[b.level].name} opens at ${hub.code}: lower charges${info ? `, ${TERMINAL_EFFECT.slots} extra slot pairs` : ''} and a better passenger experience.`, 'good', 'network');
  }
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
