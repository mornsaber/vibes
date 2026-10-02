// Fleet: acquiring aircraft (factory orders, operating leases, used market),
// valuation, cabin configuration, retrofits, upgrades and freighter conversions.

import { AIRCRAFT, aircraftById, cabinUnits, seatCount, CLASSES, CHECKS, UPGRADES, CONVERSIONS, inProduction, inService, SEAT_PRODUCTS, seatProducts, defaultCabin, canCombi, cabinGroup } from '../data/aircraft.js';
import { clamp, fail, ok, rand, randInt, pick, weightedPick, newId, log, money, sum, yearOf, weekOfYearStart } from './core.js';
import { setSchedule } from './network.js';

export const typeOf = (ac) => aircraftById[ac.type];
export const ageYears = (state, ac) => Math.max(0, (state.week - ac.builtWeek) / 52);
export const isDelivered = (state, ac) => ac.deliveryWeek <= state.week;
export const inDowntime = (state, ac) => !!ac.downtime && ac.downtime.untilWeek > state.week;
export const isFreighter = (type) => type.cat === 'freighter';

export function isOperational(state, ac) {
  return isDelivered(state, ac) && !inDowntime(state, ac) && !ac.grounded && !ac.contractFull;
}

export function statusOf(state, ac) {
  if (!isDelivered(state, ac)) return { key: 'delivery', label: `Arrives in ${ac.deliveryWeek - state.week} wk`, tone: 'warn' };
  if (ac.grounded) return { key: 'grounded', label: ac.grounded, tone: 'bad' };
  if (inDowntime(state, ac)) return { key: 'shop', label: ac.downtime.label, tone: 'warn' };
  if (ac.contractFull) return { key: 'contract', label: 'On contract', tone: 'info' };
  if (!ac.schedule.length && !ac.contractHours) return { key: 'idle', label: 'Idle', tone: 'bad' };
  return { key: 'flying', label: 'In service', tone: 'good' };
}

const REG_PREFIX = { US: 'N', CA: 'C-F', MX: 'XA-', GB: 'G-', IE: 'EI-', FR: 'F-H', DE: 'D-A', NL: 'PH-', ES: 'EC-', IT: 'I-', AE: 'A6-', QA: 'A7-', SG: '9V-', AU: 'VH-', NZ: 'ZK-', JP: 'JA', CN: 'B-', HK: 'B-H', IN: 'VT-', BR: 'PR-', TR: 'TC-' };
function registration(state) {
  const prefix = REG_PREFIX[state.airline.home] ?? `${state.airline.home}-`;
  const n = state.fleetSerial++;
  if (prefix === 'N') return `N${100 + n}${state.airline.code}`;
  if (prefix === 'JA') return `JA${800 + n}${state.airline.code[0]}`;
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  return `${prefix}${letters[Math.floor(n / 23) % 23]}${letters[n % 23]}${state.airline.code[0]}`;
}

// Create an aircraft record. `ageWeeks` > 0 makes a used airframe with a
// plausible maintenance history.
export function makeAircraft(state, typeId, { owned = true, lease = null, ageWeeks = 0, deliveryWeek = state.week, config, cabin, reliability, price } = {}) {
  const type = aircraftById[typeId];
  const builtWeek = deliveryWeek - ageWeeks;
  const fh = Math.round(ageWeeks * (type.cat === 'wide' || type.cat === 'jumbo' ? 85 : 65));
  const checks = {};
  for (const [k, c] of Object.entries(CHECKS)) {
    if (!ageWeeks) {
      checks[k] = { fh: 0, week: builtWeek };
      continue;
    }
    // Used aircraft arrive somewhere between checks.
    const progress = rand(state) * 0.8;
    const weeksAgo = Math.min(ageWeeks, Math.round(c.weeks * progress));
    const fhAgo = c.fh ? Math.min(fh, Math.round(c.fh * progress)) : Math.round(weeksAgo * 65);
    checks[k] = { fh: fh - fhAgo, week: deliveryWeek - weeksAgo };
  }
  const ac = {
    id: newId(state, 'ac'),
    reg: registration(state),
    type: typeId,
    owned,
    lease,
    builtWeek,
    deliveryWeek,
    acquiredPrice: price ?? (owned ? type.price : 0),
    config: { ...(config ?? type.config) },
    cabin: { ...defaultCabin(type), ...(cabin ?? {}) },
    upgrades: [],
    fh,
    cycles: Math.round(fh / 2.2),
    checks,
    reliability: reliability ?? (ageWeeks ? clamp(92 - ageWeeks / 52, 60, 95) : 99),
    downtime: null,
    booked: null,
    grounded: null,
    lostHours: 0,
    schedule: [],
    contractHours: 0,
    contractFull: false,
    group: null,
  };
  state.fleet.push(ac);
  return ac;
}

// ---------------------------------------------------------------------------
// Valuation & lease pricing

const MARKET_APPETITE = { a388: 0.45, b748: 0.6, crj9: 0.8, b77w: 0.85, concorde: 0.5, b741: 0.6, l1011: 0.7 };
// Out-of-production types lose value as operators and spares dry up.
function appetite(state, type) {
  const year = yearOf(state.week);
  const orphan = type.out != null && year > type.out + 8 ? Math.max(0.35, 1 - (year - type.out - 8) * 0.04) : 1;
  return (MARKET_APPETITE[type.id] ?? 1) * orphan;
}

export function aircraftValue(state, ac) {
  const type = typeOf(ac);
  const age = ageYears(state, ac);
  const sinceD = (state.week - ac.checks.D.week) / CHECKS.D.weeks;
  const greenTime = 1 - 0.15 * clamp(sinceD, 0, 1);
  const upgrades = 1 + 0.02 * ac.upgrades.length;
  return type.price * Math.max(0.08, 0.94 ** age) * greenTime * upgrades * appetite(state, type) * (0.85 + 0.15 * state.macro.economy);
}

export function monthlyLeaseRate(state, type, age) {
  return type.price * 0.0075 * Math.max(0.35, 0.94 ** age) * appetite(state, type) * (0.8 + 0.2 * state.macro.economy);
}
export const weeklyFromMonthly = (m) => (m * 12) / 52;

// ---------------------------------------------------------------------------
// Factory orders

export function orderAircraft(state, typeId, qty = 1, config, cabin) {
  if (state.restructuring?.status === 'active') return fail('Not allowed while in Chapter 11: new aircraft orders need the court’s approval');
  const type = aircraftById[typeId];
  if (!type) return fail('Unknown aircraft type');
  const year = yearOf(state.week);
  if (!inProduction(type, year)) return fail(year < type.intro ? `${type.name} isn't on offer until ${type.intro - 3}.` : `${type.name} is out of production — look at the lease and used markets.`);
  qty = clamp(Math.round(qty), 1, 50);
  if (config) {
    const v = validateConfig(type, config, cabin, year);
    if (!v.ok) return v;
  }
  const discount = Math.min(0.25, 0.02 * (qty - 1));
  const unit = type.price * (1 - discount);
  const deposit = unit * 0.2 * qty;
  if (state.cash < deposit) return fail(`Pre-delivery deposits of ${money(deposit)} needed (20%)`);
  state.cash -= deposit;
  state.ledgerCapex.aircraft += deposit;
  const backlog = state.orders.filter((o) => o.type === typeId).length;
  const first = Math.max(state.week + type.lead + randInt(state, 0, 8), weekOfYearStart(type.intro) + randInt(state, 0, 12));
  for (let i = 0; i < qty; i++) {
    state.orders.push({
      id: newId(state, 'po'),
      type: typeId,
      orderedWeek: state.week,
      deliveryWeek: first + (backlog + i) * 3,
      price: unit,
      paid: unit * 0.2,
      config: { ...(config ?? type.config) },
      cabin: { ...defaultCabin(type), ...(cabin ?? {}) },
    });
  }
  log(state, `Ordered ${qty}× ${type.name} at ${money(unit)} each${discount ? ` (${Math.round(discount * 100)}% volume discount)` : ''}. First delivery in ${first - state.week} weeks.`, 'info', 'fleet');
  return ok();
}

export function cancelOrder(state, orderId) {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o) return fail('No such order');
  state.orders = state.orders.filter((x) => x !== o);
  log(state, `Cancelled ${typeOf(o).name} order. ${money(o.paid)} in deposits forfeited.`, 'bad', 'fleet');
  return ok();
}

// ---------------------------------------------------------------------------
// Lease and used markets (refreshed monthly)

const LESSORS = ['AerCap', 'SMBC Aviation Capital', 'Air Lease Corp', 'Avolon', 'BOC Aviation', 'Carlyle Aviation', 'Aviation Capital Group', 'CDB Aviation', 'Aircastle', 'Jackson Square'];
const SELLERS = ['Liquidator (bankrupt carrier)', 'Fleet renewal sale', 'Lessor remarketing', 'Government disposal', 'Private owner', 'Charter operator'];
const POPULARITY = { bn2: 1, dhc6: 1.5, dhc6s4: 1, l410: 1, emb110: 1, do228: 1, j31: 1, c208: 1.5, b1900: 1.2, an24: 0.6, emb120: 1, sh360: 0.6, dhc7: 0.5, dh8a: 1.2, dh8c: 1.2, atr42: 1.5, f50: 1, do328: 0.6, saab2000: 0.4, cv880: 0.4, vc10: 0.4, trident: 0.5, yak40: 0.3, tu154: 0.6, il62: 0.3, il86: 0.2, bae146: 1, f70: 0.5, erj135: 0.8, crj7: 1.2, e190: 2, a318: 0.4, b717: 0.8, md90: 0.6, b74sp: 0.3, a310: 0.8, b762: 1, ssj100: 0.4, arj21: 0.3, c919: 0.4, dc3: 3, dc6: 3, l1049: 2, dc7c: 2, vc8: 2, l188: 1, f27: 2, comet4: 0.7, caravelle: 2, b707: 4, dc8: 2, b727: 5, dc9: 4, bac111: 2, b732: 4, b741: 2, b742: 3, dc10: 3, l1011: 1.5, concorde: 0.03, a300: 1.5, a306: 1.5, b752: 3, b763: 3, md80: 4, b733: 4, b738: 5, a320c: 5, a321c: 3, f100: 1.5, erj145: 2, crj2: 2, md11: 1.5, b744: 3, a343: 2, a346: 1, b772: 3, a333: 3, saab340: 1.5, atr725: 2, a320n: 6, b38m: 5, a321n: 5, a223: 3, e175: 3, e195e2: 2, atr72: 3, q400: 2, crj9: 2, a221: 1, a319n: 1, a321xlr: 1.5, b3xm: 1, b789: 3, b788: 2, b78x: 1.5, a359: 3, a35k: 1.5, a339: 2, b77w: 3, b779: 0.5, a388: 1, b748: 0.5, b763f: 1.5, b77f: 1.5, b738f: 2, a332f: 1, atr72f: 1, a321f: 1, b77wsf: 1, b748f: 0.7, a350f: 0.3 };

export function refreshMarkets(state, initial = false) {
  state.market.leases = state.market.leases.filter((o) => o.expiresWeek > state.week);
  state.market.used = state.market.used.filter((o) => o.expiresWeek > state.week);
  const year = yearOf(state.week);
  const types = AIRCRAFT.filter((t) => inService(t, year));
  const n = initial ? 14 : randInt(state, 3, 6);
  for (let i = 0; i < n; i++) {
    const type = weightedPick(state, types, (t) => POPULARITY[t.id] ?? 1);
    const maxAge = year - type.intro;
    const fresh = (inProduction(type, year) && year >= type.intro && rand(state) < 0.35) || maxAge < 2;
    if (fresh && !inProduction(type, year)) continue;
    const age = fresh ? 0 : randInt(state, Math.min(2, maxAge), Math.min(16, maxAge));
    const quick = initial && i < 5;
    const lead = quick ? randInt(state, 3, 8) : fresh ? randInt(state, 26, 78) : randInt(state, 8, 26);
    const monthly = monthlyLeaseRate(state, type, age) * (quick ? 1.15 : 0.95 + rand(state) * 0.15);
    state.market.leases.push({
      id: newId(state, 'lo'),
      type: type.id,
      age,
      monthly,
      termMonths: pick(state, [36, 48, 72, 96, 120, 144]),
      lead,
      lessor: pick(state, LESSORS),
      expiresWeek: state.week + randInt(state, 6, 16),
    });
  }
  const m = initial ? 10 : randInt(state, 2, 5);
  const usable = types.filter((t) => year - t.intro >= 3);
  for (let i = 0; i < m && usable.length; i++) {
    const type = weightedPick(state, usable, (t) => POPULARITY[t.id] ?? 1);
    const age = randInt(state, Math.min(3, year - type.intro), Math.min(24, year - type.intro));
    const probe = { type: type.id, builtWeek: state.week - age * 52, checks: { D: { week: state.week - randInt(state, 0, 300) } }, upgrades: [] };
    const value = aircraftValue(state, probe);
    state.market.used.push({
      id: newId(state, 'uo'),
      type: type.id,
      age,
      price: value * (0.88 + rand(state) * 0.22),
      reliability: Math.round(clamp(95 - age * 1.2 - rand(state) * 15, 50, 95)),
      lead: randInt(state, 3, 10),
      seller: pick(state, SELLERS),
      expiresWeek: state.week + randInt(state, 4, 12),
    });
  }
}

export function leaseFromOffer(state, offerId) {
  const o = state.market.leases.find((x) => x.id === offerId);
  if (!o) return fail('That offer has expired');
  const deposit = o.monthly * 2;
  if (state.cash < deposit) return fail(`The lessor wants a ${money(deposit)} security deposit`);
  state.cash -= deposit;
  const delivery = state.week + o.lead;
  const ac = makeAircraft(state, o.type, {
    owned: false,
    ageWeeks: o.age * 52,
    deliveryWeek: delivery,
    lease: { lessor: o.lessor, monthly: o.monthly, startWeek: delivery, endWeek: delivery + Math.round((o.termMonths * 52) / 12), deposit },
  });
  state.market.leases = state.market.leases.filter((x) => x !== o);
  log(state, `Signed a ${o.termMonths}-month lease with ${o.lessor} for a ${o.age ? `${o.age}-year-old` : 'new'} ${typeOf(ac).name} (${ac.reg}) at ${money(o.monthly)}/month. Delivery in ${o.lead} weeks.`, 'info', 'fleet');
  return ok({ aircraft: ac });
}

export function buyUsed(state, offerId) {
  const o = state.market.used.find((x) => x.id === offerId);
  if (!o) return fail('That aircraft has been sold');
  if (state.cash < o.price) return fail(`Need ${money(o.price)}`);
  state.cash -= o.price;
  state.ledgerCapex.aircraft += o.price;
  const ac = makeAircraft(state, o.type, { owned: true, ageWeeks: o.age * 52, deliveryWeek: state.week + o.lead, reliability: o.reliability, price: o.price });
  state.market.used = state.market.used.filter((x) => x !== o);
  log(state, `Bought a ${o.age}-year-old ${typeOf(ac).name} (${ac.reg}) for ${money(o.price)}. Ferry and induction take ${o.lead} weeks.`, 'info', 'fleet');
  return ok({ aircraft: ac });
}

export function removeAircraft(state, ac) {
  state.fleet = state.fleet.filter((a) => a !== ac);
  for (const c of state.contracts.active) if (c.aircraftId === ac.id) c.aircraftId = null;
}

export function sellAircraft(state, acId) {
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac) return fail('No such aircraft');
  if (!ac.owned) return fail('Leased aircraft are returned, not sold');
  if (state.loans.some((l) => l.aircraftId === ac.id)) return fail('Repay the loan secured on this aircraft first');
  const value = aircraftValue(state, ac) * 0.95;
  state.cash += value;
  state.ledgerCapex.aircraft -= value;
  removeAircraft(state, ac);
  log(state, `Sold ${typeOf(ac).name} ${ac.reg} for ${money(value)}.`, 'info', 'fleet');
  return ok({ value });
}

export function returnLease(state, acId) {
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac || ac.owned) return fail('Not a leased aircraft');
  const remainingMonths = Math.max(0, ((ac.lease.endWeek - state.week) * 12) / 52);
  const penalty = isDelivered(state, ac) ? remainingMonths * ac.lease.monthly * 0.3 : ac.lease.deposit;
  const returnOk = ac.reliability > 70 && !checkOverdue(state, ac, 'C');
  const refund = isDelivered(state, ac) && returnOk ? ac.lease.deposit : 0;
  state.cash += refund - penalty;
  removeAircraft(state, ac);
  log(state, `Returned ${typeOf(ac).name} ${ac.reg} to ${ac.lease.lessor}. Early-termination cost ${money(penalty)}${refund ? `, deposit refunded` : ', deposit forfeited'}.`, 'bad', 'fleet');
  return ok();
}

export function extendLease(state, acId) {
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac || ac.owned) return fail('Not a leased aircraft');
  ac.lease.monthly *= 0.85;
  ac.lease.endWeek += 104;
  log(state, `Extended the lease on ${ac.reg} by 24 months at ${money(ac.lease.monthly)}/month.`, 'info', 'fleet');
  return ok();
}

export function saleLeaseback(state, acId) {
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac || !ac.owned) return fail('Only owned aircraft can be sold and leased back');
  if (state.loans.some((l) => l.aircraftId === ac.id)) return fail('Repay the loan secured on this aircraft first');
  const value = aircraftValue(state, ac);
  const monthly = monthlyLeaseRate(state, typeOf(ac), ageYears(state, ac)) * 1.1;
  state.cash += value;
  state.ledgerCapex.aircraft -= value;
  ac.owned = false;
  ac.lease = { lessor: pick(state, LESSORS), monthly, startWeek: state.week, endWeek: state.week + 416, deposit: 0 };
  log(state, `Sale-and-leaseback of ${ac.reg}: raised ${money(value)}, leasing it back at ${money(monthly)}/month for 8 years.`, 'info', 'fleet');
  return ok({ value });
}

// ---------------------------------------------------------------------------
// Cabin configuration

export function validateConfig(type, config, cabin, year = 9999) {
  if (type.cat === 'freighter') return fail('Freighters have no passenger cabin');
  for (const c of [...CLASSES, 'C']) {
    const n = config[c] ?? 0;
    if (!Number.isInteger(n) || n < 0) return fail('Seat counts must be whole numbers');
  }
  if (config.F && !['wide', 'jumbo'].includes(type.cat)) return fail('First class needs a widebody');
  if (config.C && !canCombi(type)) return fail('Only airliners of 100+ seats can be fitted as combis');
  if (seatCount(config) < 4) return fail('Too few seats');
  for (const c of CLASSES) {
    const p = cabin?.[c];
    if (!p || !config[c]) continue;
    if (!SEAT_PRODUCTS[c][p]) return fail('Unknown seat type');
    if (!seatProducts(type, c, year).includes(p)) return fail(`${SEAT_PRODUCTS[c][p].name} seats don't fit a ${type.name}${SEAT_PRODUCTS[c][p].minYear > year ? ` (available from ${SEAT_PRODUCTS[c][p].minYear})` : ''}`);
  }
  const units = cabinUnits(type, config, cabin);
  if (units > type.maxSeats) return fail(`Layout uses ${units.toFixed(0)} of ${type.maxSeats} available floor units`);
  return ok({ units });
}

const seatCost = (type, cls, product) => {
  const c = SEAT_PRODUCTS[cls][product]?.cost ?? 0;
  return typeof c === 'number' ? c : c[cabinGroup(type.cat)] ?? 0;
};
// Changing a seat type refits the whole cabin; otherwise only added/removed seats are paid.
export function retrofitCost(ac, config, cabin = ac.cabin) {
  const type = typeOf(ac);
  const now = { ...defaultCabin(type), ...(ac.cabin ?? {}) };
  const next = { ...now, ...(cabin ?? {}) };
  let cost = 250e3;
  for (const c of CLASSES) {
    const n = config[c] ?? 0;
    if (next[c] !== now[c] && n) cost += n * seatCost(type, c, next[c]);
    else cost += Math.abs(n - (ac.config[c] ?? 0)) * seatCost(type, c, next[c]);
  }
  cost += Math.abs((config.C ?? 0) - (ac.config.C ?? 0)) * 60e3;
  return cost;
}

export function retrofitCabin(state, acId, config, cabin) {
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac) return fail('No such aircraft');
  const type = typeOf(ac);
  config = Object.fromEntries([...CLASSES, 'C'].map((c) => [c, Math.round(Number(config[c]) || 0)]));
  cabin = { ...defaultCabin(type), ...(ac.cabin ?? {}), ...(cabin ?? {}) };
  const v = validateConfig(type, config, cabin, yearOf(state.week));
  if (!v.ok) return v;
  const cost = retrofitCost(ac, config, cabin);
  if (state.cash < cost) return fail(`Retrofit costs ${money(cost)}`);
  if (!isDelivered(state, ac)) {
    // Change the build spec before delivery: just the seat cost difference.
    ac.config = config;
    ac.cabin = cabin;
    state.cash -= cost * 0.5;
    log(state, `Updated the cabin spec of ${ac.reg} before delivery (${money(cost * 0.5)}).`, 'info', 'engineering');
    return ok();
  }
  state.cash -= cost;
  state.ledgerCapex.retrofits += cost;
  const weeks = ['wide', 'jumbo'].includes(type.cat) ? 4 : 2;
  addWork(state, ac, weeks, 'Cabin retrofit', { config, cabin });
  log(state, `${ac.reg} enters a cabin retrofit (${money(cost)}).${ac.downtime.combined ? ' Combined with its shop visit — no extra downtime.' : ''}`, 'info', 'engineering');
  return ok();
}

// Put an aircraft in the shop. If it is already in a long shop visit the work
// runs in parallel instead of adding downtime.
export function addWork(state, ac, weeks, label, apply = {}) {
  if (ac.downtime && ac.downtime.untilWeek > state.week) {
    const combined = ac.downtime.untilWeek - state.week >= weeks;
    ac.downtime.untilWeek = Math.max(ac.downtime.untilWeek, state.week + weeks);
    ac.downtime.label = `${ac.downtime.label} + ${label}`;
    ac.downtime.apply = mergeApply(ac.downtime.apply, apply);
    ac.downtime.combined = combined;
  } else {
    ac.downtime = { label, untilWeek: state.week + weeks, apply, combined: false };
  }
}
function mergeApply(a = {}, b = {}) {
  return { ...a, ...b, upgrades: [...(a.upgrades ?? []), ...(b.upgrades ?? [])], checks: [...(a.checks ?? []), ...(b.checks ?? [])] };
}

export function startUpgrade(state, acId, upgradeId) {
  const ac = state.fleet.find((a) => a.id === acId);
  const up = UPGRADES[upgradeId];
  if (!ac || !up) return fail('Invalid upgrade');
  const type = typeOf(ac);
  if (ac.upgrades.includes(upgradeId)) return fail('Already installed');
  if (type.cat === 'freighter' && (up.quality || up.ancillary)) return fail('Not applicable to freighters');
  if (up.longHaulOnly && !['wide', 'jumbo'].includes(type.cat)) return fail('Seatback IFE is only offered on widebodies');
  if (up.minYear && yearOf(state.week) < up.minYear) return fail(`${up.name} isn't available until ${up.minYear}`);
  const cost = up.cost[type.mx];
  if (state.cash < cost) return fail(`${up.name} costs ${money(cost)}`);
  state.cash -= cost;
  state.ledgerCapex.retrofits += cost;
  if (up.days < 7 && isDelivered(state, ac)) {
    ac.lostHours += up.days * 16;
    ac.upgrades.push(upgradeId);
  } else if (!isDelivered(state, ac)) {
    ac.upgrades.push(upgradeId);
  } else {
    addWork(state, ac, Math.ceil(up.days / 7), up.name, { upgrades: [upgradeId] });
  }
  log(state, `${up.name} ordered for ${ac.reg} (${money(cost)}).`, 'info', 'engineering');
  return ok();
}

export function startConversion(state, acId) {
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac) return fail('No such aircraft');
  const conv = CONVERSIONS[ac.type];
  if (!conv) return fail('No freighter conversion program exists for this type');
  if (ageYears(state, ac) < conv.minAgeYears) return fail(`Conversions need airframes at least ${conv.minAgeYears} years old`);
  if (!ac.owned) return fail('Lessors will not allow conversion of a leased aircraft');
  if (state.cash < conv.cost) return fail(`Conversion costs ${money(conv.cost)}`);
  state.cash -= conv.cost;
  state.ledgerCapex.retrofits += conv.cost;
  setSchedule(state, ac, []);
  addWork(state, ac, Math.ceil(conv.days / 7), 'Freighter conversion', { convertTo: conv.to });
  log(state, `${ac.reg} is being converted to a ${aircraftById[conv.to].name} (${money(conv.cost)}).`, 'info', 'engineering');
  return ok();
}

export function finishWork(state, ac) {
  const a = ac.downtime.apply ?? {};
  if (a.config) ac.config = a.config;
  if (a.cabin) ac.cabin = a.cabin;
  if (a.upgrades) for (const u of a.upgrades) if (!ac.upgrades.includes(u)) ac.upgrades.push(u);
  if (a.convertTo) {
    ac.type = a.convertTo;
    ac.config = { ...aircraftById[a.convertTo].config };
    ac.cabin = defaultCabin(aircraftById[a.convertTo]);
    ac.upgrades = ac.upgrades.filter((u) => UPGRADES[u].fuel);
  }
  log(state, `${ac.reg} is back in service after: ${ac.downtime.label}.`, 'good', 'engineering');
  ac.downtime = null;
}

export function checkOverdue(state, ac, check) {
  const c = CHECKS[check];
  const last = ac.checks[check];
  return (c.fh && ac.fh - last.fh > c.fh * 1.1) || state.week - last.week > c.weeks * 1.1;
}

export function fuelFactor(state, ac) {
  const age = ageYears(state, ac);
  const upgrades = sum(ac.upgrades, (u) => UPGRADES[u].fuel ?? 0);
  return (1 + Math.max(0, age - 10) * 0.005) * (1 + upgrades);
}

export function productQuality(ac) {
  return 1 + sum(ac.upgrades, (u) => UPGRADES[u].quality ?? 0);
}

// Simple fleet groups for the Fleet > Groups view.
export function setGroup(state, acId, group) {
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac) return fail('No such aircraft');
  ac.group = group?.trim() || null;
  return ok();
}
