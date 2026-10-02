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
  assert.equal(G.elapsed(s), total);
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
  s.strikes.pilots = { kind: 'strike', weeks: 2 };
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
      const data = {
        rival_collapse: { rivalId: 'AA' },
        union_pay: { role: 'pilots', demand: 0.05 },
        union_drive: { role: 'ground' },
        crash: { reg: 'N1', type: 'a320n', where: 'MIA–MCO', fatalities: 10, onboard: 150, why: 'pilot error' },
        serious_incident: { reg: 'N1', type: 'a320n', what: 'runway excursion', why: 'weather' },
        hijacking: { acId: s.fleet[0].id, reg: s.fleet[0].reg },
        takeover_bid: { rivalId: 'AA', price: 500e6 },
      }[def.id] ?? { severity: 1 };
      const ev = G.triggerEvent(s, def.id, data, def.weight === 0);
      if (!ev) continue;
      if (choice >= ev.choices.length) continue;
      assert.doesNotThrow(() => JSON.stringify(ev));
      if (ev.choices[choice].disabled) continue;
      const res = G.resolveEvent(s, choice);
      assert.ok(res.ok, `${def.id}#${choice}: ${res.error}`);
      if (s.status === 'playing') run(s, 1);
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

// ---------------------------------------------------------------------------
// Eras, workforce, safety and rivals

test('eras gate which aircraft can be ordered', () => {
  const s = G.newGame({ hub: 'JFK', seed: 3, startYear: 1965 });
  assert.equal(G.yearOf(s.week), 1965);
  assert.equal(G.orderAircraft(s, 'a320n').ok, false, 'not invented yet');
  assert.ok(G.orderAircraft(s, 'b707').ok);
  assert.equal(G.orderAircraft(s, 'b741').ok, false, 'jumbo orders only open in 1967');
  const later = G.newGame({ hub: 'JFK', seed: 3, startYear: 1968 });
  assert.ok(G.orderAircraft(later, 'b741').ok);
  assert.ok(later.orders.at(-1).deliveryWeek >= G.weekOfYearStart(1970), 'delivered no earlier than entry into service');
  assert.ok(s.market.leases.every((o) => G.inService(G.aircraftById[o.type], 1965)));
  assert.ok(s.macro.fuel < 0.5, 'cheap 1960s fuel');
});

test('Chapter 2 noise rules ground old jets in NA/EU from 2002', () => {
  const s = G.newGame({ hub: 'ORD', seed: 3, startYear: 2003 });
  const { route } = G.openRoute(s, 'ORD', 'DEN');
  const ac = quickLease(s, 'b727');
  assert.match(G.canOperate(s, ac, route).error ?? '', /noise/);
});

test('airframes retire at their life limit', () => {
  const s = setup();
  const ac = G.makeAircraft(s, 'b738', { owned: true, ageWeeks: 46 * 52 });
  run(s, 1);
  assert.ok(ac.retired);
  assert.match(ac.grounded, /life limit/);
});

test('flight engineers add to cockpit crew requirements', () => {
  const s = G.newGame({ hub: 'ORD', seed: 3, startYear: 1975 });
  const { route } = G.openRoute(s, 'ORD', 'DEN');
  const a = quickLease(s, 'b727');
  G.setFrequency(s, a.id, route.id, 7);
  const with727 = G.staffRequirements(s).pilots;
  G.setFrequency(s, a.id, route.id, 0);
  const b = quickLease(s, 'b733');
  const s2 = G.newGame({ hub: 'ORD', seed: 3, startYear: 1990 });
  const { route: r2 } = G.openRoute(s2, 'ORD', 'DEN');
  G.setFrequency(s2, quickLease(s2, 'b733').id, r2.id, 7);
  assert.ok(with727 > G.staffRequirements(s2).pilots);
  assert.ok(b);
});

test('workforce grades, promotions, demotions and contractors', () => {
  const s = setup();
  const w = s.staff.cabin;
  assert.equal(w.grades.reduce((a, b) => a + b, 0), w.count);
  const before = w.grades[2];
  assert.ok(G.promote(s, 'cabin', 1, 3).ok);
  assert.equal(w.grades[2], before + 3);
  assert.ok(G.demote(s, 'cabin', 2, 2).ok);
  assert.equal(w.grades.reduce((a, b) => a + b, 0), w.count);
  // Contract out all ground work: requirement covered without employees.
  const { route } = G.openRoute(s, 'DEN', 'SFO');
  G.assignAircraft(s, quickLease(s, 'a320n').id, route.id);
  G.setContractShare(s, 'ground', 1);
  s.strikes = {};
  run(s, 2);
  assert.ok(s.staff.ground.contractors > 0);
  assert.ok(s.staffStatus.ground.ratio >= 0.95);
});

test('delegation needs a manager and a big enough department', () => {
  const s = setup();
  assert.equal(G.setDelegated(s, 'cabin', true).ok, false);
  s.staff.cabin.grades[0] += 200;
  s.staff.cabin.count += 200;
  assert.ok(G.setDelegated(s, 'cabin', true).ok);
});

test('expired union agreements trigger negotiations; strikes cut flying', () => {
  const s = setup();
  const { route } = G.openRoute(s, 'DEN', 'SFO');
  G.assignAircraft(s, quickLease(s, 'a320n').id, route.id);
  run(s, 6);
  s.staff.pilots.union.agreementEnds = s.week;
  s.pendingEvent = null;
  G.advanceWeek(s);
  assert.ok(s.pendingEvent?.id === 'union_pay' || s.queue.some((q) => q.event === 'union_pay'));
  G.startAction(s, 'pilots', 'strike', 2);
  assert.ok(G.actionFactor(s, 'pilots') < 0.2);
});

test('risk rises with poor maintenance; accidents destroy aircraft and hurt the brand', () => {
  const s = setup();
  const good = quickLease(s, 'a320n');
  const bad = quickLease(s, 'a320n');
  bad.reliability = 40;
  bad.checks.C.week = s.week - 150;
  assert.ok(G.riskFactors(s, bad).total > G.riskFactors(s, good).total * 4);
  const rep = s.reputation;
  G.hullLoss(s, bad);
  assert.ok(!s.fleet.includes(bad));
  assert.ok(s.reputation < rep);
  assert.ok(s.brandShock);
  assert.equal(s.incidents[0].severity, 'hull loss');
});

test('the historical timeline is randomised but plausible', () => {
  const s = G.newGame({ hub: 'JFK', seed: 9, startYear: 1970 });
  assert.ok(s.timeline.length > 3);
  assert.ok(s.timeline.every((t) => G.EVENTS.some((e) => e.id === t.event)));
  assert.ok(s.timeline.every((t) => t.week > s.week));
  const other = G.newGame({ hub: 'JFK', seed: 10, startYear: 1970 });
  assert.notDeepEqual(s.timeline.map((t) => t.week), other.timeline.map((t) => t.week));
});

test('rival rosters follow the era', () => {
  const s = G.newGame({ hub: 'JFK', seed: 3, startYear: 1970 });
  assert.equal(s.rivals.PA.status, 'active');
  assert.equal(s.rivals.EK.status, 'future');
  assert.equal(s.rivals.BA.status, 'future');
  const m = G.newGame({ hub: 'JFK', seed: 3, startYear: 2027 });
  assert.equal(m.rivals.PA.status, 'defunct');
});

test('merged rivals hand their markets to the acquirer', () => {
  const s = G.newGame({ hub: 'JFK', seed: 3, startYear: 1985 });
  assert.ok(G.rivalsOn(s, 'JFK', 'MIA').some((r) => r.id === 'PA'));
  s.rivals.PA.status = 'merged';
  s.rivals.PA.mergedInto = 'DL';
  const ids = G.rivalsOn(s, 'JFK', 'MIA').map((r) => r.id);
  assert.ok(!ids.includes('PA') && ids.includes('DL'));
});

test('startups appear and compete', () => {
  const s = setup();
  const r = G.spawnStartup(s, { hub: 'DEN', type: 'ulcc' });
  assert.ok(r && s.rivals[r.id].status === 'active');
  assert.ok(G.rivalsOn(s, 'DEN', 'LAS').some((x) => x.id === r.id));
});

test('acquiring a domestic rival brings hubs, fleet, routes and staff', () => {
  const s = setup();
  s.cash = 1e11;
  assert.equal(G.acquisitionTerms(s, 'BA').reasons.length > 0, true, 'foreign ownership rules');
  const fleet = s.fleet.length;
  const res = G.acquireRival(s, 'F9');
  assert.ok(res.ok, res.error);
  assert.equal(s.rivals.F9.status, 'acquired');
  assert.ok(s.fleet.length > fleet + 10);
  assert.ok(s.routes.length > 5);
  assert.ok(s.hubs.some((h) => h.code === 'MCO' || h.code === 'LAS'));
  run(s, 2);
  assert.ok(s.lastReport.pax > 0);
});

test('stakes create a codeshare and pay dividends', () => {
  const s = setup();
  s.cash = 1e10;
  assert.ok(G.buyStake(s, 'LH').ok);
  assert.ok(s.partners.codeshares.includes('LH'));
  s.rivals.LH.profitQ = 100e6;
  const cash = s.cash;
  G.quarterlyRivalReset(s);
  assert.ok(s.cash > cash);
});

test('a game from 1960 runs for a decade', () => {
  const s = G.newGame({ hub: 'JFK', seed: 21, startYear: 1960 });
  for (const to of ['ORD', 'MIA', 'BOS', 'LAX']) G.openRoute(s, 'JFK', to);
  for (let i = 0; i < 6; i++) G.assignAircraft(s, quickLease(s, i % 2 ? 'dc6' : 'l188').id, s.routes[i % 4].id);
  for (let w = 0; w < 520 && s.status === 'playing'; w++) {
    if (s.pendingEvent) G.resolveEvent(s, s.pendingEvent.choices.findIndex((c) => !c.disabled));
    assert.ok(G.advanceWeek(s).ok);
    assert.ok(Number.isFinite(s.cash));
  }
  assert.ok(G.yearOf(s.week) >= 1962);
});
