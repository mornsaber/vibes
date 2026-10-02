// Advisor and autopilot: optional automatic pricing toward a target load
// factor (base fares and the advance-fare bucket), automatic assignment of
// idle aircraft, and route suggestions the CEO can apply with one click.

import { CLASSES } from '../data/aircraft.js';
import { clamp, sum, ok, fail, log } from './core.js';
import { fareNow, DEFAULT_RM } from './market.js';
import { brandOf, brandKind } from './brands.js';
import { typeOf, isDelivered, isFreighter } from './fleet.js';
import {
  canOperate, maxFrequency, setFrequency, routeFreq, routeById, entryFreq, closeRoute, scheduledHours, availableHours, seasonOf, setSchedule, roundTripHours, scheduleVersion, slotInfo,
} from './network.js';

export const defaultAutopilot = () => ({ pricing: true, rm: true, fleet: true, targetLF: 0.84 });
// Autopilot fare range as a multiple of the brand's normal price level: it won't
// dump fares to fill seats that shouldn't be flown (that's a capacity problem).
export const PRICE_RANGE = [0.8, 1.6];

const priceIdx = (state, r) => r.fares.Y / fareNow(state, r.distance, 'Y');
export const autoPriced = (state, r) => (state.autopilot?.pricing ?? false) && r.autoPrice !== false;

function setIndex(state, r, idx, manual = false) {
  const level = brandKind(brandOf(state, r)).fareIdx ?? 1;
  idx = manual ? clamp(idx, 0.3, 3) : clamp(idx, PRICE_RANGE[0] * level, PRICE_RANGE[1] * level);
  for (const c of CLASSES) r.fares[c] = Math.round(fareNow(state, r.distance, c) * idx);
}

// Spill: passengers who wanted a seat this week but didn't get one.
export const spill = (r) => (r.last ? Math.max(0, sum(CLASSES, (c) => r.last.demand[c] ?? 0) - r.last.paxTotal) : 0);

// Weekly: nudge fares and the advance bucket toward the target load factor.
export function autoPricing(state) {
  const ap = state.autopilot;
  if (!ap?.pricing) return;
  const target = clamp(ap.targetLF ?? 0.84, 0.6, 0.97);
  for (const r of state.routes) {
    if (r.autoPrice === false || !r.last?.seatTotal) continue;
    const lf = r.last.lf;
    const rm = (r.rm ??= { ...DEFAULT_RM });
    const gap = lf - target;
    // Revenue management first: when full, protect seats for flexible buyers; when empty, open the advance bucket.
    if (ap.rm) {
      if (gap > 0.03 && rm.advShare > 0.25) rm.advShare = Math.round((rm.advShare - 0.05) * 100) / 100;
      else if (gap < -0.06 && rm.advShare < 0.9) rm.advShare = Math.round((rm.advShare + 0.05) * 100) / 100;
    }
    const idx = priceIdx(state, r);
    if (gap > 0.04) setIndex(state, r, idx * (1 + Math.min(0.05, gap * 0.4)));
    else if (gap < -0.06) setIndex(state, r, idx * (1 - Math.min(0.05, -gap * 0.3)));
  }
}

// Score how badly a route needs more seats from this aircraft.
function needScore(state, ac, r) {
  if (!canOperate(state, ac, r).ok) return -1;
  const max = maxFrequency(state, ac, r);
  if (max < 1) return -1;
  if (isFreighter(typeOf(ac))) return r.last ? Math.max(0, (r.last.cargoCap ? r.last.cargoKg / r.last.cargoCap : 1) - 0.7) * 10 + 0.1 : 0.5;
  const freq = routeFreq(state, r);
  if (!freq) return 100 - r.distance / 1000; // unserved routes first
  if (!r.last) return 1;
  return spill(r) / Math.max(1, r.last.seatTotal) + (r.last.lf > 0.9 ? 0.5 : 0) + (r.last.profit > 0 ? 0.2 : 0);
}

// Assign within the slots we hold, buying more with up to 10% of cash; if that
// isn't enough, fly fewer frequencies. Returns the setFrequency result.
export function autoAssign(state, ac, r, freq, current = 0) {
  const ends = [r.a, r.b].map((code) => slotInfo(state, code)).filter(Boolean).map((i) => ({ room: Math.max(0, i.held - i.used), pool: i.pool, price: i.price }));
  const extra = freq - current;
  if (ends.every((e) => e.room >= extra)) return setFrequency(state, ac.id, r.id, freq, { autoSlots: false });
  // Buy only the slots that are missing at each end, within 10% of cash and this month's pool; fly what fits.
  const budget = state.cash * 0.1;
  const cost = (n) => ends.reduce((a, e) => a + Math.max(0, n - e.room) * e.price, 0);
  const fits = (n) => ends.every((e) => n - e.room <= e.pool) && cost(n) <= budget;
  let n = extra;
  while (n > 0 && !fits(n)) n--;
  if (n < (current ? 1 : 3)) return fail('No slots');
  return setFrequency(state, ac.id, r.id, current + n, { autoSlots: ends.some((e) => n > e.room) });
}

// Weekly: put idle aircraft to work on the routes with the most unmet demand.
export function autoFleet(state) {
  if (!state.autopilot?.fleet) return [];
  const done = [];
  for (const ac of state.fleet) {
    if (ac.schedule.length || ac.contractHours || ac.retired || ac.grounded || ac.deliveryWeek > state.week + 2) continue;
    // An aircraft that fitted nowhere is retried monthly or when the network changes.
    // (Kept on the aircraft so a reloaded save behaves identically.)
    const miss = ac.autoMiss;
    if (miss && miss.routes === state.routes.length && state.week - miss.week < 4) continue;
    const ranked = state.routes.map((r) => ({ r, score: needScore(state, ac, r) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    let placed = false;
    // Try the neediest routes in turn (a slot-constrained one may not fit).
    for (const { r } of ranked.slice(0, 5)) {
      // Fill the shortfall but stay sensible: a daily-ish rotation, or whatever the aircraft can do.
      const want = !routeFreq(state, r) ? 14 : Math.max(3, Math.ceil(spill(r) / 2 / Math.max(1, sum(CLASSES, (c) => ac.config[c] || 0) * 0.85)));
      const freq = Math.min(maxFrequency(state, ac, r), want);
      if (freq < 1 || !autoAssign(state, ac, r, freq).ok) continue;
      const got = entryFreq(ac, r.id);
      done.push({ ac: ac.reg, route: `${r.a}–${r.b}`, freq: got });
      log(state, `Autopilot: ${ac.reg} assigned to ${r.a}–${r.b} (${got}×/wk).`, 'info', 'network');
      placed = true;
      break;
    }
    if (placed) delete ac.autoMiss;
    else ac.autoMiss = { routes: state.routes.length, week: state.week };
  }
  // Rebalance: if routes sit unserved, move one aircraft a week off a route
  // that has several aircraft and is running badly empty.
  const unserved = state.routes.filter((r) => !routeFreq(state, r));
  if (unserved.length) {
    const donors = state.fleet.filter((ac) => isDelivered(state, ac) && ac.schedule.length === 1 && !ac.contractHours).filter((ac) => {
      const r = routeById(state, ac.schedule[0].routeId);
      return r?.last?.seatTotal && r.last.lf < 0.55 && state.fleet.filter((x) => x.schedule.some((e) => e.routeId === r.id)).length > 1;
    });
    for (const ac of donors) {
      const to = unserved.find((r) => canOperate(state, ac, r).ok);
      if (!to) continue;
      const from = routeById(state, ac.schedule[0].routeId);
      const before = ac.schedule;
      setSchedule(state, ac, []);
      const res = autoAssign(state, ac, to, Math.min(14, maxFrequency(state, ac, to)));
      if (!res.ok) {
        setSchedule(state, ac, before);
        continue;
      }
      done.push({ ac: ac.reg, route: `${to.a}–${to.b}`, freq: entryFreq(ac, to.id) });
      log(state, `Autopilot: moved ${ac.reg} from half-empty ${from.a}–${from.b} to unserved ${to.a}–${to.b}.`, 'info', 'network');
      break;
    }
  }
  // Second pass: aircraft with lots of spare hours top up their own spilling routes.
  for (const ac of state.fleet) {
    if (!ac.schedule.length || !isDelivered(state, ac)) continue;
    const spare = availableHours(state, ac) - scheduledHours(state, ac);
    if (spare < 8) continue;
    for (const e of ac.schedule) {
      const r = routeById(state, e.routeId);
      if (!r?.last || r.last.lf < 0.9 || e.season) continue;
      const max = maxFrequency(state, ac, r);
      if (max > e.freq) {
        const res = autoAssign(state, ac, r, Math.min(max, e.freq + 3), e.freq);
        if (res.ok) done.push({ ac: ac.reg, route: `${r.a}–${r.b}`, freq: e.freq });
        break;
      }
    }
  }
  return done;
}

// ---------------------------------------------------------------------------
// Suggestions

// Aircraft with spare weekly hours (computed once per advice pass).
export function spareAircraft(state) {
  return state.fleet
    .filter((ac) => isDelivered(state, ac) && !ac.retired)
    .map((ac) => ({ ac, spare: availableHours(state, ac) - scheduledHours(state, ac) }))
    .filter((x) => x.spare > 1);
}

function idleFor(state, r, spare = spareAircraft(state)) {
  let best = null;
  let bestMax = 0;
  for (const { ac, spare: h } of spare) {
    if (h < roundTripHours(typeOf(ac), r.distance) || !canOperate(state, ac, r).ok) continue;
    const max = maxFrequency(state, ac, r);
    if (max > entryFreq(ac, r.id) && max > bestMax) {
      best = ac;
      bestMax = max;
    }
  }
  return best;
}

// Advice is memoised until the week, the schedule, the routes or the autopilot change.
const adviceMemo = new WeakMap();
export function adviseRoutes(state) {
  const key = `${state.week}|${state.routes.length}|${state.fleet.length}|${JSON.stringify(state.autopilot)}|${state.routes.filter((r) => r.autoPrice === false).length}`;
  const hit = adviceMemo.get(state);
  if (hit && hit.key === key && hit.version === scheduleVersion(state)) return hit.out;
  const out = computeAdvice(state);
  adviceMemo.set(state, { key, version: scheduleVersion(state), out });
  return out;
}

function computeAdvice(state) {
  const out = [];
  const spareList = spareAircraft(state);
  const idleFor2 = (r) => idleFor(state, r, spareList);
  const add = (r, kind, tone, text, label) => out.push({ routeId: r.id, kind, tone, text, label, route: `${r.a}–${r.b}` });
  for (const r of state.routes) {
    const l = r.last;
    const freq = routeFreq(state, r);
    if (!freq) {
      if (idleFor2(r)) add(r, 'assign', 'warn', `${r.a}–${r.b} has no aircraft. ${idleFor2(r).reg} has spare hours.`, 'Assign');
      continue;
    }
    if (!l?.seatTotal) continue;
    const s = spill(r);
    const losing = (r.hist ?? []).slice(-8);
    const chronic = losing.length >= 8 && losing.every((h) => h.profit < 0);
    if (chronic && l.contribution < 0) add(r, 'close', 'bad', `${r.a}–${r.b} has lost money for 8 weeks and doesn't cover its direct costs.`, 'Close route');
    else if (l.lf > 0.93 && s > l.seatTotal * 0.15 && idleFor2(r)) add(r, 'capacity', 'good', `${r.a}–${r.b} turned away ${Math.round(s)} passengers last week.`, 'Add flights');
    else if (l.lf > 0.92 && !autoPriced(state, r)) add(r, 'raise', 'good', `${r.a}–${r.b} is ${Math.round(l.lf * 100)}% full — fares can go up.`, 'Fares +7%');
    else if (l.lf < 0.55 && freq > 3) add(r, 'cut', 'warn', `${r.a}–${r.b} is only ${Math.round(l.lf * 100)}% full on ${Math.round(freq)} weekly flights.`, 'Cut 25%');
    else if (l.lf < 0.65 && !autoPriced(state, r)) add(r, 'lower', 'warn', `${r.a}–${r.b} is ${Math.round(l.lf * 100)}% full — cheaper fares would fill seats.`, 'Fares −7%');
    else if (l.profit < 0 && l.contribution > 0) add(r, 'info', 'info', `${r.a}–${r.b} covers its direct costs but not crew and aircraft ownership — fine as network feed, weak on its own.`, null);
  }
  const order = { bad: 0, warn: 1, good: 2, info: 3 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

export function applyAdvice(state, routeId, kind) {
  const r = routeById(state, routeId);
  if (!r) return fail('No such route');
  switch (kind) {
    case 'assign':
    case 'capacity': {
      const ac = idleFor(state, r);
      if (!ac) return fail('No aircraft with spare hours can fly this route');
      const now = entryFreq(ac, r.id);
      const add = kind === 'assign' ? 14 : Math.max(2, Math.ceil(spill(r) / 2 / Math.max(1, sum(CLASSES, (c) => ac.config[c] || 0))));
      return setFrequency(state, ac.id, r.id, Math.min(maxFrequency(state, ac, r), now + add));
    }
    case 'raise':
    case 'lower': {
      r.autoPrice = false;
      setIndex(state, r, priceIdx(state, r) * (kind === 'raise' ? 1.07 : 0.93), true);
      return ok({ message: `Fares ${kind === 'raise' ? 'raised' : 'cut'} 7% on ${r.a}–${r.b}.` });
    }
    case 'cut': {
      const season = seasonOf(state.week);
      for (const ac of state.fleet) {
        for (const e of ac.schedule.filter((x) => x.routeId === r.id)) {
          const se = e.season ?? 'all';
          if (se !== 'all' && se !== season) continue;
          setFrequency(state, ac.id, r.id, Math.floor(e.freq * 0.75), { season: se });
        }
      }
      return ok({ message: `Cut frequencies on ${r.a}–${r.b} by a quarter.` });
    }
    case 'close':
      return closeRoute(state, r.id);
    default:
      return fail('Nothing to apply');
  }
}

export function setAutopilot(state, patch) {
  state.autopilot = { ...defaultAutopilot(), ...(state.autopilot ?? {}), ...patch };
  if (patch.targetLF != null) state.autopilot.targetLF = clamp(Number(patch.targetLF), 0.6, 0.97);
  return ok();
}

export function setRouteRm(state, routeId, patch) {
  const r = routeById(state, routeId);
  if (!r) return fail('No such route');
  const rm = { ...DEFAULT_RM, ...(r.rm ?? {}) };
  if (patch.spread != null) rm.spread = clamp(Number(patch.spread), 0, 0.6);
  if (patch.advShare != null) rm.advShare = clamp(Number(patch.advShare), 0, 1);
  if (patch.peak != null) rm.peak = clamp(Number(patch.peak), 1, 1.4);
  if (patch.offpeak != null) rm.offpeak = clamp(Number(patch.offpeak), 0.6, 1);
  r.rm = rm;
  if (patch.autoPrice != null) r.autoPrice = !!patch.autoPrice;
  return ok();
}
