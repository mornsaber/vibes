// Engineering: the A/B/C/D check program, in-house facilities vs outsourced
// MRO providers, shop visit booking, grounding for overdue checks, and
// dispatch reliability.

import { CHECKS, CHECK_ORDER, FACILITIES, MRO_PROVIDERS, mroById } from '../data/aircraft.js';
import { airportByCode } from '../data/airports.js';
import { clamp, fail, ok, log, money, sum } from './core.js';
import { typeOf, ageYears, isDelivered, inDowntime, addWork, finishWork } from './fleet.js';

export const LIGHT = ['A', 'B'];
export const HEAVY = ['C', 'D'];

export function checkStatus(state, ac, check) {
  const c = CHECKS[check];
  const last = ac.checks[check];
  const fhUsed = ac.fh - last.fh;
  const weeksUsed = state.week - last.week;
  const ratio = Math.max(c.fh ? fhUsed / c.fh : 0, weeksUsed / c.weeks);
  const avgHours = Math.max(20, ac.avgHours ?? 60);
  const weeksLeft = Math.min(c.fh ? (c.fh - fhUsed) / avgHours : Infinity, c.weeks - weeksUsed);
  return { check, fhUsed, weeksUsed, ratio, weeksLeft: Math.round(weeksLeft), due: ratio >= 0.9, overdue: ratio > 1, critical: ratio > 1.1 };
}

export function nextCheck(state, ac) {
  return CHECK_ORDER.map((k) => checkStatus(state, ac, k)).sort((a, b) => a.weeksLeft - b.weeksLeft)[0];
}

// ---------------------------------------------------------------------------
// Facilities

export const facilityReady = (state, hub, key) => !!hub.facilities?.[key] && hub.facilities[key].readyWeek <= state.week;

export function buildFacility(state, hubCode, key) {
  const hub = state.hubs.find((h) => h.code === hubCode);
  const f = FACILITIES[key];
  if (!hub || !f) return fail('Invalid facility');
  if (hub.facilities[key]) return fail('Already built or under construction');
  if (key !== 'line' && !hub.facilities.line) return fail('Build a line maintenance station first');
  if (state.cash < f.cost) return fail(`${f.name} costs ${money(f.cost)}`);
  state.cash -= f.cost;
  state.ledgerCapex.facilities += f.cost;
  hub.facilities[key] = { readyWeek: state.week + f.weeks };
  log(state, `Construction started on a ${f.name.toLowerCase()} at ${hubCode}. Ready in ${f.weeks} weeks.`, 'info', 'engineering');
  return ok();
}

export const FACILITY_UPKEEP = { line: 25e3, narrowHangar: 120e3, wideHangar: 250e3 };

export function facilityUpkeep(state) {
  return sum(state.hubs, (h) => sum(Object.keys(h.facilities), (k) => (facilityReady(state, h, k) ? FACILITY_UPKEEP[k] : 0)));
}

export function facilityEngineers(state) {
  return sum(state.hubs, (h) => sum(Object.keys(h.facilities), (k) => (facilityReady(state, h, k) ? FACILITIES[k].engineers : 0)));
}

function inHouseSite(state, ac, check) {
  const mx = typeOf(ac).mx;
  for (const hub of state.hubs) {
    for (const [key, f] of Object.entries(FACILITIES)) {
      if (!facilityReady(state, hub, key) || !f.checks.includes(check)) continue;
      if (f.classes && !f.classes.includes(mx)) continue;
      if (LIGHT.includes(check)) return { hub: hub.code, key };
      const busy = state.fleet.filter((a) => a.downtime?.site === `${hub.code}:${key}` && inDowntime(state, a)).length;
      if (busy < f.bays) return { hub: hub.code, key };
    }
  }
  return null;
}

export function checkCost(state, ac, check, providerId) {
  const base = CHECKS[check].cost[typeOf(ac).mx] * (1 + ageYears(state, ac) * 0.02);
  if (providerId === 'inhouse') return base * 0.6;
  return base * (mroById[providerId]?.price ?? 1);
}

// Where a check would be done right now, and at what cost/delay.
export function quoteCheck(state, ac, check, providerId = state.engineering.provider) {
  const site = state.engineering.preferInHouse ? inHouseSite(state, ac, check) : null;
  if (site) return { where: 'inhouse', site, cost: checkCost(state, ac, check, 'inhouse'), wait: 0, ferry: 0, quality: 1.0 * engineerFactor(state) };
  if (LIGHT.includes(check)) return { where: 'contractor', cost: checkCost(state, ac, check, 'contract') * 1.0, wait: 0, ferry: 0, quality: 0.95 };
  const p = mroById[providerId] ?? MRO_PROVIDERS[0];
  const home = airportByCode[state.hubs[0].code].region;
  return { where: p.id, provider: p, cost: checkCost(state, ac, check, p.id), wait: p.wait, ferry: p.region === home ? 0 : 1, quality: p.quality };
}

export function engineerFactor(state) {
  const s = state.staffStatus?.engineers;
  return s ? clamp(s.ratio, 0.5, 1) : 1;
}

// Perform or book a check. Light checks happen overnight (lost flying hours);
// heavy checks put the aircraft in the shop for weeks.
export function scheduleCheck(state, acId, check, { providerId, forced = false } = {}) {
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac) return fail('No such aircraft');
  if (!isDelivered(state, ac)) return fail('Aircraft not yet delivered');
  if (ac.booked) return fail(`Already booked for a ${ac.booked.check}-check`);
  if (inDowntime(state, ac) && HEAVY.includes(check)) return fail('Aircraft is already in the shop');
  const q = quoteCheck(state, ac, check, providerId);
  if (state.cash < q.cost && !forced) return fail(`${CHECKS[check].name} costs ${money(q.cost)}`);
  if (LIGHT.includes(check)) {
    state.cash -= q.cost;
    state.weekCosts.checks += q.cost;
    ac.lostHours += CHECKS[check].days[typeOf(ac).mx] * 16;
    completeCheck(state, ac, check, q.quality);
    recordCheck(ac, state.week, check, q.where === 'inhouse' ? `In-house (${q.site.hub})` : 'Line contractor', q.cost);
    return ok();
  }
  ac.booked = { check, startWeek: state.week + q.wait, where: q.where, site: q.site ? `${q.site.hub}:${q.site.key}` : null, ferry: q.ferry, quality: q.quality, cost: q.cost };
  if (q.wait === 0) startShopVisit(state, ac);
  else log(state, `${ac.reg} booked into ${q.provider.name} for a ${CHECKS[check].name} in ${q.wait} weeks.`, 'info', 'engineering');
  return ok();
}

function startShopVisit(state, ac) {
  const b = ac.booked;
  ac.booked = null;
  state.cash -= b.cost;
  state.weekCosts.checks += b.cost;
  const days = CHECKS[b.check].days[typeOf(ac).mx] / (b.where === 'inhouse' ? engineerFactor(state) : 1);
  const weeks = Math.ceil(days / 7) + b.ferry;
  addWork(state, ac, weeks, CHECKS[b.check].name, { checks: [b.check], quality: b.quality });
  ac.downtime.site = b.site;
  const where = b.where === 'inhouse' ? `in-house at ${b.site.split(':')[0]}` : mroById[b.where].name;
  recordCheck(ac, state.week, b.check, where, b.cost);
  log(state, `${ac.reg} started a ${CHECKS[b.check].name} (${where}, ${weeks} weeks, ${money(b.cost)}).`, 'info', 'engineering');
}

function recordCheck(ac, week, check, where, cost) {
  ac.mxLog = [{ week, check, where, cost }, ...(ac.mxLog ?? [])].slice(0, 10);
}

const RESTORE = { A: 3, B: 6, C: 90, D: 97 };
function completeCheck(state, ac, check, quality = 1) {
  // A heavier check includes all the lighter ones.
  for (const k of CHECK_ORDER.slice(0, CHECK_ORDER.indexOf(check) + 1)) ac.checks[k] = { fh: ac.fh, week: state.week };
  if (LIGHT.includes(check)) ac.reliability = clamp(ac.reliability + RESTORE[check] * quality, 0, 100);
  else ac.reliability = clamp(Math.max(ac.reliability, RESTORE[check] * quality), 0, 100);
  if (ac.grounded && CHECK_ORDER.every((k) => checkStatus(state, ac, k).ratio <= 1.1)) ac.grounded = null;
}

export function cancelBooking(state, acId) {
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac?.booked) return fail('Nothing booked');
  ac.booked = null;
  return ok();
}

export function setAutoCheck(state, check, on) {
  state.engineering.auto[check] = !!on;
  return ok();
}
export function setProvider(state, providerId) {
  if (!mroById[providerId]) return fail('Unknown provider');
  state.engineering.provider = providerId;
  return ok();
}
export function setPreferInHouse(state, on) {
  state.engineering.preferInHouse = !!on;
  return ok();
}

// ---------------------------------------------------------------------------
// Weekly tick (after operations, so flight hours are up to date)

export function maintenanceTick(state) {
  const engShort = engineerFactor(state) < 0.95;
  for (const ac of state.fleet) {
    if (!isDelivered(state, ac)) continue;
    ac.lostHours = 0;

    if (ac.downtime && ac.downtime.untilWeek <= state.week) {
      for (const k of ac.downtime.apply?.checks ?? []) completeCheck(state, ac, k, ac.downtime.apply.quality ?? 1);
      finishWork(state, ac);
    }
    if (ac.booked && ac.booked.startWeek <= state.week && !inDowntime(state, ac)) startShopVisit(state, ac);

    // Wear.
    const hours = ac.lastHours ?? 0;
    const statuses = CHECK_ORDER.map((k) => checkStatus(state, ac, k));
    const overdue = statuses.some((s) => s.overdue);
    const decay = hours * 0.0045 * (1 + ageYears(state, ac) * 0.025) * (engShort ? 1.5 : 1) * (overdue ? 2 : 1);
    ac.reliability = clamp(ac.reliability - decay, 20, 100);

    if (inDowntime(state, ac) || ac.booked) continue;

    // Regulator grounds aircraft more than 10% past a check limit.
    const critical = statuses.find((s) => s.critical);
    if (critical && !ac.grounded) {
      ac.grounded = `AOG: ${CHECKS[critical.check].name} overdue`;
      log(state, `${ac.reg} grounded by the regulator — ${CHECKS[critical.check].name} overdue.`, 'bad', 'engineering');
    }
    // Auto-scheduling: do the heaviest check that is due.
    for (const k of ['D', 'C', 'B', 'A']) {
      const s = statuses[CHECK_ORDER.indexOf(k)];
      if ((s.due && state.engineering.auto[k]) || (ac.grounded && s.ratio > 1.1)) {
        scheduleCheck(state, ac.id, k, { forced: !!ac.grounded });
        break;
      }
    }
  }
}

// Probability a scheduled flight operates as planned (technical dispatch reliability).
export function dispatchReliability(ac) {
  return clamp(0.94 + 0.06 * (ac.reliability / 100), 0.9, 0.999);
}
