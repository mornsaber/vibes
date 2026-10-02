// Rival airline AI: finances, hostility toward you, fare wars, capacity
// dumping, route entry/exit, bankruptcies. Also codeshares and alliances.

import { RIVALS, rivalById, RIVAL_TYPES, ALLIANCES } from '../data/rivals.js';
import { airportByCode } from '../data/airports.js';
import { clamp, fail, ok, rand, randNormal, pick, log, money, pairKey, sum } from './core.js';
import { rivalsOn, sameMarket } from './market.js';

export function initRivals(state) {
  state.rivals = {};
  for (const r of RIVALS) {
    state.rivals[r.id] = {
      cash: r.fleet * 8e6,
      rep: clamp(45 + r.quality * 20 + randNormal(state) * 4, 30, 95),
      fareIdx: 1,
      capIdx: 1,
      hostility: 0,
      relation: 50,
      status: 'active',
      fleet: r.fleet,
      profitQ: 0,
      margin: 0.05,
    };
  }
}

function market(state, a, b) {
  const k = pairKey(a, b);
  return (state.rivalMarkets[k] ??= {});
}

export function overlapRoutes(state, rivalId) {
  return state.routes.filter((r) => rivalsOn(state, r.a, r.b).some((x) => x.id === rivalId && x.nonstop));
}

// Monthly.
export function rivalsTick(state) {
  const fuelGap = state.macro.fuel - 0.85;
  for (const r of RIVALS) {
    const rs = state.rivals[r.id];
    if (rs.status !== 'active') continue;

    // Finances.
    rs.margin = clamp(0.05 + (state.macro.economy - 1) * 0.4 - fuelGap * 0.15 + randNormal(state) * 0.03 + (r.quality - 1) * 0.05, -0.2, 0.2);
    const profit = rs.fleet * 1.2e6 * rs.margin;
    rs.cash += profit;
    rs.profitQ += profit;
    rs.fleet = Math.max(5, Math.round(rs.fleet * (1 + (rs.margin > 0.04 ? 0.004 : -0.004))));
    rs.rep = clamp(rs.rep + randNormal(state) * 0.8, 25, 98);
    if (rs.cash < -rs.fleet * 2e6 && rs.fleet < 200 && rand(state) < 0.12) {
      rs.status = 'bankrupt';
      log(state, `${r.name} has collapsed into bankruptcy and ceased operations!`, 'good', 'rivals');
      state.queue.push({ event: 'rival_collapse', data: { rivalId: r.id } });
      continue;
    }

    // Hostility toward you grows with how much of their traffic you take.
    const overlap = overlapRoutes(state, r.id);
    const pressure = sum(overlap, (rt) => (rt.last?.share ?? 0) * (rt.last?.paxTotal ?? 0)) / Math.max(1, rs.fleet * 300);
    const allied = state.partners.codeshares.includes(r.id) || (state.partners.alliance && r.alliance === state.partners.alliance);
    rs.hostility = clamp(rs.hostility + (overlap.length ? 0.01 + pressure * r.aggression : -0.04) - (allied ? 0.1 : 0), 0, 1);
    rs.relation = clamp(rs.relation + (allied ? 1 : 0) - rs.hostility * 3 + 0.5, 0, 100);

    // Responses on contested routes.
    for (const rt of overlap) {
      const share = rt.last?.share ?? 0;
      if (allied || share < 0.18) continue;
      const m = (market(state, rt.a, rt.b)[r.id] ??= {});
      const roll = rand(state);
      if (roll < r.aggression * rs.hostility * 0.25) {
        m.fare = Math.max(0.7, (m.fare ?? 1) * 0.9);
        log(state, `${r.name} slashes fares on ${rt.a}–${rt.b} to fight you (${Math.round((1 - m.fare) * 100)}% below normal).`, 'bad', 'rivals');
      } else if (roll < r.aggression * rs.hostility * 0.45) {
        m.cap = Math.min(2, (m.cap ?? 1) * 1.25);
        log(state, `${r.name} adds capacity on ${rt.a}–${rt.b}.`, 'bad', 'rivals');
      } else if (share > 0.5 && rand(state) < 0.03) {
        m.exited = true;
        log(state, `${r.name} withdraws from ${rt.a}–${rt.b} — you won.`, 'good', 'rivals');
      }
    }
  }

  // Market adjustments drift back to normal; exits occasionally reverse.
  for (const [k, adj] of Object.entries(state.rivalMarkets)) {
    for (const [id, m] of Object.entries(adj)) {
      if (m.fare) m.fare += (1 - m.fare) * 0.08;
      if (m.cap) m.cap += (1 - m.cap) * 0.06;
      if (m.exited && rand(state) < 0.01) {
        delete m.exited;
        log(state, `${rivalById[id].name} returns to ${k.replace('|', '–')}.`, 'bad', 'rivals');
      }
    }
  }

  // New entrants on profitable, thinly contested routes.
  for (const rt of state.routes) {
    const last = rt.last;
    if (!last || last.contribution <= 0 || last.lf < 0.82) continue;
    const present = rivalsOn(state, rt.a, rt.b).filter((x) => x.nonstop);
    if (present.length >= 2 || rand(state) > 0.04) continue;
    const candidates = RIVALS.filter((r) => {
      if (state.rivals[r.id].status !== 'active' || r.type === 'cargo' || present.some((p) => p.id === r.id)) return false;
      if (rt.distance > RIVAL_TYPES[r.type].range) return false;
      return [rt.a, rt.b].some((c) => sameMarket(r.country, airportByCode[c].country));
    });
    if (!candidates.length) continue;
    const r = pick(state, candidates);
    market(state, rt.a, rt.b)[r.id] = { entered: true, fare: 0.9 };
    log(state, `${r.name} launches service on ${rt.a}–${rt.b}, attracted by your success.`, 'bad', 'rivals');
  }
}

export function quarterlyRivalReset(state) {
  for (const rs of Object.values(state.rivals)) rs.profitQ = 0;
}

// ---------------------------------------------------------------------------
// Partnerships

export function codeshareTerms(state, rivalId) {
  const r = rivalById[rivalId];
  const rs = state.rivals[rivalId];
  const reasons = [];
  if (!r || r.type === 'cargo') reasons.push('Cargo airlines do not codeshare');
  if (rs?.status !== 'active') reasons.push('Airline is not operating');
  if (state.reputation < 45) reasons.push('Your reputation must be at least 45');
  if (rs && rs.hostility > 0.6) reasons.push(`${r.name} sees you as a threat`);
  if (r && state.hubs.some((h) => r.hubs.includes(h.code)) && r.alliance !== state.partners.alliance) reasons.push('They will not partner with a carrier hubbed at their own hub');
  const score = (rs?.relation ?? 0) / 100 + state.reputation / 200 - (rs?.hostility ?? 0) * 0.5;
  return { reasons, score, fee: 2e6 };
}

export function proposeCodeshare(state, rivalId) {
  if (state.partners.codeshares.includes(rivalId)) return fail('Already partners');
  const t = codeshareTerms(state, rivalId);
  if (t.reasons.length) return fail(t.reasons[0]);
  if (state.cash < t.fee) return fail(`Integration costs ${money(t.fee)}`);
  const r = rivalById[rivalId];
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
  log(state, `Ended the codeshare with ${rivalById[rivalId].name}.`, 'bad', 'partners');
  return ok();
}

export function allianceTerms(state, name) {
  const a = ALLIANCES[name];
  const reasons = [];
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
  for (const r of RIVALS.filter((x) => x.alliance === name)) state.rivals[r.id].hostility = 0;
  log(state, `${state.airline.name} joins ${name}!`, 'good', 'partners');
  return ok();
}

export function leaveAlliance(state) {
  if (!state.partners.alliance) return fail('Not in an alliance');
  log(state, `Left ${state.partners.alliance}.`, 'bad', 'partners');
  state.partners.alliance = null;
  return ok();
}
