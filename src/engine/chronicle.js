// The airline's history: milestones as they happen, an annual report at each
// year end, and a monthly record of passenger share against home-market rivals.

import { RIVALS } from '../data/rivals.js';
import { airportByCode } from '../data/airports.js';
import { sum, yearOf, monthKey, log, money } from './core.js';
import { sameMarket, rivalDef } from './market.js';
import { typeOf } from './fleet.js';
import { stations } from './network.js';

const lifetime = (s) => s.stats;
const annualRevenue = (s) => sum(s.history.slice(-52), (h) => h.revenue);
const intl = (s, r) => airportByCode[r.a].country !== airportByCode[r.b].country;

export const MILESTONES = [
  { id: 'first_flight', label: 'First revenue flight', test: (s) => lifetime(s).flights > 0 },
  { id: 'routes10', label: '10 routes', test: (s) => s.routes.length >= 10 },
  { id: 'routes50', label: '50 routes', test: (s) => s.routes.length >= 50 },
  { id: 'routes100', label: '100 routes', test: (s) => s.routes.length >= 100 },
  { id: 'intl', label: 'First international route', test: (s) => s.routes.some((r) => intl(s, r)) },
  { id: 'intercont', label: 'First intercontinental route', test: (s) => s.routes.some((r) => airportByCode[r.a].region !== airportByCode[r.b].region) },
  { id: 'fleet10', label: 'Fleet of 10 aircraft', test: (s) => s.fleet.length >= 10 },
  { id: 'fleet50', label: 'Fleet of 50 aircraft', test: (s) => s.fleet.length >= 50 },
  { id: 'fleet100', label: 'Fleet of 100 aircraft', test: (s) => s.fleet.length >= 100 },
  { id: 'fleet250', label: 'Fleet of 250 aircraft', test: (s) => s.fleet.length >= 250 },
  { id: 'widebody', label: 'First widebody', test: (s) => s.fleet.some((a) => ['wide', 'jumbo'].includes(typeOf(a).cat)) },
  { id: 'jumbo', label: 'First jumbo jet', test: (s) => s.fleet.some((a) => typeOf(a).cat === 'jumbo') },
  { id: 'sst', label: 'Supersonic service', test: (s) => s.fleet.some((a) => typeOf(a).cat === 'sst') },
  { id: 'pax1m', label: '1 millionth passenger', test: (s) => lifetime(s).pax >= 1e6 },
  { id: 'pax10m', label: '10 millionth passenger', test: (s) => lifetime(s).pax >= 1e7 },
  { id: 'pax100m', label: '100 millionth passenger', test: (s) => lifetime(s).pax >= 1e8 },
  { id: 'rev1b', label: '$1 billion annual revenue', test: (s) => annualRevenue(s) >= 1e9 },
  { id: 'rev10b', label: '$10 billion annual revenue', test: (s) => annualRevenue(s) >= 1e10 },
  { id: 'hub2', label: 'Second hub', test: (s) => s.hubs.length >= 2 },
  { id: 'alliance', label: 'Joined a global alliance', test: (s) => !!s.partners.alliance },
  { id: 'acquisition', label: 'First acquisition', test: (s) => Object.values(s.rivals).some((r) => r.acquiredBy === 'player') },
  { id: 'brand', label: 'Launched a subsidiary brand', test: (s) => (s.brands ?? []).length > 0 },
  { id: 'terminal', label: 'Opened a terminal', test: (s) => s.hubs.some((h) => h.terminal > 0) },
  { id: 'ratingA', label: 'Single-A credit rating', test: (s) => ['AAA', 'AA', 'A'].includes(s.finance.rating) },
  { id: 'accident', label: 'First fatal accident', test: (s) => s.incidents.some((i) => i.severity === 'hull loss'), tone: 'bad' },
];

export function milestoneTick(state) {
  const have = new Set((state.milestones ??= []).map((m) => m.id));
  for (const m of MILESTONES) {
    if (have.has(m.id) || !m.test(state)) continue;
    state.milestones.push({ id: m.id, label: m.label, week: state.week, tone: m.tone ?? 'good' });
    if (m.id !== 'accident') log(state, `Milestone: ${m.label}.`, 'good', 'history');
  }
}

// ---------------------------------------------------------------------------
// Market share against the main rivals based in the home market.

// Rough weekly passengers for a rival from its fleet.
export const rivalPax = (state, id) => {
  const r = state.rivals[id];
  if (r?.status !== 'active') return 0;
  const def = rivalDef(state, id);
  return r.fleet * (def?.type === 'regional' ? 1200 : def?.type === 'connector' ? 3500 : 2600);
};

export function homeRivals(state, n = 5) {
  const year = yearOf(state.week);
  const all = [...RIVALS, ...(state.newRivals ?? [])].filter((r) => r.type !== 'cargo' && state.rivals[r.id]?.status === 'active' && sameMarket(state.airline.home, r.country, year));
  return all.sort((a, b) => state.rivals[b.id].fleet - state.rivals[a.id].fleet).slice(0, n);
}

export function shareTick(state) {
  const key = monthKey(state.week);
  const month = state.months[key - 1] ?? state.months[key];
  const us = month ? month.pax / Math.max(1, month.weeks) : state.lastReport?.pax ?? 0;
  const rivals = Object.fromEntries(homeRivals(state).map((r) => [r.id, rivalPax(state, r.id)]));
  (state.shareHistory ??= []).push({ key, us, rivals });
  if (state.shareHistory.length > 600) state.shareHistory.shift();
}

export function shareNow(state) {
  const last = state.shareHistory?.[state.shareHistory.length - 1];
  if (!last) return 0;
  const total = last.us + sum(Object.values(last.rivals));
  return total ? last.us / total : 0;
}

// ---------------------------------------------------------------------------
// Annual report, written on the first week of the new year.

export function annualReport(state, year) {
  const weeks = state.history.filter((h) => yearOf(h.week) === year);
  if (!weeks.length) return null;
  const flown = weeks.filter((h) => h.flights > 0);
  const v = (f) => sum(weeks, f);
  const report = {
    year,
    revenue: v((h) => h.revenue),
    profit: v((h) => h.profit),
    pax: v((h) => h.pax),
    flights: v((h) => h.flights),
    lf: v((h) => h.seats) ? v((h) => h.pax) / v((h) => h.seats) : 0,
    otp: flown.length ? sum(flown, (h) => h.otp) / flown.length : 0,
    co2: v((h) => h.co2 ?? 0),
    fleet: state.fleet.length,
    routes: state.routes.length,
    destinations: stations(state).length,
    cash: state.cash,
    rating: state.finance.rating,
    reputation: state.reputation,
    share: shareNow(state),
    sharePrice: weeks[weeks.length - 1].sharePrice,
    milestones: (state.milestones ?? []).filter((m) => yearOf(m.week) === year).map((m) => m.label),
  };
  (state.annual ??= []).push(report);
  log(state, `Annual report ${year}: revenue ${money(report.revenue)}, ${report.profit >= 0 ? 'profit' : 'loss'} ${money(Math.abs(report.profit))}, ${Math.round(report.pax).toLocaleString()} passengers.`, report.profit >= 0 ? 'good' : 'bad', 'history');
  return report;
}
