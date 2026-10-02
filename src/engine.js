// Core simulation. Every function here is pure data-in/data-out apart from
// mutating the `state` object it is given, so the whole game can be saved as
// JSON and replayed deterministically from its seed.

import { CITIES, AIRCRAFT, SERVICE_LEVELS, cityByCode, aircraftById } from './data.js';
import { EVENTS, eventById } from './events.js';

export const START_YEAR = 2027;
export const WEEKS_PER_YEAR = 52;
export const WEEKS_PER_QUARTER = 13;

const WEEKLY_HOURS = 112; // 16 operating hours a day
const TURN_HOURS = 1; // ground time per landing
const TAXI_HOURS = 0.5; // added to every block time
const LEASE_RATE = 0.0019; // weekly lease as a share of list price
const LEASE_SIGNING_WEEKS = 2; // signing fee, in weeks of lease
const LEASE_RETURN_WEEKS = 6; // early return penalty, in weeks of lease
const BUY_DELIVERY_WEEKS = 4;
const LEASE_DELIVERY_WEEKS = 2;
const HEAVY_CHECK_WEEKS = 2;
const HEAVY_CHECK_COST = 0.015; // share of list price
const ROUTE_OPEN_COST = 250_000;
const HQ_OVERHEAD = 120_000;
const OVERHEAD_PER_AIRCRAFT = 12_000;
const OVERHEAD_PER_STATION = 15_000;
const ANCILLARY_SHARE = 0.08;
const DISTRIBUTION_SHARE = 0.1; // booking fees and commissions
const DEPRECIATION_YEARS = 25;
const SHARES = 10_000_000;
const BASE_FUEL = 0.85; // USD per kg
const BANKRUPT_WEEKS = 6;
const EVENT_CHANCE = 0.14;
const OUTSIDE_OPTION = 0.5; // travellers who drive, take the train, or stay home
const ELASTICITY = 2.4; // how strongly travellers react to fare differences

export const DIFFICULTY = {
  easy: { cash: 90e6, label: 'Easy', demand: 1.1 },
  normal: { cash: 60e6, label: 'Normal', demand: 1.0 },
  hard: { cash: 40e6, label: 'Hard', demand: 0.9 },
};

// ---------------------------------------------------------------------------
// Random numbers (mulberry32, state kept in the save file)

export function rand(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randNormal(state) {
  const u = Math.max(rand(state), 1e-9);
  const v = rand(state);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function pick(state, list) {
  return list[Math.floor(rand(state) * list.length)];
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ---------------------------------------------------------------------------
// Geography & route economics

export function distanceKm(a, b) {
  const ca = typeof a === 'string' ? cityByCode[a] : a;
  const cb = typeof b === 'string' ? cityByCode[b] : b;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(cb.lat - ca.lat);
  const dLon = toRad(cb.lon - ca.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(ca.lat)) * Math.cos(toRad(cb.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)));
}

export function referenceFare(distance) {
  return Math.round(25 + 0.28 * distance ** 0.87);
}

export function blockHours(type, distance) {
  return distance / type.speed + TAXI_HOURS;
}

export function roundTripsPerWeek(type, distance) {
  return Math.floor(WEEKLY_HOURS / (2 * (blockHours(type, distance) + TURN_HOURS)));
}

// Short hops lose travellers to cars and trains; ultra long haul thins out.
function distanceFactor(d) {
  if (d < 250) return 0.15;
  if (d < 800) return 0.15 + (0.85 * (d - 250)) / 550;
  if (d <= 6000) return 1;
  return Math.max(0.55, 1 - (d - 6000) / 14000);
}

// Unconstrained weekly travellers in one direction across all airlines.
export function marketDemand(fromCode, toCode) {
  const a = cityByCode[fromCode];
  const b = cityByCode[toCode];
  const mix = ((a.biz + b.biz) / 2) * 0.6 + ((a.tourism + b.tourism) / 2) * 0.4;
  return 1200 * Math.sqrt(a.pop * b.pop) * mix * distanceFactor(distanceKm(a, b));
}

export function weekOfYear(week) {
  return (week % WEEKS_PER_YEAR) + 1;
}

export function seasonality(week, tourism = 1) {
  const phase = (2 * Math.PI * (weekOfYear(week) - 13)) / WEEKS_PER_YEAR;
  return 1 + 0.12 * tourism * Math.sin(phase);
}

export function dateLabel(week) {
  const year = START_YEAR + Math.floor(week / WEEKS_PER_YEAR);
  const w = weekOfYear(week);
  const q = Math.min(4, Math.floor((w - 1) / WEEKS_PER_QUARTER) + 1);
  return `Week ${w}, Q${q} ${year}`;
}

// ---------------------------------------------------------------------------
// New game

export function newGame({ name = 'Skyward Air', hub = 'ORD', seed, difficulty = 'normal' } = {}) {
  if (!cityByCode[hub]) throw new Error(`Unknown hub ${hub}`);
  const diff = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
  const state = {
    version: 1,
    airline: { name, hub, difficulty },
    week: 0,
    cash: diff.cash,
    rng: (seed ?? Math.floor(Math.random() * 2 ** 31)) | 0,
    nextId: 1,
    fleet: [],
    routes: [],
    loans: [],
    settings: { marketing: 100_000, service: 3, wages: 1.0 },
    reputation: 50,
    morale: 60,
    fuelPrice: BASE_FUEL,
    economy: 1.0,
    shocks: [], // { name, mult, weeks }
    strikeWeeks: 0,
    lowCashWeeks: 0,
    board: { confidence: 60, lastPrice: 0, reviews: 0 },
    history: [],
    log: [],
    pendingEvent: null,
    lastReport: null,
    status: 'playing',
  };
  state.board.lastPrice = sharePrice(state);
  log(state, `${name} is founded with ${CITIES.find((c) => c.code === hub).name} as its hub. The board expects results.`, 'good');
  return state;
}

export function log(state, text, tone = 'info') {
  state.log.unshift({ week: state.week, text, tone });
  if (state.log.length > 200) state.log.length = 200;
}

function newId(state, prefix) {
  return `${prefix}${state.nextId++}`;
}

// ---------------------------------------------------------------------------
// Derived values

export function stations(state) {
  const set = new Set([state.airline.hub]);
  for (const r of state.routes) {
    set.add(r.from);
    set.add(r.to);
  }
  return [...set];
}

export function weeklyLease(type) {
  return type.price * LEASE_RATE;
}

export function isAvailable(state, ac) {
  return ac.deliveryWeek <= state.week && ac.checkUntil <= state.week;
}

export function aircraftValue(ac) {
  const type = aircraftById[ac.type];
  const years = ac.ageWeeks / WEEKS_PER_YEAR;
  return type.price * Math.max(0.15, 0.93 ** years) * (0.7 + (0.3 * ac.condition) / 100);
}

export function totalDebt(state) {
  return state.loans.reduce((s, l) => s + l.principal, 0);
}

export function ownedFleetValue(state) {
  return state.fleet.filter((a) => a.owned).reduce((s, a) => s + aircraftValue(a), 0);
}

export function creditLimit(state) {
  const limit = 25e6 + 0.6 * ownedFleetValue(state) + Math.max(0, recentAnnualProfit(state)) * 2;
  return Math.max(0, limit - totalDebt(state));
}

export function loanRate(state) {
  const equity = Math.max(1, state.cash + ownedFleetValue(state));
  const leverage = totalDebt(state) / equity;
  return clamp(0.055 + leverage * 0.04 + (state.lowCashWeeks > 0 ? 0.03 : 0), 0.055, 0.18);
}

function recentAnnualProfit(state) {
  const recent = state.history.slice(-WEEKS_PER_QUARTER);
  if (!recent.length) return 0;
  return (recent.reduce((s, h) => s + h.profit, 0) / recent.length) * WEEKS_PER_YEAR;
}

export function sharePrice(state) {
  const equity = state.cash + ownedFleetValue(state) - totalDebt(state);
  const earnings = recentAnnualProfit(state);
  const earningsValue = earnings > 0 ? earnings * 8 : earnings * 2;
  const brand = state.reputation * 400_000 + state.routes.length * 1.5e6;
  return Math.max(0.25, (equity + earningsValue + brand) / SHARES);
}

// ---------------------------------------------------------------------------
// Player actions. Each returns { ok: true, ... } or { ok: false, error }.

const fail = (error) => ({ ok: false, error });

export function buyAircraft(state, typeId) {
  const type = aircraftById[typeId];
  if (!type) return fail('Unknown aircraft type');
  if (state.cash < type.price) return fail(`Not enough cash: ${type.name} costs ${money(type.price)}`);
  state.cash -= type.price;
  const ac = addAircraft(state, typeId, { owned: true, deliveryWeek: state.week + BUY_DELIVERY_WEEKS });
  log(state, `Ordered a new ${type.name} (${ac.reg}) for ${money(type.price)}. Delivery in ${BUY_DELIVERY_WEEKS} weeks.`);
  return { ok: true, aircraft: ac };
}

export function leaseAircraft(state, typeId) {
  const type = aircraftById[typeId];
  if (!type) return fail('Unknown aircraft type');
  const fee = weeklyLease(type) * LEASE_SIGNING_WEEKS;
  if (state.cash < fee) return fail(`Not enough cash for the ${money(fee)} signing fee`);
  state.cash -= fee;
  const ac = addAircraft(state, typeId, { owned: false, deliveryWeek: state.week + LEASE_DELIVERY_WEEKS });
  log(state, `Leased a ${type.name} (${ac.reg}) at ${money(weeklyLease(type))}/week. Arrives in ${LEASE_DELIVERY_WEEKS} weeks.`);
  return { ok: true, aircraft: ac };
}

export function addAircraft(state, typeId, { owned, deliveryWeek = state.week, ageWeeks = 0, condition = 100 }) {
  const n = state.nextId++;
  const ac = {
    id: `ac${n}`,
    reg: `N${100 + n}${state.airline.name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'XA'}`,
    type: typeId,
    owned,
    ageWeeks,
    condition,
    routeId: null,
    deliveryWeek,
    checkUntil: 0,
  };
  state.fleet.push(ac);
  return ac;
}

export function sellAircraft(state, acId) {
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac) return fail('No such aircraft');
  const type = aircraftById[ac.type];
  if (ac.owned) {
    const value = aircraftValue(ac);
    state.cash += value;
    log(state, `Sold ${type.name} ${ac.reg} for ${money(value)}.`);
  } else {
    const penalty = ac.deliveryWeek > state.week ? 0 : weeklyLease(type) * LEASE_RETURN_WEEKS;
    state.cash -= penalty;
    log(state, `Returned leased ${type.name} ${ac.reg}${penalty ? ` (penalty ${money(penalty)})` : ''}.`);
  }
  state.fleet = state.fleet.filter((a) => a !== ac);
  return { ok: true };
}

export function heavyCheck(state, acId) {
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac) return fail('No such aircraft');
  if (!isAvailable(state, ac)) return fail('Aircraft is not available');
  const cost = aircraftById[ac.type].price * HEAVY_CHECK_COST;
  if (state.cash < cost) return fail(`Heavy check costs ${money(cost)}`);
  state.cash -= cost;
  ac.condition = 100;
  ac.checkUntil = state.week + HEAVY_CHECK_WEEKS;
  log(state, `${ac.reg} entered a heavy maintenance check (${money(cost)}).`);
  return { ok: true };
}

export function canFly(ac, route) {
  return aircraftById[ac.type].range >= route.distance;
}

export function assignAircraft(state, acId, routeId) {
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac) return fail('No such aircraft');
  if (routeId == null) {
    ac.routeId = null;
    return { ok: true };
  }
  const route = state.routes.find((r) => r.id === routeId);
  if (!route) return fail('No such route');
  if (!canFly(ac, route)) return fail(`${aircraftById[ac.type].name} cannot reach ${route.distance.toLocaleString()} km`);
  ac.routeId = routeId;
  return { ok: true };
}

export function routeOpenCost(from, to) {
  const a = cityByCode[from];
  const b = cityByCode[to];
  return ROUTE_OPEN_COST * ((a.fee + b.fee) / 2);
}

export function openRoute(state, from, to) {
  if (!cityByCode[from] || !cityByCode[to]) return fail('Unknown airport');
  if (from === to) return fail('Pick two different airports');
  const served = new Set(stations(state));
  if (!served.has(from) && !served.has(to)) return fail('One end of a new route must be an airport you already serve');
  if (state.routes.some((r) => (r.from === from && r.to === to) || (r.from === to && r.to === from))) {
    return fail('You already fly this route');
  }
  const cost = routeOpenCost(from, to);
  if (state.cash < cost) return fail(`Opening this route costs ${money(cost)}`);
  state.cash -= cost;
  const distance = distanceKm(from, to);
  const a = cityByCode[from];
  const b = cityByCode[to];
  const ref = referenceFare(distance);
  const competitors = clamp(Math.round((a.hub + b.hub) / 3 + (rand(state) * 2 - 1)), 0, 5);
  const route = {
    id: newId(state, 'rt'),
    from,
    to,
    distance,
    fare: ref,
    competitors,
    compFare: Math.round(ref * (0.9 + rand(state) * 0.2)),
    openedWeek: state.week,
    last: null,
  };
  state.routes.push(route);
  log(state, `Opened ${from}–${to} (${distance.toLocaleString()} km, ${competitors} competitor${competitors === 1 ? '' : 's'}) for ${money(cost)}.`);
  return { ok: true, route };
}

export function closeRoute(state, routeId) {
  const route = state.routes.find((r) => r.id === routeId);
  if (!route) return fail('No such route');
  for (const ac of state.fleet) if (ac.routeId === routeId) ac.routeId = null;
  state.routes = state.routes.filter((r) => r !== route);
  log(state, `Closed ${route.from}–${route.to}.`, 'bad');
  return { ok: true };
}

export function setFare(state, routeId, fare) {
  const route = state.routes.find((r) => r.id === routeId);
  if (!route) return fail('No such route');
  const ref = referenceFare(route.distance);
  route.fare = Math.round(clamp(Number(fare) || ref, ref * 0.3, ref * 3));
  return { ok: true, fare: route.fare };
}

export function updateSettings(state, patch) {
  const s = state.settings;
  if (patch.marketing != null) s.marketing = clamp(Math.round(Number(patch.marketing) || 0), 0, 5e6);
  if (patch.service != null) s.service = clamp(Math.round(Number(patch.service)), 1, 5);
  if (patch.wages != null) {
    const wages = clamp(Number(patch.wages), 0.7, 1.5);
    if (wages < s.wages - 0.001) {
      state.morale = clamp(state.morale - (s.wages - wages) * 80, 0, 100);
      log(state, 'Staff are furious about the pay cut.', 'bad');
    }
    s.wages = Math.round(wages * 100) / 100;
  }
  return { ok: true };
}

export function takeLoan(state, amount) {
  amount = Math.round(Number(amount));
  if (!(amount > 0)) return fail('Enter a positive amount');
  const limit = creditLimit(state);
  if (amount > limit) return fail(`Banks will lend at most ${money(limit)} right now`);
  const rate = loanRate(state);
  const weeks = 5 * WEEKS_PER_YEAR;
  const r = rate / WEEKS_PER_YEAR;
  const payment = (amount * r) / (1 - (1 + r) ** -weeks);
  const loan = { id: newId(state, 'ln'), principal: amount, original: amount, rate, payment, weeksLeft: weeks };
  state.loans.push(loan);
  state.cash += amount;
  log(state, `Borrowed ${money(amount)} at ${(rate * 100).toFixed(1)}% over 5 years.`);
  return { ok: true, loan };
}

export function repayLoan(state, loanId) {
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan) return fail('No such loan');
  if (state.cash < loan.principal) return fail(`Repaying needs ${money(loan.principal)}`);
  state.cash -= loan.principal;
  state.loans = state.loans.filter((l) => l !== loan);
  log(state, `Repaid a ${money(loan.original)} loan early.`, 'good');
  return { ok: true };
}

export function resolveEvent(state, choiceIndex) {
  const pending = state.pendingEvent;
  if (!pending) return fail('No event to resolve');
  const def = eventById[pending.id];
  const choice = pending.choices[choiceIndex];
  if (!choice) return fail('Invalid choice');
  if (choice.disabled) return fail('That option is not available');
  const message = def.resolve(state, choiceIndex, pending.data, helpers) ?? '';
  state.pendingEvent = null;
  if (message) log(state, `${pending.title}: ${message}`, choice.tone ?? 'info');
  return { ok: true, message };
}

// ---------------------------------------------------------------------------
// Weekly simulation

function aircraftOnRoute(state, route) {
  return state.fleet.filter((a) => a.routeId === route.id && isAvailable(state, a));
}

function demandMultiplier(state) {
  const shocks = state.shocks.reduce((m, s) => m * s.mult, 1);
  return state.economy * shocks * (DIFFICULTY[state.airline.difficulty]?.demand ?? 1);
}

function marketingEffect(state) {
  const scale = 50_000 * Math.max(1, state.routes.length);
  return 1 + 0.25 * (1 - Math.exp(-state.settings.marketing / scale));
}

// Forecast/actual results for one route this week. Pure apart from `noise`.
export function simulateRoute(state, route, noise = 1) {
  const planes = aircraftOnRoute(state, route);
  const service = SERVICE_LEVELS[state.settings.service - 1];
  const a = cityByCode[route.from];
  const b = cityByCode[route.to];
  const ref = referenceFare(route.distance);

  let roundTrips = 0;
  let seatsPerDir = 0;
  const cost = { fuel: 0, crew: 0, maintenance: 0, fees: 0, service: 0, distribution: 0 };
  const flightsByPlane = planes.map((ac) => {
    const type = aircraftById[ac.type];
    const trips = roundTripsPerWeek(type, route.distance);
    roundTrips += trips;
    seatsPerDir += trips * type.seats;
    return { ac, type, trips };
  });

  const strike = state.strikeWeeks > 0 ? 0.3 : 1;
  roundTrips *= strike;
  seatsPerDir *= strike;

  // Our appeal against competitors.
  const priceEffect = (route.fare / ref) ** -ELASTICITY;
  const repEffect = 0.5 + state.reputation / 100;
  const freqEffect = clamp(0.4 + 0.6 * Math.sqrt(roundTrips / 14), 0.4, 1.4);
  // Beyond what travellers on this route will tolerate, demand falls off a cliff.
  const ceiling = 1.05 + 0.15 * ((a.biz + b.biz) / 2);
  const gouge = Math.exp(-Math.max(0, route.fare / ref - ceiling) * 5);
  const ours = gouge * priceEffect * repEffect * service.appeal * freqEffect * marketingEffect(state);
  const theirs = route.competitors * (route.compFare / ref) ** -ELASTICITY;
  const share = roundTrips > 0 ? ours / (ours + theirs + OUTSIDE_OPTION) : 0;

  const season = seasonality(state.week, (a.tourism + b.tourism) / 2);
  const market = marketDemand(route.from, route.to) * season * demandMultiplier(state);
  const demandPerDir = market * share * noise;
  const paxPerDir = Math.min(demandPerDir, seatsPerDir);
  const pax = Math.round(paxPerDir * 2);
  const seats = Math.round(seatsPerDir * 2);

  const feeMult = (a.fee + b.fee) / 2;
  const lf = seats ? pax / seats : 0;
  for (const { ac, type, trips } of flightsByPlane) {
    const flights = trips * 2 * strike;
    const hours = flights * blockHours(type, route.distance);
    const aging = 1 + (ac.ageWeeks / WEEKS_PER_YEAR) * 0.03 + (100 - ac.condition) * 0.004;
    cost.fuel += flights * type.burn * route.distance * state.fuelPrice;
    cost.crew += hours * type.crewHr * state.settings.wages;
    cost.maintenance += hours * type.mxHr * aging;
    cost.fees += flights * type.seats * 6 * feeMult + flights * type.seats * lf * 10 * feeMult;
  }
  cost.service = pax * service.costPerPax * (1 + route.distance / 3000);

  const tickets = pax * route.fare;
  const revenue = tickets * (1 + ANCILLARY_SHARE);
  cost.distribution = revenue * DISTRIBUTION_SHARE;
  const directCost = Object.values(cost).reduce((s, x) => s + x, 0);
  return {
    aircraft: planes.length,
    roundTrips,
    seats,
    demand: Math.round(demandPerDir * 2),
    pax,
    loadFactor: lf,
    share,
    revenue,
    cost,
    directCost,
    contribution: revenue - directCost,
  };
}

export function advanceWeek(state) {
  if (state.status !== 'playing') return fail('The game is over');
  if (state.pendingEvent) return fail('Resolve the current event first');

  state.week += 1;
  const report = {
    week: state.week,
    revenue: 0,
    cost: { fuel: 0, crew: 0, maintenance: 0, fees: 0, service: 0, distribution: 0, leases: 0, marketing: 0, overhead: 0, interest: 0, depreciation: 0 },
    pax: 0,
    seats: 0,
    routes: {},
  };

  // Macro environment.
  state.fuelPrice = clamp(state.fuelPrice + (BASE_FUEL - state.fuelPrice) * 0.04 + randNormal(state) * 0.025, 0.45, 1.9);
  state.economy = clamp(state.economy + (1 - state.economy) * 0.05 + randNormal(state) * 0.01, 0.8, 1.2);

  // Deliveries.
  for (const ac of state.fleet) {
    if (ac.deliveryWeek === state.week) log(state, `${aircraftById[ac.type].name} ${ac.reg} has been delivered.`, 'good');
    if (ac.checkUntil === state.week) log(state, `${ac.reg} is back from its heavy check.`);
  }

  // Routes.
  for (const route of state.routes) {
    const res = simulateRoute(state, route, clamp(1 + randNormal(state) * 0.06, 0.8, 1.2));
    route.last = res;
    report.routes[route.id] = res;
    report.revenue += res.revenue;
    report.pax += res.pax;
    report.seats += res.seats;
    for (const k of Object.keys(res.cost)) report.cost[k] += res.cost[k];
    // Competitors slowly react to our fares, but only within a band around the market rate.
    const ref = referenceFare(route.distance);
    const target = clamp(route.fare, ref * 0.85, ref * 1.15);
    route.compFare = Math.round(route.compFare + (target - route.compFare) * 0.03);
  }

  // Fleet costs and wear.
  const delivered = state.fleet.filter((a) => a.deliveryWeek <= state.week);
  for (const ac of delivered) {
    const type = aircraftById[ac.type];
    ac.ageWeeks += 1;
    const flying = ac.routeId && isAvailable(state, ac);
    ac.condition = clamp(ac.condition - (flying ? 0.35 : 0.1), 0, 100);
    if (ac.owned) report.cost.depreciation += type.price / (DEPRECIATION_YEARS * WEEKS_PER_YEAR);
    else report.cost.leases += weeklyLease(type);
  }

  report.cost.marketing = state.settings.marketing;
  report.cost.overhead =
    HQ_OVERHEAD + delivered.length * OVERHEAD_PER_AIRCRAFT + (stations(state).length - 1) * OVERHEAD_PER_STATION;

  // Loans.
  let principalPaid = 0;
  for (const loan of state.loans) {
    const interest = (loan.principal * loan.rate) / WEEKS_PER_YEAR;
    const principal = Math.min(loan.principal, loan.payment - interest);
    report.cost.interest += interest;
    principalPaid += principal;
    loan.principal -= principal;
    loan.weeksLeft -= 1;
  }
  const finished = state.loans.filter((l) => l.weeksLeft <= 0 || l.principal < 1);
  if (finished.length) {
    state.loans = state.loans.filter((l) => !finished.includes(l));
    log(state, `Paid off ${finished.length} loan${finished.length > 1 ? 's' : ''}.`, 'good');
  }

  report.totalCost = Object.values(report.cost).reduce((s, x) => s + x, 0);
  report.profit = report.revenue - report.totalCost;
  report.loadFactor = report.seats ? report.pax / report.seats : 0;
  state.cash += report.revenue - (report.totalCost - report.cost.depreciation) - principalPaid;

  // Reputation and morale drift toward targets.
  const service = SERVICE_LEVELS[state.settings.service - 1];
  const avgCondition = delivered.length ? delivered.reduce((s, a) => s + a.condition, 0) / delivered.length : 100;
  const repTarget =
    service.rep + (state.morale - 60) * 0.25 - Math.max(0, 70 - avgCondition) * 0.6 + (marketingEffect(state) - 1) * 40;
  state.reputation = clamp(state.reputation + (repTarget - state.reputation) * 0.06, 0, 100);
  const moraleTarget = 60 + (state.settings.wages - 1) * 120 + (report.profit > 0 ? 5 : -5) - (state.strikeWeeks > 0 ? 10 : 0);
  state.morale = clamp(state.morale + (moraleTarget - state.morale) * 0.08, 0, 100);

  // Timers.
  if (state.strikeWeeks > 0 && --state.strikeWeeks === 0) log(state, 'The strike is over and crews are back at work.', 'good');
  for (const s of state.shocks) s.weeks -= 1;
  for (const s of state.shocks.filter((s) => s.weeks <= 0)) log(state, `${s.name} has ended.`);
  state.shocks = state.shocks.filter((s) => s.weeks > 0);

  // Spontaneous strike when morale collapses.
  if (state.morale < 25 && state.strikeWeeks === 0 && rand(state) < 0.15) {
    state.strikeWeeks = 2;
    log(state, 'Unhappy staff have walked out! Operations cut to 30% for 2 weeks.', 'bad');
  }

  report.cash = state.cash;
  report.sharePrice = 0;
  state.history.push({
    week: state.week,
    revenue: report.revenue,
    cost: report.totalCost,
    profit: report.profit,
    cash: state.cash,
    pax: report.pax,
    loadFactor: report.loadFactor,
    sharePrice: 0,
  });
  if (state.history.length > 520) state.history.shift();
  const price = sharePrice(state);
  report.sharePrice = price;
  state.history[state.history.length - 1].sharePrice = price;
  state.lastReport = report;

  if (state.week % WEEKS_PER_QUARTER === 0) boardReview(state);

  // Solvency.
  state.lowCashWeeks = state.cash < 0 ? state.lowCashWeeks + 1 : 0;
  if (state.lowCashWeeks === 1) log(state, 'Cash is negative! Raise money within 6 weeks or face bankruptcy.', 'bad');
  if (state.lowCashWeeks >= BANKRUPT_WEEKS) {
    state.status = 'bankrupt';
    log(state, `${state.airline.name} has filed for bankruptcy.`, 'bad');
  }

  if (state.status === 'playing' && rand(state) < EVENT_CHANCE) triggerEvent(state);
  return { ok: true, report };
}

function boardReview(state) {
  const quarter = state.history.slice(-WEEKS_PER_QUARTER);
  const qProfit = quarter.reduce((s, h) => s + h.profit, 0);
  const price = sharePrice(state);
  const change = (price - state.board.lastPrice) / state.board.lastPrice;
  let delta = clamp(change * 60, -15, 15) + (qProfit > 0 ? 6 : -6) + (state.reputation > 60 ? 2 : 0);
  if (state.board.reviews < 4 && delta < 0) delta /= 2; // startup honeymoon
  state.board.reviews += 1;
  state.board.confidence = clamp(state.board.confidence + delta, 0, 100);
  state.board.lastPrice = price;
  const mood = delta >= 0 ? 'pleased' : 'concerned';
  log(
    state,
    `Board review: the board is ${mood}. Quarterly profit ${money(qProfit)}, share price ${change >= 0 ? 'up' : 'down'} ${Math.abs(change * 100).toFixed(1)}%. Confidence now ${Math.round(state.board.confidence)}.`,
    delta >= 0 ? 'good' : 'bad',
  );
  if (state.board.confidence <= 0) {
    state.status = 'fired';
    log(state, 'The board has voted to remove you as CEO.', 'bad');
  }
}

export function triggerEvent(state, id) {
  const eligible = id ? [eventById[id]] : EVENTS.filter((e) => !e.canTrigger || e.canTrigger(state));
  if (!eligible.length) return null;
  const total = eligible.reduce((s, e) => s + (e.weight ?? 1), 0);
  let roll = rand(state) * total;
  let def = eligible[eligible.length - 1];
  for (const e of eligible) {
    roll -= e.weight ?? 1;
    if (roll <= 0) {
      def = e;
      break;
    }
  }
  const built = def.build(state, helpers);
  state.pendingEvent = { id: def.id, week: state.week, ...built };
  return state.pendingEvent;
}

// Tools handed to event definitions so they don't import the engine (avoids a cycle).
const helpers = { rand, pick, log, money, clamp, addAircraft, referenceFare };

// ---------------------------------------------------------------------------

export function money(x) {
  const sign = x < 0 ? '-' : '';
  const v = Math.abs(x);
  if (v >= 1e9) return `${sign}$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${sign}$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${sign}$${(v / 1e3).toFixed(0)}K`;
  return `${sign}$${v.toFixed(0)}`;
}

export { CITIES, AIRCRAFT, SERVICE_LEVELS, cityByCode, aircraftById };
