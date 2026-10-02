// Balance check: plays a few scripted strategies headlessly and prints results.
import { newGame, openRoute, leaseAircraft, assignAircraft, advanceWeek, resolveEvent, money, sharePrice, setFare } from '../src/engine.js';

function play(label, hub, plan, weeks = 104, seed = 42) {
  const s = newGame({ name: 'Sim Air', hub, seed });
  for (const [to, type, n] of plan) {
    const { route, error } = openRoute(s, hub, to);
    if (error) throw new Error(error);
    for (let i = 0; i < n; i++) {
      const { aircraft } = leaseAircraft(s, type);
      assignAircraft(s, aircraft.id, route.id);
    }
  }
  for (let w = 0; w < weeks && s.status === 'playing'; w++) {
    if (s.pendingEvent) resolveEvent(s, s.pendingEvent.choices.findIndex((c) => !c.disabled));
    advanceWeek(s);
    // A sensible player nudges fares toward a ~85% load factor.
    for (const r of s.routes) {
      if (!r.last) continue;
      if (r.last.loadFactor > 0.95) setFare(s, r.id, r.fare * 1.04);
      else if (r.last.loadFactor < 0.75) setFare(s, r.id, r.fare * 0.97);
    }
  }
  const yr = s.history.slice(-52);
  const profit = yr.reduce((a, h) => a + h.profit, 0);
  const lf = yr.reduce((a, h) => a + h.loadFactor, 0) / yr.length;
  console.log(`${label.padEnd(34)} status=${s.status.padEnd(8)} cash=${money(s.cash).padStart(8)} lastYrProfit=${money(profit).padStart(8)} LF=${(lf * 100).toFixed(0)}% share=$${sharePrice(s).toFixed(2)} conf=${Math.round(s.board.confidence)}`);
  for (const r of s.routes) {
    const x = r.last;
    console.log(`   ${r.from}-${r.to} ${r.distance}km comp=${r.competitors} ac=${x.aircraft} rt=${x.roundTrips} dem=${x.demand} pax=${x.pax} LF=${(x.loadFactor*100).toFixed(0)}% fare=$${r.fare} contrib=${money(x.contribution)}`);
  }
}

play('Do nothing', 'ORD', []);
play('ORD domestic narrowbodies', 'ORD', [['DEN', 'a320', 2], ['BOS', 'a220', 1], ['MIA', 'a320', 1]]);
play('ORD regional jets', 'ORD', [['DEN', 'e175', 1], ['BOS', 'e175', 1], ['ATL', 'e175', 1], ['SEA', 'e175', 1]]);
play('JFK transatlantic', 'JFK', [['LHR', 'b789', 1], ['CDG', 'b789', 1]]);
play('DXB long haul', 'DXB', [['LHR', 'b789', 1], ['SIN', 'a359', 1], ['DEL', 'a321xlr', 1]]);
play('Overexpansion ORD', 'ORD', [['DEN', 'a320', 4], ['LAX', 'b77w', 2], ['LHR', 'b77w', 2]]);
