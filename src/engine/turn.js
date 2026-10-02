// New game setup, the weekly turn that ties every system together, calendar
// time controls (week / month / quarter / year), board reviews and objectives.

import { airportByCode, COUNTRIES, REGIONS } from '../data/airports.js';
import { CLASSES } from '../data/aircraft.js';
import { ROLE_IDS, ROLES } from '../data/business.js';
import { MRO_PROVIDERS } from '../data/aircraft.js';
import { eraFuel, eraRate, eraOf, cpiIndex, histInflation } from '../data/eras.js';
import { PRESETS, makeSettings } from '../data/difficulty.js';
import { clamp, sum, fail, ok, rand, randNormal, log, money, monthKey, quarterKey, yearOf, weeksInUnit, weekOfYearStart, elapsed, setPriceLevel, dayOfYear } from './core.js';
import { typeOf, isDelivered, makeAircraft, refreshMarkets, removeAircraft, weeklyFromMonthly, aircraftValue } from './fleet.js';
import { replenishSlots, stations, scheduleChanged, newHub, hubWeeklyCost, autoBankTick, terminalTick } from './network.js';
import { autoPricing, autoFleet, defaultAutopilot } from './advisor.js';
import { brandTick, campaignTick, defaultLivery, BRAND_WEEKLY } from './brands.js';
import { regulationYearly } from './regulation.js';
import { rivalReactTick } from './rivalai.js';
import { inChapter11, restructuringTerms, restructuringTick } from './restructuring.js';
import { newTutorial } from './tutorial.js';
import { milestoneTick, shareTick, annualReport } from './chronicle.js';
import { setupScenario, scenarioTick, finalizeScenario, SCENARIOS } from './scenarios.js';
import { maintenanceTick, facilityUpkeep } from './maintenance.js';
import { staffTick, strikeTick, payroll, headcount, newWorkforce } from './staff.js';
import { simulateOperations, serviceAppeal, marketingEffect } from './ops.js';
import { effectiveFuelPrice, serviceDebt, weeklyDepreciation, rateCredit, quarterlyTax, sharePrice, loanRateFor } from './finance.js';
import { initRivals, rivalsTick, quarterlyRivalReset } from './rivals.js';
import { generateOffers, reserveContractHours, contractsTick, subsidiesTick, venturesTick } from './contracts.js';
import { triggerEvent } from './events.js';
import { buildTimeline, timelineTick, weatherTick, safetyTick } from './safety.js';

export const DIFFICULTY = PRESETS;

const zeroCosts = () => ({ checks: 0, recruiting: 0, severance: 0, hedging: 0, incidents: 0, campaigns: 0 });

export const SAVE_VERSION = 6;
export const HISTORY_WEEKS = 312;
const round3 = (x) => Math.round(x * 1000) / 1000;
const zeroCapex = () => ({ aircraft: 0, retrofits: 0, facilities: 0, slots: 0, other: 0 });

export function newGame(opts = {}) {
  const sc = SCENARIOS[opts.scenario];
  if (sc) {
    const state = createGame({ ...sc.airline, ...opts, hub: sc.hub, startYear: sc.year, difficulty: opts.difficulty ?? sc.difficulty });
    state.tutorial.on = false; // scenarios are for players who know the ropes
    return setupScenario(state, opts.scenario);
  }
  return createGame(opts);
}

function createGame({ name = 'Skyward Air', code = 'SK', hub = 'ORD', seed, difficulty = 'normal', settings: overrides = {}, color = '#4da3ff', startYear = 2027, livery, model = 'full' } = {}) {
  const ap = airportByCode[hub];
  if (!ap) throw new Error(`Unknown hub ${hub}`);
  const settings = makeSettings(difficulty, overrides);
  const state = {
    version: SAVE_VERSION,
    settings,
    rng: (seed ?? Math.floor(Math.random() * 2 ** 31)) | 0,
    nextId: 1,
    fleetSerial: 1,
    week: weekOfYearStart(startYear),
    startWeek: weekOfYearStart(startYear),
    startYear,
    status: 'playing',
    airline: { name, code: code.toUpperCase().slice(0, 2), color, slogan: '', home: ap.country, homeName: COUNTRIES[ap.country], difficulty, model, livery: { ...defaultLivery(color), ...(livery ?? {}), color } },
    cash: settings.cash,
    hubs: [newHub(hub, weekOfYearStart(startYear))],
    fleet: [],
    orders: [],
    routes: [],
    market: { leases: [], used: [] },
    slots: {},
    staff: {},
    hrPolicy: 'balanced',
    staffAuto: Object.fromEntries(ROLE_IDS.map((r) => [r, true])),
    staffStatus: {},
    strikes: {},
    service: { catering: 3, comfort: 3, ground: 3, baggage: 3, security: 3, loyalty: 2 },
    incidents: [],
    timeline: [],
    brandShock: null,
    marketing: 150e3,
    reputation: 50,
    engineering: { auto: { A: true, B: true, C: true, D: true }, provider: (MRO_PROVIDERS.find((m) => m.region === ap.region) ?? MRO_PROVIDERS[0]).id, preferInHouse: true },
    loans: [],
    hedges: [],
    finance: { rating: 'BB', score: 45, lossCarry: 0, shares: 20e6, dividends: 0, facilityValue: 0 },
    macro: { fuel: eraFuel(startYear), economy: 1, baseRate: eraRate(startYear), shocks: [], priceLevel: settings.inflation === 'off' ? 1 : cpiIndex(startYear), inflation: settings.inflation === 'off' ? 0 : histInflation(startYear) },
    disruptions: [],
    typeRestrictions: {},
    rivals: {},
    rivalMarkets: {},
    partners: { codeshares: [], alliance: null },
    contracts: { offers: [], active: [] },
    subsidies: { offers: [], active: [] },
    ventures: {},
    board: { confidence: 60, lastPrice: 0, reviews: 0, objectives: [], year: startYear },
    stats: { pax: 0, flights: 0, rpk: 0, ask: 0, revenue: 0, cargoKg: 0, profit: 0 },
    history: [],
    months: {},
    log: [],
    queue: [],
    pendingEvent: null,
    lastReport: null,
    weekCosts: zeroCosts(),
    ledgerCapex: zeroCapex(),
    lowCashWeeks: 0,
    advanceRemaining: 0,
    autopilot: defaultAutopilot(),
    brands: [],
    campaigns: [],
    regulation: { openSkies: [], foreignCap: 0.25, notes: [] },
    annual: [],
    milestones: [],
    shareHistory: [],
    scenario: null,
    restructuring: null,
    tutorial: newTutorial(true),
  };
  setPriceLevel(state.macro.priceLevel);
  if (model === 'lcc') {
    state.service = { catering: 1, comfort: 2, ground: 2, baggage: 1, security: 3, loyalty: 1 };
    state.marketing = 80e3;
  }
  // Founding team hired before launch: enough crew for the first couple of narrowbodies.
  for (const r of ROLE_IDS) state.staff[r] = newWorkforce(state, r, { pilots: 24, cabin: 60, engineers: 12, ground: 50, admin: 45 }[r]);
  if (ap.slots) state.slots[hub] = { held: ap.slots === 2 ? 42 : 70, pool: ap.slots === 2 ? 6 : 60 };
  initRivals(state);
  buildTimeline(state);
  refreshMarkets(state, true);
  generateOffers(state);
  setObjectives(state);
  state.board.lastPrice = sharePrice(state);
  log(state, `${name} is founded in ${startYear} — the ${eraOf(startYear).name.toLowerCase()} — with ${ap.city} (${hub}) as its hub. The board has set your first-year objectives.`, 'good');
  return state;
}

// A new board after a reorganisation: fresh confidence and objectives.
export function resetBoard(state) {
  state.board.confidence = 60;
  state.board.reviews = 0;
  state.board.lastPrice = sharePrice(state);
  setObjectives(state);
  log(state, 'A new board of directors has been appointed and set fresh objectives.', 'info', 'board');
}

// Bring an older save up to the current state shape.
export function migrate(state) {
  if (!state || typeof state !== 'object') return null;
  if (state.version === SAVE_VERSION) return state;
  if (state.version !== 4 && state.version !== 5) return null;
  if (state.version === 5) return migrate5to6(state);
  for (const h of state.hubs) {
    if (h.banks == null) {
      h.banks = { 1: 0, 2: 3, 3: 5 }[h.bank] ?? 0;
      h.autoBanks = (h.bank ?? 1) === 1;
      h.discipline = h.bank === 3 ? 0.7 : 0.6;
      h.terminal = 0;
      h.terminalBuild = null;
      delete h.bank;
    }
  }
  state.autopilot ??= { ...defaultAutopilot(), pricing: false, fleet: false };
  state.brands ??= [];
  state.campaigns ??= [];
  state.regulation ??= { openSkies: [], foreignCap: 0.25, notes: [] };
  state.annual ??= [];
  state.milestones ??= [];
  state.shareHistory ??= [];
  state.scenario ??= null;
  state.airline.livery ??= defaultLivery(state.airline.color);
  state.settings.regulation ??= 'historical';
  state.weekCosts.campaigns ??= 0;
  state.version = 5;
  return migrate5to6(state);
}

// v6: restructuring, tutorial, settings for bankruptcy protection; trimmed history.
function migrate5to6(state) {
  state.restructuring ??= null;
  state.tutorial ??= newTutorial(false);
  state.settings.restructuring ??= 'available';
  while (state.history.length > HISTORY_WEEKS) state.history.shift();
  for (const ac of state.fleet) if (ac.mxLog?.length > 6) ac.mxLog = ac.mxLog.slice(0, 6);
  state.version = SAVE_VERSION;
  return state;
}

// ---------------------------------------------------------------------------
// Objectives

function setObjectives(state) {
  const lastYear = state.history.slice(-52);
  const revenue = sum(lastYear, (h) => h.revenue);
  const first = state.history.length < 26;
  const list = [
    { key: 'revenue', label: `Annual revenue of ${money(Math.max(first ? 60e6 : 100e6, revenue * 1.25))}`, target: Math.max(first ? 60e6 : 100e6, revenue * 1.25) },
    first ? { key: 'routes', label: 'Operate at least 8 routes', target: 8 } : { key: 'profit', label: 'Positive net profit for the year', target: 0 },
    { key: 'fleet', label: `Fleet of at least ${Math.max(6, state.fleet.length + 4)} aircraft`, target: Math.max(6, state.fleet.length + 4) },
    { key: 'otp', label: 'Average on-time performance of 80%+', target: 0.8 },
    { key: 'rating', label: 'Credit rating of BB or better', target: 'BB' },
  ];
  state.board.objectives = list.filter((_, i) => i < 3 || rand(state) < 0.5).slice(0, 4).map((o) => ({ ...o, year: yearOf(state.week) }));
}

export function objectiveProgress(state, o) {
  const year = state.history.filter((h) => yearOf(h.week) === o.year);
  switch (o.key) {
    case 'revenue': { const v = sum(year, (h) => h.revenue); return { value: money(v), pct: v / o.target, met: v >= o.target }; }
    case 'profit': { const v = sum(year, (h) => h.profit); return { value: money(v), pct: v > 0 ? 1 : 0, met: v > 0 }; }
    case 'routes': return { value: state.routes.length, pct: state.routes.length / o.target, met: state.routes.length >= o.target };
    case 'fleet': return { value: state.fleet.length, pct: state.fleet.length / o.target, met: state.fleet.length >= o.target };
    case 'otp': { const flown = year.filter((h) => h.flights > 0); const v = flown.length ? sum(flown, (h) => h.otp) / flown.length : 0; return { value: `${Math.round(v * 100)}%`, pct: v / o.target, met: v >= o.target }; }
    case 'rating': { const order = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D']; const met = order.indexOf(state.finance.rating) <= order.indexOf(o.target); return { value: state.finance.rating, pct: met ? 1 : 0.5, met }; }
    default: return { value: '', pct: 0, met: false };
  }
}

function yearEnd(state, year) {
  annualReport(state, year);
  regulationYearly(state);
  let delta = 0;
  for (const o of state.board.objectives) {
    const p = objectiveProgress(state, o);
    delta += p.met ? 7 : -6 / (state.settings?.board ?? 1);
    log(state, `Objective ${p.met ? 'met' : 'missed'}: ${o.label} (${p.value}).`, p.met ? 'good' : 'bad', 'board');
  }
  state.board.confidence = clamp(state.board.confidence + delta, 0, 100);
  setObjectives(state);
  log(state, 'The board has set new objectives for the year.', 'info', 'board');
}

function boardReview(state) {
  const q = state.history.slice(-13);
  const qProfit = sum(q, (h) => h.profit);
  const price = sharePrice(state);
  const change = (price - state.board.lastPrice) / state.board.lastPrice;
  const goodRating = ['AAA', 'AA', 'A', 'BBB', 'BB'].includes(state.finance.rating);
  let delta = clamp(change * 50, -12, 12) + (qProfit > 0 ? 5 : -5) + (goodRating ? 2 : -3) + (state.reputation > 60 ? 2 : 0);
  if (delta < 0) delta /= state.settings?.board ?? 1;
  if (state.board.reviews < 4 && delta < 0) delta /= 2;
  state.board.reviews += 1;
  state.board.confidence = clamp(state.board.confidence + delta, 0, 100);
  state.board.lastPrice = price;
  log(state, `Board review: ${delta >= 0 ? 'satisfied' : 'concerned'}. Quarter profit ${money(qProfit)}, share price ${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%. Confidence ${Math.round(state.board.confidence)}.`, delta >= 0 ? 'good' : 'bad', 'board');
  // Under court protection the board can't fire you.
  if (inChapter11(state)) state.board.confidence = Math.max(10, state.board.confidence);
  if (state.board.confidence <= 0) {
    state.status = 'fired';
    log(state, 'The board has voted to remove you as CEO.', 'bad', 'board');
  }
}

// ---------------------------------------------------------------------------
// The weekly turn

function demandMacro(state) {
  const shocks = state.macro.shocks.filter((s) => !s.regions).reduce((m, s) => m * s.mult, 1);
  return state.macro.economy * shocks * (state.settings?.demand ?? 1);
}

const routeSumRevenue = (legList) => sum(legList, (l) => l.s.ticket + l.s.ancillary + l.s.cargoRev);

function processDeliveries(state) {
  for (const o of state.orders.filter((x) => x.deliveryWeek <= state.week)) {
    const due = o.price - o.paid;
    if (state.cash < due) {
      if (['CCC', 'D'].includes(state.finance.rating)) {
        o.deliveryWeek = state.week + 4;
        log(state, `Could not pay for a ${typeOf(o).name} delivery — deferred 4 weeks.`, 'bad', 'fleet');
        continue;
      }
      const rate = loanRateFor(state, 'secured');
      const r = rate / 52;
      const ac = makeAircraft(state, o.type, { owned: true, config: o.config, cabin: o.cabin, price: o.price });
      state.loans.push({ id: `ln${state.nextId++}`, kind: 'secured', principal: due, original: due, rate, payment: (due * r) / (1 - (1 + r) ** -624), weeksLeft: 624, aircraftId: ac.id });
      log(state, `${typeOf(ac).name} ${ac.reg} delivered, financed with a ${money(due)} aircraft loan.`, 'good', 'fleet');
    } else {
      state.cash -= due;
      state.ledgerCapex.aircraft += due;
      const ac = makeAircraft(state, o.type, { owned: true, config: o.config, cabin: o.cabin, price: o.price });
      log(state, `New ${typeOf(ac).name} ${ac.reg} delivered from the factory.`, 'good', 'fleet');
    }
    state.orders = state.orders.filter((x) => x !== o);
  }
  for (const ac of state.fleet) {
    if (ac.deliveryWeek === state.week && ac.reg && !ac.owned) log(state, `Leased ${typeOf(ac).name} ${ac.reg} has arrived.`, 'good', 'fleet');
    if (ac.deliveryWeek === state.week && ac.owned && ac.acquiredPrice && ac.builtWeek < state.week) log(state, `${typeOf(ac).name} ${ac.reg} has completed induction.`, 'good', 'fleet');
  }
  for (const ac of state.fleet.filter((a) => !a.owned && a.lease.endWeek <= state.week)) {
    removeAircraft(state, ac);
    state.cash += ac.lease.deposit;
    log(state, `Lease ended: ${typeOf(ac).name} ${ac.reg} returned to ${ac.lease.lessor}.`, 'info', 'fleet');
  }
}

// Everything fixed in nominal dollars loses real value as prices rise.
function applyInflation(state) {
  const i = state.macro.inflation ?? 0;
  if (!i) return;
  const e = 1 / (1 + i) ** (1 / 52);
  state.cash *= e;
  for (const l of state.loans) {
    l.principal *= e;
    l.payment *= e;
    l.original *= e;
  }
  for (const ac of state.fleet) if (!ac.owned && ac.lease) ac.lease.monthly *= e;
  for (const o of state.orders) {
    o.price *= e;
    o.paid *= e;
  }
  for (const h of state.hedges) h.price *= e;
  for (const c of state.contracts.active) c.weekly *= e;
  for (const sub of state.subsidies.active) sub.weekly *= e;
  state.finance.lossCarry *= e;
  if (!state.settings?.cola) for (const w of Object.values(state.staff)) w.pay *= e;
}

function updateMacro(state) {
  const m = state.macro;
  m.fuel = clamp(m.fuel + (eraFuel(yearOf(state.week)) - m.fuel) * 0.03 + randNormal(state) * 0.022 * (state.settings?.fuel ?? 1), 0.2, 2.5);
  // Inflation: a noisy, persistent version of the historical rate that is
  // pulled back towards the real price-level path so it stays loosely historical.
  if (state.settings?.inflation === 'off') {
    m.inflation = 0;
    m.priceLevel = 1;
  } else {
    const year = yearOf(state.week) + (dayOfYear(state.week) / 365);
    const gap = Math.log(cpiIndex(year) / m.priceLevel);
    m.inflDev = (m.inflDev ?? 0) * 0.985 + randNormal(state) * 0.0012;
    m.inflation = clamp(histInflation(year) + m.inflDev + gap * 0.3, -0.03, 0.25);
    m.priceLevel *= (1 + m.inflation) ** (1 / 52);
  }
  setPriceLevel(m.priceLevel);
  m.economy = clamp(m.economy + (1 - m.economy) * 0.04 + randNormal(state) * 0.008, 0.8, 1.2);
}

export function advanceWeek(state) {
  setPriceLevel(state.macro.priceLevel ?? 1);
  scheduleChanged(state);
  if (state.status !== 'playing') return fail('The game is over');
  if (state.pendingEvent) return fail('Resolve the current decision first');
  const prevMonth = monthKey(state.week);
  const prevQuarter = quarterKey(state.week);
  const prevYear = yearOf(state.week);
  state.week += 1;

  updateMacro(state);
  timelineTick(state);
  weatherTick(state);
  processDeliveries(state);
  rivalReactTick(state);
  terminalTick(state);
  autoFleet(state);
  reserveContractHours(state);
  staffTick(state);

  const fuelPrice = effectiveFuelPrice(state);
  const { legs, flows } = simulateOperations(state, { fuelPrice, macro: demandMacro(state) });
  const contracts = contractsTick(state);
  const subsidies = subsidiesTick(state);
  const ventures = venturesTick(state);
  const safety = safetyTick(state);
  maintenanceTick(state);
  strikeTick(state);

  // ---- Income statement
  const pay = payroll(state);
  const delivered = state.fleet.filter((a) => isDelivered(state, a));
  const legList = Object.values(legs);
  const routeSum = (f) => sum(legList, (l) => f(l.s));
  const leases = sum(delivered.filter((a) => !a.owned), (a) => weeklyFromMonthly(a.lease.monthly));
  const fleetValue = sum(delivered, (a) => aircraftValue(state, a));
  const hubCosts = sum(state.hubs, hubWeeklyCost) + (stations(state).length - state.hubs.length) * 8e3;
  // Subsidiary brands fly with cheaper crew contracts on their routes.
  const crewHoursAll = routeSum((s) => s.crewHours) || 1;
  const crewSaving = sum(legList, (l) => (1 - (l.s.crewFactor ?? 1)) * (l.s.crewHours / crewHoursAll));
  const debt = serviceDebt(state);

  const revenue = {
    passenger: routeSum((s) => s.ticket),
    ancillary: routeSum((s) => s.ancillary),
    cargo: routeSum((s) => s.cargoRev),
    contracts: contracts.revenue,
    subsidies,
    ventures: ventures.revenue,
    interest: Math.max(0, state.cash) * Math.max(0, state.macro.baseRate - 0.01) / 52,
  };
  const cost = {
    fuel: routeSum((s) => s.cost.fuel),
    pilots: pay.pilots * (1 - crewSaving),
    cabin: pay.cabin * (1 - crewSaving),
    engineers: pay.engineers,
    ground: pay.ground,
    admin: pay.admin,
    maintenance: routeSum((s) => s.cost.maintenance) + state.weekCosts.checks,
    airport: routeSum((s) => s.cost.landing + s.cost.paxFees + s.cost.handling),
    navigation: routeSum((s) => s.cost.navigation),
    service: routeSum((s) => s.cost.service),
    distribution: routeSum((s) => s.cost.distribution + s.cost.codeshare),
    disruption: routeSum((s) => s.cost.delays + s.cost.crewTravel),
    leases,
    marketing: state.marketing + (state.weekCosts.campaigns ?? 0),
    carbon: routeSum((s) => s.cost.carbon),
    facilities: facilityUpkeep(state) + hubCosts,
    overhead: 120e3 + (state.brands?.length ?? 0) * BRAND_WEEKLY + delivered.length * 8e3 + (fleetValue * 0.0015) / 52 + state.weekCosts.recruiting + state.weekCosts.severance + state.weekCosts.hedging,
    incidents: state.weekCosts.incidents ?? 0,
    sga: 0.04 * (routeSumRevenue(legList) + contracts.revenue),
    contracts: contracts.cost + ventures.cost,
    interest: debt.interest,
    depreciation: weeklyDepreciation(state),
    tax: 0,
  };
  const totalRevenue = sum(Object.values(revenue));
  let totalCost = sum(Object.values(cost));
  let profit = totalRevenue - totalCost;
  const ebitda = profit + cost.interest + cost.depreciation;

  // Quarterly tax on the quarter's pre-tax result.
  if (quarterKey(state.week) !== prevQuarter) {
    const pretax = sum(state.history.slice(-12), (h) => h.pretax) + profit;
    cost.tax = quarterlyTax(state, pretax);
    totalCost += cost.tax;
    profit -= cost.tax;
    if (cost.tax) log(state, `Quarterly corporate tax: ${money(cost.tax)}.`, 'info', 'finance');
  }

  // Already-paid items (checks, recruiting, hedges) left cash when they happened.
  const prepaid = state.weekCosts.checks + state.weekCosts.recruiting + state.weekCosts.severance + state.weekCosts.hedging + (state.weekCosts.incidents ?? 0) + (state.weekCosts.campaigns ?? 0);
  state.cash += totalRevenue - (totalCost - cost.depreciation - prepaid) - debt.principal;
  applyInflation(state);

  // ---- Route-level profit (allocate crew pay by crew hours, ownership by aircraft hours)
  const crewPay = cost.pilots + cost.cabin;
  const crewHours = sum(legList, (l) => l.s.crewHours * (l.s.crewFactor ?? 1)) || 1;
  const ownership = Object.fromEntries(delivered.map((a) => [a.id, a.owned ? ((a.acquiredPrice || typeOf(a).price * 0.5) * 0.9) / 1300 : weeklyFromMonthly(a.lease.monthly)]));
  const acHours = {};
  for (const l of legList) for (const [id, h] of Object.entries(l.s.acHours)) acHours[id] = (acHours[id] ?? 0) + h;
  for (const l of legList) {
    const s = l.s;
    s.crewCost = crewPay * ((s.crewHours * (s.crewFactor ?? 1)) / crewHours);
    s.ownership = sum(Object.entries(s.acHours), ([id, h]) => (ownership[id] ?? 0) * (h / (acHours[id] || 1)));
    s.profit = s.contribution - s.crewCost - s.ownership;
    s.freq = Math.round(s.freq * 10) / 10;
    l.route.last = s;
    l.route.hist = [...(l.route.hist ?? []), { week: state.week, pax: Math.round(s.paxTotal), lf: round3(s.lf), revenue: Math.round(s.totalRevenue), profit: Math.round(s.profit) }].slice(-26);
  }

  // ---- Reputation
  const flights = routeSum((s) => s.flights);
  const otp = flights ? routeSum((s) => s.otp * s.flights) / flights : 0;
  const quality = flights ? routeSum((s) => s.quality * s.flights) / flights : 1;
  const morale = sum(ROLE_IDS, (r) => state.staff[r].morale * Math.max(1, state.staff[r].count)) / Math.max(1, headcount(state));
  const repTarget = clamp(
    45 + (serviceAppeal(state, true) - 1) * 150 + (flights ? (otp - 0.8) * 80 : 0) + (quality - 1) * 60 + (morale - 60) * 0.2 + (marketingEffect(state) - 1) * 40 + (state.partners.alliance ? 3 : 0),
    5, 98,
  );
  state.reputation = clamp(state.reputation + (repTarget - state.reputation) * 0.04, 0, 100);
  brandTick(state, serviceAppeal);
  campaignTick(state);

  // ---- Stats & history
  const pax = routeSum((s) => s.paxTotal);
  const seats = routeSum((s) => s.seatTotal);
  const cargoKg = routeSum((s) => s.cargoKg);
  state.stats.pax += pax;
  state.stats.flights += flights;
  state.stats.revenue += totalRevenue;
  state.stats.cargoKg += cargoKg;
  state.stats.profit += profit;
  const ask = sum(legList, (l) => l.s.seatTotal * l.route.distance);
  const rpkWeek = sum(legList, (l) => l.s.paxTotal * l.route.distance);
  state.stats.rpk += rpkWeek;
  state.stats.ask += ask;

  const report = {
    week: state.week,
    revenue,
    cost,
    totalRevenue,
    totalCost,
    profit,
    ebitda,
    pax,
    seats,
    lf: seats ? pax / seats : 0,
    cargoKg,
    flights,
    otp,
    ask,
    rpk: rpkWeek,
    capex: { ...state.ledgerCapex },
    principal: debt.principal,
    connecting: routeSum((s) => s.connecting),
    flows: flows.length,
    incidents: safety,
    topFlows: flows
      .map((f) => ({ a: f.a, b: f.b, via: f.via, pax: CLASSES.reduce((t, c) => t + (f.carried?.[c] ?? 0) * 2, 0), demand: CLASSES.reduce((t, c) => t + (f.demand?.[c] ?? 0) * 2, 0), revenue: CLASSES.reduce((t, c) => t + (f.carried?.[c] ?? 0) * 2 * (f.fare?.[c] ?? 0), 0), cargoKg: (f.carried?.C ?? 0) * 2 }))
      .filter((f) => f.pax > 0.5 || f.cargoKg > 1)
      .sort((x, y) => y.pax - x.pax)
      .slice(0, 150),
  };
  state.lastReport = report;
  const cashCost = totalCost - cost.depreciation - cost.tax;
  // Stored compactly: whole dollars and passengers, ratios to 3 places.
  state.history.push({
    week: state.week, revenue: Math.round(totalRevenue), cost: Math.round(totalCost), profit: Math.round(profit), pretax: Math.round(profit + cost.tax), ebitda: Math.round(ebitda), cash: Math.round(state.cash),
    pax: Math.round(pax), seats: Math.round(seats), lf: round3(report.lf), cargoKg: Math.round(cargoKg), flights: Math.round(flights), otp: round3(otp), cashCost: Math.round(cashCost), sharePrice: 0, co2: Math.round(routeSum((s) => s.co2 ?? 0)),
  });
  // Six years of weekly history; annual reports keep the long view.
  while (state.history.length > HISTORY_WEEKS) state.history.shift();
  const mk = monthKey(state.week);
  const m = (state.months[mk] ??= { revenue: 0, cost: 0, profit: 0, pax: 0, cargoKg: 0, flights: 0, weeks: 0 });
  m.revenue += totalRevenue;
  m.cost += totalCost;
  m.profit += profit;
  m.pax += pax;
  m.cargoKg += cargoKg;
  m.flights += flights;
  m.weeks += 1;

  // ---- Timers
  for (const s of state.macro.shocks) s.weeks -= 1;
  for (const s of state.macro.shocks.filter((x) => x.weeks <= 0)) log(state, `${s.name} has ended.`, 'good');
  state.macro.shocks = state.macro.shocks.filter((s) => s.weeks > 0);
  for (const d of state.disruptions) d.weeks -= 1;
  state.disruptions = state.disruptions.filter((d) => d.weeks > 0);
  for (const [t, r] of Object.entries(state.typeRestrictions)) if (--r.weeks <= 0) delete state.typeRestrictions[t];
  if (state.brandShock && --state.brandShock.weeks <= 0) state.brandShock = null;
  for (const h of state.hedges) h.weeksLeft -= 1;
  state.hedges = state.hedges.filter((h) => h.weeksLeft > 0);

  // ---- Calendar boundaries
  if (monthKey(state.week) !== prevMonth) {
    autoBankTick(state);
    shareTick(state);
    scenarioTick(state);
    rivalsTick(state);
    refreshMarkets(state);
    replenishSlots(state);
    generateOffers(state);
    rateCredit(state);
    state.macro.baseRate = clamp(state.macro.baseRate + (eraRate(yearOf(state.week)) - state.macro.baseRate) * 0.08 + randNormal(state) * 0.0015, 0.005, 0.18);
  }
  if (quarterKey(state.week) !== prevQuarter) {
    boardReview(state);
    quarterlyRivalReset(state);
  }
  if (yearOf(state.week) !== prevYear) yearEnd(state, prevYear);

  milestoneTick(state);
  const price = sharePrice(state);
  state.history[state.history.length - 1].sharePrice = price;
  report.sharePrice = price;

  // ---- Solvency (with optional Chapter 11 protection)
  restructuringTick(state, resetBoard);
  state.lowCashWeeks = state.cash < 0 && !inChapter11(state) ? state.lowCashWeeks + 1 : 0;
  if (state.lowCashWeeks === 1) log(state, 'Cash is negative! Raise money within 8 weeks or face administration.', 'bad', 'finance');
  if (state.lowCashWeeks >= 8 && state.status === 'playing') {
    const t = restructuringTerms(state);
    if (!t.reasons.filter((r) => !r.startsWith('Only a distressed')).length) {
      if (!state.pendingEvent) triggerEvent(state, 'insolvency', null, true);
    } else {
      state.status = 'bankrupt';
      log(state, `${state.airline.name} has entered administration.`, 'bad');
    }
  }
  if (state.status !== 'playing') {
    finalizeScenario(state);
    return ok({ report });
  }

  // ---- Autopilot pricing for next week
  autoPricing(state);

  state.weekCosts = zeroCosts();
  state.ledgerCapex = zeroCapex();

  // ---- Decisions
  if (state.pendingEvent) return ok({ report });
  const queued = state.queue.shift();
  if (queued) triggerEvent(state, queued.event, queued.data, true);
  else if (elapsed(state) > 3 && rand(state) < 0.1 * (state.settings?.events ?? 1)) triggerEvent(state);
  return ok({ report });
}

// Advance by a calendar unit, stopping early if a decision is needed.
export function advance(state, unit = 'week') {
  const n = state.advanceRemaining > 0 && unit === 'continue' ? state.advanceRemaining : weeksInUnit(state.week, unit === 'continue' ? 'week' : unit);
  let ran = 0;
  for (let i = 0; i < n; i++) {
    const res = advanceWeek(state);
    if (!res.ok) {
      state.advanceRemaining = 0;
      return ran ? ok({ ran }) : res;
    }
    ran += 1;
    if (state.status !== 'playing') break;
    if (state.pendingEvent) {
      state.advanceRemaining = n - ran;
      return ok({ ran, interrupted: true });
    }
  }
  state.advanceRemaining = 0;
  return ok({ ran });
}

export { REGIONS, CLASSES, ROLES };
