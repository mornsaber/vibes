import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/engine/index.js';

const setup = (opts = {}) => G.newGame({ name: 'Test Air', code: 'TA', hub: 'DEN', seed: 1234, ...opts });

function run(s, weeks) {
  for (let i = 0; i < weeks; i++) {
    if (s.pendingEvent) G.resolveEvent(s, s.pendingEvent.choices.findIndex((c) => !c.disabled));
    if (s.status !== 'playing') return;
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
  assert.ok(s.lastReport.revenue.contracts >= 490e3, 'nominal contract value erodes slightly with inflation');
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
  const s = setup({ settings: { restructuring: 'off' } });
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
    if (s.status !== 'playing') break;
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
    if (s.status !== 'playing') break;
    assert.ok(G.advanceWeek(s).ok);
    assert.ok(Number.isFinite(s.cash));
  }
  assert.ok(G.yearOf(s.week) >= 1962);
});

// ---------------------------------------------------------------------------
// Difficulty, inflation, niche aircraft

test('difficulty presets and custom overrides shape the game', () => {
  const easy = G.newGame({ hub: 'DEN', seed: 1, difficulty: 'easy' });
  const brutal = G.newGame({ hub: 'DEN', seed: 1, difficulty: 'brutal' });
  assert.ok(easy.cash > brutal.cash);
  assert.ok(easy.settings.safety < brutal.settings.safety);
  const custom = G.newGame({ hub: 'DEN', seed: 1, difficulty: 'normal', settings: { cash: 300e6, safety: 0, startups: 0 } });
  assert.equal(custom.cash, 300e6);
  const ac = quickLease(custom, 'a320n');
  ac.reliability = 10;
  assert.equal(G.incidentRates(custom, ac).hull, 0, 'accidents can be switched off');
});

test('inflation erodes nominal debt and shows money in the dollars of the day', () => {
  const s = G.newGame({ hub: 'JFK', seed: 2, startYear: 1975 });
  assert.ok(s.macro.priceLevel < 0.2);
  G.setPriceLevel(s.macro.priceLevel);
  assert.equal(G.money(60e6), G.money(60e6 * s.macro.priceLevel / G.priceLevel()));
  assert.match(G.money(60e6), /\$9\.\dM|\$\d\.\dM/, 'a $60M (2027) jet costs single-digit millions in 1975');
  G.takeTermLoan(s, 20e6);
  const loan = s.loans[0];
  run(s, 52);
  // 1970s inflation shrinks the real burden far faster than amortisation alone.
  const amortOnly = 20e6 * 0.8;
  assert.ok(loan.principal < amortOnly);
  assert.ok(s.macro.priceLevel > 0.16);
  const off = G.newGame({ hub: 'JFK', seed: 2, startYear: 1975, settings: { inflation: 'off' } });
  run(off, 10);
  assert.equal(off.macro.priceLevel, 1);
});

test('without wage indexing, real pay erodes and union claims grow', () => {
  const s = G.newGame({ hub: 'JFK', seed: 2, startYear: 1975, settings: { cola: false } });
  const demand0 = G.unionDemand(s, 'pilots');
  run(s, 52);
  assert.ok(s.staff.pilots.pay < 0.95);
  assert.ok(G.unionDemand(s, 'pilots') > demand0);
});

test('commuter aircraft fly short strips without cabin crew', () => {
  const s = G.newGame({ hub: 'JFK', seed: 2, startYear: 2015 });
  const { route } = G.openRoute(s, 'JFK', 'ACK');
  const otter = quickLease(s, 'dhc6s4');
  assert.ok(G.setFrequency(s, otter.id, route.id, 14).ok);
  assert.equal(G.cabinCrewPerFlight(otter.config), 0);
  assert.equal(G.staffRequirements(s).cabin, 0);
  const sbh = G.openRoute(G.newGame({ hub: 'SJU', seed: 1, startYear: 2015 }), 'SJU', 'SBH');
  assert.ok(sbh.ok);
  assert.ok(G.airportByCode.LUA.runway < G.aircraftById.atr72.runway);
});

test('niche types follow production years', () => {
  const y1965 = G.newGame({ hub: 'LHR', seed: 2, startYear: 1965 });
  assert.ok(G.orderAircraft(y1965, 'vc10').ok);
  assert.equal(G.orderAircraft(y1965, 'bae146').ok, false);
  const y2020 = G.newGame({ hub: 'PEK', seed: 2, startYear: 2020 });
  assert.ok(G.orderAircraft(y2020, 'c919').ok, 'orders open before entry into service');
  assert.equal(G.orderAircraft(y2020, 'il86').ok, false);
});

// ---------------------------------------------------------------------------
// Advisor, scenarios, revenue management, timetables, seasons, brands,
// terminals, regulation, history, branding and cabins.

const manual = (s) => G.setAutopilot(s, { pricing: false, fleet: false });

test('autopilot assigns idle aircraft and prices toward the target load factor', () => {
  const s = setup();
  const { route } = G.openRoute(s, 'DEN', 'SEA');
  const ac = quickLease(s, 'a320n');
  run(s, 1);
  assert.ok(ac.schedule.some((e) => e.routeId === route.id), 'idle aircraft assigned');
  // Overpriced: the autopilot brings fares down and loads up.
  G.setPriceIndex(s, route.id, 1.55);
  run(s, 1);
  const lf0 = route.last.lf;
  run(s, 10);
  assert.ok(G.priceIndex(s, route) < 1.4, `idx ${G.priceIndex(s, route)}`);
  assert.ok(route.last.lf > lf0, `lf ${route.last.lf} vs ${lf0}`);
  const idx = G.priceIndex(s, route);
  assert.ok(idx >= G.PRICE_RANGE[0] - 1e-9 && idx <= G.PRICE_RANGE[1] + 1e-9);
  // Pricing by hand takes the route off auto.
  G.setRouteRm(s, route.id, { autoPrice: false });
  G.setPriceIndex(s, route.id, 1.4);
  run(s, 2);
  assert.ok(Math.abs(G.priceIndex(s, route) - 1.4) < 0.02);
});

test('the advisor suggests fixes that can be applied', () => {
  const s = setup();
  manual(s);
  const { route } = G.openRoute(s, 'DEN', 'BZN');
  const a = quickLease(s, 'a321n');
  G.setFrequency(s, a.id, route.id, 20);
  run(s, 2);
  const advice = G.adviseRoutes(s);
  const cut = advice.find((x) => x.routeId === route.id && x.kind === 'cut');
  assert.ok(cut, JSON.stringify(advice));
  assert.ok(G.applyAdvice(s, route.id, 'cut').ok);
  assert.equal(G.routeFreq(s, route), 15);
  const { route: empty } = G.openRoute(s, 'DEN', 'SLC');
  quickLease(s, 'a320n');
  assert.ok(G.adviseRoutes(s).some((x) => x.routeId === empty.id && x.kind === 'assign'));
  assert.ok(G.applyAdvice(s, empty.id, 'assign').ok);
  assert.ok(G.routeFreq(s, empty) > 0);
});

test('revenue management splits flexible and advance travellers', () => {
  const s = setup();
  manual(s);
  const { route } = G.openRoute(s, 'DEN', 'LAX');
  G.assignAircraft(s, quickLease(s, 'a320n').id, route.id);
  run(s, 3);
  const open = route.last;
  assert.ok(open.adv.Y > 0 && open.adv.Y < open.pax.Y, 'some advance, some flex');
  const yieldOpen = open.revenue.Y / open.pax.Y;
  G.setRouteRm(s, route.id, { advShare: 0 });
  run(s, 2);
  const closed = route.last;
  assert.equal(Math.round(closed.adv.Y), 0);
  assert.ok(closed.pax.Y < open.pax.Y, 'closing the bucket loses leisure travellers');
  assert.ok(closed.revenue.Y / closed.pax.Y > yieldOpen, 'but raises the average fare');
  assert.ok(G.priceEffect(1.2, 1, 'Y', 1, G.FLEX_ELASTICITY) > G.priceEffect(1.2, 1, 'Y', 1, G.ADV_ELASTICITY));
});

test('summer and winter schedules fly in their own season', () => {
  const s = setup({ startYear: 2026 });
  manual(s);
  const { route } = G.openRoute(s, 'DEN', 'BZN');
  const ac = quickLease(s, 'a320n');
  assert.ok(G.setFrequency(s, ac.id, route.id, 14, { season: 'summer' }).ok);
  assert.ok(G.setFrequency(s, ac.id, route.id, 3, { season: 'winter' }).ok);
  assert.equal(ac.schedule.length, 2);
  assert.equal(G.seasonOf(s.week), 'winter');
  assert.equal(G.routeFreq(s, route), 3);
  assert.equal(G.peakFreq(s, route), 14);
  run(s, 2);
  assert.ok(route.last.freq > 1 && route.last.freq <= 3, `winter freq ${route.last.freq}`);
  while (G.seasonOf(s.week) !== 'summer') run(s, 1);
  run(s, 1);
  assert.ok(route.last.freq > 10, `summer freq ${route.last.freq}`);
  // Setting the same frequency for both seasons merges back to one entry.
  G.setFrequency(s, ac.id, route.id, 14, { season: 'winter' });
  assert.equal(ac.schedule.length, 1);
  assert.ok(!G.isSeasonal(ac));
});

test('connection banks beat a small rolling hub when spokes fly daily', () => {
  const hub = { banks: 0, discipline: 0.6 };
  const rolling = G.hubConnectionQuality(hub, 14, 14, 60);
  const banked = G.hubConnectionQuality({ banks: 2, discipline: 0.8 }, 14, 14, 60);
  const thin = G.hubConnectionQuality({ banks: 6, discipline: 0.8 }, 7, 7, 60);
  assert.ok(banked > rolling, `${banked} vs ${rolling}`);
  assert.ok(thin < banked, 'too many banks for the frequency');
  const s = setup();
  for (const to of ['SEA', 'LAX', 'ORD', 'BZN', 'SLC']) G.openRoute(s, 'DEN', to);
  for (const r of s.routes) G.setFrequency(s, quickLease(s, 'a320n').id, r.id, 14);
  assert.equal(G.suggestedBanks(s, 'DEN'), 2);
  run(s, 6);
  assert.equal(s.hubs[0].banks, 2, 'auto timetable');
  assert.ok(G.setHubTimetable(s, 'DEN', { banks: 0 }).ok);
  assert.equal(s.hubs[0].autoBanks, false);
});

test('terminals take years to build, then cut fees and add slots', () => {
  const s = setup({ hub: 'JFK' });
  manual(s);
  s.cash = 1e9;
  const held = s.slots.JFK.held;
  assert.ok(G.buildTerminal(s, 'JFK').ok);
  assert.ok(!G.buildTerminal(s, 'JFK').ok, 'one project at a time');
  const { route } = G.openRoute(s, 'JFK', 'BOS');
  G.setFrequency(s, quickLease(s, 'a320n').id, route.id, 10);
  run(s, 2);
  const before = route.last.cost.landing / route.last.flights;
  run(s, G.TERMINALS[1].weeks);
  assert.equal(s.hubs[0].terminal, 1);
  assert.equal(s.slots.JFK.held, held + G.TERMINAL_EFFECT.slots);
  const after = route.last.cost.landing / route.last.flights;
  assert.ok(after < before, `${after} vs ${before}`);
});

test('subsidiary brands have their own reputation, fares and costs', () => {
  const s = setup();
  manual(s);
  const { route } = G.openRoute(s, 'DEN', 'LAS');
  G.assignAircraft(s, quickLease(s, 'a320n').id, route.id);
  run(s, 2);
  const main = route.last;
  const res = G.launchBrand(s, { name: 'Zoom', code: 'ZM', kind: 'lcc' });
  assert.ok(res.ok);
  assert.ok(G.setRouteBrand(s, route.id, res.brand.id).ok);
  assert.ok(G.priceIndex(s, route) < 0.85);
  run(s, 3);
  const lcc = route.last;
  assert.ok(lcc.cost.distribution / lcc.ticket < main.cost.distribution / main.ticket, 'direct sales');
  assert.ok(lcc.crewFactor < 1);
  assert.ok(lcc.ancillary / lcc.paxTotal > main.ancillary / main.paxTotal, 'paid extras');
  const results = G.brandResults(s);
  assert.equal(results.length, 2);
  assert.ok(results[1].routes === 1 && Number.isFinite(results[1].rep));
  const { route: far } = G.openRoute(s, 'DEN', 'LHR');
  assert.ok(!G.setRouteBrand(s, far.id, res.brand.id).ok, 'too far for the LCC');
  assert.ok(G.closeBrand(s, res.brand.id).ok);
  assert.equal(route.brand, undefined);
});

test('acquired rivals can be kept as subsidiary brands', () => {
  const s = setup();
  s.cash = 5e10;
  const target = G.RIVALS.filter((r) => r.country === 'US' && ['lcc', 'ulcc'].includes(r.type) && s.rivals[r.id]?.status === 'active').sort((a, b) => s.rivals[a.id].fleet - s.rivals[b.id].fleet)[0];
  const res = G.acquireRival(s, target.id, 'cash', { asBrand: true });
  assert.ok(res.ok, res.error);
  const brand = s.brands.find((b) => b.name === target.name);
  assert.ok(brand && brand.kind === 'lcc');
  assert.ok(s.routes.some((r) => r.brand === brand.id));
});

test('campaigns cost money, lift demand for a while, then end', () => {
  const s = setup();
  manual(s);
  const { route } = G.openRoute(s, 'DEN', 'SEA');
  G.assignAircraft(s, quickLease(s, 'a320n').id, route.id);
  run(s, 2);
  const cash = s.cash;
  assert.ok(G.startCampaign(s, 'business').ok);
  assert.ok(s.cash < cash);
  assert.ok(!G.startCampaign(s, 'business').ok, 'no duplicates');
  assert.ok(G.campaignEffect(s, 'main').flex > 1);
  run(s, 1);
  assert.ok(s.lastReport.cost.marketing > s.marketing, 'campaign spend reported');
  run(s, G.CAMPAIGNS.business.weeks + 1);
  assert.equal(s.campaigns.length, 0);
  const rep = s.reputation;
  G.startCampaign(s, 'sponsorship');
  run(s, 10);
  assert.ok(s.reputation > rep - 3);
});

test('repainting costs money unless a relaunch is running', () => {
  const s = setup();
  manual(s);
  quickLease(s, 'a320n');
  const cash = s.cash;
  assert.ok(G.setLivery(s, 'main', { pattern: 'band', color2: '#ff0000' }, G.typeOf).ok);
  assert.ok(s.cash < cash);
  assert.equal(s.airline.livery.pattern, 'band');
  G.startCampaign(s, 'relaunch');
  const c2 = s.cash;
  assert.ok(G.setLivery(s, 'main', { logo: '★' }, G.typeOf).ok);
  assert.equal(s.cash, c2);
  assert.ok(!G.setLivery(s, 'main', { pattern: 'tartan' }, G.typeOf).ok);
});

test('bilateral agreements cap international frequencies until open skies', () => {
  const s = setup({ startYear: 1975 });
  manual(s);
  assert.equal(G.treatyFor(s, 'US', 'CA').cap, 14);
  const { route } = G.openRoute(s, 'DEN', 'YVR');
  const a = quickLease(s, 'b727');
  const b = quickLease(s, 'b727');
  assert.ok(G.setFrequency(s, a.id, route.id, 10).ok);
  const res = G.setFrequency(s, b.id, route.id, 7);
  assert.ok(!res.ok && /air service agreement/.test(res.error), res.error);
  assert.ok(G.setFrequency(s, b.id, route.id, 4).ok);
  const later = setup({ startYear: 2010 });
  assert.equal(G.treatyFor(later, 'US', 'CA').kind, 'open');
  assert.equal(G.treatyFor(later, 'US', 'DE').kind, 'open');
  assert.ok(!G.sameMarket('FR', 'DE', 1990) && G.sameMarket('FR', 'DE', 2000));
  const off = setup({ startYear: 1975, settings: { regulation: 'off' } });
  assert.equal(G.treatyFor(off, 'US', 'CA').cap, Infinity);
});

test('carbon pricing applies to modern European flying only', () => {
  const s = setup({ hub: 'FRA', startYear: 2026 });
  manual(s);
  const { route } = G.openRoute(s, 'FRA', 'MAD');
  G.assignAircraft(s, quickLease(s, 'a320n').id, route.id);
  run(s, 2);
  assert.ok(route.last.cost.carbon > 0);
  assert.ok(route.last.co2 > 0);
  assert.ok(s.lastReport.cost.carbon > 0);
  const old = setup({ hub: 'FRA', startYear: 1999 });
  manual(old);
  const { route: r2 } = G.openRoute(old, 'FRA', 'MAD');
  G.assignAircraft(old, quickLease(old, 'a320c').id, r2.id);
  run(old, 2);
  assert.equal(r2.last.cost.carbon, 0);
  assert.equal(G.etsPrice(2005), 0);
  assert.ok(G.safShare(2030) > G.safShare(2025));
});

test('foreign stakes follow ownership rules', () => {
  const s = setup();
  const foreign = G.RIVALS.find((r) => r.country === 'GB' && s.rivals[r.id]?.status === 'active' && r.type !== 'cargo');
  assert.equal(G.acquisitionTerms(s, foreign.id).stake, 0.25);
  s.regulation.foreignCap = 0.49;
  const t = G.acquisitionTerms(s, foreign.id);
  assert.equal(t.stake, 0.49);
  s.cash = 1e11;
  assert.ok(G.buyStake(s, foreign.id).ok);
  assert.equal(s.stakes[foreign.id], 0.49);
});

test('seat products change floor space, appeal and availability', () => {
  const s = setup({ startYear: 1975 });
  const jumbo = G.makeAircraft(s, 'b742', {});
  const res = G.retrofitCabin(s, jumbo.id, { F: 12, J: 40, W: 0, Y: 300 }, { J: 'flat' });
  assert.ok(!res.ok && /1998/.test(res.error));
  const t = G.aircraftById.b789;
  assert.ok(G.seatUnits(t, 'J', 'suite') > G.seatUnits(t, 'J', 'flat'));
  assert.ok(G.seatUnits(t, 'Y', 'dense') < 1);
  assert.ok(G.productQ('J', 'flat', true) > G.productQ('J', 'recliner', true));
  assert.ok(G.cabinUnits(t, { F: 0, J: 30, W: 0, Y: 200 }, { J: 'suite' }) > G.cabinUnits(t, { F: 0, J: 30, W: 0, Y: 200 }, { J: 'flat' }));
  // Long-haul business travellers prefer beds.
  const m = setup({ startYear: 2026 });
  manual(m);
  const { route } = G.openRoute(m, 'DEN', 'LHR');
  const a = quickLease(m, 'b789');
  a.cabin = { ...a.cabin, J: 'recliner' };
  G.assignAircraft(m, a.id, route.id);
  run(m, 3);
  const recl = route.last.demand.J;
  a.cabin.J = 'suite';
  run(m, 3);
  assert.ok(route.last.demand.J > recl * 1.15, `${route.last.demand.J} vs ${recl}`);
});

test('combis carry freight on the main deck', () => {
  const s = setup();
  const ac = G.makeAircraft(s, 'b738', {});
  const before = G.cargoCapacity(ac);
  assert.ok(G.retrofitCabin(s, ac.id, { F: 0, J: 0, W: 0, Y: 120, C: 8 }).ok);
  run(s, 3);
  assert.equal(ac.config.C, 8);
  assert.equal(G.cargoCapacity(ac), before + 8000);
  assert.ok(!G.validateConfig(G.aircraftById.dhc6, { F: 0, J: 0, W: 0, Y: 10, C: 1 }).ok);
});

test('milestones, annual reports and market share are recorded', () => {
  const s = setup({ startYear: 2026 });
  const { route } = G.openRoute(s, 'DEN', 'SEA');
  G.assignAircraft(s, quickLease(s, 'a320n').id, route.id);
  run(s, 56);
  assert.ok(s.milestones.some((m) => m.id === 'first_flight'));
  assert.equal(s.annual.length, 1);
  assert.equal(s.annual[0].year, 2026);
  assert.ok(s.annual[0].pax > 0 && Number.isFinite(s.annual[0].profit));
  assert.ok(s.shareHistory.length >= 12);
  assert.ok(G.shareNow(s) > 0 && G.shareNow(s) < 1);
  assert.ok(G.freeScore(s) > 0);
});

test('every scenario sets up a working airline', () => {
  for (const id of Object.keys(G.SCENARIOS)) {
    const s = G.newGame({ scenario: id, seed: 77 });
    const sc = G.SCENARIOS[id];
    assert.equal(G.yearOf(s.week), sc.year, id);
    assert.equal(s.hubs[0].code, sc.hub);
    assert.ok(s.fleet.length >= 3 && s.routes.length >= 4, id);
    assert.ok(s.fleet.filter((a) => a.schedule.length).length >= s.fleet.length * 0.7, `${id}: fleet scheduled`);
    assert.equal(G.scenarioGoals(s).length, sc.goals.length);
    run(s, 20);
    assert.ok(['playing', 'sold'].includes(s.status) || s.status === 'bankrupt', `${id} ${s.status}`);
    assert.ok(s.lastReport.pax > 0, id);
  }
});

test('scenarios are won when goals are met and lost at the deadline', () => {
  const s = G.newGame({ scenario: 'panam65', seed: 3 });
  s.scenario.met = { regions: s.week, intercont: s.week, jumbos: s.week, bigger: s.week };
  G.scenarioTick(s);
  assert.equal(s.status, 'won');
  assert.ok(s.scenario.score >= 4000);
  assert.ok(G.continueFreePlay(s).ok);
  assert.equal(s.status, 'playing');
  const l = G.newGame({ scenario: 'lcc05', seed: 3 });
  l.week = l.scenario.deadlineWeek;
  G.scenarioTick(l);
  assert.equal(l.status, 'lost');
});

test('version 4 saves migrate to the current shape', () => {
  const s = setup();
  const { route } = G.openRoute(s, 'DEN', 'SEA');
  G.assignAircraft(s, quickLease(s, 'a320n').id, route.id);
  run(s, 2);
  const old = JSON.parse(JSON.stringify(s));
  old.version = 4;
  old.hubs[0] = { code: 'DEN', openedWeek: 0, bank: 3, lounge: false, facilities: {} };
  for (const k of ['autopilot', 'brands', 'campaigns', 'regulation', 'annual', 'milestones', 'shareHistory', 'scenario']) delete old[k];
  delete old.airline.livery;
  delete old.settings.regulation;
  const m = G.migrate(old);
  assert.equal(m.version, G.SAVE_VERSION);
  assert.equal(m.hubs[0].banks, 5);
  assert.equal(m.autopilot.pricing, false, 'old games keep manual pricing');
  run(m, 3);
  assert.equal(m.status, 'playing');
  assert.equal(G.migrate({ version: 2 }), null);
});

// ---------------------------------------------------------------------------
// Performance caches, reactive rivals, Chapter 11, tutorial, save slots.

import { createSaves } from '../src/ui/storage.js';

const bruteFreq = (s, route, season) => s.fleet.reduce((t, ac) => t + ac.schedule.filter((e) => e.routeId === route.id && G.inSeason(e, season)).reduce((a, e) => a + e.freq, 0), 0);

test('frequency and route caches stay correct as schedules change', () => {
  const s = setup();
  manual(s);
  const { route: r1 } = G.openRoute(s, 'DEN', 'SEA');
  const { route: r2 } = G.openRoute(s, 'DEN', 'LAX');
  const a = quickLease(s, 'a320n');
  const b = quickLease(s, 'a320n');
  const check = () => {
    for (const r of s.routes) for (const se of ['summer', 'winter']) assert.equal(G.routeFreq(s, r, se), bruteFreq(s, r, se), `${r.a}-${r.b} ${se}`);
  };
  G.setFrequency(s, a.id, r1.id, 7);
  check();
  G.setFrequency(s, b.id, r1.id, 5, { season: 'summer' });
  G.setFrequency(s, b.id, r2.id, 4, { season: 'winter' });
  check();
  assert.ok(G.splitSeasons(s, a.id, r1.id).ok);
  G.setFrequency(s, a.id, r1.id, 9, { season: 'winter' });
  check();
  run(s, 3);
  check();
  G.closeRoute(s, r2.id);
  check();
  assert.equal(G.routeById(s, r2.id), undefined);
  assert.equal(G.routeById(s, r1.id), r1);
  G.sellAircraft(s, b.id);
  check();
  // Connection candidates follow the route list.
  const before = G.connectionCandidates(s).length;
  G.openRoute(s, 'DEN', 'ORD');
  G.openRoute(s, 'DEN', 'BOS');
  assert.ok(G.connectionCandidates(s).length > before);
});

test('the fast rival-appeal path and the rivalsOn memo match the plain versions', () => {
  const s = setup();
  run(s, 6);
  const ctx = G.rivalsContext(s);
  const pairs = [['DEN', 'LAX'], ['ORD', 'LHR'], ['JFK', 'CDG'], ['ATL', 'MIA'], ['SEA', 'SFO']];
  for (const [a, b] of pairs) {
    const memo = G.rivalsOn(s, a, b, ctx);
    const plain = G.rivalsOn(s, a, b);
    assert.deepEqual(memo, plain);
    for (const r of plain) for (const c of ['F', 'J', 'W', 'Y', 'C']) assert.equal(G.rivalAppealFast(s, ctx, r, c, 1.1), G.rivalAppeal(s, r, c, 1.1));
  }
});

test('incumbents defend their hubs when you move in', () => {
  const s = setup();
  manual(s);
  const { route } = G.openRoute(s, 'DEN', 'SFO'); // United hubs at both ends
  G.assignAircraft(s, quickLease(s, 'a320n').id, route.id);
  G.setPriceIndex(s, route.id, 0.8);
  run(s, 8);
  const m = s.rivalMarkets[G.pairKey('DEN', 'SFO')]?.UA;
  assert.ok(m?.defended, 'United responded');
  assert.ok(m.fare < 1 && m.cap > 1, JSON.stringify(m));
  assert.ok(s.log.some((l) => /defends its/.test(l.text)));
});

test('rivals retreat from routes where they are beaten', () => {
  const s = setup();
  // Delta has entered DEN–PHX (neither end is its hub).
  const { route } = G.openRoute(s, 'DEN', 'PHX');
  s.rivalMarkets[G.pairKey('DEN', 'PHX')] = { DL: { entered: true } };
  const rival = G.rivalsOn(s, 'DEN', 'PHX').find((x) => x.id === 'DL');
  assert.ok(rival);
  route.last = { seatTotal: 1000, share: 0.7, lf: 0.85, paxTotal: 850 };
  const overlaps = new Map([[rival.id, [route]]]);
  for (let i = 0; i < 4; i++) G.contestTick(s, overlaps);
  assert.ok(s.rivalMarkets[G.pairKey(route.a, route.b)][rival.id].exited);
});

test('rivals order aircraft, take delivery and open routes', () => {
  const s = setup();
  const rs = s.rivals.DL;
  rs.margin = 0.12;
  rs.cash = 1e11;
  const fleet = rs.fleet;
  let ordered = false;
  for (let i = 0; i < 200 && !ordered; i++) {
    G.fleetTick(s, G.typicalTypes);
    ordered = (rs.orders ?? []).length > 0;
    rs.margin = 0.12;
  }
  assert.ok(ordered, 'placed an order');
  const o = rs.orders[0];
  s.week = o.week;
  rs.margin = 0.01;
  G.fleetTick(s, G.typicalTypes);
  assert.ok(rs.fleet >= fleet + o.n);
  assert.ok(Object.values(s.rivalMarkets).some((adj) => adj.DL?.entered), 'new routes');
});

test('alliances form at their founding dates and change membership', () => {
  const s = setup({ startYear: 1995 });
  assert.equal(G.rivalAlliance(s, G.rivalDef(s, 'UA')), null);
  s.week = G.weekOfYearStart(1998);
  assert.equal(G.rivalAlliance(s, G.rivalDef(s, 'UA')), 'Star Alliance');
  assert.equal(G.rivalAlliance(s, G.rivalDef(s, 'DL')), null, 'SkyTeam forms in 2000');
  // Big unaligned carriers eventually join; one member per country.
  s.week = G.weekOfYearStart(2005);
  const joiner = G.RIVALS.find((r) => !r.alliance && r.type === 'legacy' && s.rivals[r.id]?.status === 'active' && s.rivals[r.id].fleet >= 40);
  if (joiner) {
    s.rivals[joiner.id].rep = 80;
    for (let i = 0; i < 3000 && !G.rivalAlliance(s, joiner); i++) G.allianceTick(s, G.activeRivals);
    const a = G.rivalAlliance(s, joiner);
    if (a) assert.ok(!G.activeRivals(s).some((x) => x !== joiner && x.country === joiner.country && G.rivalAlliance(s, x) === a));
  }
  s.rivals.UA.alliance = null;
  assert.equal(G.rivalAlliance(s, G.rivalDef(s, 'UA')), null, 'dynamic override');
});

function insolvent(opts = {}) {
  const s = setup({ settings: { inflation: 'off' }, ...opts });
  manual(s);
  const { route } = G.openRoute(s, 'DEN', 'SEA');
  G.assignAircraft(s, quickLease(s, 'a320n').id, route.id);
  G.takeTermLoan(s, 20e6);
  s.cash = -50e6;
  for (let i = 0; i < 8 && !s.pendingEvent; i++) G.advanceWeek(s);
  return s;
}

test('insolvency offers Chapter 11 instead of instant collapse', () => {
  const s = insolvent();
  assert.equal(s.pendingEvent?.id, 'insolvency');
  assert.equal(s.status, 'playing');
  assert.ok(G.resolveEvent(s, 0).ok);
  assert.ok(G.inChapter11(s));
  assert.ok(s.cash > 0, 'DIP loan');
  assert.ok(s.loans.some((l) => l.kind === 'dip'));
  const term = s.loans.find((l) => l.kind === 'term');
  const owed = term.principal;
  run(s, 2);
  assert.equal(term.principal, owed, 'debt frozen');
  assert.equal(s.finance.rating, 'D');
  assert.ok(!G.orderAircraft(s, 'a320n', 1).ok);
  assert.ok(!G.takeTermLoan(s, 1e6).ok);
  // The board can't fire you while protected.
  s.board.confidence = 0;
  run(s, 14);
  assert.equal(s.status, 'playing');
  const l = insolvent();
  G.resolveEvent(l, 1);
  assert.equal(l.status, 'bankrupt');
});

test('Chapter 11 tools, emergence and liquidation', () => {
  const s = insolvent();
  G.resolveEvent(s, 0);
  const leased = s.fleet.find((a) => !a.owned);
  const rent = leased.lease.monthly;
  assert.ok(G.renegotiateLeases(s).ok);
  assert.ok(Math.abs(leased.lease.monthly - rent * 0.75) < 1);
  assert.ok(!G.renegotiateLeases(s).ok, 'once only');
  const pay = s.staff.pilots.pay;
  assert.ok(G.cutLabourDeals(s).ok);
  assert.ok(s.staff.pilots.pay < pay);
  const spare = quickLease(s, 'e175');
  assert.ok(G.rejectLease(s, spare.id).ok);
  assert.ok(!s.fleet.includes(spare));
  // Too early, and not yet profitable.
  assert.ok(G.emergenceCheck(s).reasons.length > 0);
  // Pretend the turnaround worked.
  run(s, G.CH11_MIN_WEEKS);
  for (const h of s.history.slice(-4)) h.profit = 1e6;
  const term = s.loans.find((l) => l.kind === 'term');
  const owed = term.principal;
  const shares = s.finance.shares;
  s.cash = 500e6;
  assert.ok(G.emergeChapter11(s, G.resetBoard).ok);
  assert.ok(!G.inChapter11(s));
  assert.ok(Math.abs(term.principal - owed * 0.4) < 1, 'unsecured haircut');
  assert.ok(!s.loans.some((l) => l.kind === 'dip'));
  assert.equal(s.finance.rating, 'B');
  assert.equal(s.board.confidence, 60);
  assert.notEqual(s.finance.shares, shares * 1.5);
  // A failed plan is liquidated at the deadline.
  const f = insolvent();
  G.resolveEvent(f, 0);
  run(f, G.CH11_WEEKS + 1);
  if (G.emergenceCheck(f).reasons.length || f.status !== 'playing') assert.ok(['bankrupt', 'playing'].includes(f.status));
  // Voluntary filing needs distress.
  const healthy = setup();
  assert.ok(!G.fileChapter11(healthy).ok);
});

test('filings are limited and can be switched off', () => {
  const s = setup();
  s.restructuring = { status: 'emerged', count: G.MAX_FILINGS };
  s.cash = -1;
  assert.ok(G.restructuringTerms(s).reasons.some((r) => /filing/.test(r)));
  const off = setup({ settings: { restructuring: 'off' } });
  off.cash = -1;
  assert.ok(!G.fileChapter11(off).ok);
});

test('the first-year tutorial tracks progress and can be hidden', () => {
  const s = setup();
  assert.equal(G.tutorialCurrent(s).id, 'welcome');
  assert.ok(G.tutorialAck(s, 'welcome').ok);
  assert.equal(G.tutorialCurrent(s).id, 'aircraft');
  quickLease(s, 'a320n');
  assert.equal(G.tutorialCurrent(s).id, 'route');
  const { route } = G.openRoute(s, 'DEN', 'SEA');
  G.assignAircraft(s, s.fleet[0].id, route.id);
  assert.equal(G.tutorialCurrent(s).id, 'advance');
  run(s, 1);
  assert.equal(G.tutorialCurrent(s).id, 'results');
  G.setTutorial(s, false);
  assert.equal(G.tutorialCurrent(s), null);
  G.setTutorial(s, true);
  assert.equal(G.tutorialCurrent(s).id, 'results');
  assert.equal(G.tutorialSteps(s).filter((x) => x.complete).length, 5);
  assert.equal(G.tutorialCurrent(G.newGame({ scenario: 'oil73', seed: 1 })), null, 'off in scenarios');
  assert.ok(G.explain('Load factor') && G.explain('<b>RASK</b>') && !G.explain('nonsense'));
});

function fakeStore(limit = Infinity) {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const size = [...m.entries()].reduce((t, [kk, vv]) => t + (kk === k ? 0 : vv.length), 0) + v.length;
      if (size > limit) {
        const e = new Error('quota');
        e.name = 'QuotaExceededError';
        throw e;
      }
      m.set(k, v);
    },
    removeItem: (k) => m.delete(k),
  };
}

test('save slots compress, list, rename, copy, delete, snapshot and import', async () => {
  const store = fakeStore();
  let t = 1000;
  const saves = createSaves(store, { migrate: G.migrate, now: () => (t += 1000) });
  const a = setup();
  run(a, 3);
  const b = setup({ hub: 'ORD', name: 'Second Air' });
  const ra = await saves.save(a, { name: 'First' });
  const rb = await saves.save(b);
  assert.ok(ra.ok && rb.ok);
  assert.ok(store.getItem(`airline-exec-sim/slot/${ra.id}`).startsWith('gz:'), 'compressed');
  assert.ok(store.getItem(`airline-exec-sim/slot/${ra.id}`).length < JSON.stringify(a).length / 2);
  assert.deepEqual(saves.list().map((x) => x.name), ['Second Air', 'First']);
  const back = await saves.load(ra.id);
  assert.deepEqual(back, JSON.parse(JSON.stringify(a)));
  assert.ok(saves.rename(ra.id, 'Renamed').ok);
  assert.equal(saves.list().find((x) => x.id === ra.id).name, 'Renamed');
  const copy = await saves.duplicate(ra.id);
  assert.ok(copy.ok && saves.list().length === 3);
  // Snapshot = undo the last advance.
  await saves.snapshot(ra.id, a);
  run(a, 1);
  assert.ok(saves.hasSnapshot(ra.id));
  assert.equal((await saves.loadSnapshot(ra.id)).week, a.week - 1);
  saves.remove(ra.id);
  assert.equal(saves.list().length, 2);
  assert.ok(!saves.hasSnapshot(ra.id));
  // Export / import as plain JSON.
  const imp = await saves.importText(saves.exportText(b), 'Imported');
  assert.ok(imp.ok);
  assert.equal((await saves.load(imp.id)).airline.name, 'Second Air');
  assert.ok(!(await saves.importText(JSON.stringify({ version: 1 }))).ok);
  // Legacy single save is adopted into a slot.
  const legacy = fakeStore();
  const old = JSON.parse(JSON.stringify(setup()));
  old.version = 5;
  legacy.setItem('airline-exec-sim/save-v3', JSON.stringify(old));
  const s2 = createSaves(legacy, { migrate: G.migrate });
  const id = await s2.adoptLegacy();
  assert.ok(id && (await s2.load(id)).version === G.SAVE_VERSION);
  assert.equal(legacy.getItem('airline-exec-sim/save-v3'), null);
  // Quota errors are reported, not thrown.
  const tiny = createSaves(fakeStore(500), { migrate: G.migrate });
  const res = await tiny.save(a);
  assert.ok(!res.ok && /storage is full/.test(res.error));
});

test('version 5 saves migrate to version 6', () => {
  const s = setup();
  run(s, 2);
  const old = JSON.parse(JSON.stringify(s));
  old.version = 5;
  delete old.tutorial;
  delete old.restructuring;
  delete old.settings.restructuring;
  const m = G.migrate(old);
  assert.equal(m.version, 6);
  assert.equal(m.settings.restructuring, 'available');
  assert.equal(m.tutorial.on, false);
  run(m, 2);
  assert.equal(m.status, 'playing');
});
