// People: requirements derived from the flying program, hiring pipelines with
// training lead times, payroll, morale, attrition, unions and strikes.

import { ROLES, ROLE_IDS } from '../data/business.js';
import { REGIONS, airportByCode } from '../data/airports.js';
import { clamp, fail, ok, rand, log, money, sum } from './core.js';
import { typeOf, isDelivered } from './fleet.js';
import { blockHours, routeById, stations } from './network.js';
import { facilityEngineers } from './maintenance.js';

const PILOT_HOURS = 15; // productive block hours per pilot per week
const CABIN_HOURS = 16;
const RESERVE = 1.12;
const ENGINEERS_PER_AC = { small: 3, narrow: 4, wide: 7, jumbo: 9 };
const RECRUIT_COST = { pilots: 30e3, cabin: 5e3, engineers: 12e3, ground: 2e3, admin: 4e3 };

export const cockpitCrew = (block) => (block > 12 ? 4 : block > 8 ? 3 : 2);
export function cabinCrewPerFlight(config) {
  const seats = (config.F || 0) + (config.J || 0) + (config.W || 0) + (config.Y || 0);
  if (!seats) return 0;
  return Math.max(1, Math.ceil(seats / 50)) + Math.ceil((config.J || 0) / 14) + Math.ceil((config.F || 0) / 4);
}

export const wageIndex = (state) => REGIONS[airportByCode[state.hubs[0].code].region].wage;
export const weeklySalary = (state, role) => (ROLES[role].salary * wageIndex(state) * state.staff[role].pay) / 52;

// Crew hours implied by the current schedule and contracts.
function crewHours(state, horizon = 0) {
  let pilot = 0;
  let cabin = 0;
  for (const ac of state.fleet) {
    if (ac.deliveryWeek > state.week + horizon) continue;
    const type = typeOf(ac);
    for (const s of ac.schedule) {
      const r = routeById(state, s.routeId);
      if (!r) continue;
      const bh = blockHours(type, r.distance);
      const legHours = s.freq * 2 * bh;
      pilot += legHours * cockpitCrew(bh);
      cabin += legHours * cabinCrewPerFlight(ac.config);
    }
    if (ac.contractHours) {
      pilot += ac.contractHours * 0.8 * 2;
      cabin += ac.contractHours * 0.8 * cabinCrewPerFlight(ac.config);
    }
  }
  return { pilot, cabin };
}

export function staffRequirements(state, horizon = 0) {
  const hours = crewHours(state, horizon);
  const fleet = state.fleet.filter((a) => a.deliveryWeek <= state.week + horizon);
  const pax = state.lastReport?.pax ?? 0;
  const ventures = state.ventures;
  return {
    pilots: Math.ceil((hours.pilot / PILOT_HOURS) * RESERVE),
    cabin: Math.ceil((hours.cabin / CABIN_HOURS) * RESERVE),
    engineers: Math.ceil(sum(fleet, (a) => ENGINEERS_PER_AC[typeOf(a).mx]) + facilityEngineers(state) + (ventures.mro3p?.level ?? 0) * 60),
    ground: Math.ceil(state.hubs.length * 50 + (stations(state).length - state.hubs.length) * 6 + pax / 350 + (ventures.handling?.level ?? 0) * 80),
    admin: Math.ceil(40 + fleet.length * 2 + state.routes.length * 0.5),
  };
}

export function hire(state, role, n) {
  const r = ROLES[role];
  n = Math.round(Number(n));
  if (!r || !(n > 0)) return fail('Enter how many people to hire');
  let unit = RECRUIT_COST[role];
  let weeks = r.train;
  if (role === 'pilots' && state.ventures.academy?.level) {
    unit *= 0.35;
    weeks = Math.max(3, weeks - state.ventures.academy.level);
  }
  if ((role === 'pilots' || role === 'cabin') && state.ventures.simulator?.level) weeks = Math.ceil(weeks * 0.75);
  const cost = unit * n;
  if (state.cash < cost) return fail(`Recruiting and training costs ${money(cost)}`);
  state.cash -= cost;
  state.weekCosts.recruiting += cost;
  state.staff[role].pipeline.push({ n, ready: state.week + weeks });
  return ok({ weeks, cost });
}

export function fire(state, role, n) {
  const s = state.staff[role];
  n = Math.min(Math.round(Number(n)), s.count);
  if (!(n > 0)) return fail('Nobody to lay off');
  const severance = n * weeklySalary(state, role) * ROLES[role].severanceWeeks;
  state.cash -= severance;
  state.weekCosts.severance += severance;
  s.count -= n;
  s.morale = clamp(s.morale - (n / Math.max(1, s.count + n)) * 40 - 3, 0, 100);
  for (const other of ROLE_IDS) if (other !== role) state.staff[other].morale = clamp(state.staff[other].morale - 2, 0, 100);
  log(state, `Laid off ${n} ${ROLES[role].name.toLowerCase()} (severance ${money(severance)}).`, 'bad', 'staff');
  return ok();
}

export function setPay(state, role, pay) {
  const s = state.staff[role];
  pay = Math.round(clamp(Number(pay), 0.7, 1.6) * 100) / 100;
  if (pay < s.pay) {
    s.morale = clamp(s.morale - (s.pay - pay) * 90, 0, 100);
    log(state, `${ROLES[role].name} pay cut to ${Math.round(pay * 100)}% of market. Morale plummets.`, 'bad', 'staff');
  }
  s.pay = pay;
  return ok();
}

export function setAutoStaff(state, role, on) {
  state.staffAuto[role] = !!on;
  return ok();
}

export const payroll = (state) =>
  Object.fromEntries(ROLE_IDS.map((r) => [r, (state.staff[r].count + sum(state.staff[r].pipeline, (p) => p.n)) * weeklySalary(state, r)]));

export const headcount = (state) => sum(ROLE_IDS, (r) => state.staff[r].count);

// Runs at the start of each week, before operations.
export function staffTick(state) {
  const req = staffRequirements(state);
  const ahead = staffRequirements(state, 13);
  const profitable = (state.lastReport?.profit ?? 0) > 0;
  state.staffStatus = {};
  for (const role of ROLE_IDS) {
    const s = state.staff[role];
    // Graduates join.
    const ready = s.pipeline.filter((p) => p.ready <= state.week);
    if (ready.length) s.count += sum(ready, (p) => p.n);
    s.pipeline = s.pipeline.filter((p) => p.ready > state.week);
    // Attrition.
    const rate = 0.0015 + Math.max(0, 50 - s.morale) * 0.0001;
    const leavers = Math.floor(s.count * rate + rand(state));
    s.count = Math.max(0, s.count - leavers);
    // Auto-hiring toward the 13-week requirement.
    if (state.staffAuto[role]) {
      const target = Math.ceil(Math.max(req[role], ahead[role]) * 1.04);
      const have = s.count + sum(s.pipeline, (p) => p.n);
      if (target > have) hire(state, role, target - have);
    }
    const ratio = req[role] ? s.count / req[role] : 1;
    // Morale.
    const target = clamp(60 + (s.pay - 1) * 120 - (ratio < 1 ? (1 - ratio) * 60 : 0) + (profitable ? 4 : -4) + (state.reputation - 50) * 0.1, 0, 100);
    s.morale = clamp(s.morale + (target - s.morale) * 0.08, 0, 100);
    // Industrial action.
    if (ROLES[role].union && s.morale < 30 && !state.strikes[role] && rand(state) < 0.05) {
      state.strikes[role] = 1 + Math.floor(rand(state) * 3);
      log(state, `${ROLES[role].union} has called a strike for ${state.strikes[role]} week(s)!`, 'bad', 'staff');
    }
    state.staffStatus[role] = { required: req[role], count: s.count, ratio };
  }
}

// Share of the flying program crews can actually cover this week.
export function crewFactor(state) {
  const st = state.staffStatus;
  let f = Math.min(1, (st.pilots?.ratio ?? 1) * 1.08, (st.cabin?.ratio ?? 1) * 1.08);
  if (state.strikes.pilots) f = Math.min(f, 0.1);
  if (state.strikes.cabin) f = Math.min(f, 0.35);
  return clamp(f, 0, 1);
}

export function strikeTick(state) {
  for (const role of Object.keys(state.strikes)) {
    if (--state.strikes[role] <= 0) {
      delete state.strikes[role];
      state.staff[role].morale = clamp(state.staff[role].morale + 15, 0, 100);
      log(state, `${ROLES[role].union} strike is over.`, 'good', 'staff');
    }
  }
}
