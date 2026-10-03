// Scenarios: preset starting positions with goals, a deadline and a score.
// Free play keeps the normal open-ended game (with a running score).

import { aircraftById, seatCount } from '../data/aircraft.js';
import { ROLE_IDS } from '../data/business.js';
import { airportByCode } from '../data/airports.js';
import { clamp, sum, ok, fail, log, money, yearOf, weekOfYearStart, randInt } from './core.js';
import { makeAircraft, monthlyLeaseRate, typeOf } from './fleet.js';
import { openRoute, setFrequency, maxFrequency, canOperate, routeFreq, stations, routeCapacity } from './network.js';
import { staffRequirements, addToGrade, newWorkforce } from './staff.js';
import { loanRateFor } from './finance.js';
import { rivalDef, marketNow } from './market.js';
import { routesForAircraft } from './fit.js';
import { autoAssign } from './advisor.js';

const yearProfit = (s, y) => sum(s.history.filter((h) => yearOf(h.week) === y), (h) => h.profit);
const lastYearPax = (s) => sum(s.history.slice(-52), (h) => h.pax);
const ratingAtLeast = (s, r) => ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'].indexOf(s.finance.rating) <= ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'].indexOf(r);
const regions = (s) => new Set(stations(s).map((c) => airportByCode[c].region)).size;
const intercontinental = (s) => s.routes.filter((r) => airportByCode[r.a].region !== airportByCode[r.b].region).length;

export const SCENARIOS = {
  oil73: {
    name: 'Survive the oil shock',
    blurb: 'Chicago, January 1973. You run a mid-sized trunk carrier of thirsty 707s, 727s and DC-9s — and in October the Arab oil embargo will quadruple fuel prices. Keep the airline solvent and the board on side until 1977.',
    year: 1973, hub: 'ORD', airline: { name: 'Lakeshore Airlines', code: 'LK', color: '#e5484d' }, difficulty: 'normal', cash: 30e6,
    fleet: [['b727', 6, 5], ['dc9', 6, 4], ['b707', 3, 9]],
    routes: ['EWR', 'BOS', 'DEN', 'LAX', 'SFO', 'MIA', 'ATL', 'MSP', 'DTW', 'PHL', 'DFW', 'SEA', 'IAH'],
    loans: 90e6, rep: 55,
    timeline: [{ year: 1973, month: 10, event: 'oil_embargo', severity: 1.2 }],
    deadline: 1977,
    goals: [
      { id: 'alive', label: 'Still flying on 1 January 1977', test: (s) => s.status === 'playing', final: true },
      { id: 'rating', label: 'Credit rating B or better', test: (s) => ratingAtLeast(s, 'B'), final: true },
      { id: 'profit76', label: 'A profitable 1976', test: (s) => yearProfit(s, 1976) > 0, final: true },
    ],
  },
  flag92: {
    name: 'Rescue the flag carrier',
    blurb: 'Athens, 1992. The state airline is bankrupt in all but name: an ageing fleet, overstaffed, deep in debt and loved by no one. The government gives you five years to make it profitable and investment-grade-ish before it pulls the plug.',
    year: 1992, hub: 'ATH', airline: { name: 'Hellenic Airways', code: 'HA', color: '#4da3ff' }, difficulty: 'normal', cash: 70e6,
    fleet: [['b732', 8, 18], ['b727', 4, 20], ['a300', 3, 15], ['b742', 2, 18]],
    routes: ['LHR', 'CDG', 'FRA', 'FCO', 'MUC', 'AMS', 'ZRH', 'JFK', 'TLV', 'CAI', 'IST', 'BRU', 'MAD', 'VIE'],
    loans: 220e6, rep: 32, overstaff: 0.3, morale: 35, union: 0.75, rating: 'CCC', defunct: ['OA'],
    deadline: 1997,
    goals: [
      { id: 'profit', label: 'A profitable calendar year', test: (s) => s.annual?.some((a) => a.profit > 0 && a.year >= 1992) },
      { id: 'rating', label: 'Credit rating BB or better', test: (s) => ratingAtLeast(s, 'BB') },
      { id: 'rep', label: 'Reputation 55+', test: (s) => s.reputation >= 55 },
    ],
  },
  lcc05: {
    name: 'Build a low-cost carrier',
    blurb: 'Berlin, 2005. Europe is open, the 737-800 is cheap to lease and everyone wants a €19 fare. Start with three jets and build a pan-European low-cost network.',
    year: 2005, hub: 'BER', airline: { name: 'Zipp', code: 'ZP', color: '#f5a524', model: 'lcc' }, difficulty: 'normal', cash: 100e6,
    fleet: [['b738', 8, 4]],
    routes: ['BCN', 'FCO', 'MAD', 'LIS', 'ATH', 'NAP', 'BUD', 'AYT'],
    fareIdx: 0.8,
    deadline: 2011,
    goals: [
      { id: 'fleet', label: 'Fleet of 40 aircraft', test: (s) => s.fleet.length >= 40 },
      { id: 'routes', label: '30 routes', test: (s) => s.routes.length >= 30 },
      { id: 'pax', label: '5 million passengers in a year', test: (s) => lastYearPax(s) >= 5e6 },
    ],
  },
  panam65: {
    name: 'Become Pan Am',
    blurb: 'New York, 1965. Juan Trippe’s Pan Am rules the world’s skies. Build an intercontinental network across six continents, order the jumbo jet, and overtake the Clipper fleet by 1980.',
    year: 1965, hub: 'JFK', airline: { name: 'Transglobal Airways', code: 'TG', color: '#30a46c' }, difficulty: 'normal', cash: 160e6,
    fleet: [['b707', 6, 2]],
    routes: ['LHR', 'CDG', 'FRA', 'MIA'],
    deadline: 1980,
    goals: [
      { id: 'regions', label: 'Serve 6 world regions', test: (s) => regions(s) >= 6 },
      { id: 'intercont', label: '25 intercontinental routes', test: (s) => intercontinental(s) >= 25 },
      { id: 'jumbos', label: '5 jumbo jets', test: (s) => s.fleet.filter((a) => typeOf(a).cat === 'jumbo').length >= 5 },
      { id: 'bigger', label: 'A bigger fleet than Pan Am', test: (s) => s.rivals.PA?.status !== 'active' || s.fleet.length > (s.rivals.PA?.fleet ?? 0) },
    ],
  },
  gulf95: {
    name: 'Gulf super-connector',
    blurb: 'Abu Dhabi, 1995. Sit between Europe, Asia and Africa and connect the world through your hub. Turn a regional airline into a global connector by 2010.',
    year: 1995, hub: 'AUH', airline: { name: 'Falcon Gulf', code: 'FG', color: '#8e4ec6' }, difficulty: 'normal', cash: 250e6,
    fleet: [['a306', 3, 6], ['a320c', 4, 4]],
    routes: ['LHR', 'BOM', 'DEL', 'BKK', 'CAI', 'DOH'],
    deadline: 2010,
    goals: [
      { id: 'routes', label: '40 routes', test: (s) => s.routes.length >= 40 },
      { id: 'regions', label: 'Serve 5 world regions', test: (s) => regions(s) >= 5 },
      { id: 'connect', label: 'Half of passengers connecting', test: (s) => (s.lastReport?.pax ?? 0) > 2e4 && s.lastReport.connecting / s.lastReport.pax >= 0.5 },
      { id: 'profit', label: 'Profitable over the last 12 months', test: (s) => s.history.length >= 52 && sum(s.history.slice(-52), (h) => h.profit) > 0 },
    ],
  },
  dereg78: {
    name: 'Deregulation dash',
    blurb: 'Nashville, 1978. The Airline Deregulation Act is about to tear up the rulebook: anyone can fly anywhere at any fare. Turn a sleepy local carrier into a national airline before the giants wake up.',
    year: 1978, hub: 'BNA', airline: { name: 'Music City Air', code: 'MC', color: '#e93d82' }, difficulty: 'normal', cash: 80e6,
    fleet: [['dc9', 4, 8], ['b727', 2, 10]],
    routes: ['ATL', 'ORD', 'DFW', 'MEM', 'CLT', 'MCO'],
    timeline: [{ year: 1978, month: 10, event: 'deregulation', severity: 1 }],
    deadline: 1985,
    goals: [
      { id: 'routes', label: '30 routes', test: (s) => s.routes.length >= 30 },
      { id: 'fleet', label: 'Fleet of 30 aircraft', test: (s) => s.fleet.length >= 30 },
      { id: 'profit', label: 'A profitable 1984', test: (s) => yearProfit(s, 1984) > 0, final: true },
    ],
  },
  concorde76: {
    name: 'Supersonic flagship',
    blurb: 'London, 1976. You have just taken delivery of two Concordes — the most glamorous and least economic airliners ever built. Keep the supersonic flag flying, make the airline the most admired in the world, and still turn a profit.',
    year: 1976, hub: 'LHR', airline: { name: 'Britannic Airways', code: 'BR', color: '#12a594' }, difficulty: 'normal', cash: 220e6,
    fleet: [['concorde', 2, 0], ['b742', 1, 4], ['b707', 2, 10], ['b732', 4, 5]],
    routes: ['JFK', 'DXB', 'CAI', 'BOS', 'CDG', 'FRA', 'AMS', 'MAD'],
    rep: 62, deadline: 1981,
    goals: [
      { id: 'sst', label: 'Still flying two or more Concordes', test: (s) => s.fleet.filter((a) => typeOf(a).cat === 'sst' && !a.retired).length >= 2, final: true },
      { id: 'rep', label: 'Reputation 75+', test: (s) => s.reputation >= 75 },
      { id: 'profit', label: 'A profitable calendar year', test: (s) => s.annual?.some((a) => a.profit > 0) },
    ],
  },
  pandemic19: {
    name: 'Pandemic winter',
    blurb: 'Seattle, 2019. Business is booming and the order book is full. In March 2020 a pandemic will empty the skies. Survive it without losing the airline — or your reputation.',
    year: 2019, hub: 'SEA', airline: { name: 'Cascade Airlines', code: 'CS', color: '#30a46c' }, difficulty: 'normal', cash: 120e6,
    fleet: [['a320n', 6, 2], ['b38m', 4, 1], ['b789', 3, 3]],
    routes: ['LAX', 'SFO', 'DEN', 'ORD', 'JFK', 'HNL', 'LAS', 'PHX', 'BOS', 'NRT', 'ICN'],
    loans: 120e6, rep: 60,
    timeline: [{ year: 2020, month: 3, event: 'pandemic', severity: 1.3 }],
    deadline: 2024,
    goals: [
      { id: 'alive', label: 'Still flying on 1 January 2024', test: (s) => s.status === 'playing', final: true },
      { id: 'rating', label: 'Credit rating B or better', test: (s) => ratingAtLeast(s, 'B'), final: true },
      { id: 'rep', label: 'Reputation 55+', test: (s) => s.reputation >= 55, final: true },
    ],
  },
  asia90: {
    name: 'Asian tiger',
    blurb: 'Singapore, 1990. Asia is the fastest-growing aviation market on earth. Build a network spanning the continents from the crossroads of Asia — and weather the 1997 financial crisis on the way.',
    year: 1990, hub: 'SIN', airline: { name: 'Lion City Airways', code: 'LC', color: '#e5484d' }, difficulty: 'normal', cash: 200e6,
    fleet: [['a306', 4, 2], ['b744', 2, 0], ['a320c', 4, 1]],
    routes: ['BKK', 'KUL', 'HKG', 'CGK', 'MNL', 'TPE', 'BOM', 'SYD'],
    timeline: [{ year: 1997, month: 7, event: 'asian_crisis', severity: 1.2 }],
    deadline: 2005,
    goals: [
      { id: 'routes', label: '50 routes', test: (s) => s.routes.length >= 50 },
      { id: 'regions', label: 'Serve 5 world regions', test: (s) => regions(s) >= 5 },
      { id: 'fleet', label: 'Fleet of 60 aircraft', test: (s) => s.fleet.length >= 60 },
    ],
  },
  outback12: {
    name: 'Outback and islands',
    blurb: 'Brisbane, 2012. Mining towns, outback communities and Pacific islands need air links, and nobody else wants to fly turboprops to them. Build a regional network that pays.',
    year: 2012, hub: 'BNE', airline: { name: 'Southern Cross Regional', code: 'SX', color: '#f5a524' }, difficulty: 'normal', cash: 120e6,
    fleet: [['dhc6s4', 2, 1], ['q400', 3, 3], ['atr72', 2, 2]],
    routes: ['CNS', 'SYD', 'MEL', 'ADL', 'ASP', 'AYQ'],
    deadline: 2018,
    goals: [
      { id: 'routes', label: '20 routes', test: (s) => s.routes.length >= 20 },
      { id: 'pax', label: '1 million passengers in a year', test: (s) => lastYearPax(s) >= 1e6 },
      { id: 'profit', label: 'Profitable over the last 12 months', test: (s) => s.history.length >= 52 && sum(s.history.slice(-52), (h) => h.profit) > 0 },
    ],
  },
  lcclong15: {
    name: 'Low-cost long-haul',
    blurb: 'Oslo, 2015. Fuel-efficient 787s make it possible to sell transatlantic seats for the price of a train ticket. Many have tried; most have failed. Build a profitable low-cost long-haul airline.',
    year: 2015, hub: 'OSL', airline: { name: 'Aurora Long-Haul', code: 'AU', color: '#8e4ec6', model: 'lcc' }, difficulty: 'normal', cash: 260e6,
    fleet: [['b789', 3, 1], ['b38m', 4, 0]],
    routes: ['JFK', 'LAX', 'BKK', 'BCN', 'LGW', 'FCO', 'AGP', 'PMI'],
    fareIdx: 0.8, deadline: 2020,
    goals: [
      { id: 'intercont', label: '15 intercontinental routes', test: (s) => intercontinental(s) >= 15 },
      { id: 'wide', label: '15 widebodies', test: (s) => s.fleet.filter((a) => ['wide', 'jumbo'].includes(typeOf(a).cat)).length >= 15 },
      { id: 'profit', label: 'Profitable over the last 12 months', test: (s) => s.history.length >= 52 && sum(s.history.slice(-52), (h) => h.profit) > 0 },
    ],
  },
};

const SCORE_PER_GOAL = 1000;

// Applied to a fresh game made by newGame() with the scenario's year and hub.
export function setupScenario(state, id) {
  const sc = SCENARIOS[id];
  if (!sc) throw new Error(`Unknown scenario ${id}`);
  const hub = sc.hub;
  state.cash = sc.cash;
  for (const code of sc.defunct ?? []) state.rivals[code] = { status: 'defunct' };
  // Routes (launch costs are part of the inheritance).
  const cash = state.cash;
  state.cash = Infinity;
  for (const to of sc.routes) {
    const res = openRoute(state, hub, to);
    if (!res.ok) log(state, `Scenario route ${hub}–${to} unavailable: ${res.error}`, 'info');
  }
  state.cash = cash;
  state.ledgerCapex.other = 0;
  if (sc.fareIdx) for (const r of state.routes) for (const c of Object.keys(r.fares)) r.fares[c] = Math.round(r.fares[c] * sc.fareIdx);
  // Fleet: half owned, half on lease, of the given age.
  let n = 0;
  for (const [type, count, age] of sc.fleet) {
    const t = aircraftById[type];
    for (let i = 0; i < count; i++) {
      const owned = n++ % 2 === 0;
      const ageY = Math.max(0, Math.min(age + randInt(state, -2, 2), state.startYear - t.intro));
      const monthly = monthlyLeaseRate(state, t, ageY);
      makeAircraft(state, type, {
        owned, ageWeeks: ageY * 52, price: owned ? t.price * 0.94 ** ageY : 0, reliability: clamp(95 - ageY * 1.2, 65, 95),
        lease: owned ? null : { lessor: 'Legacy lessor', monthly, startWeek: state.week, endWeek: state.week + randInt(state, 156, 420), deposit: 0 },
      });
    }
  }
  // Inherited slot holdings at congested airports on the network.
  for (const r of state.routes) {
    for (const code of [r.a, r.b]) {
      const ap = airportByCode[code];
      if (ap.slots) state.slots[code] = { held: (state.slots[code]?.held ?? 0) + 14, pool: state.slots[code]?.pool ?? 6 };
    }
  }
  // Schedule: biggest aircraft first, each onto the route where it earns most
  // (sized to demand), falling back to the least-bad route.
  const bySize = [...state.fleet].sort((a, b) => seatCount(b.config) - seatCount(a.config));
  for (const ac of bySize) {
    const options = routesForAircraft(state, ac, { includeNew: false, limit: 20 });
    // Profitable routes first; then unserved ones; then whatever covers the most
    // of its costs (an inherited aircraft is paid for whether it flies or not).
    const rest = options.filter((x) => x.profit <= 0 && x.served).sort((x, y) => y.profit + (y.costs?.ownership ?? 0) - (x.profit + (x.costs?.ownership ?? 0)));
    for (const pick of [...options.filter((x) => x.profit > 0), ...options.filter((x) => x.profit <= 0 && !x.served), ...rest]) {
      const r = state.routes.find((x) => x.id === pick.routeId);
      if (autoAssign(state, ac, r, Math.min(maxFrequency(state, ac, r), Math.max(pick.freq, 3))).ok) break;
    }
  }
  // Staff for the operation (plus any legacy overstaffing).
  const req = staffRequirements(state);
  for (const role of ROLE_IDS) {
    const want = Math.round(req[role] * 1.08 * (1 + (sc.overstaff ?? 0)));
    state.staff[role] = newWorkforce(state, role, want);
    if (sc.morale) state.staff[role].morale = sc.morale;
    if (sc.union) state.staff[role].union = { ...state.staff[role].union, recognized: true, strength: sc.union };
  }
  if (sc.loans) {
    const rate = loanRateFor(state, 'term');
    const r = rate / 52;
    state.loans.push({ id: `ln${state.nextId++}`, kind: 'term', principal: sc.loans, original: sc.loans, rate, payment: (sc.loans * r) / (1 - (1 + r) ** -520), weeksLeft: 520 });
  }
  if (sc.rep != null) state.reputation = sc.rep;
  if (sc.rating) state.finance.rating = sc.rating;
  if (sc.service) state.service = { ...sc.service };
  if (sc.marketing != null) state.marketing = sc.marketing;
  for (const t of sc.timeline ?? []) {
    const week = weekOfYearStart(t.year) + Math.round(((t.month - 1) * 52) / 12);
    state.timeline = state.timeline.filter((x) => x.event !== t.event);
    state.timeline.push({ week, event: t.event, severity: t.severity });
    state.timeline.sort((a, b) => a.week - b.week);
  }
  state.scenario = { id, name: sc.name, deadlineWeek: weekOfYearStart(sc.deadline), met: {}, status: 'active', score: 0 };
  state.board.confidence = 55;
  log(state, `Scenario: ${sc.name}. ${sc.goals.map((g) => g.label).join('; ')} — by ${sc.deadline}.`, 'info', 'board');
  return state;
}

export function scenarioGoals(state) {
  const sc = SCENARIOS[state.scenario?.id];
  if (!sc) return [];
  return sc.goals.map((g) => ({ ...g, met: !!state.scenario.met[g.id] || (!g.final && g.test(state)), now: g.test(state) }));
}

// Running score for any game: profit, growth, reputation and milestones.
export function freeScore(state) {
  return Math.max(0, Math.round(state.stats.profit / 1e6 + state.stats.pax / 1e5 + state.reputation * 10 + (state.milestones?.length ?? 0) * 50 + state.fleet.length * 5));
}

// Monthly: lock in goals as they are met; win when all are, lose at the deadline.
export function scenarioTick(state) {
  const sc = SCENARIOS[state.scenario?.id];
  if (!sc || state.scenario.status !== 'active') return;
  for (const g of sc.goals) if (!g.final && !state.scenario.met[g.id] && g.test(state)) {
    state.scenario.met[g.id] = state.week;
    log(state, `Scenario goal achieved: ${g.label}.`, 'good', 'board');
  }
  const atDeadline = state.week >= state.scenario.deadlineWeek;
  if (atDeadline) for (const g of sc.goals) if (g.final && g.test(state)) state.scenario.met[g.id] = state.week;
  const all = sc.goals.every((g) => state.scenario.met[g.id]);
  if (all && (atDeadline || !sc.goals.some((g) => g.final))) return endScenario(state, 'won');
  if (atDeadline) return endScenario(state, 'lost');
}

export function endScenario(state, result) {
  const sc = SCENARIOS[state.scenario.id];
  const goals = sc.goals.filter((g) => state.scenario.met[g.id]).length;
  const early = Math.max(0, state.scenario.deadlineWeek - state.week) / 52;
  const score = goals * SCORE_PER_GOAL + (result === 'won' ? Math.round(early * 300) + 1000 : 0) + Math.round(clamp(state.stats.profit / 1e6, -500, 3000)) + Math.round(state.reputation * 5);
  state.scenario.status = result;
  state.scenario.score = Math.max(0, score);
  state.status = result;
  log(state, result === 'won' ? `SCENARIO COMPLETE: ${sc.name}! Score ${state.scenario.score}.` : `Scenario failed: ${sc.name}. Score ${state.scenario.score}.`, result === 'won' ? 'good' : 'bad', 'board');
}

// After a scenario ends, carry on flying in free play.
export function continueFreePlay(state) {
  if (!['won', 'lost'].includes(state.status)) return fail('Nothing to continue');
  state.status = 'playing';
  state.scenario.status = `${state.scenario.status} (continued)`;
  return ok();
}

// Called on a lost game (bankrupt / fired) to record the final scenario score.
export function finalizeScenario(state) {
  if (state.scenario?.status === 'active' && state.status !== 'playing') {
    const status = state.status;
    endScenario(state, 'lost');
    state.status = status;
  }
}

export { money, rivalDef };
