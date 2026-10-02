// Balance harness: plays scripted strategies headlessly and prints results.
// Usage: npm run simulate [-- years]
//   SEED=n       play one seed (default 11)
//   SEEDS=n      play n seeds per strategy and print the spread of yearly profit
//   ONLY=regex   only strategies whose label matches
//   VERBOSE=1    per-route and cost breakdown
//   NO_COMMONALITY=1  switch off mixed-fleet penalties (for comparison)
import * as G from '../src/engine/index.js';

const years = Number(process.argv[2]) || 2;
const seeds = Number(process.env.SEEDS) || 0;
const quiet = seeds > 0;

function play(label, { hub, routes, types, seed = Number(process.env.SEED) || 11, pricing = true }) {
  const s = G.newGame({ name: 'Sim Air', code: 'SM', hub, seed });
  if (process.env.NO_COMMONALITY) s.settings.commonality = false;
  // Pricing is left to the autopilot (on by default); fleet assignment is scripted below.
  G.setAutopilot(s, { pricing, fleet: false });
  for (const to of routes) {
    const r = G.openRoute(s, hub, to);
    if (!r.ok) console.log('  open failed', to, r.error);
  }
  // Lease the requested types from the market (take the soonest offers of each type, else any).
  // Lease every aircraft at market rate (4-year-old frames, 6-week lead) so strategies compare fairly.
  for (const [type, n] of Object.entries(types)) {
    for (let i = 0; i < n; i++) {
      const monthly = G.monthlyLeaseRate(s, G.aircraftById[type], 4);
      s.cash -= monthly * 2;
      G.makeAircraft(s, type, { owned: false, ageWeeks: 208, deliveryWeek: s.week + 6, lease: { lessor: 'Sim', monthly, startWeek: s.week + 6, endWeek: s.week + 526, deposit: monthly * 2 } });
    }
  }
  const schedule = () => {
    for (const ac of s.fleet) {
      if (ac.schedule.length || G.typeOf(ac).cat === 'freighter') continue;
      const opts = s.routes
        .map((r) => ({ r, cap: G.canOperate(s, ac, r).ok ? G.maxFrequency(s, ac, r) : 0, have: G.routeFreq(s, r) }))
        .filter((x) => x.cap > 0)
        .sort((a, b) => a.have - b.have || b.r.distance - a.r.distance);
      // Slot-aware, like a player or the autopilot: buy affordable slots or fly fewer frequencies.
      for (const o of opts) if (G.autoAssign(s, ac, o.r, Math.min(o.cap, 14)).ok) break;
    }
  };
  for (let w = 0; w < years * 52 && s.status === 'playing'; w++) {
    if (s.pendingEvent) G.resolveEvent(s, pick(s.pendingEvent.choices));
    schedule();
    G.advanceWeek(s);
  }
  const yr = s.history.slice(-52);
  const sumv = (f) => yr.reduce((a, h) => a + f(h), 0);
  const profit = sumv((h) => h.profit);
  if (quiet) return { s, profit };
  console.log(
    `${label.padEnd(30)} ${s.status.padEnd(9)} cash ${G.money(s.cash).padStart(8)}  yr profit ${G.money(sumv((h) => h.profit)).padStart(8)}  yr rev ${G.money(sumv((h) => h.revenue)).padStart(8)}  LF ${(sumv((h) => h.lf) / yr.length * 100).toFixed(0)}%  OTP ${(sumv((h) => h.otp) / yr.length * 100).toFixed(0)}%  ${s.finance.rating}  rep ${s.reputation.toFixed(0)}  board ${s.board.confidence.toFixed(0)}  fleet ${s.fleet.length}`,
  );
  if (process.env.VERBOSE) {
    for (const r of s.routes) {
      const l = r.last;
      if (l) console.log(`   ${r.a}-${r.b} ${r.distance}km f=${l.freq} pax=${Math.round(l.paxTotal)} lf=${(l.lf * 100).toFixed(0)}% conn=${Math.round(l.connecting)} idx=${G.priceIndex(s, r).toFixed(2)} contrib=${G.money(l.contribution)} profit=${G.money(l.profit)}`);
    }
    const c = s.lastReport.cost;
    console.log('   costs', Object.entries(c).map(([k, v]) => `${k}:${G.money(v)}`).join(' '));
    console.log('   rev', Object.entries(s.lastReport.revenue).map(([k, v]) => `${k}:${G.money(v)}`).join(' '));
  }
  return { s, profit };
}

// Answer events like a player trying to keep going: first available choice that doesn't end the game.
const ENDS_GAME = /recommend the offer|liquidat|resign|sell the airline/i;
function pick(choices) {
  const i = choices.findIndex((c) => !c.disabled && !ENDS_GAME.test(`${c.label} ${c.hint ?? ''}`));
  return i >= 0 ? i : choices.findIndex((c) => !c.disabled);
}

const STRATEGIES = [];
const strategy = (label, opts) => STRATEGIES.push([label, opts]);

strategy('Idle (no flying)', { hub: 'ORD', routes: [], types: {} });
strategy('ORD regional (6 E175)', { hub: 'ORD', routes: ['BOS', 'DEN', 'ATL', 'MSP', 'DTW', 'PHL', 'BNA', 'AUS'], types: { e175: 6 } });
strategy('ORD narrowbody (6 A320/737)', { hub: 'ORD', routes: ['BOS', 'DEN', 'ATL', 'LAX', 'SFO', 'MIA', 'SEA', 'PHX'], types: { a320n: 3, b38m: 3 } });
strategy('ORD mixed hub (10)', { hub: 'ORD', routes: ['BOS', 'DEN', 'ATL', 'LAX', 'SFO', 'MIA', 'SEA', 'LHR', 'BZN', 'MSP', 'PHL', 'AUS'], types: { a320n: 3, b38m: 3, e175: 2, b789: 2 } });
strategy('JFK transatlantic (4 787)', { hub: 'JFK', routes: ['LHR', 'CDG', 'FRA', 'MAD'], types: { b789: 4 } });
strategy('LHR European (6 A320)', { hub: 'LHR', routes: ['CDG', 'FRA', 'MAD', 'FCO', 'AMS', 'DUB', 'BCN', 'ZRH'], types: { a320n: 6 } });
strategy('LHR European (3 A320)', { hub: 'LHR', routes: ['MAD', 'FCO', 'BCN', 'ATH', 'LIS', 'CPH'], types: { a320n: 3 } });
strategy('DXB connector (6)', { hub: 'DXB', routes: ['LHR', 'BOM', 'DEL', 'SIN', 'JNB', 'BKK'], types: { b789: 3, a321n: 3 } });
strategy('Overexpansion (20 widebodies)', { hub: 'ORD', routes: ['LHR', 'CDG', 'HND', 'FRA', 'LAX', 'DEN'], types: { b77w: 10, a359: 10 } });

const only = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
for (const [label, opts] of STRATEGIES) {
  if (only && !only.test(label)) continue;
  if (!quiet) {
    play(label, opts);
    continue;
  }
  const runs = Array.from({ length: seeds }, (_, i) => play(label, { ...opts, seed: 101 + i * 7919 }));
  const p = runs.map((r) => r.profit).sort((a, b) => a - b);
  const mean = p.reduce((a, b) => a + b, 0) / p.length;
  const bust = runs.filter((r) => r.s.status !== 'playing').length;
  console.log(`${label.padEnd(30)} mean ${G.money(mean).padStart(8)}  median ${G.money(p[p.length >> 1]).padStart(8)}  range ${G.money(p[0])} … ${G.money(p.at(-1))}  failed ${bust}/${seeds}`);
}
