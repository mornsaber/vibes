import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/engine/index.js';

const setup = (opts = {}) => G.newGame({ name: 'Test Air', code: 'TA', hub: 'DEN', seed: 1234, ...opts });

function run(s, weeks) {
  for (let i = 0; i < weeks; i++) {
    if (s.pendingEvent) G.resolveEvent(s, s.pendingEvent.choices.findIndex((c) => !c.disabled));
    const res = G.advanceWeek(s);
    assert.ok(res.ok, res.error);
  }
}

// A leased aircraft available right away, bypassing the market.
function quickLease(s, type, weeks = 0) {
  const monthly = G.monthlyLeaseRate(s, G.aircraftById[type], 3);
  return G.makeAircraft(s, type, { owned: false, ageWeeks: 156, deliveryWeek: s.week + weeks, lease: { lessor: 'Test', monthly, startWeek: s.week, endWeek: s.week + 520, deposit: 0 } });
}

test('calendar units advance to the next boundary', () => {
  assert.equal(G.weeksInUnit(0, 'week'), 1);
  const m = G.weeksInUnit(0, 'month');
  assert.ok(m >= 4 && m <= 5);
  assert.notEqual(G.monthKey(m), G.monthKey(0));
  assert.equal(G.monthKey(m - 1), G.monthKey(0));
  const y = G.weeksInUnit(0, 'year');
  assert.ok(y >= 52 && y <= 53);
});

test('advance by quarter runs whole calendar quarters', () => {
  const s = setup();
  let total = 0;
  while (total < 52 && s.status === 'playing') {
    const res = G.advance(s, 'quarter');
    assert.ok(res.ok);
    total += res.ran;
    while (s.pendingEvent) {
      G.resolveEvent(s, s.pendingEvent.choices.findIndex((c) => !c.disabled));
      total += G.advance(s, 'continue').ran;
    }
  }
  assert.equal(s.week, total);
  assert.notEqual(G.quarterKey(s.week), G.quarterKey(s.week - 1));
});

test('distances and markets are realistic', () => {
  assert.ok(Math.abs(G.distanceKm('JFK', 'LHR') - 5540) < 30);
  assert.ok(G.baseMarket('JFK', 'LAX') > G.baseMarket('BZN', 'DEN') * 10);
  const cs = G.classShares('JFK', 'LHR');
  assert.ok(Math.abs(cs.F + cs.J + cs.W + cs.Y - 1) < 1e-9);
  assert.ok(cs.J > G.classShares('LAS', 'MCO').J);
});

test('traffic rights enforce cabotage and fifth freedoms', () => {
  const s = setup();
  assert.equal(G.trafficRights(s, 'LHR', 'MAN').ok, false, 'UK domestic is cabotage for a US airline');
  assert.equal(G.trafficRights(s, 'LHR', 'CDG').ok, false, 'no link from home yet');
  assert.ok(G.openRoute(s, 'DEN', 'LHR').ok);
  const r = G.trafficRights(s, 'LHR', 'CDG');
  assert.ok(r.ok && r.fifth);
  assert.ok(G.openRoute(s, 'LHR', 'CDG').ok);
});

test('cabin layouts must fit the floor area', () => {
  const a320 = G.aircraftById.a320n;
  assert.ok(G.validateConfig(a320, { F: 0, J: 0, W: 0, Y: 194 }).ok);
  assert.equal(G.validateConfig(a320, { F: 0, J: 0, W: 0, Y: 195 }).ok, false);
  assert.equal(G.validateConfig(a320, { F: 4, J: 0, W: 0, Y: 100 }).ok, false, 'no first class on a narrowbody');
  assert.ok(G.validateConfig(G.aircraftById.b789, { F: 0, J: 30, W: 28, Y: 216 }).ok);
});

test('factory orders take the manufacturer lead time and charge deposits', () => {
  const s = setup();
  const cash = s.cash;
  assert.equal(G.orderAircraft(s, 'b77w').ok, false, 'out of production');
  assert.ok(G.orderAircraft(s, 'a320n', 2).ok);
  assert.equal(s.orders.length, 2);
  assert.ok(s.orders[0].deliveryWeek >= G.aircraftById.a320n.lead);
  assert.ok(Math.abs(cash - s.cash - s.orders[0].price * 0.4) < 1);
});

test('lease offers deliver after their lead time', () => {
  const s = setup();
  const offer = s.market.leases[0];
  const res = G.leaseFromOffer(s, offer.id);
  assert.ok(res.ok);
  assert.equal(G.isDelivered(s, res.aircraft), false);
  run(s, offer.lead);
  const ac = s.fleet.find((a) => a.id === res.aircraft.id);
  assert.ok(ac && G.isDelivered(s, ac));
});

test('scheduling respects hours, range and runway', () => {
  const s = setup();
  const { route: shortRoute } = G.openRoute(s, 'DEN', 'JAC');
  const { route: longRoute } = G.openRoute(s, 'DEN', 'HND');
  const atr = quickLease(s, 'atr72');
  const a320 = quickLease(s, 'a320n');
  assert.equal(G.setFrequency(s, atr.id, longRoute.id, 1).ok, false, 'range');
  assert.ok(G.setFrequency(s, atr.id, shortRoute.id, 7).ok);
  assert.equal(G.canOperate(s, quickLease(s, 'b789'), shortRoute).ok, false, 'JAC runway too short for a 787');
  assert.equal(G.setFrequency(s, a320.id, shortRoute.id, 1).ok, false, 'JAC runway too short for an A320neo');
  const { route: sea } = G.openRoute(s, 'DEN', 'SEA');
  const max = G.maxFrequency(s, a320, sea);
  assert.ok(max > 10);
  assert.equal(G.setFrequency(s, a320.id, sea.id, max + 1).ok, false);
  assert.ok(G.setFrequency(s, a320.id, sea.id, max).ok);
  assert.ok(G.utilization(s, a320) <= 1);
});

test('a sensible domestic operation carries passengers and earns route contribution', () => {
  const s = setup();
  const { route } = G.openRoute(s, 'DEN', 'SEA');
  G.setFrequency(s, quickLease(s, 'a320n').id, route.id, 7);
  run(s, 3);
  const l = s.routes[0].last;
  assert.ok(l.paxTotal > 500, `pax ${l.paxTotal}`);
  assert.ok(l.lf > 0.25 && l.lf <= 1, `lf ${l.lf}`);
  assert.ok(l.contribution > 0, `contribution ${l.contribution}`);
  assert.ok(l.cargoKg > 0, 'belly cargo');
});

test('higher fares lower market share', () => {
  const s = setup();
  const { route } = G.openRoute(s, 'DEN', 'LAX');
  G.assignAircraft(s, quickLease(s, 'a320n').id, route.id);
  run(s, 2);
  const before = s.routes[0].last.share;
  G.setPriceIndex(s, route.id, 1.6);
  run(s, 1);
  assert.ok(s.routes[0].last.share < before * 0.6);
});

test('passengers connect over the hub', () => {
  const s = setup();
  const { route: r1 } = G.openRoute(s, 'DEN', 'BZN');
  const { route: r2 } = G.openRoute(s, 'DEN', 'ORD');
  G.assignAircraft(s, quickLease(s, 'e175').id, r1.id);
  G.assignAircraft(s, quickLease(s, 'a320n').id, r2.id);
  run(s, 2);
  assert.ok(s.routes.every((r) => r.last.connecting > 0));
  assert.ok(s.lastReport.topFlows.some((f) => f.via === 'DEN'));
});

test('staff requirements follow the schedule and auto-hiring fills them', () => {
  const s = setup();
  const { route } = G.openRoute(s, 'DEN', 'SFO');
  G.assignAircraft(s, quickLease(s, 'a320n').id, route.id);
  const req = G.staffRequirements(s);
  assert.ok(req.pilots > 5 && req.cabin > req.pilots);
  run(s, 8);
  assert.ok(s.staffStatus.pilots.ratio >= 0.95);
});

test('a pilot strike collapses flying', () => {
  const s = setup();
  const { route } = G.openRoute(s, 'DEN', 'SFO');
  G.assignAircraft(s, quickLease(s, 'a320n').id, route.id);
  run(s, 8);
  const normal = s.routes[0].last.flights;
  s.strikes.pilots = 2;
  s.pendingEvent = null;
  G.advanceWeek(s);
  assert.ok(s.routes[0].last.flights < normal * 0.2);
});

test('checks run automatically; overdue aircraft are grounded', () => {
  const s = setup();
  const ac = quickLease(s, 'a320n');
  ac.fh = ac.checks.A.fh + 740;
  run(s, 1);
  assert.equal(ac.checks.A.fh, ac.fh, 'auto A-check done');
  for (const k of G.CHECK_ORDER) G.setAutoCheck(s, k, false);
  ac.checks.C.week = s.week - 200;
  run(s, 1);
  assert.match(ac.grounded ?? '', /overdue/);
  assert.ok(ac.booked || ac.downtime, 'forced into the shop');
});

test('in-house hangars are cheaper than outsourcing', () => {
  const s = setup();
  const ac = quickLease(s, 'a320n');
  const outside = G.quoteCheck(s, ac, 'C').cost;
  s.cash = 1e9;
  assert.ok(G.buildFacility(s, 'DEN', 'line').ok);
  assert.ok(G.buildFacility(s, 'DEN', 'narrowHangar').ok);
  run(s, 40);
  assert.equal(G.quoteCheck(s, ac, 'C').where, 'inhouse');
  assert.ok(G.quoteCheck(s, ac, 'C').cost < outside);
});

test('retrofits and upgrades take the aircraft out of service then apply', () => {
  const s = setup();
  s.cash = 1e9;
  const ac = quickLease(s, 'b789');
  assert.ok(G.retrofitCabin(s, ac.id, { F: 0, J: 48, W: 24, Y: 180 }).ok);
  assert.ok(G.inDowntime(s, ac));
  assert.ok(G.startUpgrade(s, ac.id, 'wifi').ok);
  run(s, 5);
  assert.equal(ac.config.J, 48);
  assert.ok(ac.upgrades.includes('wifi'));
  assert.equal(G.inDowntime(s, ac), false);
});

test('slots are needed at congested airports', () => {
  const s = setup();
  const { route } = G.openRoute(s, 'DEN', 'LHR');
  const ac = quickLease(s, 'b789');
  s.slots.LHR = { held: 0, pool: 2 };
  assert.equal(G.setFrequency(s, ac.id, route.id, 5).ok, false);
  assert.ok(G.setFrequency(s, ac.id, route.id, 2).ok);
  assert.equal(s.slots.LHR.held, 2);
});

test('loans, credit facility and hedges work', () => {
  const s = setup();
  assert.ok(G.takeTermLoan(s, 10e6).ok);
  assert.equal(G.takeTermLoan(s, 1e12).ok, false);
  assert.ok(G.drawRcf(s, 5e6).ok);
  s.lastReport = { cost: { fuel: 500e3 } };
  assert.ok(G.buyHedge(s, 0.25, 26).ok);
  assert.ok(G.buyHedge(s, 0.5, 26).ok);
  assert.equal(G.buyHedge(s, 0.5, 26).ok, false, 'max 80% hedged');
  s.lastReport = null;
  run(s, 6);
  assert.ok(s.loans.find((l) => l.kind === 'term').principal < 10e6);
  assert.ok(G.RATINGS.includes(s.finance.rating));
});

test('real rivals compete on their hub markets', () => {
  const s = setup({ hub: 'ORD' });
  const rivals = G.rivalsOn(s, 'ORD', 'LAX').map((r) => r.id);
  assert.ok(rivals.includes('UA') && rivals.includes('AA'));
  assert.equal(G.rivalsOn(s, 'BZN', 'JAC').length, 0);
});

test('charters reserve aircraft hours and pay out', () => {
  const s = setup();
  s.cash = 1e9;
  const ac = quickLease(s, 'b789');
  const offer = { id: 'co-test', category: 'charter', kind: 'Sports team', client: 'Test FC', a: 'DEN', b: 'LAX', distance: G.distanceKm('DEN', 'LAX'), seats: 100, weeks: 4, rt: 2, weekly: 500e3, rep: 1, startIn: 1, expiresWeek: s.week + 4, fullTime: false };
  s.contracts.offers.push(offer);
  assert.ok(G.acceptContract(s, offer.id, ac.id).ok);
  run(s, 2);
  assert.ok(ac.contractHours > 0);
  assert.ok(s.lastReport.revenue.contracts >= 500e3);
});

test('every event builds and resolves every choice', () => {
  for (const def of G.EVENTS) {
    for (let choice = 0; choice < 3; choice++) {
      const s = setup({ hub: 'MIA' });
      s.cash = 1e9;
      for (const to of ['LHR', 'CDG', 'EYW', 'MCO']) G.openRoute(s, 'MIA', to);
      for (let i = 0; i < 30; i++) G.assignAircraft(s, quickLease(s, i % 2 ? 'b789' : 'a320n').id, s.routes[i % 4].id);
      G.orderAircraft(s, 'a320n', 1);
      s.staff.pilots.count = 200;
      s.fleet[0].reliability = 50;
      run(s, 1);
      s.pendingEvent = null;
      const ev = G.triggerEvent(s, def.id, def.id === 'rival_collapse' ? { rivalId: 'AA' } : undefined);
      if (!ev) continue;
      if (choice >= ev.choices.length) continue;
      assert.doesNotThrow(() => JSON.stringify(ev));
      if (ev.choices[choice].disabled) continue;
      const res = G.resolveEvent(s, choice);
      assert.ok(res.ok, `${def.id}#${choice}: ${res.error}`);
      run(s, 1);
    }
  }
});

test('running out of cash ends in administration', () => {
  const s = setup();
  s.cash = -500e6;
  run(s, 7);
  assert.equal(s.status, 'playing');
  s.pendingEvent = null;
  G.advanceWeek(s);
  assert.equal(s.status, 'bankrupt');
  assert.equal(G.advanceWeek(s).ok, false);
});

test('games are deterministic and survive a JSON round trip', () => {
  const play = () => {
    const s = setup();
    const { route } = G.openRoute(s, 'DEN', 'ORD');
    G.leaseFromOffer(s, s.market.leases[0].id);
    G.assignAircraft(s, quickLease(s, 'a320n').id, route.id);
    run(s, 30);
    return s;
  };
  const a = play();
  const b = play();
  assert.deepEqual(a, b);
  const restored = JSON.parse(JSON.stringify(a));
  run(restored, 20);
  run(a, 20);
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), JSON.parse(JSON.stringify(a)));
});

test('a five-year game runs without errors', () => {
  const s = setup({ hub: 'ATL' });
  for (const to of ['MIA', 'ORD', 'JFK', 'DFW', 'BNA', 'LHR']) G.openRoute(s, 'ATL', to);
  for (let i = 0; i < 8; i++) G.assignAircraft(s, quickLease(s, i < 6 ? 'b38m' : 'b789').id, s.routes[i < 6 ? i : 5].id);
  for (let w = 0; w < 260 && s.status === 'playing'; w++) {
    if (s.pendingEvent) G.resolveEvent(s, s.pendingEvent.choices.findIndex((c) => !c.disabled));
    assert.ok(G.advanceWeek(s).ok);
    assert.ok(Number.isFinite(s.cash), 'cash stays finite');
  }
  assert.ok(s.history.length > 0);
});
