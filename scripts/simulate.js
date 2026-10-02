// Balance harness: plays scripted strategies headlessly and prints results.
// Usage: npm run simulate [-- years]
import * as G from '../src/engine/index.js';

const years = Number(process.argv[2]) || 2;

function play(label, { hub, routes, types, seed = Number(process.env.SEED) || 11, pricing = true }) {
  const s = G.newGame({ name: 'Sim Air', code: 'SM', hub, seed });
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
      if (opts[0]) G.setFrequency(s, ac.id, opts[0].r.id, Math.min(opts[0].cap, 14));
    }
  };
  for (let w = 0; w < years * 52 && s.status === 'playing'; w++) {
    if (s.pendingEvent) G.resolveEvent(s, s.pendingEvent.choices.findIndex((c) => !c.disabled));
    schedule();
    G.advanceWeek(s);
  }
  const yr = s.history.slice(-52);
  const sumv = (f) => yr.reduce((a, h) => a + f(h), 0);
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
  return s;
}

play('Idle (no flying)', { hub: 'ORD', routes: [], types: {} });
play('ORD regional (6 E175)', { hub: 'ORD', routes: ['BOS', 'DEN', 'ATL', 'MSP', 'DTW', 'PHL', 'BNA', 'AUS'], types: { e175: 6 } });
play('ORD narrowbody (6 A320/737)', { hub: 'ORD', routes: ['BOS', 'DEN', 'ATL', 'LAX', 'SFO', 'MIA', 'SEA', 'PHX'], types: { a320n: 3, b38m: 3 } });
play('ORD mixed hub (10)', { hub: 'ORD', routes: ['BOS', 'DEN', 'ATL', 'LAX', 'SFO', 'MIA', 'SEA', 'LHR', 'BZN', 'MSP', 'PHL', 'AUS'], types: { a320n: 3, b38m: 3, e175: 2, b789: 2 } });
play('JFK transatlantic (4 787)', { hub: 'JFK', routes: ['LHR', 'CDG', 'FRA', 'MAD'], types: { b789: 4 } });
play('LHR European (6 A320)', { hub: 'LHR', routes: ['CDG', 'FRA', 'MAD', 'FCO', 'AMS', 'DUB', 'BCN', 'ZRH'], types: { a320n: 6 } });
play('DXB connector (6)', { hub: 'DXB', routes: ['LHR', 'BOM', 'DEL', 'SIN', 'JNB', 'BKK'], types: { b789: 3, a321n: 3 } });
play('Overexpansion (20 widebodies)', { hub: 'ORD', routes: ['LHR', 'CDG', 'HND', 'FRA', 'LAX', 'DEN'], types: { b77w: 10, a359: 10 } });
