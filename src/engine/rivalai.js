// Reactive rival AI: incumbents defend their hubs when you move in (matching
// fares, dumping capacity), retreat from routes where they are beaten, order
// aircraft and grow (or shrink) their networks, and join or leave alliances.
// Market-level responses live in state.rivalMarkets[pair][rivalId].

import { airportByCode, AIRPORTS } from '../data/airports.js';
import { RIVAL_TYPES } from '../data/rivals.js';
import { inProduction } from '../data/aircraft.js';
import { clamp, sum, rand, randInt, pick, weightedPick, log, pairKey, yearOf, distanceKm } from './core.js';
import { rivalsOn, rivalsContext, rivalDef, rivalFliesNonstop, rivalAlliance, ALLIANCE_FOUNDED, marketNow, fareNow, sameMarket } from './market.js';
import { stations } from './network.js';

const agg = (state) => state.settings?.rivals ?? 1;
const marketAdj = (state, a, b) => (state.rivalMarkets[pairKey(a, b)] ??= {});
const allied = (state, r) => state.partners.codeshares.includes(r.id) || (state.partners.alliance && rivalAlliance(state, r) === state.partners.alliance) || !!state.stakes[r.id];
const ourIndex = (state, route) => route.fares.Y / fareNow(state, route.distance, 'Y');
// Does a change at this pair matter to the player (worth a news item)?
const touchesUs = (state, a, b) => {
  const st = new Set(stations(state));
  return st.has(a) || st.has(b);
};

// Incumbents on one of your routes that have a hub at either end.
export function hubIncumbents(state, route, ctx) {
  return rivalsOn(state, route.a, route.b, ctx)
    .filter((x) => x.nonstop)
    .map((x) => rivalDef(state, x.id))
    .filter((r) => r && r.type !== 'cargo' && (r.hubs.includes(route.a) || r.hubs.includes(route.b)) && !allied(state, r));
}

// ---------------------------------------------------------------------------
// Weekly: hub defence against new entrants.

export function rivalReactTick(state) {
  const ctx = rivalsContext(state, { memo: false });
  for (const route of state.routes) {
    if (!route.last?.freq) continue;
    for (const r of hubIncumbents(state, route, ctx)) {
      const rs = state.rivals[r.id];
      const m = marketAdj(state, route.a, route.b)[r.id] ??= {};
      // A fresh entry at their hub draws a response a few weeks later.
      if (state.week - route.openedWeek <= 8 && m.defendAt == null && !m.defended) m.defendAt = state.week + randInt(state, 2, 6);
      if (m.defendAt != null && state.week >= m.defendAt) {
        delete m.defendAt;
        m.defended = state.week;
        const strength = r.aggression * agg(state) * (0.6 + rs.hostility * 0.8);
        const type = RIVAL_TYPES[r.type];
        const match = clamp(Math.min(m.fare ?? 1, (ourIndex(state, route) / type.fare) * (0.97 + rand(state) * 0.03)), 0.6, 1);
        m.fare = match;
        m.cap = clamp((m.cap ?? 1) * (1.1 + 0.25 * strength), 1, 1.8);
        m.defenceUntil = state.week + 26;
        rs.hostility = clamp(rs.hostility + 0.15, 0, 1);
        log(state, `${r.name} defends its ${route.a === r.hubs[0] || route.b === r.hubs[0] ? 'home' : ''} hub: it matches your fares on ${route.a}–${route.b} (${Math.round((1 - m.fare) * 100)}% off) and adds ${Math.round((m.cap - 1) * 100)}% more seats.`, 'bad', 'rivals');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Monthly: fare matching and retreat on contested routes.

export function contestTick(state, overlaps) {
  for (const [id, routes] of overlaps) {
    const r = rivalDef(state, id);
    const rs = state.rivals[id];
    if (!r || rs?.status !== 'active' || r.type === 'cargo' || allied(state, r)) continue;
    const type = RIVAL_TYPES[r.type];
    for (const route of routes) {
      const l = route.last;
      if (!l?.seatTotal) continue;
      const m = (marketAdj(state, route.a, route.b)[id] ??= {});
      if (m.exited) continue;
      const atHub = r.hubs.includes(route.a) || r.hubs.includes(route.b);
      // Undercut them and they follow you down (more readily at home).
      const theirs = type.fare * rs.fareIdx * (m.fare ?? 1);
      const ours = ourIndex(state, route);
      if (ours < theirs * 0.95 && rand(state) < r.aggression * agg(state) * (atHub ? 0.5 : 0.2)) {
        m.fare = clamp((ours / (type.fare * rs.fareIdx)) * 1.01, 0.6, 1);
        log(state, `${r.name} matches your fares on ${route.a}–${route.b}.`, 'bad', 'rivals');
      }
      // Retreat after months of being outcompeted (much longer at their own hub).
      const beaten = (l.share ?? 0) > (atHub ? 0.6 : 0.45) && l.lf > 0.7;
      m.losing = beaten ? (m.losing ?? 0) + 1 : Math.max(0, (m.losing ?? 0) - 1);
      if (m.losing >= (atHub ? 9 : 4)) {
        m.exited = true;
        delete m.losing;
        delete m.defenceUntil;
        log(state, `${r.name} withdraws from ${route.a}–${route.b} — outcompeted by ${state.airline.name}.`, 'good', 'rivals');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Monthly: fleet orders, deliveries, and network growth or retrenchment.

export function fleetTick(state, typicalTypes) {
  const year = yearOf(state.week);
  const home = state.airline.home;
  for (const [id, rs] of Object.entries(state.rivals)) {
    if (rs.status !== 'active') continue;
    const r = rivalDef(state, id);
    if (!r) continue;
    const near = sameMarket(r.country, home, year) || r.hubs.some((h) => touchesUs(state, h, h));
    // Deliveries.
    for (const o of (rs.orders ?? []).filter((x) => x.week <= state.week)) {
      rs.fleet += o.n;
      rs.newRoutes = (rs.newRoutes ?? 0) + o.n / 10;
      if (near) log(state, `${r.name} takes delivery of ${o.n} ${o.name}${o.n > 1 ? 's' : ''}.`, 'info', 'rivals');
    }
    rs.orders = (rs.orders ?? []).filter((x) => x.week > state.week);
    // New orders when flush.
    if (rs.margin > 0.05 && rs.cash > rs.fleet * 3e6 && rs.orders.length < 2 && rand(state) < 0.05) {
      const types = typicalTypes(state, r.type).filter((t) => inProduction(t, year));
      if (types.length) {
        const t = weightedPick(state, types, (x) => (x.intro >= year - 8 ? 3 : 1));
        const n = Math.max(3, Math.round(rs.fleet * (0.05 + rand(state) * 0.1)));
        const week = state.week + t.lead + randInt(state, 0, 26);
        rs.orders.push({ n, type: t.id, name: t.name, week });
        rs.cash -= n * t.price * 0.1;
        if (near) log(state, `${r.name} orders ${n} ${t.name}${n > 1 ? 's' : ''} for delivery from ${yearOf(week)}.`, 'info', 'rivals');
      }
    }
    // Shrinking when losing money: retire aircraft and close a route.
    if (rs.margin < -0.03 && rand(state) < 0.25) {
      rs.fleet = Math.max(3, Math.round(rs.fleet * 0.97));
      closeRivalRoute(state, r, rs, near);
    }
    // Delivered aircraft open new routes from their hubs.
    while ((rs.newRoutes ?? 0) >= 1) {
      rs.newRoutes -= 1;
      openRivalRoute(state, r, near);
    }
  }
}

function openRivalRoute(state, r, near) {
  const type = RIVAL_TYPES[r.type];
  const ours = new Set(stations(state));
  const options = [];
  for (const h of r.hubs) {
    for (const ap of AIRPORTS) {
      if (ap.code === h || rivalFliesNonstop(r, h, ap.code)) continue;
      const d = distanceKm(h, ap.code);
      if (d < 300 || d > type.range || ap.runway < (d > 5000 ? 2700 : 1700)) continue;
      const m = state.rivalMarkets[pairKey(h, ap.code)]?.[r.id];
      if (m?.entered || m?.exited) continue;
      // Rivals follow the money — markets you serve look attractive.
      options.push({ a: h, b: ap.code, w: marketNow(state, h, ap.code) * (ours.has(ap.code) || ours.has(h) ? 1.3 : 1) });
    }
  }
  if (!options.length) return;
  options.sort((x, y) => y.w - x.w);
  const pickd = weightedPick(state, options.slice(0, 12), (x) => x.w);
  marketAdj(state, pickd.a, pickd.b)[r.id] = { entered: true, cap: 0.8 };
  if (near && touchesUs(state, pickd.a, pickd.b)) log(state, `${r.name} opens a new route: ${pickd.a}–${pickd.b}.`, 'bad', 'rivals');
}

function closeRivalRoute(state, r, rs, near) {
  // Prefer routes they recently opened, then contested ones where they're losing.
  const entered = Object.entries(state.rivalMarkets).filter(([, adj]) => adj[r.id]?.entered && !adj[r.id].exited);
  const target = entered.length ? pick(state, entered) : null;
  if (!target) return;
  target[1][r.id].exited = true;
  const [a, b] = target[0].split('|');
  if (near && touchesUs(state, a, b)) log(state, `${r.name} cuts ${a}–${b} as it retrenches.`, 'good', 'rivals');
}

// ---------------------------------------------------------------------------
// Monthly: alliances form at their founding dates; big carriers join; weak
// ones leave or are expelled.

export function allianceTick(state, activeRivals) {
  const year = yearOf(state.week);
  const open = Object.keys(ALLIANCE_FOUNDED).filter((a) => year >= ALLIANCE_FOUNDED[a]);
  if (!open.length) return;
  for (const r of activeRivals(state)) {
    if (r.type === 'cargo') continue;
    const rs = state.rivals[r.id];
    const current = rivalAlliance(state, r);
    if (!current && rs.fleet >= 40 && rs.rep >= 60 && ['legacy', 'connector'].includes(r.type) && rand(state) < 0.006) {
      // One member per country: pick an alliance without a compatriot.
      const fits = open.filter((a) => !activeRivals(state).some((x) => x !== r && rivalAlliance(state, x) === a && x.country === r.country));
      if (!fits.length) continue;
      const a = pick(state, fits);
      rs.alliance = a;
      const ours = state.partners.alliance === a;
      if (ours) rs.hostility = 0;
      log(state, `${r.name} joins ${a}${ours ? ' — your alliance partners just got stronger' : ''}.`, ours ? 'good' : 'info', 'rivals');
    } else if (current && rs.margin < -0.08 && rs.cash < 0 && rand(state) < 0.08) {
      rs.alliance = null;
      log(state, `${r.name} leaves ${current} amid financial trouble.`, 'info', 'rivals');
    }
  }
}

// Market adjustments drift back to normal, except while a hub defence is on.
export function driftMarkets(state) {
  for (const [k, adj] of Object.entries(state.rivalMarkets)) {
    for (const [id, m] of Object.entries(adj)) {
      const defending = m.defenceUntil > state.week;
      if (!defending) {
        if (m.fare) m.fare += (1 - m.fare) * 0.08;
        if (m.cap && !m.entered) m.cap += (1 - m.cap) * 0.06;
        if (m.defenceUntil) delete m.defenceUntil;
      }
      if (m.exited && !m.entered && rand(state) < 0.01) {
        delete m.exited;
        delete m.losing;
        if (touchesUs(state, ...k.split('|'))) log(state, `${rivalDef(state, id)?.name} returns to ${k.replace('|', '–')}.`, 'bad', 'rivals');
      }
    }
  }
}

export { sum, airportByCode };
