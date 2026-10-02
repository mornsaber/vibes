// Performance harness: a large airline (≈300 aircraft, ≈150 routes) run for
// many years, timing the weekly turn and reporting state size.
// Usage: node scripts/profile.js [years] [--cpu-prof]
import * as G from '../src/engine/index.js';

const years = Number(process.argv[2]) || 10;
const weeksOverride = Number(process.env.WEEKS) || 0;
const t0 = performance.now();

export function bigAirline({ seed = 7, aircraft = 300, routes = 150 } = {}) {
  const s = G.newGame({ name: 'Mega Air', code: 'MG', hub: 'ORD', seed, difficulty: 'easy', startYear: 2027 });
  s.cash = 1e12;
  for (const h of ['DEN', 'ATL', 'DFW', 'LAX', 'JFK']) G.openHub(s, h);
  const dests = G.AIRPORTS.filter((a) => a.runway >= 2400).map((a) => a.code);
  outer: for (const hub of s.hubs.map((h) => h.code)) {
    for (const d of dests) {
      if (s.routes.length >= routes) break outer;
      if (d === hub || Math.random() < 0) continue;
      G.openRoute(s, hub, d);
    }
  }
  const types = ['a320n', 'b38m', 'a321n', 'e175', 'b789', 'a359'];
  for (let i = 0; i < aircraft; i++) {
    const type = types[i % types.length];
    const monthly = G.monthlyLeaseRate(s, G.aircraftById[type], 3);
    G.makeAircraft(s, type, { owned: false, ageWeeks: 156, lease: { lessor: 'P', monthly, startWeek: s.week, endWeek: s.week + 1040, deposit: 0 } });
  }
  // Staff up for the operation before the clock starts.
  for (const r of G.ROLE_IDS) s.staffAuto[r] = true;
  return s;
}

const s = bigAirline();
const setup = performance.now() - t0;
const times = [];
const weeks = weeksOverride || years * 52;
for (let w = 0; w < weeks && s.status === 'playing'; w++) {
  if (s.pendingEvent) G.resolveEvent(s, s.pendingEvent.choices.findIndex((c) => !c.disabled));
  if (s.cash < 1e10) s.cash = 1e12;
  const a = performance.now();
  G.advanceWeek(s);
  times.push(performance.now() - a);
  if (w === 2) for (const r of G.ROLE_IDS) for (let g = 0; g < 5; g++) s.staff[r].grades[g] *= 1; // noop hook
}
const sorted = [...times].sort((a, b) => a - b);
const pct = (p) => sorted[Math.floor((sorted.length - 1) * p)].toFixed(1);
const json = JSON.stringify(s);
console.log(`setup ${setup.toFixed(0)} ms · ${s.fleet.length} aircraft · ${s.routes.length} routes · ${s.hubs.length} hubs · status ${s.status}`);
console.log(`weekly turn ms: median ${pct(0.5)} · p90 ${pct(0.9)} · max ${pct(1)} · total ${(times.reduce((a, b) => a + b, 0) / 1000).toFixed(1)} s over ${times.length} weeks`);
console.log(`save size ${(json.length / 1e6).toFixed(2)} MB · history ${s.history.length} · log ${s.log.length} · shareHistory ${s.shareHistory?.length} · months ${Object.keys(s.months).length} · route hist ${s.routes.reduce((t, r) => t + (r.hist?.length ?? 0), 0)} · incidents ${s.incidents.length} · mxLog ${s.fleet.reduce((t, a) => t + (a.mxLog?.length ?? 0), 0)}`);
const parts = Object.entries(s).map(([k, v]) => [k, JSON.stringify(v)?.length ?? 0]).sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log('largest keys', parts.map(([k, n]) => `${k} ${(n / 1e3).toFixed(0)}k`).join(' · '));
const fleetParts = {};
for (const a of s.fleet) for (const [k, v] of Object.entries(a)) fleetParts[k] = (fleetParts[k] ?? 0) + (JSON.stringify(v)?.length ?? 0);
console.log('fleet fields', Object.entries(fleetParts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${(n / 1e3).toFixed(0)}k`).join(' · '));
const routeParts = {};
for (const r of s.routes) for (const [k, v] of Object.entries(r)) routeParts[k] = (routeParts[k] ?? 0) + (JSON.stringify(v)?.length ?? 0);
console.log('route fields', Object.entries(routeParts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${(n / 1e3).toFixed(0)}k`).join(' · '));
const t1 = performance.now();
JSON.parse(json);
console.log(`JSON stringify+parse ${(performance.now() - t1).toFixed(0)} ms`);
