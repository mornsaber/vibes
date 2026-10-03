// Joint ventures and the loyalty programme.
//
// A joint venture pools revenue with one partner on a long-haul market (a pair
// of regions, e.g. North America–Europe). It needs antitrust immunity, so the
// two home countries must have open skies, and a regulator reviews it first.
// Once approved the partner coordinates instead of competing on your routes in
// that market, joint sales lift demand, and revenue is shared "metal-neutrally":
// the pool is split by capacity share, re-set every year. Between re-sets, extra
// capacity is shared with the partner, and a bad patch is cushioned by the
// partner's steadier revenue.
//
// The loyalty programme turns the frequent-flyer service level into members and
// miles. Members make flexible travellers stickier; miles are a liability that
// costs money when redeemed. From 1987 banks buy miles for co-brand credit cards
// (a steady income), and in a crunch you can pre-sell a year of miles for cash.

import { airportByCode } from '../data/airports.js';
import { RIVAL_JVS } from '../data/rivals.js';
import { clamp, sum, fail, ok, log, money, newId, rand, yearOf, distanceKm } from './core.js';
import { rivalDef, rivalAlliance } from './market.js';
import { treatyFor } from './regulation.js';
import { routeFreq } from './network.js';

// ---------------------------------------------------------------------------
// Joint ventures

export const JV_FIRST_YEAR = 1993; // Northwest–KLM, the first with antitrust immunity
export const JV_FEE = 8e6;
export const JV_REVIEW_WEEKS = 26;
export const JV_MIN_DISTANCE = 2500;
const JV_BOOST = 1.12; // joint sales and schedules
const JV_RIVAL = 0.3; // what's left of the partner's competing appeal
const SETTLEMENT_CAP = 0.3; // settlement is capped at ±30% of our JV revenue

const homeRegion = (state) => airportByCode[state.hubs[0].code].region;
const regionOf = (code) => airportByCode[code]?.region;
const sameRegions = (jv, ra, rb) => (jv.regions[0] === ra && jv.regions[1] === rb) || (jv.regions[0] === rb && jv.regions[1] === ra);

export const isPartner = (state, id) => {
  const r = rivalDef(state, id);
  return !!r && (state.partners.codeshares.includes(id) || (!!state.partners.alliance && rivalAlliance(state, r) === state.partners.alliance));
};

// The active joint venture covering a route between a and b, if any.
export function jvFor(state, a, b) {
  if (!state.jvs?.length) return null;
  const ra = regionOf(a);
  const rb = regionOf(b);
  if (!ra || !rb || ra === rb) return null;
  return state.jvs.find((jv) => jv.status === 'active' && sameRegions(jv, ra, rb) && distanceKm(a, b) >= JV_MIN_DISTANCE) ?? null;
}
// Rival joint ventures in force this year (at least two members still flying).
const JV_MEMBERS = new Set(RIVAL_JVS.flatMap((j) => j.members));
const jvCache = new WeakMap(); // derived per week, never saved
export function rivalJVs(state) {
  const c = jvCache.get(state);
  if (c && c.week === state.week) return c.list;
  const year = yearOf(state.week);
  const list = RIVAL_JVS.filter((j) => year >= j.year && j.members.filter((id) => state.rivals[id]?.status === 'active').length >= 2);
  jvCache.set(state, { week: state.week, list });
  return list;
}
// The rival JV a rival belongs to on a pair, if any.
export function rivalJvOn(state, a, b, rivalId) {
  if (!JV_MEMBERS.has(rivalId)) return null;
  const ra = regionOf(a);
  const rb = regionOf(b);
  if (!ra || !rb || ra === rb || distanceKm(a, b) < JV_MIN_DISTANCE) return null;
  return rivalJVs(state).find((j) => j.members.includes(rivalId) && sameRegions(j, ra, rb)) ?? null;
}
// Could any joint venture (ours or a rival one) apply on this pair at all?
export function jvPossible(state, a, b) {
  const ra = regionOf(a);
  const rb = regionOf(b);
  if (!ra || !rb || ra === rb) return false;
  if (!state.jvs?.some((j) => j.status === 'active') && !rivalJVs(state).length) return false;
  return distanceKm(a, b) >= JV_MIN_DISTANCE;
}

// Combined effect on a rival's appeal: our JV partner stops competing; rivals in their own JV coordinate.
export function jvRivalMult(state, a, b, rivalId) {
  return jvRivalFactor(state, a, b, rivalId) * (rivalJvOn(state, a, b, rivalId) ? JV_BOOST : 1);
}

// Demand multiplier on our routes (joint sales and connecting schedules).
export const jvBoost = (state, a, b) => (jvFor(state, a, b) ? JV_BOOST : 1);
// How much of a rival's appeal remains on a pair (a JV partner coordinates instead of competing).
export function jvRivalFactor(state, a, b, rivalId) {
  const jv = jvFor(state, a, b);
  return jv && jv.partner === rivalId ? JV_RIVAL : 1;
}

const inMarket = (route, regions) => {
  const ra = regionOf(route.a);
  const rb = regionOf(route.b);
  return ra !== rb && route.distance >= JV_MIN_DISTANCE && sameRegions({ regions }, ra, rb);
};

// Our capacity (seat-km) and revenue last week in a JV market.
function marketStats(state, regions) {
  let ask = 0;
  let revenue = 0;
  let freq = 0;
  for (const r of state.routes) {
    if (!inMarket(r, regions)) continue;
    if (!r.last) {
      freq += routeFreq(state, r);
      continue;
    }
    ask += (r.last.seatTotal ?? 0) * r.distance;
    revenue += r.last.totalRevenue ?? 0;
    freq += routeFreq(state, r);
  }
  return { ask, revenue, freq };
}

// Can we form a JV with this partner? Lists every obstacle.
export function jvTerms(state, partnerId) {
  const r = rivalDef(state, partnerId);
  const rs = state.rivals[partnerId];
  const reasons = [];
  const year = yearOf(state.week);
  const home = homeRegion(state);
  const theirs = r ? regionOf(r.hubs[0]) : null;
  const regions = [home, theirs];
  if (year < JV_FIRST_YEAR) reasons.push(`Antitrust-immune joint ventures start in ${JV_FIRST_YEAR}`);
  if (!r || rs?.status !== 'active') reasons.push('Airline is not operating');
  else {
    if (r.type === 'cargo' || r.type === 'lcc') reasons.push('Only network airlines form joint ventures');
    if (!isPartner(state, partnerId)) reasons.push('Sign a codeshare or join their alliance first');
    if (theirs === home) reasons.push('Joint ventures cover long-haul markets between two regions');
    const treaty = treatyFor(state, airportByCode[state.hubs[0].code].country, airportByCode[r.hubs[0]].country);
    if (treaty.kind !== 'open' && treaty.kind !== 'single') reasons.push('Regulators require open skies between the home countries');
    if (state.jvs?.some((jv) => jv.status !== 'ended' && sameRegions(jv, home, theirs))) reasons.push('You already have a joint venture in this market');
    const rival = rivalJVs(state).find((j) => j.members.includes(partnerId) && sameRegions(j, home, theirs));
    if (rival) reasons.push(`Already in the ${rival.name} joint venture`);
  }
  if (state.reputation < 55) reasons.push('Reputation 55+ required');
  const stats = theirs && theirs !== home ? marketStats(state, regions) : { ask: 0, revenue: 0, freq: 0 };
  if (stats.freq < 7) reasons.push('Fly at least 7 weekly round trips in the market first');
  // The partner's contribution, in proportion to its size against ours.
  const ratio = r ? clamp((rs?.fleet ?? 50) / Math.max(10, state.fleet.length * 2), 0.5, 3) : 1;
  return { partner: partnerId, name: r?.name, regions, reasons, fee: JV_FEE, stats, share: 1 / (1 + ratio), ratio };
}

export function proposeJV(state, partnerId) {
  const t = jvTerms(state, partnerId);
  if (t.reasons.length) return fail(t.reasons[0]);
  if (state.cash < t.fee) return fail(`Lawyers and integration cost ${money(t.fee)}`);
  state.cash -= t.fee;
  state.ledgerCapex.other += t.fee;
  (state.jvs ??= []).push({
    id: newId(state, 'jv'), partner: partnerId, regions: t.regions, status: 'review', signed: state.week, decision: state.week + JV_REVIEW_WEEKS,
    share: t.share, ratio: t.ratio, ask0: t.stats.ask, fleet0: state.rivals[partnerId].fleet ?? 50, settled: 0,
  });
  log(state, `Signed a joint venture with ${t.name}. Competition regulators will rule within ${JV_REVIEW_WEEKS} weeks.`, 'info', 'partners');
  return ok();
}

export function endJV(state, id, why) {
  const jv = state.jvs?.find((x) => x.id === id);
  if (!jv || jv.status === 'ended') return fail('No such joint venture');
  const name = rivalDef(state, jv.partner)?.name ?? 'partner';
  jv.status = 'ended';
  jv.ended = state.week;
  if (!why) {
    if (state.rivals[jv.partner]) state.rivals[jv.partner].relation = clamp((state.rivals[jv.partner].relation ?? 50) - 30, 0, 100);
    log(state, `Walked away from the joint venture with ${name}.`, 'bad', 'partners');
  } else log(state, `The joint venture with ${name} has ended: ${why}.`, 'bad', 'partners');
  return ok();
}

// Weekly: regulatory decisions, dissolution, and the revenue-sharing settlement.
export function jvTick(state) {
  let settlement = 0;
  for (const jv of state.jvs ?? []) {
    if (jv.status === 'ended') continue;
    const name = rivalDef(state, jv.partner)?.name ?? 'partner';
    if (state.rivals[jv.partner]?.status !== 'active') {
      endJV(state, jv.id, `${name} is no longer flying`);
      continue;
    }
    if (!isPartner(state, jv.partner)) {
      endJV(state, jv.id, `${name} is no longer a partner`);
      continue;
    }
    if (jv.status === 'review') {
      if (state.week < jv.decision) continue;
      const treaty = treatyFor(state, airportByCode[state.hubs[0].code].country, airportByCode[rivalDef(state, jv.partner).hubs[0]].country);
      if ((treaty.kind === 'open' || treaty.kind === 'single') && rand(state) < 0.85) {
        jv.status = 'active';
        jv.approved = state.week;
        jv.ask0 = Math.max(jv.ask0, 1);
        log(state, `Regulators approved the joint venture with ${name}. Revenue is now shared on the market.`, 'good', 'partners');
      } else {
        jv.status = 'ended';
        jv.ended = state.week;
        log(state, `Regulators blocked the joint venture with ${name}.`, 'bad', 'partners');
      }
      continue;
    }
    // Metal-neutral settlement. The pool is our revenue plus the partner's; the
    // split is re-set every year to each side's capacity share. The partner's
    // revenue per seat-km moves only half as much as ours, so the settlement
    // cushions a bad patch and charges for capacity added between re-sets.
    const { ask, revenue } = marketStats(state, jv.regions);
    if (ask <= 0 || revenue <= 0) {
      jv.last = 0;
      continue;
    }
    const partnerAsk = jv.ask0 * jv.ratio * ((state.rivals[jv.partner].fleet ?? jv.fleet0) / Math.max(1, jv.fleet0));
    const rask = revenue / ask;
    if (!jv.reset || state.week - jv.reset >= 52) {
      jv.reset = state.week;
      jv.share = ask / (ask + partnerAsk);
      jv.rask0 = rask;
      if (jv.approved !== state.week) log(state, `Annual joint-venture true-up with ${name}: your share of the pool is now ${Math.round(jv.share * 100)}%.`, 'info', 'partners');
    }
    const partnerRevenue = partnerAsk * (0.5 * jv.rask0 + 0.5 * rask);
    const s = clamp(jv.share * (revenue + partnerRevenue) - revenue, -SETTLEMENT_CAP * revenue, SETTLEMENT_CAP * revenue);
    jv.last = s;
    jv.settled += s;
    settlement += s;
  }
  return settlement;
}

// ---------------------------------------------------------------------------
// Loyalty programme

export const LOYALTY_FIRST_YEAR = 1981; // American AAdvantage
export const COBRAND_FIRST_YEAR = 1987;
const EARN = [0, 0.3, 0.5, 0.65, 0.85]; // miles per km flown, by programme level (service 1–5)
const REDEEM_RATE = 0.01; // share of outstanding miles redeemed each week
const EXPIRY_RATE = 0.0025; // breakage
export const MILE_COST = 0.005; // cost to the airline of a redeemed mile (2027$)
// Card miles per member per week (card spend × share of members holding the card).
const CARD_SPEND = { NA: 60, EU: 35, OC: 40, AS: 25, ME: 30, LA: 15, AF: 10 };
const BANKS = ['Continental Trust', 'Harbour Bank', 'Meridian Card Services', 'First Union Card', 'Atlas Financial'];
export const PRESALE_DISCOUNT = 0.15;

export const loyaltyOn = (state) => yearOf(state.week) >= LOYALTY_FIRST_YEAR && (state.service?.loyalty ?? 1) >= 2;

// Members make flexible (mostly business) travellers more likely to choose us.
export function loyaltyBoost(state) {
  const L = state.loyalty;
  if (!L?.members || !loyaltyOn(state)) return 1;
  const weeklyPax = Math.max(1, state.lastReport?.pax ?? 1);
  return 1 + 0.05 * clamp(L.members / (weeklyPax * 30), 0, 1) + (L.bank ? 0.01 : 0);
}

export const loyaltyLiability = (state) => (state.loyalty?.miles ?? 0) * MILE_COST;

// Weekly miles a bank buys under a co-brand card deal.
const cardMiles = (state, L) => L.members * CARD_SPEND[airportByCode[state.hubs[0].code].region] * (L.bank?.spend ?? 1);
export const cardWeekly = (state) => (state.loyalty?.bank ? cardMiles(state, state.loyalty) * state.loyalty.bank.price : 0);

export function bankOffer(state) {
  const L = state.loyalty;
  const reasons = [];
  if (yearOf(state.week) < COBRAND_FIRST_YEAR) reasons.push(`Co-brand credit cards arrive in ${COBRAND_FIRST_YEAR}`);
  if (!loyaltyOn(state)) reasons.push('Run a frequent flyer programme first (Service › loyalty level 2+)');
  if ((L?.members ?? 0) < 150e3) reasons.push('Banks want at least 150,000 members');
  if (L?.bank) reasons.push(`Already signed with ${L.bank.name}`);
  if (state.reputation < 40) reasons.push('Reputation 40+ required');
  const biz = airportByCode[state.hubs[0].code].biz ?? 0.6;
  const price = 0.011 + 0.003 * clamp(biz, 0, 1) + 0.002 * clamp((state.reputation - 50) / 50, 0, 1);
  const name = BANKS[(state.hubs[0].code.charCodeAt(0) + (L?.deals ?? 0)) % BANKS.length];
  const weekly = L ? cardMiles(state, { ...L, bank: { spend: 1 } }) * price : 0;
  return { name, price, weekly, bonus: weekly * 8, years: 5, reasons };
}

export function signBankDeal(state) {
  const o = bankOffer(state);
  if (o.reasons.length) return fail(o.reasons[0]);
  const L = state.loyalty;
  L.bank = { name: o.name, price: o.price, spend: 1, signed: state.week, until: state.week + o.years * 52 };
  L.deals = (L.deals ?? 0) + 1;
  state.cash += o.bonus;
  log(state, `Co-brand card deal with ${o.name}: ${money(o.bonus)} signing bonus and about ${money(o.weekly)} a week for miles.`, 'good', 'finance');
  return ok();
}

// Pre-sell a year of card miles for cash now (as airlines did in 2008 and 2020).
export function presellMiles(state, weeks = 52) {
  const L = state.loyalty;
  if (!L?.bank) return fail('Sign a co-brand card deal first');
  if (L.presold > 0) return fail('Miles are already pre-sold');
  weeks = Math.min(weeks, L.bank.until - state.week);
  if (weeks < 13) return fail('Too little of the deal is left to pre-sell');
  const cash = cardWeekly(state) * weeks * (1 - PRESALE_DISCOUNT);
  L.presold = weeks;
  state.cash += cash;
  log(state, `Pre-sold ${weeks} weeks of miles to ${L.bank.name} for ${money(cash)}.`, 'info', 'finance');
  return ok({ cash });
}

// Weekly: members, miles issued, redeemed and sold.
export function loyaltyTick(state, legList) {
  if (!loyaltyOn(state)) return { revenue: 0, cost: 0 };
  const L = (state.loyalty ??= { members: 0, miles: 0, bank: null, presold: 0, launched: state.week });
  const level = clamp(state.service.loyalty, 1, 5);
  const pax = sum(legList, (l) => l.s.paxTotal);
  const paxKm = sum(legList, (l) => l.s.paxTotal * l.route.distance);
  // Enrolment from travellers, churn from inactive members.
  L.members = Math.max(0, L.members * 0.998 + pax * 0.04 * (level - 1));
  const issued = paxKm * EARN[level - 1];
  const redeemed = L.miles * REDEEM_RATE;
  L.miles = Math.max(0, L.miles + issued - redeemed - L.miles * EXPIRY_RATE);
  let revenue = 0;
  if (L.bank) {
    if (state.week >= L.bank.until) {
      log(state, `The co-brand card deal with ${L.bank.name} has expired. Sign a new one from Management › Partners.`, 'info', 'finance');
      L.bank = null;
      L.presold = 0;
    } else {
      const sold = cardMiles(state, L);
      L.miles += sold;
      if (L.presold > 0) L.presold -= 1;
      else revenue = sold * L.bank.price;
    }
  }
  L.lastIssued = issued;
  L.lastRedeemed = redeemed;
  L.lastCard = revenue;
  return { revenue, cost: redeemed * MILE_COST };
}
