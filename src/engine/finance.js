// Finance: fuel hedging, debt (term loans, aircraft-secured loans, revolving
// credit), credit rating, tax, equity and valuation.

import { RATINGS, RATING_SPREAD } from '../data/business.js';
import { clamp, fail, ok, newId, log, money, sum } from './core.js';
import { typeOf, aircraftValue, isDelivered, weeklyFromMonthly } from './fleet.js';

// ---------------------------------------------------------------------------
// Fuel hedging

export function effectiveFuelPrice(state) {
  const spot = state.macro.fuel;
  const hedged = Math.min(0.9, sum(state.hedges, (h) => h.ratio));
  const hedgePrice = hedged ? sum(state.hedges, (h) => h.ratio * h.price) / hedged : 0;
  return hedged * hedgePrice + (1 - hedged) * spot;
}

export function hedgeQuote(state, ratio, weeks) {
  const price = state.macro.fuel * (1.02 + (weeks / 52) * 0.03);
  const weeklyKg = (state.lastReport?.cost.fuel ?? 0) / Math.max(0.3, state.macro.fuel);
  const premium = weeklyKg * ratio * weeks * price * 0.015;
  return { price, premium };
}

export function buyHedge(state, ratio, weeks) {
  ratio = clamp(Number(ratio), 0.05, 0.5);
  weeks = [13, 26, 52].includes(Number(weeks)) ? Number(weeks) : 26;
  const current = sum(state.hedges, (h) => h.ratio);
  if (current + ratio > 0.8 + 1e-9) return fail(`At most 80% of fuel can be hedged (currently ${Math.round(current * 100)}%)`);
  const { price, premium } = hedgeQuote(state, ratio, weeks);
  if (state.cash < premium) return fail(`Hedge premium is ${money(premium)}`);
  state.cash -= premium;
  state.weekCosts.hedging += premium;
  state.hedges.push({ id: newId(state, 'hg'), ratio, price, weeksLeft: weeks });
  log(state, `Hedged ${Math.round(ratio * 100)}% of fuel at $${price.toFixed(2)}/kg for ${weeks} weeks (premium ${money(premium)}).`, 'info', 'finance');
  return ok();
}

// ---------------------------------------------------------------------------
// Debt

export const baseRate = (state) => state.macro.baseRate;
export const loanRateFor = (state, kind) =>
  baseRate(state) + RATING_SPREAD[state.finance.rating] * (kind === 'secured' ? 0.6 : 1) + (kind === 'rcf' ? 0.005 : 0);

export const totalDebt = (state) => sum(state.loans, (l) => l.principal);
export const leaseCommitmentWeekly = (state) =>
  sum(state.fleet.filter((a) => !a.owned && isDelivered(state, a)), (a) => weeklyFromMonthly(a.lease.monthly));

export function annualEbitda(state) {
  const h = state.history.slice(-13);
  if (!h.length) return 0;
  return (sum(h, (x) => x.ebitda) / h.length) * 52;
}

export function termLoanLimit(state) {
  const capacity = Math.max(30e6, annualEbitda(state) * 3);
  const termDebt = sum(state.loans.filter((l) => l.kind === 'term'), (l) => l.principal);
  return state.finance.rating === 'D' ? 0 : Math.max(0, capacity - termDebt);
}

export const RCF_LIMIT = { AAA: 400e6, AA: 250e6, A: 150e6, BBB: 100e6, BB: 50e6, B: 25e6, CCC: 0, D: 0 };
export const rcfDrawn = (state) => sum(state.loans.filter((l) => l.kind === 'rcf'), (l) => l.principal);

function addLoan(state, kind, amount, years, extra = {}) {
  const rate = loanRateFor(state, kind);
  const weeks = years * 52;
  const r = rate / 52;
  const payment = kind === 'rcf' ? 0 : (amount * r) / (1 - (1 + r) ** -weeks);
  const loan = { id: newId(state, 'ln'), kind, principal: amount, original: amount, rate, payment, weeksLeft: kind === 'rcf' ? Infinity : weeks, ...extra };
  state.loans.push(loan);
  state.cash += amount;
  return loan;
}

export function takeTermLoan(state, amount) {
  amount = Math.round(Number(amount));
  if (!(amount > 0)) return fail('Enter an amount');
  const limit = termLoanLimit(state);
  if (amount > limit) return fail(`Banks will lend at most ${money(limit)} at your ${state.finance.rating} rating`);
  const loan = addLoan(state, 'term', amount, 5);
  log(state, `Took a ${money(amount)} 5-year term loan at ${(loan.rate * 100).toFixed(2)}%.`, 'info', 'finance');
  return ok({ loan });
}

export function securedLoanQuote(state, ac) {
  return { amount: aircraftValue(state, ac) * 0.8, rate: loanRateFor(state, 'secured') };
}

export function takeSecuredLoan(state, acId) {
  const ac = state.fleet.find((a) => a.id === acId);
  if (!ac || !ac.owned) return fail('Only owned aircraft can secure a loan');
  if (state.loans.some((l) => l.aircraftId === acId)) return fail('Already financed');
  const { amount } = securedLoanQuote(state, ac);
  const loan = addLoan(state, 'secured', amount, 12, { aircraftId: acId });
  log(state, `Raised ${money(amount)} secured on ${ac.reg} (12 years at ${(loan.rate * 100).toFixed(2)}%).`, 'info', 'finance');
  return ok({ loan });
}

export function drawRcf(state, amount) {
  amount = Math.round(Number(amount));
  const limit = RCF_LIMIT[state.finance.rating] - rcfDrawn(state);
  if (!(amount > 0)) return fail('Enter an amount');
  if (amount > limit) return fail(`Revolving facility headroom is ${money(Math.max(0, limit))}`);
  const existing = state.loans.find((l) => l.kind === 'rcf');
  if (existing) {
    existing.principal += amount;
    existing.original += amount;
    existing.rate = loanRateFor(state, 'rcf');
    state.cash += amount;
  } else addLoan(state, 'rcf', amount, 1);
  log(state, `Drew ${money(amount)} on the revolving credit facility.`, 'info', 'finance');
  return ok();
}

export function repayLoan(state, loanId, amount) {
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan) return fail('No such loan');
  amount = Math.min(loan.principal, amount == null ? loan.principal : Math.round(Number(amount)));
  if (state.cash < amount) return fail(`Need ${money(amount)}`);
  state.cash -= amount;
  loan.principal -= amount;
  if (loan.principal < 1) state.loans = state.loans.filter((l) => l !== loan);
  log(state, `Repaid ${money(amount)} of debt.`, 'good', 'finance');
  return ok();
}

// Weekly debt service. Returns { interest, principal }.
export function serviceDebt(state) {
  let interest = 0;
  let principal = 0;
  for (const l of state.loans) {
    const i = (l.principal * l.rate) / 52;
    interest += i;
    if (l.kind === 'rcf') continue;
    const p = Math.min(l.principal, l.payment - i);
    principal += p;
    l.principal -= p;
    l.weeksLeft -= 1;
  }
  const done = state.loans.filter((l) => l.kind !== 'rcf' && (l.weeksLeft <= 0 || l.principal < 1));
  if (done.length) {
    state.loans = state.loans.filter((l) => !done.includes(l));
    log(state, `Paid off ${done.length} loan(s).`, 'good', 'finance');
  }
  state.loans = state.loans.filter((l) => l.kind !== 'rcf' || l.principal >= 1);
  return { interest, principal };
}

// ---------------------------------------------------------------------------
// Credit rating

export function creditMetrics(state) {
  const ebitda = annualEbitda(state);
  const leasesAnnual = leaseCommitmentWeekly(state) * 52;
  const ebitdar = ebitda + leasesAnnual;
  const debt = totalDebt(state);
  const leverage = ebitdar > 0 ? (debt + leasesAnnual * 5 - Math.max(0, state.cash)) / ebitdar : Infinity;
  const h = state.history.slice(-8);
  const burn = h.length ? sum(h, (x) => x.cashCost) / h.length : 1;
  const liquidity = state.cash / Math.max(1, burn);
  const interest = sum(state.loans, (l) => l.principal * l.rate);
  const coverage = interest ? ebitda / interest : Infinity;
  return { ebitda, ebitdar, leverage, liquidity, coverage, debt, leasesAnnual };
}

export function rateCredit(state) {
  const m = creditMetrics(state);
  let score = 50;
  if (m.ebitdar <= 0) score -= 20;
  else if (m.leverage < 2) score += 25;
  else if (m.leverage < 3.5) score += 12;
  else if (m.leverage < 5) score += 0;
  else if (m.leverage < 7) score -= 12;
  else score -= 25;
  if (m.liquidity > 26) score += 15;
  else if (m.liquidity > 13) score += 8;
  else if (m.liquidity > 6) score += 0;
  else if (m.liquidity > 3) score -= 10;
  else score -= 25;
  if (m.coverage < 1.5) score -= 10;
  if (state.cash < 0) score -= 30;
  const revenue = sum(state.history.slice(-52), (h) => h.revenue);
  if (revenue > 1e9) score += 10;
  else if (revenue > 3e8) score += 5;
  const idx = score >= 85 ? 0 : score >= 75 ? 1 : score >= 65 ? 2 : score >= 55 ? 3 : score >= 45 ? 4 : score >= 30 ? 5 : score >= 15 ? 6 : 7;
  const rating = RATINGS[idx];
  if (rating !== state.finance.rating) {
    const up = idx < RATINGS.indexOf(state.finance.rating);
    log(state, `Credit rating ${up ? 'upgraded' : 'downgraded'} to ${rating}.`, up ? 'good' : 'bad', 'finance');
    state.finance.rating = rating;
  }
  state.finance.score = score;
  return rating;
}

// ---------------------------------------------------------------------------
// Tax (quarterly, with loss carry-forward)

export const TAX_RATE = 0.21;
export function quarterlyTax(state, pretax) {
  if (pretax <= 0) {
    state.finance.lossCarry += -pretax;
    return 0;
  }
  const offset = Math.min(state.finance.lossCarry, pretax);
  state.finance.lossCarry -= offset;
  return (pretax - offset) * TAX_RATE;
}

// ---------------------------------------------------------------------------
// Equity & valuation

export const ownedFleetValue = (state) => sum(state.fleet.filter((a) => a.owned), (a) => aircraftValue(state, a));

export function bookEquity(state) {
  return state.cash + ownedFleetValue(state) + state.finance.facilityValue - totalDebt(state);
}

export function marketCap(state) {
  const ebitda = annualEbitda(state);
  const netDebt = totalDebt(state) - state.cash;
  const leases = leaseCommitmentWeekly(state) * 52 * 3;
  const earnings = ebitda > 0 ? ebitda * 7 - netDebt - leases : 0;
  const assets = bookEquity(state) * 0.8;
  const brand = state.reputation * 0.6e6 + state.routes.length * 1e6;
  return Math.max(2e6, Math.max(earnings, assets) + brand + (ebitda < 0 ? ebitda * 1.5 : 0));
}

export const sharePrice = (state) => marketCap(state) / state.finance.shares;

export function issueShares(state, amount) {
  amount = Math.round(Number(amount));
  const cap = marketCap(state);
  if (!(amount > 0)) return fail('Enter an amount');
  if (amount > cap * 0.3) return fail(`The market will absorb at most ${money(cap * 0.3)} (30% of market cap)`);
  const price = sharePrice(state) * 0.92;
  const shares = amount / price;
  state.finance.shares += shares;
  state.cash += amount;
  state.board.confidence = clamp(state.board.confidence - 6, 0, 100);
  log(state, `Raised ${money(amount)} in a share placing at $${price.toFixed(2)} (${(shares / 1e6).toFixed(2)}M new shares). The board dislikes the dilution.`, 'info', 'finance');
  return ok();
}

export function payDividend(state, amount) {
  amount = Math.round(Number(amount));
  if (!(amount > 0)) return fail('Enter an amount');
  if (state.cash - amount < 20e6) return fail('Keep at least $20M of cash after a dividend');
  state.cash -= amount;
  const yieldPct = amount / marketCap(state);
  state.board.confidence = clamp(state.board.confidence + Math.min(10, yieldPct * 300), 0, 100);
  state.finance.dividends += amount;
  log(state, `Paid a ${money(amount)} dividend to shareholders.`, 'good', 'finance');
  return ok();
}

export function weeklyDepreciation(state) {
  return sum(state.fleet.filter((a) => a.owned && isDelivered(state, a)), (a) => (a.acquiredPrice || typeOf(a).price * 0.5) * 0.9 / (25 * 52));
}
