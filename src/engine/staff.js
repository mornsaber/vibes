// People. Each workforce is modelled as five grade cohorts (three frontline
// grades, supervisors, managers) with headcount and average tenure, rather
// than as individuals — detailed enough for careers, promotions, unions and
// contracting, without the micromanagement.

import { ROLES, ROLE_IDS, SUPERVISOR, MANAGER, ACTIONS, HR_POLICIES } from '../data/business.js';
import { REGIONS, airportByCode } from '../data/airports.js';
import { eraUnion } from '../data/eras.js';
import { clamp, fail, ok, rand, log, money, sum, monthKey } from './core.js';
import { typeOf } from './fleet.js';
import { blockHours, routeById, stations } from './network.js';
import { facilityEngineers } from './maintenance.js';

const PILOT_HOURS = 15; // productive block hours per pilot per week
const CABIN_HOURS = 16;
const RESERVE = 1.12;
const ENGINEERS_PER_AC = { small: 3, narrow: 4, wide: 7, jumbo: 9 };
const RECRUIT_COST = { pilots: 30e3, cabin: 5e3, engineers: 12e3, ground: 2e3, admin: 4e3 };
const FRONTLINE = [0, 1, 2];
export const DELEGATION_MIN = 100; // role headcount needed before a department can run itself

export const cockpitCrew = (block) => (block > 12 ? 4 : block > 8 ? 3 : 2);
export function cabinCrewPerFlight(config) {
  const seats = (config.F || 0) + (config.J || 0) + (config.W || 0) + (config.Y || 0);
  if (!seats) return 0;
  return Math.max(1, Math.ceil(seats / 50)) + Math.ceil((config.J || 0) / 14) + Math.ceil((config.F || 0) / 4);
}

export const wageIndex = (state) => REGIONS[airportByCode[state.hubs[0].code].region].wage;
const gradeSalary = (state, role, g) => (ROLES[role].salary * ROLES[role].grades[g].pay * wageIndex(state) * state.staff[role].pay) / 52;
export const weeklySalary = (state, role, g = 1) => gradeSalary(state, role, g);
const contractorRate = (state, role) => (ROLES[role].salary * ROLES[role].contract * wageIndex(state)) / 52;

// ---------------------------------------------------------------------------
// Workforce records

export function newWorkforce(state, role, count) {
  const union = role === 'ground' || role === 'admin' ? 0.15 : eraUnion(state.startYear);
  return {
    grades: splitCount(role, count),
    tenure: [0.5, 2, 5, 7, 10],
    count,
    pay: 1,
    morale: 65,
    pipeline: [],
    contract: 0,
    contractors: 0,
    union: { recognized: role !== 'ground' && role !== 'admin', strength: union, agreementEnds: state.week + 52 + Math.floor(rand(state) * 104) },
    delegated: false,
    autoPromote: true,
    poach: 0,
  };
}

// Plausible grade mix for an established team of `count`.
export function splitCount(role, count) {
  const r = ROLES[role];
  const sup = Math.round(count / (r.span + 1));
  const mgr = count > 5 ? Math.max(1, Math.round(sup / 6)) : 0;
  const front = Math.max(0, count - sup - mgr);
  const senior = role === 'pilots' ? Math.round(front * 0.5) : Math.round(front * 0.25);
  const mid = Math.round((front - senior) * 0.65);
  return [front - senior - mid, mid, senior, sup, mgr];
}

const sync = (w) => (w.count = sum(w.grades));

export function addToGrade(w, g, n, tenure = 0) {
  if (n <= 0) return;
  const total = w.grades[g] + n;
  w.tenure[g] = total ? (w.grades[g] * w.tenure[g] + n * tenure) / total : 0;
  w.grades[g] = total;
  sync(w);
}
export function removeFromGrade(w, g, n) {
  n = Math.max(0, Math.min(n, w.grades[g]));
  w.grades[g] -= n;
  sync(w);
  return n;
}
// Remove n people spread across frontline grades (for poaching, layoffs from events).
export function removeFrontline(w, n) {
  let left = n;
  for (const g of [1, 2, 0]) left -= removeFromGrade(w, g, Math.ceil((left * w.grades[g]) / Math.max(1, sum(FRONTLINE, (x) => w.grades[x]))));
  return n - left;
}

// ---------------------------------------------------------------------------
// Requirements

function crewHours(state, horizon = 0) {
  let pilot = 0;
  let cabin = 0;
  for (const ac of state.fleet) {
    if (ac.deliveryWeek > state.week + horizon || ac.retired) continue;
    const type = typeOf(ac);
    for (const s of ac.schedule) {
      const r = routeById(state, s.routeId);
      if (!r) continue;
      const bh = blockHours(type, r.distance);
      const legHours = s.freq * 2 * bh;
      pilot += legHours * (cockpitCrew(bh) + (type.fe ? 1 : 0));
      cabin += legHours * cabinCrewPerFlight(ac.config);
    }
    if (ac.contractHours) {
      pilot += ac.contractHours * 0.8 * (2 + (type.fe ? 1 : 0));
      cabin += ac.contractHours * 0.8 * cabinCrewPerFlight(ac.config);
    }
  }
  return { pilot, cabin };
}

// Frontline staff needed for the flying program (employees + contractors).
export function staffRequirements(state, horizon = 0) {
  const hours = crewHours(state, horizon);
  const fleet = state.fleet.filter((a) => a.deliveryWeek <= state.week + horizon && !a.retired);
  const pax = state.lastReport?.pax ?? 0;
  const v = state.ventures;
  return {
    pilots: Math.ceil((hours.pilot / PILOT_HOURS) * RESERVE),
    cabin: Math.ceil((hours.cabin / CABIN_HOURS) * RESERVE),
    engineers: Math.ceil(sum(fleet, (a) => ENGINEERS_PER_AC[typeOf(a).mx]) + facilityEngineers(state) + (v.mro3p?.level ?? 0) * 60),
    ground: Math.ceil(state.hubs.length * 50 + (stations(state).length - state.hubs.length) * 6 + pax / 350 + (v.handling?.level ?? 0) * 80),
    admin: Math.ceil(40 + fleet.length * 2 + state.routes.length * 0.5),
  };
}

// Full staffing plan for one role: frontline split employees/contractors, plus supervision.
export function staffPlan(state, role, frontline) {
  const w = state.staff[role];
  const r = ROLES[role];
  const contractors = Math.ceil(frontline * w.contract);
  const inhouse = Math.max(0, frontline - contractors);
  const sup = inhouse ? Math.ceil(inhouse / r.span) : 0;
  const mgr = inhouse ? Math.max(1, Math.ceil(sup / 6)) : 0;
  const seniors = role === 'pilots' ? Math.ceil(inhouse * 0.5) : 0; // one captain per cockpit
  return { frontline, contractors, inhouse, sup, mgr, seniors, total: inhouse + sup + mgr };
}

// ---------------------------------------------------------------------------
// Player actions

export function hireQuote(state, role, n, grade = 0) {
  const r = ROLES[role];
  let unit = RECRUIT_COST[role] * [1, 1.5, 3, 4, 6][grade];
  let weeks = r.train + [0, 1, 2, 3, 4][grade];
  if (role === 'pilots' && state.ventures.academy?.level && grade <= 1) {
    unit *= 0.35;
    weeks = Math.max(3, weeks - state.ventures.academy.level);
  }
  if ((role === 'pilots' || role === 'cabin') && state.ventures.simulator?.level) weeks = Math.ceil(weeks * 0.75);
  return { cost: unit * n, weeks };
}

export function hire(state, role, n, grade = 0) {
  n = Math.round(Number(n));
  grade = clamp(Math.round(Number(grade) || 0), 0, MANAGER);
  if (!ROLES[role] || !(n > 0)) return fail('Enter how many people to hire');
  const { cost, weeks } = hireQuote(state, role, n, grade);
  if (state.cash < cost) return fail(`Recruiting and training costs ${money(cost)}`);
  state.cash -= cost;
  state.weekCosts.recruiting += cost;
  state.staff[role].pipeline.push({ n, ready: state.week + weeks, grade });
  return ok({ weeks, cost });
}

export function fire(state, role, n, grade = 0) {
  const w = state.staff[role];
  grade = clamp(Math.round(Number(grade) || 0), 0, MANAGER);
  n = Math.min(Math.round(Number(n)), w.grades[grade]);
  if (!(n > 0)) return fail(`No ${ROLES[role].grades[grade].title}s to lay off`);
  const severance = n * gradeSalary(state, role, grade) * ROLES[role].severanceWeeks * (1 + w.tenure[grade] / 10);
  state.cash -= severance;
  state.weekCosts.severance += severance;
  removeFromGrade(w, grade, n);
  w.morale = clamp(w.morale - (n / Math.max(1, w.count + n)) * 40 - 3, 0, 100);
  if (w.union.recognized) w.union.strength = clamp(w.union.strength + 0.05, 0, 1);
  for (const other of ROLE_IDS) if (other !== role) state.staff[other].morale = clamp(state.staff[other].morale - 2, 0, 100);
  log(state, `Laid off ${n} ${ROLES[role].grades[grade].title}${n > 1 ? 's' : ''} (severance ${money(severance)}).`, 'bad', 'staff');
  return ok();
}

export function promote(state, role, grade, n) {
  const w = state.staff[role];
  grade = Math.round(Number(grade));
  if (grade < 0 || grade >= MANAGER) return fail('Invalid grade');
  n = Math.min(Math.round(Number(n)), w.grades[grade]);
  if (!(n > 0)) return fail('Nobody to promote');
  const ready = w.tenure[grade] >= ROLES[role].promote[grade] * 0.6;
  const moved = removeFromGrade(w, grade, n);
  addToGrade(w, grade + 1, moved, w.tenure[grade] + 1);
  w.morale = clamp(w.morale + (ready ? 1 : -1) + (moved / Math.max(1, w.count)) * 15, 0, 100);
  return ok({ message: `Promoted ${moved} to ${ROLES[role].grades[grade + 1].title}.${ready ? '' : ' Colleagues grumble that it was too soon.'}` });
}

export function demote(state, role, grade, n) {
  const w = state.staff[role];
  grade = Math.round(Number(grade));
  if (grade <= 0 || grade > MANAGER) return fail('Invalid grade');
  n = Math.min(Math.round(Number(n)), w.grades[grade]);
  if (!(n > 0)) return fail('Nobody to demote');
  removeFromGrade(w, grade, n);
  const quit = Math.round(n * 0.25);
  addToGrade(w, grade - 1, n - quit, w.tenure[grade]);
  w.morale = clamp(w.morale - (n / Math.max(1, w.count)) * 40 - 2, 0, 100);
  log(state, `Demoted ${n} ${ROLES[role].grades[grade].title}${n > 1 ? 's' : ''}; ${quit} resigned in protest.`, 'bad', 'staff');
  return ok();
}

export function setPay(state, role, pay) {
  const w = state.staff[role];
  pay = Math.round(clamp(Number(pay), 0.7, 1.6) * 100) / 100;
  if (pay < w.pay) {
    w.morale = clamp(w.morale - (w.pay - pay) * 90, 0, 100);
    if (w.union.recognized && rand(state) < w.union.strength) startAction(state, role, 'work-to-rule', 2, 'in protest at the pay cut');
    log(state, `${ROLES[role].name} pay cut to ${Math.round(pay * 100)}% of market. Morale plummets.`, 'bad', 'staff');
  }
  w.pay = pay;
  return ok();
}

export function setContractShare(state, role, share) {
  const w = state.staff[role];
  share = clamp(Math.round(Number(share) * 4) / 4, 0, 1);
  if (share > w.contract) {
    w.morale = clamp(w.morale - (share - w.contract) * 30, 0, 100);
    if (w.union.recognized && rand(state) < w.union.strength * 0.6) startAction(state, role, share >= 0.75 ? 'strike' : 'work-to-rule', 2, 'against outsourcing');
    log(state, `${ROLES[role].name}: ${Math.round(share * 100)}% of frontline work given to a ${ROLES[role].contractor}.`, 'info', 'staff');
  }
  w.contract = share;
  return ok();
}

export const canDelegate = (state, role) => state.staff[role].grades[MANAGER] >= 1 && (state.staff[role].count >= DELEGATION_MIN || headcount(state) >= 500);

export function setDelegated(state, role, on) {
  if (on && !canDelegate(state, role)) return fail(`Needs a ${ROLES[role].grades[MANAGER].title} and ${DELEGATION_MIN}+ staff (or 500+ company-wide)`);
  state.staff[role].delegated = !!on;
  if (on) {
    state.staffAuto[role] = true;
    state.staff[role].autoPromote = true;
  }
  return ok();
}

export function setAutoStaff(state, role, on) {
  state.staffAuto[role] = !!on;
  return ok();
}
export function setAutoPromote(state, role, on) {
  state.staff[role].autoPromote = !!on;
  return ok();
}
export function setHrPolicy(state, policy) {
  if (!HR_POLICIES[policy]) return fail('Unknown policy');
  state.hrPolicy = policy;
  return ok();
}

// ---------------------------------------------------------------------------
// Unions & industrial action

export function startAction(state, role, kind, weeks, why = '') {
  if (state.strikes[role]) return;
  state.strikes[role] = { kind, weeks };
  log(state, `${ROLES[role].union}: ${ACTIONS[kind].name.toLowerCase()} for ${weeks} week(s)${why ? ` ${why}` : ''}!`, 'bad', 'staff');
}

export function actionFactor(state, role) {
  const a = state.strikes[role];
  if (!a) return 1;
  const f = ACTIONS[a.kind].factor;
  return typeof f === 'number' ? f : f[role];
}

// The raise a union will ask for at the end of its agreement.
export function unionDemand(state, role) {
  const w = state.staff[role];
  return Math.round((0.03 + Math.max(0, 60 - w.morale) * 0.001 + w.union.strength * 0.03) * 100) / 100;
}

// Settlement by a delegated manager according to HR policy.
function settle(state, role) {
  const w = state.staff[role];
  const demand = unionDemand(state, role);
  const policy = state.hrPolicy ?? 'balanced';
  w.union.agreementEnds = state.week + 156;
  if (policy === 'conciliatory') {
    w.pay = Math.round((w.pay + demand) * 100) / 100;
    w.morale = clamp(w.morale + 8, 0, 100);
    return `settled in full (+${Math.round(demand * 100)}%)`;
  }
  if (policy === 'balanced') {
    w.pay = Math.round((w.pay + demand / 2) * 100) / 100;
    if (rand(state) < 0.3 * w.union.strength) startAction(state, role, 'work-to-rule', 2, 'after a split decision');
    return `settled halfway (+${Math.round((demand / 2) * 100)}%)`;
  }
  w.pay = Math.round((w.pay + 0.01) * 100) / 100;
  w.morale = clamp(w.morale - 8, 0, 100);
  if (rand(state) < 0.7 * w.union.strength) startAction(state, role, rand(state) < 0.5 ? 'strike' : 'sickout', 1 + Math.floor(rand(state) * 2), 'after management imposed a 1% deal');
  return 'imposed a 1% deal';
}

function unionTick(state, role, monthly) {
  const w = state.staff[role];
  const u = w.union;
  if (!u.recognized) {
    if (monthly && w.count >= 30 && w.morale < 45 && rand(state) < 0.08 && !state.queue.some((q) => q.event === 'union_drive')) {
      state.queue.push({ event: 'union_drive', data: { role } });
    }
    return;
  }
  u.strength = clamp(u.strength + (w.morale < 50 ? 0.002 : -0.001) - w.contract * 0.002, 0.05, 1);
  if (u.agreementEnds <= state.week && w.count > 0) {
    if (w.delegated) {
      log(state, `${ROLES[role].grades[MANAGER].title} negotiated a new ${ROLES[role].union.toLowerCase()} agreement: ${settle(state, role)}.`, 'info', 'staff');
    } else if (!state.queue.some((q) => q.event === 'union_pay' && q.data.role === role)) {
      state.queue.push({ event: 'union_pay', data: { role, demand: unionDemand(state, role) } });
      u.agreementEnds = state.week + 8; // talks drag on if ignored
    }
  }
  // Wildcat action when morale collapses.
  if (!state.strikes[role] && w.morale < 28 && rand(state) < 0.04 * (0.5 + u.strength)) {
    startAction(state, role, w.morale < 18 ? 'strike' : rand(state) < 0.5 ? 'sickout' : 'work-to-rule', 1 + Math.floor(rand(state) * 3), 'over working conditions');
  }
}

export function recognizeUnion(state, role, strength = 0.5) {
  const u = state.staff[role].union;
  u.recognized = true;
  u.strength = strength;
  u.agreementEnds = state.week + 26;
}

// ---------------------------------------------------------------------------
// Weekly tick

export const payroll = (state) =>
  Object.fromEntries(ROLE_IDS.map((r) => {
    const w = state.staff[r];
    const employees = sum(w.grades.map((n, g) => n * gradeSalary(state, r, g)));
    const trainees = sum(w.pipeline, (p) => p.n * gradeSalary(state, r, p.grade ?? 0) * 0.8);
    return [r, employees + trainees + w.contractors * contractorRate(state, r)];
  }));

export const headcount = (state) => sum(ROLE_IDS, (r) => state.staff[r].count);

export function staffTick(state) {
  const req = staffRequirements(state);
  const ahead = staffRequirements(state, 13);
  const profitable = (state.lastReport?.profit ?? 0) > 0;
  const monthly = monthKey(state.week) !== monthKey(state.week - 1);
  state.staffStatus = {};
  for (const role of ROLE_IDS) {
    const w = state.staff[role];
    const r = ROLES[role];
    const plan = staffPlan(state, role, req[role]);
    const planAhead = staffPlan(state, role, Math.max(req[role], ahead[role]));
    w.contractors = plan.contractors;

    // Graduates join; everyone gets a week older.
    for (const p of w.pipeline.filter((x) => x.ready <= state.week)) addToGrade(w, p.grade ?? 0, p.n, p.grade ? 3 : 0);
    w.pipeline = w.pipeline.filter((x) => x.ready > state.week);
    for (let g = 0; g < 5; g++) w.tenure[g] += 1 / 52;

    // Retirement, resignations and poaching.
    for (let g = 0; g < 5; g++) {
      const rate = (1 / (r.career * 52)) * (g >= SUPERVISOR ? 1.5 : 1) + Math.max(0, 50 - w.morale) * 0.0001 + w.poach;
      removeFromGrade(w, g, Math.floor(w.grades[g] * rate + rand(state)));
    }

    // Monthly progression and promotions.
    if (monthly) {
      const g0ready = Math.floor(w.grades[0] * (w.tenure[0] >= r.promote[0] ? 0.08 : 0.02));
      if (g0ready) addToGrade(w, 1, removeFromGrade(w, 0, g0ready), w.tenure[0]);
      if (w.autoPromote || w.delegated) {
        const targets = [null, null, Math.max(plan.seniors, Math.round(plan.inhouse * 0.2)), plan.sup, plan.mgr];
        for (const g of [2, SUPERVISOR, MANAGER]) {
          const gap = targets[g] - w.grades[g];
          if (gap <= 0) continue;
          const pool = Math.floor(w.grades[g - 1] * clamp(w.tenure[g - 1] / r.promote[g - 1], 0.1, 1) * 0.3);
          const n = Math.min(gap, pool);
          if (n > 0) {
            addToGrade(w, g, removeFromGrade(w, g - 1, n), w.tenure[g - 1] + 0.5);
            w.morale = clamp(w.morale + (n / Math.max(1, w.count)) * 10, 0, 100);
          }
        }
      }
    }

    // Auto-hiring toward the 13-week plan.
    if (state.staffAuto[role] || w.delegated) {
      const front = sum(FRONTLINE, (g) => w.grades[g]) + sum(w.pipeline.filter((p) => (p.grade ?? 0) <= 2), (p) => p.n);
      const short = Math.ceil(planAhead.inhouse * 1.04) - front;
      if (role === 'pilots') {
        const capts = w.grades[2] + sum(w.pipeline.filter((p) => p.grade === 2), (p) => p.n);
        const captShort = planAhead.seniors - capts - Math.floor(w.grades[1] * 0.05);
        if (captShort > 0) hire(state, role, Math.min(captShort, Math.max(short, 1)), 2);
        const rest = short - Math.max(0, captShort);
        if (rest > 0) hire(state, role, rest, 1);
      } else if (short > 0) hire(state, role, short, 0);
      // Outside supervisors/managers only when nobody can be promoted.
      for (const g of [SUPERVISOR, MANAGER]) {
        const need = (g === SUPERVISOR ? planAhead.sup : planAhead.mgr) - w.grades[g] - sum(w.pipeline.filter((p) => p.grade === g), (p) => p.n);
        if (need > 0 && w.grades[g - 1] < need * 2) hire(state, role, need, g);
      }
    }

    // Coverage.
    const factor = actionFactor(state, role);
    const front = sum(FRONTLINE, (g) => w.grades[g]);
    const supCover = plan.sup ? clamp((w.grades[SUPERVISOR] + w.grades[MANAGER] * 0.5) / plan.sup, 0, 1.5) : 1;
    const efficiency = 0.85 + 0.15 * Math.min(1, supCover);
    let ratio = plan.frontline ? (front * factor * efficiency + plan.contractors) / plan.frontline : 1;
    let captains = 1;
    if (role === 'pilots' && plan.seniors) {
      captains = (w.grades[2] * factor + plan.contractors * 0.5) / (plan.frontline * 0.5);
      ratio = Math.min(ratio, captains * 1.05);
    }
    const experience = clamp(sum(FRONTLINE, (g) => w.grades[g] * (w.tenure[g] + g * 3)) / Math.max(1, front) / (r.career * 0.4), 0, 1);

    // Morale.
    const target = clamp(
      60 + (w.pay - 1) * 120 - (ratio < 1 ? (1 - ratio) * 60 : 0) + (profitable ? 4 : -4) + (state.reputation - 50) * 0.1
        - (supCover < 0.8 ? 6 : 0) + (w.union.recognized && w.union.agreementEnds > state.week ? 3 : 0) - w.contract * 5,
      0, 100,
    );
    w.morale = clamp(w.morale + (target - w.morale) * 0.08, 0, 100);
    unionTick(state, role, monthly);

    state.staffStatus[role] = { required: plan.total + plan.contractors, plan, count: w.count, ratio: Math.max(0, ratio), supCover, captains, experience };
  }
}

// Share of the flying program crews can actually cover this week.
export function crewFactor(state) {
  const st = state.staffStatus;
  return clamp(Math.min(1, (st.pilots?.ratio ?? 1) * 1.08, (st.cabin?.ratio ?? 1) * 1.08), 0, 1);
}

export function strikeTick(state) {
  for (const [role, a] of Object.entries(state.strikes)) {
    if (--a.weeks <= 0) {
      delete state.strikes[role];
      state.staff[role].morale = clamp(state.staff[role].morale + 10, 0, 100);
      log(state, `${ROLES[role].union}: ${ACTIONS[a.kind].name.toLowerCase()} is over.`, 'good', 'staff');
    }
  }
}
