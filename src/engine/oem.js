// Manufacturer deals: launch-customer terms on types not yet flying, programme
// delays (hidden until about a year before first delivery), fleet-wide
// groundings (MAX-style) that freeze deliveries, and engine in-service issues
// that send engines to the shop. The manufacturer pays compensation for
// delays and grounded aircraft — never quite enough.

import { aircraftById, engineOf } from '../data/aircraft.js';
import { clamp, sum, log, money, rand, randInt, yearOf, weekOfYearStart } from './core.js';
import { typeOf, isDelivered, inDowntime, addWork, monthlyLeaseRate, weeklyFromMonthly } from './fleet.js';
import { inProduction } from '../data/aircraft.js';

export const LAUNCH_DISCOUNT = 0.15;
export const LAUNCH_DEPOSIT = 0.1;
export const launchMinQty = (type) => (['wide', 'jumbo', 'sst'].includes(type.cat) ? 5 : 10);
// Chance that a new programme slips, by type (default 0.35). Historical troublemakers run high.
const PROGRAMME_RISK = { b788: 0.95, b789: 0.4, a388: 0.9, c919: 0.9, arj21: 0.9, b779: 0.9, b778: 0.8, a35k: 0.3, b748: 0.8, a221: 0.6, a223: 0.6, a225: 0.5, mrj: 0.95, e195e2: 0.2, b38m: 0.2, b3xm: 0.8, a321xlr: 0.6, concorde: 0.9, b741: 0.5, a300: 0.4 };
// Compensation the manufacturer pays: share of the aircraft price per year of delay.
const DELAY_COMP = 0.025;
// Share of a type's weekly lease value paid for each grounded aircraft-week.
const GROUNDING_COMP = 0.6;

const isNew = (state, type) => yearOf(state.week) < type.intro;
const introWeek = (type) => weekOfYearStart(type.intro);

export function launchTerms(state, typeId) {
  const type = aircraftById[typeId];
  const reasons = [];
  const year = yearOf(state.week);
  if (!type) reasons.push('Unknown type');
  else {
    if (year >= type.intro) reasons.push('Already in service — launch terms are for new programmes');
    else if (!inProduction(type, year)) reasons.push(`${type.name} isn't on offer until ${type.intro - 3}`);
  }
  return { type, reasons, minQty: type ? launchMinQty(type) : 0, discount: LAUNCH_DISCOUNT, deposit: LAUNCH_DEPOSIT, risk: PROGRAMME_RISK[typeId] ?? 0.35 };
}

// The first order for a new type sets up its programme, with a hidden delay.
export function ensureProgramme(state, typeId) {
  const type = aircraftById[typeId];
  if (!isNew(state, type)) return null;
  const p = (state.programmes ??= {});
  if (!p[typeId]) {
    const risk = PROGRAMME_RISK[typeId] ?? 0.35;
    const slips = rand(state) < risk;
    p[typeId] = { delay: slips ? randInt(state, 13, 26 + Math.round(risk * 130)) : 0, announced: false };
  }
  return p[typeId];
}

// ---------------------------------------------------------------------------
// Groundings

// Ground every aircraft of these types for `weeks`; deliveries freeze too.
export function groundTypes(state, types, weeks, reason) {
  const until = state.week + weeks;
  (state.groundings ??= []).push({ types, until, reason, started: state.week });
  for (const t of types) state.typeRestrictions[t] = { factor: 0, weeks, reason };
  let held = 0;
  for (const o of state.orders) {
    if (types.includes(o.type) && o.deliveryWeek < until) {
      o.deliveryWeek = until + held++ * 2;
    }
  }
  const ours = state.fleet.filter((a) => types.includes(a.type)).length;
  log(state, `${reason}: every ${types.map((t) => aircraftById[t].name).join(' / ')} is grounded for about ${weeks} weeks${ours ? ` — ${ours} of yours` : ''}. Deliveries are frozen; the manufacturer will pay partial compensation.`, 'bad', 'fleet');
  return until;
}

export const activeGrounding = (state, typeId) => state.groundings?.find((g) => g.until > state.week && g.types.includes(typeId)) ?? null;

// Weekly compensation for one grounded aircraft.
const groundedComp = (state, ac) => weeklyFromMonthly(monthlyLeaseRate(state, typeOf(ac), 0)) * GROUNDING_COMP;

// ---------------------------------------------------------------------------
// Weekly tick

export function oemTick(state, monthly) {
  let credit = 0;
  const year = yearOf(state.week);

  // Programme delays are revealed about a year before first delivery.
  for (const [typeId, p] of Object.entries(state.programmes ?? {})) {
    if (p.announced) continue;
    const type = aircraftById[typeId];
    if (state.week < introWeek(type) - 52) continue;
    p.announced = true;
    const orders = state.orders.filter((o) => o.type === typeId);
    if (!p.delay) {
      if (orders.length) log(state, `The ${type.name} programme is on schedule for first deliveries in ${type.intro}.`, 'good', 'fleet');
      continue;
    }
    let comp = 0;
    for (const o of orders) {
      o.deliveryWeek += p.delay;
      comp += o.price * DELAY_COMP * (p.delay / 52) * (o.launch ? 1.5 : 1);
    }
    credit += comp;
    if (orders.length) log(state, `${type.maker} announces a ${Math.round(p.delay / 4.3)}-month delay to the ${type.name}. Your ${orders.length} on order slip; compensation of ${money(comp)} is credited.`, 'bad', 'fleet');
  }

  // Grounded fleets: compensation while they sit, and a note when they return.
  for (const g of state.groundings ?? []) {
    if (g.done) continue;
    if (state.week >= g.until) {
      g.done = true;
      if (state.fleet.some((a) => g.types.includes(a.type))) log(state, `Regulators clear the ${g.types.map((t) => aircraftById[t].name).join(' / ')} to fly again.`, 'good', 'fleet');
      continue;
    }
    credit += sum(state.fleet.filter((a) => g.types.includes(a.type) && isDelivered(state, a)), (a) => groundedComp(state, a));
  }

  // Engine in-service issues: a share of affected engines goes to the shop each month.
  if (monthly) {
    for (const ac of state.fleet) {
      const issue = engineOf(ac)?.issue;
      if (!issue || year < issue.from || year > issue.to || !isDelivered(state, ac) || inDowntime(state, ac) || ac.retired) continue;
      if (rand(state) >= issue.monthly) continue;
      const weeks = randInt(state, issue.weeks[0], issue.weeks[1]);
      addWork(state, ac, weeks, `Engine removal: ${issue.name}`);
      ac.oemComp = { until: state.week + weeks, weekly: groundedComp(state, ac) };
      log(state, `${typeOf(ac).name} ${ac.reg}: engine removed for ${issue.name.toLowerCase()} — out for ${weeks} weeks (the engine maker pays part of the cost).`, 'bad', 'engineering');
    }
    // Brand-new types occasionally get grounded early in their lives.
    const young = [...new Set(state.fleet.filter((a) => isDelivered(state, a)).map((a) => a.type))].filter((t) => year - aircraftById[t].intro <= 2 && !activeGrounding(state, t));
    for (const t of young) {
      if (rand(state) < 0.004) groundTypes(state, [t], randInt(state, 4, 16), `Emergency airworthiness directive on the new ${aircraftById[t].name}`);
    }
  }
  for (const ac of state.fleet) {
    if (!ac.oemComp) continue;
    if (state.week >= ac.oemComp.until) delete ac.oemComp;
    else credit += ac.oemComp.weekly;
  }
  return credit;
}

// Groundings and programme news for the fleet page.
export function oemNews(state) {
  const groundings = (state.groundings ?? []).filter((g) => g.until > state.week);
  const programmes = Object.entries(state.programmes ?? {}).filter(([t]) => state.orders.some((o) => o.type === t)).map(([t, p]) => ({ type: aircraftById[t], ...p }));
  return { groundings, programmes };
}

export const engineIssueActive = (state, ac) => {
  const issue = engineOf(ac)?.issue;
  const y = yearOf(state.week);
  return issue && y >= issue.from && y <= issue.to ? issue : null;
};

export const groundingWeeksLeft = (state, typeId) => {
  const g = activeGrounding(state, typeId);
  return g ? clamp(g.until - state.week, 0, Infinity) : 0;
};
