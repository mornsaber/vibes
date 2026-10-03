// Crew bases, seniority and union scope clauses.
//
// Crews live at bases. Every hub is one; more can be opened at airports you
// serve. A route is crewed from a base at one of its ends (the cheaper one when
// both are bases); a route with no base at either end needs crews positioned in
// (deadheading, hotels) and they are less productive. Crews are paid at their
// base's local rates, so a base abroad can be much cheaper — and pilots' unions
// fight that unless the contract allows it.
//
// Seniority rules the crew room: furloughs go by reverse seniority (the
// youngest go first and have recall rights), and buying another airline means
// merging two seniority lists, which nobody ever likes.
//
// Scope clauses in the pilots' contract limit what subsidiaries may fly: how
// big a regional brand's aircraft can be, how much of the group's flying they
// may do, whether a low-cost brand can use its own (cheaper) crew contract, and
// whether foreign crew bases are allowed. Breaking scope brings grievances;
// buying relief costs a permanent pay rise.

import { REGIONS, airportByCode } from '../data/airports.js';
import { ROLES } from '../data/business.js';
import { seatCount } from '../data/aircraft.js';
import { clamp, fail, ok, log, money, rand, distanceKm, yearOf } from './core.js';
import { stations, isHub, routeById } from './network.js';
import { startAction, removeFromGrade } from './staff.js';
import { brandOf } from './brands.js';
import { sameMarket } from './market.js';
import { treatyFor } from './regulation.js';

export const CREW_BASE_COST = 1.5e6;
export const CREW_BASE_WEEKLY = 30e3;
export const MAX_CREW_BASES = 8;
export const POSITIONING = 300; // per crew member per positioned flight (deadhead seat + hotel share)
export const REMOTE_PRODUCTIVITY = 1.2; // crew hours needed per block hour when positioned in
const RELOCATION = 20e3;

const homeCountry = (state) => airportByCode[state.hubs[0].code].country;
const wageOf = (code) => REGIONS[airportByCode[code].region].wage;
export const crewBaseCodes = (state) => [...new Set([...state.hubs.map((h) => h.code), ...(state.crewBases ?? []).map((b) => b.code)])];
export const isCrewBase = (state, code) => isHub(state, code) || (state.crewBases ?? []).some((b) => b.code === code);

// Where a route's crews come from, their pay relative to home, and whether they are positioned in.
// Derived, never saved: route → base, valid while hubs and bases are unchanged
// (both lists only ever grow or shrink, so identity plus length is enough).
const baseCache = new WeakMap();
export function routeBase(state, route) {
  const bases = state.crewBases ?? [];
  let c = baseCache.get(state);
  if (!c || c.hubs !== state.hubs || c.hubCount !== state.hubs.length || c.bases !== bases || c.baseCount !== bases.length) {
    baseCache.set(state, (c = { hubs: state.hubs, hubCount: state.hubs.length, bases, baseCount: bases.length, map: new Map() }));
  }
  let hit = c.map.get(route.id);
  if (!hit) c.map.set(route.id, (hit = computeRouteBase(state, route)));
  return hit;
}

function computeRouteBase(state, route) {
  const home = wageOf(state.hubs[0].code);
  const ends = [route.a, route.b].filter((c) => isCrewBase(state, c));
  if (ends.length) {
    // Crews come from the cheaper base; at equal cost, from a hub.
    const code = ends.sort((x, y) => wageOf(x) - wageOf(y) || Number(isHub(state, y)) - Number(isHub(state, x)))[0];
    return { code, wage: wageOf(code) / home, remote: false };
  }
  const code = crewBaseCodes(state).sort((x, y) => distanceKm(x, route.a) - distanceKm(y, route.a))[0];
  return { code, wage: wageOf(code) / home, remote: true };
}

export function crewBaseTerms(state, code) {
  const ap = airportByCode[code];
  const reasons = [];
  if (!ap) reasons.push('Unknown airport');
  else {
    if (isCrewBase(state, code)) reasons.push('Already a crew base');
    if (!stations(state).includes(code)) reasons.push('Fly there first');
    if ((state.crewBases ?? []).length >= MAX_CREW_BASES) reasons.push(`At most ${MAX_CREW_BASES} crew bases besides your hubs`);
    const foreign = ap.country !== homeCountry(state);
    if (foreign && !sameMarket(ap.country, homeCountry(state), yearOf(state.week))) {
      const t = treatyFor(state, homeCountry(state), ap.country);
      if (t.kind !== 'open') reasons.push('Basing crews abroad needs open skies with that country');
    }
  }
  const foreign = ap && ap.country !== homeCountry(state);
  const cheaper = ap ? wageOf(code) < wageOf(state.hubs[0].code) * 0.9 : false;
  const objection = foreign && cheaper && state.staff.pilots.union.recognized && !state.scope?.foreignBases;
  return { code, reasons, cost: CREW_BASE_COST, weekly: CREW_BASE_WEEKLY, wage: ap ? wageOf(code) / wageOf(state.hubs[0].code) : 1, foreign, objection };
}

export function openCrewBase(state, code) {
  const t = crewBaseTerms(state, code);
  if (t.reasons.length) return fail(t.reasons[0]);
  if (state.cash < t.cost) return fail(`Setting up a base costs ${money(t.cost)}`);
  state.cash -= t.cost;
  state.ledgerCapex.facilities += t.cost;
  (state.crewBases ??= []).push({ code, opened: state.week });
  log(state, `Opened a crew base at ${code}${t.wage < 0.95 ? ` — crews there earn about ${Math.round((1 - t.wage) * 100)}% less` : ''}.`, 'good', 'staff');
  if (t.objection) {
    for (const role of ['pilots', 'cabin']) state.staff[role].morale = clamp(state.staff[role].morale - 8, 0, 100);
    state.staff.pilots.union.strength = clamp(state.staff.pilots.union.strength + 0.05, 0, 1);
    log(state, `${ROLES.pilots.union} calls the ${code} base an attempt to outsource their jobs.`, 'bad', 'staff');
    if (rand(state) < state.staff.pilots.union.strength * 0.6) startAction(state, 'pilots', 'work-to-rule', 2, `over the ${code} crew base`);
  }
  return ok();
}

// Crew based somewhere, by share of crew hours flown from there last week.
export function crewAtBase(state, code) {
  let hours = 0;
  let all = 0;
  for (const r of state.routes) {
    const h = r.last?.crewHours ?? 0;
    all += h;
    if (routeBase(state, r).code === code) hours += h;
  }
  const crew = state.staff.pilots.count + state.staff.cabin.count;
  return all ? Math.round((crew * hours) / all) : 0;
}

export function closeCrewBase(state, code) {
  const i = (state.crewBases ?? []).findIndex((b) => b.code === code);
  if (i < 0) return fail(isHub(state, code) ? 'Hubs are always crew bases' : 'Not a crew base');
  const crew = crewAtBase(state, code);
  const cost = crew * RELOCATION;
  state.crewBases.splice(i, 1);
  state.cash -= cost;
  state.weekCosts.severance += cost;
  // Seniority decides who moves where; some junior crew quit rather than relocate.
  let quit = 0;
  for (const role of ['pilots', 'cabin']) {
    const w = state.staff[role];
    const share = crew / Math.max(1, state.staff.pilots.count + state.staff.cabin.count);
    quit += removeFromGrade(w, 0, Math.round(w.count * share * 0.1));
    w.morale = clamp(w.morale - 6, 0, 100);
  }
  log(state, `Closed the ${code} crew base: ${crew} crew relocate (${money(cost)}), ${quit} quit rather than move.`, 'bad', 'staff');
  return ok();
}

export const crewBaseUpkeep = (state) => (state.crewBases ?? []).length * CREW_BASE_WEEKLY;

// ---------------------------------------------------------------------------
// Seniority: furloughs and recalls

// Furlough the most junior frontline crew first; they keep recall rights.
export function furlough(state, role, n) {
  const w = state.staff[role];
  n = Math.round(Number(n));
  if (!(n > 0)) return fail('Enter how many to furlough');
  let left = n;
  for (const g of [0, 1, 2]) left -= removeFromGrade(w, g, left);
  const done = n - left;
  if (!done) return fail('Nobody left to furlough');
  const severance = done * (ROLES[role].salary / 52) * 2;
  state.cash -= severance;
  state.weekCosts.severance += severance;
  w.furloughed = (w.furloughed ?? 0) + done;
  w.morale = clamp(w.morale - (done / Math.max(1, w.count + done)) * 25 - 2, 0, 100);
  if (w.union.recognized) w.union.strength = clamp(w.union.strength + 0.03, 0, 1);
  log(state, `Furloughed ${done} ${ROLES[role].grades[0].title.toLowerCase()}s and juniors by reverse seniority (${money(severance)}). They keep recall rights.`, 'bad', 'staff');
  return ok({ furloughed: done });
}

// Recall furloughed crew before hiring anyone new: cheap and quick.
export function recall(state, role, n) {
  const w = state.staff[role];
  n = Math.min(Math.round(Number(n)), Math.floor(w.furloughed ?? 0));
  if (!(n > 0)) return fail('Nobody on the recall list');
  const cost = n * 2000;
  state.cash -= cost;
  state.weekCosts.recruiting += cost;
  w.furloughed -= n;
  w.pipeline.push({ n, ready: state.week + 2, grade: 1 });
  w.morale = clamp(w.morale + 2, 0, 100);
  return ok({ message: `Recalled ${n} furloughed ${ROLES[role].name.toLowerCase()}; back in 2 weeks.` });
}

// Seniority-list merger after buying an airline.
export const SENIORITY_OPTIONS = ['date-of-hire', 'staple', 'arbitration'];
export function mergeSeniority(state, how) {
  const p = state.staff.pilots;
  const c = state.staff.cabin;
  if (how === 'date-of-hire') {
    p.morale = clamp(p.morale - 8, 0, 100);
    c.morale = clamp(c.morale - 4, 0, 100);
    return 'Lists merged by date of hire. Your own pilots lose relative seniority and grumble.';
  }
  if (how === 'staple') {
    p.morale = clamp(p.morale - 12, 0, 100);
    p.union.strength = clamp(p.union.strength + 0.1, 0, 1);
    if (rand(state) < 0.25) startAction(state, 'pilots', 'sickout', 1, 'by the stapled pilots');
    return 'Acquired crews stapled to the bottom of the list. They are furious.';
  }
  state.cash -= 4e6;
  state.crewIntegration = { until: state.week + 26 };
  return 'Arbitration it is: $4M in fees and six months of separate crew operations while it runs.';
}
// While seniority arbitration runs, crews can't be mixed: more crews needed.
export const integrationFactor = (state) => (state.crewIntegration && state.crewIntegration.until > state.week ? 1.1 : 1);

// Weekly drift: furloughed crew find other jobs.
export function crewTick(state) {
  for (const role of ['pilots', 'cabin']) {
    const w = state.staff[role];
    if (w.furloughed) w.furloughed = w.furloughed > 1 ? w.furloughed * 0.99 : 0;
  }
}

// ---------------------------------------------------------------------------
// Scope clauses

export const defaultScope = () => ({ regionalSeats: 76, subsidiaryShare: 0.25, lccSeparate: false, foreignBases: false });
export const scopeApplies = (state) => !!state.staff?.pilots?.union?.recognized && !!state.scope;
// A low-cost brand needs scope relief to fly on its own, cheaper crew contract.
export const lccOnMainline = (state) => scopeApplies(state) && !state.scope.lccSeparate;

export function scopeStatus(state) {
  if (!scopeApplies(state)) return { applies: false, violations: [], share: 0 };
  const sc = state.scope;
  const violations = [];
  let sub = 0;
  let all = 0;
  const big = new Set();
  for (const r of state.routes) {
    const h = r.last?.crewHours ?? 0;
    all += h;
    const b = brandOf(state, r);
    if (b.id === 'main') continue;
    sub += h;
    if (b.kind === 'regional') {
      for (const ac of state.fleet) if (ac.schedule.some((x) => x.routeId === r.id) && seatCount(ac.config) > sc.regionalSeats) big.add(ac.reg);
    }
  }
  const share = all ? sub / all : 0;
  if (big.size) violations.push(`${big.size} aircraft over ${sc.regionalSeats} seats fly for a regional brand`);
  if (share > sc.subsidiaryShare) violations.push(`Subsidiaries fly ${Math.round(share * 100)}% of the group's hours (limit ${Math.round(sc.subsidiaryShare * 100)}%)`);
  return { applies: true, violations, share };
}

// Monthly: grievances while scope is broken.
export function scopeTick(state) {
  const st = scopeStatus(state);
  if (!st.violations.length) return;
  const p = state.staff.pilots;
  p.morale = clamp(p.morale - 4, 0, 100);
  p.union.strength = clamp(p.union.strength + 0.02, 0, 1);
  log(state, `${ROLES.pilots.union} files a scope grievance: ${st.violations[0]}.`, 'bad', 'staff');
  if (rand(state) < 0.12 * (state.settings?.labour ?? 1)) startAction(state, 'pilots', 'work-to-rule', 2, 'over scope-clause violations');
}

export const SCOPE_RELIEF = {
  regional: { label: 'Larger regional jets', desc: 'Regional brands may fly up to 100 seats and 50% of group hours.', pay: 0.03, fee: 0 },
  lcc: { label: 'Separate low-cost contract', desc: 'A low-cost brand may use its own cheaper crew contract.', pay: 0.02, fee: 2e6 },
  foreign: { label: 'Foreign crew bases', desc: 'Crews may be based abroad at local pay without a dispute.', pay: 0.04, fee: 0 },
};

export function buyScopeRelief(state, kind) {
  const r = SCOPE_RELIEF[kind];
  if (!r) return fail('Unknown request');
  if (!scopeApplies(state)) return fail('There is no pilots’ union contract to change');
  const sc = state.scope;
  if ((kind === 'regional' && sc.regionalSeats >= 100) || (kind === 'lcc' && sc.lccSeparate) || (kind === 'foreign' && sc.foreignBases)) return fail('Already agreed');
  const p = state.staff.pilots;
  if (p.morale < 40) return fail('The union won’t negotiate while morale is this low');
  if (state.cash < r.fee) return fail(`Needs ${money(r.fee)}`);
  state.cash -= r.fee;
  p.pay = Math.round(p.pay * (1 + r.pay) * 1000) / 1000;
  if (kind === 'regional') Object.assign(sc, { regionalSeats: 100, subsidiaryShare: 0.5 });
  if (kind === 'lcc') sc.lccSeparate = true;
  if (kind === 'foreign') sc.foreignBases = true;
  log(state, `Scope relief agreed: ${r.label.toLowerCase()}, for a ${Math.round(r.pay * 100)}% pilot pay rise.`, 'info', 'staff');
  return ok();
}

// Kept for the routes page: which base crews a route.
export const routeBaseLabel = (state, routeId) => {
  const r = routeById(state, routeId);
  if (!r) return '';
  const b = routeBase(state, r);
  return b.remote ? `positioned from ${b.code}` : b.code;
};
