// Chapter 11-style restructuring: instead of instant administration, an
// insolvent airline can seek court protection. Debt service is frozen and a
// debtor-in-possession (DIP) loan keeps the lights on while you renegotiate
// leases and labour deals and shed routes and aircraft. Emerge with debt cut,
// old shareholders wiped out and a fresh board — or be liquidated.

import { ROLE_IDS, ROLES } from '../data/business.js';
import { clamp, sum, ok, fail, log, money, rand } from './core.js';
import { typeOf, removeAircraft, weeklyFromMonthly, isDelivered } from './fleet.js';
import { startAction } from './staff.js';

export const CH11_WEEKS = 26;
export const CH11_MIN_WEEKS = 8;
export const MAX_FILINGS = 2;
const HAIRCUT = { term: 0.6, rcf: 0.6, secured: 0.3 };

export const inChapter11 = (state) => state.restructuring?.status === 'active';
const filings = (state) => state.restructuring?.count ?? 0;

export function restructuringTerms(state) {
  const reasons = [];
  if (state.settings?.restructuring === 'off') reasons.push('Restructuring is switched off in your game settings');
  if (inChapter11(state)) reasons.push('Already in Chapter 11');
  if (filings(state) >= MAX_FILINGS) reasons.push(`Courts won't accept a ${MAX_FILINGS + 1}rd filing — creditors have had enough`);
  const distressed = state.cash < 0 || ['CCC', 'D'].includes(state.finance.rating);
  if (!distressed) reasons.push('Only a distressed airline (negative cash or a CCC/D rating) can file');
  const recent = state.history.slice(-8);
  const burn = recent.length ? sum(recent, (h) => h.cashCost) / recent.length : 1e6;
  return { reasons, dip: Math.max(10e6, burn * 6) + Math.max(0, -state.cash), distressed };
}

export function fileChapter11(state, { forced = false } = {}) {
  const t = restructuringTerms(state);
  const blocking = t.reasons.filter((r) => !(forced && r.startsWith('Only a distressed')));
  if (blocking.length) return fail(blocking[0]);
  const dip = t.dip;
  state.loans.push({ id: `ln${state.nextId++}`, kind: 'dip', principal: dip, original: dip, rate: state.macro.baseRate + 0.06, payment: 0, weeksLeft: Infinity });
  state.cash += dip;
  state.restructuring = {
    status: 'active', count: filings(state) + 1, startWeek: state.week, deadlineWeek: state.week + CH11_WEEKS,
    leases: false, unions: false, rejected: 0, dip,
  };
  state.lowCashWeeks = 0;
  state.board.confidence = Math.max(state.board.confidence, 35);
  state.reputation = clamp(state.reputation - 5, 0, 100);
  state.brandShock = { mult: 0.94, weeks: CH11_WEEKS };
  for (const r of ROLE_IDS) state.staff[r].morale = clamp(state.staff[r].morale - 10, 0, 100);
  log(state, `CHAPTER 11: ${state.airline.name} files for court protection. Debt payments are frozen and a ${money(dip)} DIP loan keeps the airline flying. You have ${CH11_WEEKS} weeks to fix the business.`, 'bad', 'finance');
  return ok({ dip });
}

// Lessors accept lower rents rather than repossess aircraft into a weak market.
export function renegotiateLeases(state) {
  if (!inChapter11(state)) return fail('Only possible in Chapter 11');
  if (state.restructuring.leases) return fail('Leases have already been renegotiated');
  const leased = state.fleet.filter((a) => !a.owned);
  if (!leased.length) return fail('No leased aircraft');
  const before = sum(leased, (a) => a.lease.monthly);
  for (const a of leased) a.lease.monthly *= 0.75;
  state.restructuring.leases = true;
  log(state, `Lessors agree to cut rents by a quarter on ${leased.length} aircraft (saving ${money(weeklyFromMonthly(before * 0.25))} a week).`, 'good', 'finance');
  return ok();
}

// Hand back a leased aircraft with no early-return penalty (the deposit is forfeit).
export function rejectLease(state, acId) {
  if (!inChapter11(state)) return fail('Only possible in Chapter 11');
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac || ac.owned) return fail('Only leased aircraft can be rejected');
  removeAircraft(state, ac);
  state.restructuring.rejected += 1;
  log(state, `Lease rejected: ${typeOf(ac).name} ${ac.reg} goes back to ${ac.lease.lessor}.`, 'info', 'finance');
  return ok();
}

// Court-approved concessions from organised labour.
export function cutLabourDeals(state) {
  if (!inChapter11(state)) return fail('Only possible in Chapter 11');
  if (state.restructuring.unions) return fail('Labour deals have already been reopened');
  const hit = [];
  for (const role of ROLE_IDS) {
    const w = state.staff[role];
    w.pay *= w.union.recognized ? 0.88 : 0.94;
    w.morale = clamp(w.morale - (w.union.recognized ? 15 : 8), 0, 100);
    if (w.union.recognized) {
      w.union.agreementEnds = state.week + 156;
      w.union.strength = clamp(w.union.strength - 0.05, 0, 1);
      if (w.union.strength > 0.7 && rand(state) < 0.35) startAction(state, role, 'strike', 2, 'over concessions forced in Chapter 11');
      hit.push(ROLES[role].name.toLowerCase());
    }
  }
  state.restructuring.unions = true;
  log(state, `The court approves concessionary contracts: pay cut 12% for ${hit.join(', ') || 'unionised staff'} and 6% for others, frozen for three years.`, 'warn', 'staff');
  return ok();
}

export function emergenceCheck(state) {
  const reasons = [];
  if (!inChapter11(state)) reasons.push('Not in Chapter 11');
  else if (state.week - state.restructuring.startWeek < CH11_MIN_WEEKS) reasons.push(`The court needs at least ${CH11_MIN_WEEKS} weeks to confirm a plan`);
  const recent = state.history.slice(-4);
  const operating = recent.length ? sum(recent, (h) => h.profit) / recent.length : -1;
  if (operating <= 0) reasons.push('Creditors want to see the airline making money (4-week average profit above zero)');
  return { reasons, operating };
}

// Plan of reorganisation: debt haircut, equity wiped, board reset.
export function emergeChapter11(state, resetBoard) {
  const chk = emergenceCheck(state);
  if (chk.reasons.length) return fail(chk.reasons[0]);
  let forgiven = 0;
  const dip = state.loans.filter((l) => l.kind === 'dip');
  const dipOwed = sum(dip, (l) => l.principal);
  state.loans = state.loans.filter((l) => l.kind !== 'dip');
  for (const l of state.loans) {
    const cut = l.principal * (HAIRCUT[l.kind] ?? 0.5);
    forgiven += cut;
    l.principal -= cut;
    l.original = l.principal;
    if (l.kind === 'rcf') l.kind = 'term';
    l.weeksLeft = l.kind === 'secured' ? Math.max(l.weeksLeft, 312) : 520;
    const r = l.rate / 52;
    l.payment = (l.principal * r) / (1 - (1 + r) ** -l.weeksLeft);
  }
  // Exit financing repays the DIP lender.
  if (dipOwed > 0) {
    const repay = Math.min(dipOwed, Math.max(0, state.cash - 10e6));
    state.cash -= repay;
    const rest = dipOwed - repay;
    if (rest > 1) {
      const rate = state.macro.baseRate + 0.045;
      const r = rate / 52;
      state.loans.push({ id: `ln${state.nextId++}`, kind: 'term', principal: rest, original: rest, rate, payment: (rest * r) / (1 - (1 + r) ** -260), weeksLeft: 260 });
    }
  }
  // Old equity is cancelled; creditors own the new shares.
  state.finance.shares = 20e6;
  state.finance.lossCarry *= 0.5;
  state.finance.rating = 'B';
  state.finance.score = 40;
  state.restructuring = { ...state.restructuring, status: 'emerged', emergedWeek: state.week, forgiven };
  state.brandShock = null;
  state.lowCashWeeks = 0;
  resetBoard?.(state);
  log(state, `EMERGED FROM CHAPTER 11: creditors forgive ${money(forgiven)} of debt and take the new shares — the old shareholders are wiped out. A new board gives you a fresh start.`, 'good', 'finance');
  return ok({ forgiven });
}

// Weekly: reputation wobbles under protection; at the deadline the court decides.
export function restructuringTick(state, resetBoard) {
  if (!inChapter11(state)) return;
  state.reputation = clamp(state.reputation - 0.05, 0, 100);
  state.lowCashWeeks = 0;
  if (state.week < state.restructuring.deadlineWeek) return;
  if (!emergenceCheck(state).reasons.length) emergeChapter11(state, resetBoard);
  else {
    state.restructuring.status = 'liquidated';
    state.status = 'bankrupt';
    log(state, `The court converts the case to Chapter 7: ${state.airline.name} is liquidated.`, 'bad', 'finance');
  }
}

// Debt service under court protection: only the DIP loan pays interest.
export const frozenDebt = (state, loan) => inChapter11(state) && loan.kind !== 'dip';

export const ch11Blocked = (state, what) => (inChapter11(state) ? fail(`Not allowed while in Chapter 11: ${what} need the court’s approval`) : null);

export { isDelivered };
