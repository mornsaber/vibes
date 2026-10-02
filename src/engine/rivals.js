// Rival airlines: era-aware roster (historic carriers come and go, loosely
// following history), generated startups, finances, hostility, fare wars,
// staff poaching, mergers among rivals, bankruptcies — plus your own
// codeshares, alliances, minority stakes and acquisitions.

import { RIVALS, rivalById, RIVAL_TYPES, ALLIANCES } from '../data/rivals.js';
import { AIRPORTS, airportByCode, COUNTRIES } from '../data/airports.js';
import { AIRCRAFT, inService } from '../data/aircraft.js';
import { ROLE_IDS } from '../data/business.js';
import { eraFuel, regionDemand } from '../data/eras.js';
import { clamp, fail, ok, rand, randInt, randNormal, pick, weightedPick, log, money, pairKey, sum, yearOf, distanceKm } from './core.js';
import { rivalsOn, rivalsContext, rivalAlliance, ALLIANCE_FOUNDED, sameMarket, rivalDef, rivalFliesNonstop, trafficRights, marketNow } from './market.js';
import { makeAircraft, monthlyLeaseRate } from './fleet.js';
import { openRoute, canOperate, maxFrequency, setFrequency, isHub, newHub } from './network.js';
import { foreignStakeCap } from './regulation.js';
import { contestTick, fleetTick, allianceTick, driftMarkets } from './rivalai.js';
import { launchBrand } from './brands.js';
import { staffRequirements, addToGrade } from './staff.js';
import { marketCap, sharePrice } from './finance.js';

const MAX_STARTUPS = 10;

export const activeRivals = (state) => [...RIVALS, ...state.newRivals].filter((r) => state.rivals[r.id]?.status === 'active');

function rivalState(state, r, fleet) {
  return {
    cash: fleet * 8e6,
    rep: clamp(45 + r.quality * 20 + randNormal(state) * 4, 30, 95),
    fareIdx: 1,
    capIdx: 1,
    hostility: 0,
    relation: 50,
    status: 'active',
    fleet,
    profitQ: 0,
    margin: 0.05,
    payIdx: clamp(1 + (r.quality - 1) * 0.5 + randNormal(state) * 0.05, 0.9, 1.25),
  };
}

export function initRivals(state) {
  state.rivals = {};
  state.newRivals = state.newRivals ?? [];
  state.stakes = state.stakes ?? {};
  const year = state.startYear;
  for (const r of RIVALS) {
    const region = airportByCode[r.hubs[0]].region;
    if (r.founded > year) {
      state.rivals[r.id] = { status: 'future' };
      continue;
    }
    if (r.ceased != null && r.ceased <= year) {
      state.rivals[r.id] = { status: 'defunct' };
      continue;
    }
    const ref = r.historic ? regionDemand(region, Math.min(r.ceased - 5, 2027)) : regionDemand(region, 2027);
    const fleet = Math.max(5, Math.round(r.fleet * clamp(regionDemand(region, year) / ref, 0.08, 1.2)));
    state.rivals[r.id] = rivalState(state, r, fleet);
  }
}

// ---------------------------------------------------------------------------
// Startups

const PREFIX = ['Aurora', 'Blue', 'Sky', 'Horizon', 'Polar', 'Sun', 'Zephyr', 'Atlas', 'Nova', 'Coastal', 'Summit', 'Meridian', 'Falcon', 'Silver', 'Jade', 'Crimson', 'Pacific', 'Northern', 'Global', 'Spirit of', 'Liberty', 'Orbit', 'Kestrel', 'Vista'];
const SUFFIX = ['Air', 'Airways', 'Jet', 'Express', 'Wings', 'Airlines', 'Connect', 'Fly'];

export function spawnStartup(state, { type, hub } = {}) {
  if (state.newRivals.filter((r) => state.rivals[r.id]?.status === 'active').length >= MAX_STARTUPS) return null;
  const year = yearOf(state.week);
  if (!hub) {
    // Half the time they set up right where you are making money.
    const home = AIRPORTS.filter((a) => sameMarket(state.airline.home, a.country) && a.runway >= 2000 && a.pop > 1);
    const pool = rand(state) < 0.5 && home.length ? home : AIRPORTS.filter((a) => a.runway >= 2000 && a.pop > 1.5);
    hub = weightedPick(state, pool, (a) => a.pop * regionDemand(a.region, year)).code;
  }
  type = type ?? weightedPick(state, year < 1978 ? ['legacy'] : ['lcc', 'ulcc', 'legacy', 'connector'], (t) => ({ lcc: 4, ulcc: 2, legacy: 2, connector: 1 })[t]);
  let name;
  for (let i = 0; i < 20; i++) {
    name = `${pick(state, PREFIX)} ${pick(state, SUFFIX)}`;
    if (![...RIVALS, ...state.newRivals].some((r) => r.name === name) && name !== state.airline.name) break;
  }
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const code = letters[randInt(state, 0, 25)] + letters[randInt(state, 0, 25)];
  const id = `N${state.nextId++}`;
  const def = {
    id, name, code, country: airportByCode[hub].country, type, alliance: null, hubs: [hub],
    fleet: randInt(state, 6, 20), quality: clamp(0.9 + rand(state) * 0.35, 0.8, 1.25), aggression: clamp(0.5 + rand(state) * 0.45, 0, 1),
    founded: year, startup: true,
  };
  state.newRivals.push(def);
  state.rivals[id] = { ...rivalState(state, def, def.fleet), cash: def.fleet * 6e6 + 50e6 };
  log(state, `New airline: ${name} (${RIVAL_TYPES[type].label.toLowerCase()}) launches from ${airportByCode[hub].city} with ${def.fleet} aircraft.`, 'bad', 'rivals');
  return def;
}

// ---------------------------------------------------------------------------
// Monthly AI

function eraTransitions(state) {
  const year = yearOf(state.week);
  for (const r of RIVALS) {
    const rs = state.rivals[r.id];
    if (rs.status === 'future' && r.founded <= year) {
      if (rand(state) < 0.85) {
        state.rivals[r.id] = rivalState(state, r, randInt(state, 8, 25));
        log(state, `${r.name} is founded in ${COUNTRIES[r.country]} and begins flying.`, 'info', 'rivals');
      } else state.rivals[r.id] = { status: 'never' };
    }
    if (rs.status === 'active' && r.ceased != null && r.ceased <= year && !rs.historyChecked) {
      rs.historyChecked = true;
      // History usually repeats... but not always.
      if (rand(state) < 0.6) exitRival(state, r, r.successor ? `merged into ${rivalDef(state, r.successor)?.name}` : 'ceased operations');
      else log(state, `Against expectations, ${r.name} survives its crisis year.`, 'info', 'rivals');
    }
  }
}

function exitRival(state, r, how) {
  const rs = state.rivals[r.id];
  const successor = r.successor && state.rivals[r.successor]?.status === 'active' ? r.successor : null;
  if (successor && how.startsWith('merged')) {
    rs.status = 'merged';
    rs.mergedInto = successor;
    state.rivals[successor].fleet += rs.fleet;
  } else {
    rs.status = 'bankrupt';
    state.queue.push({ event: 'rival_collapse', data: { rivalId: r.id } });
  }
  log(state, `${r.name} has ${how}.`, 'good', 'rivals');
}

// Your routes each rival flies nonstop, for every rival in one pass.
export function overlapIndex(state) {
  const ctx = rivalsContext(state, { memo: false });
  const idx = new Map();
  for (const r of state.routes) {
    for (const x of rivalsOn(state, r.a, r.b, ctx)) {
      if (!x.nonstop) continue;
      if (!idx.has(x.id)) idx.set(x.id, []);
      idx.get(x.id).push(r);
    }
  }
  return idx;
}

export function overlapRoutes(state, rivalId, ctx = rivalsContext(state, { memo: false })) {
  return state.routes.filter((r) => rivalsOn(state, r.a, r.b, ctx).some((x) => x.id === rivalId && x.nonstop));
}

export function rivalValuation(state, id) {
  const rs = state.rivals[id];
  return Math.max(rs.fleet * 2e6, rs.fleet * (6e6 + rs.margin * 40e6) + rs.cash * 0.5);
}

export function rivalsTick(state) {
  eraTransitions(state);
  const overlaps = overlapIndex(state);
  const year = yearOf(state.week);
  const fuelGap = state.macro.fuel - eraFuel(year);
  const homeRegion = airportByCode[state.hubs[0].code].region;
  const offers = { pilots: 0, cabin: 0, engineers: 0 };
  const poachers = { pilots: null, cabin: null, engineers: null };

  const agg = (state.settings?.rivals ?? 1);
  for (const r of activeRivals(state)) {
    const rs = state.rivals[r.id];
    // Finances.
    rs.margin = clamp(0.05 + (state.macro.economy - 1) * 0.4 - fuelGap * 0.15 + randNormal(state) * 0.03 + (r.quality - 1) * 0.05 - (r.startup && rs.fleet < 25 ? 0.04 : 0), -0.25, 0.2);
    const profit = rs.fleet * 1.2e6 * rs.margin;
    rs.cash += profit;
    rs.profitQ += profit;
    // Established carriers mostly grow through their aircraft orders (see rivalai.js).
    const growth = r.startup ? (rs.margin > 0.02 ? 0.03 : -0.01) : rs.margin > 0.04 ? 0.002 : -0.003;
    rs.fleet = Math.max(3, Math.round(rs.fleet * (1 + growth) + (r.startup && rs.margin > 0.02 && rand(state) < 0.5 ? 1 : 0)));
    rs.rep = clamp(rs.rep + randNormal(state) * 0.8, 25, 98);
    rs.payIdx = clamp(rs.payIdx + (rs.margin > 0.06 ? 0.005 : -0.003) + randNormal(state) * 0.005, 0.85, 1.35);
    // Growing startups open a second base.
    if (r.startup && rs.fleet > 40 && r.hubs.length < 3 && rand(state) < 0.1) {
      const base = pick(state, AIRPORTS.filter((a) => sameMarket(r.country, a.country) && a.runway >= 2000 && !r.hubs.includes(a.code)));
      if (base) {
        r.hubs.push(base.code);
        log(state, `${r.name} opens a new base at ${base.city}.`, 'bad', 'rivals');
      }
    }
    if (rs.cash < -rs.fleet * 2e6 && (rs.fleet < 200 || r.startup) && rand(state) < 0.12) {
      exitRival(state, r, 'collapsed into bankruptcy');
      continue;
    }

    // Hostility toward you.
    const overlap = overlaps.get(r.id) ?? [];
    const pressure = sum(overlap, (rt) => (rt.last?.share ?? 0) * (rt.last?.paxTotal ?? 0)) / Math.max(1, rs.fleet * 300);
    const allied = state.partners.codeshares.includes(r.id) || (state.partners.alliance && rivalAlliance(state, r) === state.partners.alliance) || state.stakes[r.id];
    rs.hostility = clamp(rs.hostility + (overlap.length ? (0.01 + pressure * r.aggression) * agg : -0.04) - (allied ? 0.1 : 0), 0, 1);
    rs.relation = clamp(rs.relation + (allied ? 1 : 0) - rs.hostility * 3 + 0.5, 0, 100);

    // Responses on contested routes.
    for (const rt of overlap) {
      const share = rt.last?.share ?? 0;
      if (allied || share < 0.18) continue;
      const m = (market(state, rt.a, rt.b)[r.id] ??= {});
      const roll = rand(state);
      if (roll < r.aggression * agg * rs.hostility * 0.25) {
        m.fare = Math.max(0.7, (m.fare ?? 1) * 0.9);
        log(state, `${r.name} slashes fares on ${rt.a}–${rt.b} to fight you (${Math.round((1 - m.fare) * 100)}% below normal).`, 'bad', 'rivals');
      } else if (roll < r.aggression * agg * rs.hostility * 0.45) {
        m.cap = Math.min(2, (m.cap ?? 1) * 1.25);
        log(state, `${r.name} adds capacity on ${rt.a}–${rt.b}.`, 'bad', 'rivals');
      }
    }

    // Staff packages: rivals in your region recruit your people.
    const local = r.hubs.some((h) => airportByCode[h].region === homeRegion);
    if (local && r.type !== 'cargo') {
      for (const role of Object.keys(offers)) {
        const appetite = rs.margin > 0.03 ? rs.payIdx + rs.hostility * 0.08 : 0;
        if (appetite > offers[role]) {
          offers[role] = appetite;
          poachers[role] = r;
        }
      }
    }
  }

  // Poaching pressure on your workforce.
  for (const role of Object.keys(offers)) {
    const w = state.staff[role];
    const gap = offers[role] - w.pay;
    const before = w.poach;
    w.poach = gap > 0.03 && poachers[role] ? Math.min(0.004, gap * 0.02 * (0.5 + poachers[role].aggression)) : w.poach * 0.5;
    if (w.poach > 0.0008 && before <= 0.0008) {
      log(state, `${poachers[role].name} is offering ${role === 'pilots' ? 'pilots' : role === 'cabin' ? 'cabin crew' : 'engineers'} ${Math.round(gap * 100)}% more than you pay. Expect resignations unless you match.`, 'bad', 'staff');
    }
  }

  // Reactive behaviour: fare matching and retreat, fleet orders and network
  // changes, alliances, and drift of market adjustments back to normal.
  contestTick(state, overlaps);
  fleetTick(state, typicalTypes);
  allianceTick(state, activeRivals);
  driftMarkets(state);

  // New entrants on profitable, thinly contested routes.
  for (const rt of state.routes) {
    const last = rt.last;
    if (!last || last.contribution <= 0 || last.lf < 0.82) continue;
    const present = rivalsOn(state, rt.a, rt.b).filter((x) => x.nonstop);
    if (present.length >= 2 || rand(state) > 0.04 * (state.settings?.rivals ?? 1)) continue;
    const candidates = activeRivals(state).filter((r) => r.type !== 'cargo' && !present.some((p) => p.id === r.id) && rt.distance <= RIVAL_TYPES[r.type].range && [rt.a, rt.b].some((c) => sameMarket(r.country, airportByCode[c].country)));
    if (!candidates.length) continue;
    const r = pick(state, candidates);
    market(state, rt.a, rt.b)[r.id] = { entered: true, fare: 0.9 };
    log(state, `${r.name} launches service on ${rt.a}–${rt.b}, attracted by your success.`, 'bad', 'rivals');
  }

  // Startups appear — more often when the industry (and you) are making money.
  const profitable = (state.lastReport?.profit ?? 0) > 0;
  if (year >= 1970 && rand(state) < 0.025 * (profitable ? 1.6 : 1) * state.macro.economy * (state.settings?.startups ?? 1)) spawnStartup(state);

  // Consolidation among rivals.
  if (rand(state) < 0.012) rivalMerger(state);

  // A predator circles if your share price is weak.
  const cap = marketCap(state);
  const predator = activeRivals(state).find((r) => r.type !== 'cargo' && state.rivals[r.id].cash > cap * 1.3 && sameMarket(r.country, state.airline.home));
  if (predator && cap > 40e6 && state.board.confidence < 40 && rand(state) < 0.06 && !state.queue.some((q) => q.event === 'takeover_bid')) {
    state.queue.push({ event: 'takeover_bid', data: { rivalId: predator.id, price: Math.round(cap * 1.35) } });
  }

  // Dividends from minority stakes.
  for (const [id, pct] of Object.entries(state.stakes)) {
    const rs = state.rivals[id];
    if (rs?.status !== 'active') {
      delete state.stakes[id];
      log(state, `Your stake in ${rivalDef(state, id)?.name} has been written off.`, 'bad', 'finance');
    }
  }
}

function rivalMerger(state) {
  const list = activeRivals(state).filter((r) => r.type !== 'cargo');
  const weak = list.filter((r) => state.rivals[r.id].margin < 0 || state.rivals[r.id].cash < 0);
  if (!weak.length) return;
  const target = pick(state, weak);
  const buyers = list.filter((r) => r !== target && sameMarket(r.country, target.country) && state.rivals[r.id].fleet > state.rivals[target.id].fleet && state.rivals[r.id].margin > 0.02);
  if (!buyers.length) return;
  const buyer = pick(state, buyers);
  const ts = state.rivals[target.id];
  ts.status = 'merged';
  ts.mergedInto = buyer.id;
  state.rivals[buyer.id].fleet += ts.fleet;
  state.rivals[buyer.id].cash -= ts.fleet * 3e6;
  log(state, `${buyer.name} acquires struggling ${target.name}, absorbing its ${ts.fleet} aircraft.`, 'bad', 'rivals');
}

export function quarterlyRivalReset(state) {
  let dividends = 0;
  for (const [id, pct] of Object.entries(state.stakes)) {
    const rs = state.rivals[id];
    if (rs?.status === 'active' && rs.profitQ > 0) dividends += rs.profitQ * pct * 0.5;
  }
  if (dividends) {
    state.cash += dividends;
    state.stakeIncome = (state.stakeIncome ?? 0) + dividends;
    log(state, `Dividends from airline stakes: ${money(dividends)}.`, 'good', 'finance');
  }
  for (const rs of Object.values(state.rivals)) if (rs.status === 'active') rs.profitQ = 0;
}

function market(state, a, b) {
  return (state.rivalMarkets[pairKey(a, b)] ??= {});
}

// ---------------------------------------------------------------------------
// Partnerships

export function codeshareTerms(state, rivalId) {
  const r = rivalDef(state, rivalId);
  const rs = state.rivals[rivalId];
  const reasons = [];
  if (!r || r.type === 'cargo') reasons.push('Cargo airlines do not codeshare');
  if (rs?.status !== 'active') reasons.push('Airline is not operating');
  if (state.reputation < 45) reasons.push('Your reputation must be at least 45');
  if (rs && rs.hostility > 0.6) reasons.push(`${r.name} sees you as a threat`);
  if (r && state.hubs.some((h) => r.hubs.includes(h.code)) && rivalAlliance(state, r) !== state.partners.alliance && !state.stakes[rivalId]) reasons.push('They will not partner with a carrier hubbed at their own hub');
  const score = (rs?.relation ?? 0) / 100 + state.reputation / 200 - (rs?.hostility ?? 0) * 0.5 + (state.stakes[rivalId] ? 0.5 : 0);
  return { reasons, score, fee: 2e6 };
}

export function proposeCodeshare(state, rivalId) {
  if (state.partners.codeshares.includes(rivalId)) return fail('Already partners');
  const t = codeshareTerms(state, rivalId);
  if (t.reasons.length) return fail(t.reasons[0]);
  if (state.cash < t.fee) return fail(`Integration costs ${money(t.fee)}`);
  const r = rivalDef(state, rivalId);
  if (t.score < 0.6) {
    state.rivals[rivalId].relation = clamp(state.rivals[rivalId].relation - 5, 0, 100);
    return fail(`${r.name} declined. Build your reputation and relationship first.`);
  }
  state.cash -= t.fee;
  state.partners.codeshares.push(rivalId);
  log(state, `Codeshare signed with ${r.name}. Their customers can now book your flights from their hubs.`, 'good', 'partners');
  return ok();
}

export function endCodeshare(state, rivalId) {
  state.partners.codeshares = state.partners.codeshares.filter((x) => x !== rivalId);
  state.rivals[rivalId].relation = clamp(state.rivals[rivalId].relation - 15, 0, 100);
  log(state, `Ended the codeshare with ${rivalDef(state, rivalId).name}.`, 'bad', 'partners');
  return ok();
}

export function allianceTerms(state, name) {
  const a = ALLIANCES[name];
  const reasons = [];
  const formed = ALLIANCE_FOUNDED[name];
  if (yearOf(state.week) < formed) reasons.push(`${name} doesn't exist until ${formed}`);
  if (state.partners.alliance) reasons.push(`Already a member of ${state.partners.alliance}`);
  if (state.reputation < a.minRep) reasons.push(`Reputation ${a.minRep}+ required`);
  if (state.fleet.length < a.minFleet) reasons.push(`Fleet of ${a.minFleet}+ aircraft required`);
  return { ...a, reasons };
}

export function joinAlliance(state, name) {
  const t = allianceTerms(state, name);
  if (t.reasons.length) return fail(t.reasons[0]);
  if (state.cash < t.fee) return fail(`Joining costs ${money(t.fee)}`);
  state.cash -= t.fee;
  state.partners.alliance = name;
  for (const r of activeRivals(state).filter((x) => rivalAlliance(state, x) === name)) state.rivals[r.id].hostility = 0;
  log(state, `${state.airline.name} joins ${name}!`, 'good', 'partners');
  return ok();
}

export function leaveAlliance(state) {
  if (!state.partners.alliance) return fail('Not in an alliance');
  log(state, `Left ${state.partners.alliance}.`, 'bad', 'partners');
  state.partners.alliance = null;
  return ok();
}

// ---------------------------------------------------------------------------
// Mergers & acquisitions

export function acquisitionTerms(state, id) {
  const r = rivalDef(state, id);
  const rs = state.rivals[id];
  const reasons = [];
  if (!r || rs?.status !== 'active') reasons.push('Not an operating airline');
  const domestic = r && sameMarket(state.airline.home, r.country);
  if (r && !domestic) reasons.push(`Foreign-ownership rules stop you buying ${COUNTRIES[r.country]} airlines outright — take a stake instead`);
  if (r && r.type === 'cargo') reasons.push('Integrators are not for sale');
  if (rs && state.fleet.length + rs.fleet > 500) reasons.push('Competition regulators would block a combination this large');
  const value = rs?.status === 'active' ? rivalValuation(state, id) : 0;
  const premium = rs?.margin < 0 ? 1.1 : 1.35;
  // Domestic stakes are 25%; foreign ones are capped by ownership rules (25% or, after liberalisation, 49%).
  const stake = domestic ? 0.25 : foreignStakeCap(state);
  return { reasons, price: value * premium, value, stake, stakePrice: value * stake * 1.2, domestic };
}

// Fleet types a carrier of this kind would plausibly fly in this year.
export function typicalTypes(state, rtype) {
  const year = yearOf(state.week);
  const live = AIRCRAFT.filter((t) => inService(t, year) && year - t.intro >= 1 && t.cat !== 'freighter' && t.cat !== 'sst' && t.cat !== 'commuter');
  const pickCat = (cats) => live.filter((t) => cats.includes(t.cat));
  if (rtype === 'connector') return pickCat(['wide', 'jumbo']).length ? pickCat(['wide', 'jumbo']) : live;
  if (rtype === 'lcc' || rtype === 'ulcc') return pickCat(['narrow']).length ? pickCat(['narrow']) : live;
  return live;
}

export function acquireRival(state, id, payWith = 'cash', { asBrand = false } = {}) {
  if (state.restructuring?.status === 'active') return fail('Not allowed while in Chapter 11');
  const t = acquisitionTerms(state, id);
  if (t.reasons.length) return fail(t.reasons[0]);
  const r = rivalDef(state, id);
  const rs = state.rivals[id];
  if (payWith === 'cash') {
    if (state.cash < t.price) return fail(`The deal needs ${money(t.price)} in cash`);
    state.cash -= t.price;
  } else {
    const shares = t.price / (sharePrice(state) * 0.9);
    if (shares > state.finance.shares * 0.6) return fail('Too many new shares — your shareholders would lose control');
    state.finance.shares += shares;
    state.board.confidence = clamp(state.board.confidence - 6, 0, 100);
  }
  state.ledgerCapex.other += payWith === 'cash' ? t.price : 0;

  // Hubs in your home market join your network.
  for (const h of r.hubs) {
    if (!isHub(state, h) && sameMarket(state.airline.home, airportByCode[h].country)) {
      state.hubs.push(newHub(h, state.week));
      const ap = airportByCode[h];
      if (ap.slots) state.slots[h] = { held: (state.slots[h]?.held ?? 0) + (ap.slots === 2 ? 28 : 70), pool: state.slots[h]?.pool ?? 6 };
    }
  }
  // Their fleet (capped — the rest is sold off).
  const n = Math.min(rs.fleet, 80);
  const types = typicalTypes(state, r.type);
  const acquired = [];
  for (let i = 0; i < n && types.length; i++) {
    const type = weightedPick(state, types, (x) => (x.cat === 'narrow' ? 4 : x.cat === 'wide' ? 2 : 1));
    const age = randInt(state, 2, Math.max(2, Math.min(18, yearOf(state.week) - type.intro)));
    const owned = rand(state) < 0.5;
    const monthly = monthlyLeaseRate(state, type, age);
    acquired.push(makeAircraft(state, type.id, {
      owned, ageWeeks: age * 52, price: owned ? type.price * 0.94 ** age : 0,
      lease: owned ? null : { lessor: `${r.name} lessor`, monthly, startWeek: state.week, endWeek: state.week + randInt(state, 104, 400), deposit: 0 },
      reliability: 75 + rand(state) * 15,
    }));
  }
  // Their best routes from their hubs.
  const dests = [];
  for (const h of r.hubs) {
    for (const ap of AIRPORTS) {
      if (ap.code === h || !rivalFliesNonstop(r, h, ap.code) || !trafficRights(state, h, ap.code).ok) continue;
      dests.push({ a: h, b: ap.code, m: marketNow(state, h, ap.code) });
    }
  }
  dests.sort((x, y) => y.m - x.m);
  let opened = 0;
  const newRoutes = [];
  const cash = state.cash;
  const capex = state.ledgerCapex.other;
  state.cash = Infinity; // route launches are part of the deal
  for (const d of dests.slice(0, Math.ceil(n * 0.7))) {
    if (state.routes.some((x) => pairKey(x.a, x.b) === pairKey(d.a, d.b))) continue;
    const res = openRoute(state, d.a, d.b);
    if (res.ok) {
      opened += 1;
      newRoutes.push(res.route);
    }
  }
  state.cash = cash;
  state.ledgerCapex.other = capex;
  for (const ac of acquired) {
    const options = state.routes.filter((x) => r.hubs.includes(x.a) || r.hubs.includes(x.b)).filter((x) => canOperate(state, ac, x).ok && maxFrequency(state, ac, x) > 0);
    options.sort((x, y) => (x.last?.freq ?? 0) - (y.last?.freq ?? 0));
    if (options[0]) setFrequency(state, ac.id, options[0].id, Math.min(14, maxFrequency(state, ac, options[0])), { autoSlots: true });
  }
  // Their people.
  const req = staffRequirements(state);
  for (const role of ROLE_IDS) {
    const w = state.staff[role];
    const gap = Math.max(0, Math.round(req[role] * 1.05) - w.count);
    if (!gap) continue;
    const mix = [0.25, 0.35, 0.3, 0.07, 0.03];
    mix.forEach((m, g) => addToGrade(w, g, Math.round(gap * m), 6));
    w.morale = clamp(w.morale - 8, 0, 100);
    w.union.strength = clamp(w.union.strength + 0.05, 0, 1);
  }
  // Keep the acquired airline flying under its own name as a subsidiary brand.
  if (asBrand) {
    const kind = r.type === 'lcc' || r.type === 'ulcc' ? 'lcc' : r.type === 'connector' ? 'premium' : 'regional';
    const res = launchBrand(state, { name: r.name, code: r.code, kind, color: ['#e5484d', '#30a46c', '#8e4ec6', '#12a594'][(state.brands?.length ?? 0) % 4], rep: rs.rep });
    if (res.ok) for (const route of newRoutes) route.brand = res.brand.id;
  }
  rs.status = 'acquired';
  rs.acquiredBy = 'player';
  delete state.stakes[id];
  state.partners.codeshares = state.partners.codeshares.filter((x) => x !== id);
  state.reputation = clamp((state.reputation * 2 + rs.rep) / 3, 0, 100);
  log(state, `ACQUISITION: ${state.airline.name} has bought ${r.name} for ${money(t.price)}${payWith === 'shares' ? ' in shares' : ''}. ${acquired.length} aircraft and ${opened} routes join the network; integration will test morale.`, 'good', 'rivals');
  return ok({ aircraft: acquired.length, routes: opened });
}

export function buyStake(state, id) {
  if (state.restructuring?.status === 'active') return fail('Not allowed while in Chapter 11');
  const r = rivalDef(state, id);
  const t = acquisitionTerms(state, id);
  if (state.rivals[id]?.status !== 'active' || r.type === 'cargo') return fail('Not available');
  if (state.stakes[id]) return fail('You already own a stake');
  if (state.cash < t.stakePrice) return fail(`A ${Math.round(t.stake * 100)}% stake costs ${money(t.stakePrice)}`);
  state.cash -= t.stakePrice;
  state.ledgerCapex.other += t.stakePrice;
  state.stakes[id] = t.stake;
  if (!state.partners.codeshares.includes(id)) state.partners.codeshares.push(id);
  state.rivals[id].hostility = 0;
  state.rivals[id].relation = clamp(state.rivals[id].relation + 25, 0, 100);
  log(state, `Bought a ${Math.round(t.stake * 100)}% stake in ${r.name} for ${money(t.stakePrice)}. A codeshare follows.`, 'good', 'rivals');
  return ok();
}

export function sellStake(state, id) {
  if (!state.stakes[id]) return fail('No stake');
  const value = rivalValuation(state, id) * state.stakes[id];
  state.cash += value;
  delete state.stakes[id];
  log(state, `Sold your stake in ${rivalDef(state, id).name} for ${money(value)}.`, 'info', 'rivals');
  return ok();
}

export { distanceKm, rivalById };
