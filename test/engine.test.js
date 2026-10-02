import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  distanceKm,
  referenceFare,
  roundTripsPerWeek,
  openRoute,
  closeRoute,
  leaseAircraft,
  buyAircraft,
  sellAircraft,
  assignAircraft,
  advanceWeek,
  takeLoan,
  creditLimit,
  triggerEvent,
  resolveEvent,
  setFare,
  updateSettings,
  heavyCheck,
  aircraftById,
} from '../src/engine.js';
import { EVENTS } from '../src/events.js';

const setup = (opts = {}) => newGame({ name: 'Test Air', hub: 'ORD', seed: 1234, ...opts });

function skipEvents(state, weeks) {
  for (let i = 0; i < weeks; i++) {
    if (state.pendingEvent) resolveEvent(state, state.pendingEvent.choices.findIndex((c) => !c.disabled));
    const res = advanceWeek(state);
    assert.ok(res.ok, res.error);
  }
}

test('great-circle distances are realistic', () => {
  assert.ok(Math.abs(distanceKm('JFK', 'LHR') - 5540) < 30);
  assert.ok(Math.abs(distanceKm('LAX', 'HND') - 8800) < 100);
  assert.equal(distanceKm('ORD', 'ORD'), 0);
});

test('reference fares grow with distance but taper per km', () => {
  const short = referenceFare(500);
  const long = referenceFare(8000);
  assert.ok(long > short);
  assert.ok(long / 8000 < short / 500);
});

test('aircraft fly fewer round trips on longer routes', () => {
  const a320 = aircraftById.a320;
  assert.ok(roundTripsPerWeek(a320, 500) > roundTripsPerWeek(a320, 4000));
  assert.ok(roundTripsPerWeek(aircraftById.b789, 12000) >= 2);
});

test('new games start solvent and with an unknown hub rejected', () => {
  const s = setup();
  assert.equal(s.cash, 60e6);
  assert.equal(s.status, 'playing');
  assert.throws(() => newGame({ hub: 'XXX' }));
});

test('routes must touch an airport you already serve', () => {
  const s = setup();
  assert.equal(openRoute(s, 'LHR', 'CDG').ok, false);
  assert.ok(openRoute(s, 'ORD', 'DEN').ok);
  assert.ok(openRoute(s, 'DEN', 'SEA').ok, 'DEN is now a station');
  assert.equal(openRoute(s, 'DEN', 'ORD').ok, false, 'duplicate in reverse');
});

test('leased aircraft arrive after two weeks and respect range', () => {
  const s = setup();
  const { route } = openRoute(s, 'ORD', 'HND');
  const { aircraft: atr } = leaseAircraft(s, 'atr72');
  assert.equal(assignAircraft(s, atr.id, route.id).ok, false);
  const { aircraft: wide } = leaseAircraft(s, 'b789');
  assert.ok(assignAircraft(s, wide.id, route.id).ok);

  skipEvents(s, 1);
  assert.equal(s.routes[0].last.aircraft, 0, 'not delivered yet');
  skipEvents(s, 1);
  assert.equal(s.routes[0].last.aircraft, 1);
  assert.ok(s.routes[0].last.pax > 0);
});

test('buying needs cash; selling returns depreciated value', () => {
  const s = setup({ difficulty: 'hard' });
  assert.equal(buyAircraft(s, 'b77w').ok, false);
  const before = s.cash;
  const { aircraft } = buyAircraft(s, 'e175');
  assert.equal(s.cash, before - aircraftById.e175.price);
  skipEvents(s, 10);
  const cashBeforeSale = s.cash;
  sellAircraft(s, aircraft.id);
  const proceeds = s.cash - cashBeforeSale;
  assert.ok(proceeds > 0.8 * aircraftById.e175.price && proceeds < aircraftById.e175.price);
});

test('closing a route frees its aircraft', () => {
  const s = setup();
  const { route } = openRoute(s, 'ORD', 'ATL');
  const { aircraft } = leaseAircraft(s, 'e175');
  assignAircraft(s, aircraft.id, route.id);
  closeRoute(s, route.id);
  assert.equal(s.fleet[0].routeId, null);
});

test('fares are clamped around the reference fare', () => {
  const s = setup();
  const { route } = openRoute(s, 'ORD', 'ATL');
  const ref = referenceFare(route.distance);
  assert.equal(setFare(s, route.id, 1).fare, Math.round(ref * 0.3));
  assert.equal(setFare(s, route.id, 1e9).fare, Math.round(ref * 3));
});

test('a sensible regional operation earns a positive contribution', () => {
  const s = setup();
  const { route } = openRoute(s, 'ORD', 'BOS');
  for (let i = 0; i < 1; i++) {
    const { aircraft } = leaseAircraft(s, 'e175');
    assignAircraft(s, aircraft.id, route.id);
  }
  skipEvents(s, 6);
  assert.ok(s.routes[0].last.contribution > 0, `contribution ${s.routes[0].last.contribution}`);
});

test('higher fares lower our share of the market', () => {
  const s = setup();
  const { route } = openRoute(s, 'ORD', 'DEN');
  const { aircraft } = leaseAircraft(s, 'a320');
  assignAircraft(s, aircraft.id, route.id);
  skipEvents(s, 3);
  const cheapShare = s.routes[0].last.share;
  setFare(s, route.id, route.fare * 2);
  skipEvents(s, 1);
  assert.ok(s.routes[0].last.share < cheapShare / 2);
});

test('loans add cash, amortise weekly and respect the credit limit', () => {
  const s = setup();
  assert.equal(takeLoan(s, creditLimit(s) + 1).ok, false);
  const before = s.cash;
  const { loan } = takeLoan(s, 10e6);
  assert.equal(s.cash, before + 10e6);
  skipEvents(s, 4);
  assert.ok(loan.principal < 10e6);
  assert.equal(loan.weeksLeft, 256);
});

test('pay cuts hurt morale', () => {
  const s = setup();
  const before = s.morale;
  updateSettings(s, { wages: 0.8 });
  assert.ok(s.morale < before);
});

test('heavy checks restore condition and ground the aircraft', () => {
  const s = setup();
  const { aircraft } = leaseAircraft(s, 'e175');
  skipEvents(s, 2);
  aircraft.condition = 50;
  assert.ok(heavyCheck(s, aircraft.id).ok);
  assert.equal(aircraft.condition, 100);
  assert.equal(heavyCheck(s, aircraft.id).ok, false, 'already in the hangar');
});

test('running out of cash for six weeks is bankruptcy', () => {
  const s = setup();
  s.cash = -50e6;
  skipEvents(s, 5);
  assert.equal(s.status, 'playing');
  s.pendingEvent = null;
  advanceWeek(s);
  assert.equal(s.status, 'bankrupt');
  assert.equal(advanceWeek(s).ok, false);
});

test('pending events block the week until resolved', () => {
  const s = setup();
  triggerEvent(s, 'boom');
  assert.equal(advanceWeek(s).ok, false);
  assert.ok(resolveEvent(s, 0).ok);
  assert.equal(s.shocks.length, 1);
  assert.ok(advanceWeek(s).ok);
});

test('every event builds and resolves every choice', () => {
  for (const def of EVENTS) {
    for (let choice = 0; choice < 3; choice++) {
      const s = setup();
      s.cash = 500e6;
      const { route } = openRoute(s, 'ORD', 'LAS');
      const { aircraft } = leaseAircraft(s, 'a320');
      assignAircraft(s, aircraft.id, route.id);
      leaseAircraft(s, 'e175');
      skipEvents(s, 60);
      for (const h of s.history) h.profit = Math.abs(h.profit) + 1;
      s.settings.service = 4;
      s.reputation = 70;
      s.strikeWeeks = 0;
      s.shocks = [];
      s.pendingEvent = null;
      aircraft.condition = 50;
      s.routes[0].competitors = 2;
      assert.ok(!def.canTrigger || def.canTrigger(s), `${def.id} preconditions not met by the fixture`);
      const ev = triggerEvent(s, def.id);
      if (choice >= ev.choices.length) continue;
      assert.doesNotThrow(() => JSON.stringify(ev));
      const res = resolveEvent(s, choice);
      assert.ok(res.ok, `${def.id}#${choice}: ${res.error}`);
      assert.equal(s.pendingEvent, null);
    }
  }
});

test('games are deterministic for a given seed and survive a JSON round trip', () => {
  const play = (state) => {
    const { route } = openRoute(state, 'ORD', 'MIA');
    const { aircraft } = leaseAircraft(state, 'a220');
    assignAircraft(state, aircraft.id, route.id);
    skipEvents(state, 20);
    return state;
  };
  const a = play(setup());
  const b = play(setup());
  assert.deepEqual(a, b);

  const restored = JSON.parse(JSON.stringify(a));
  skipEvents(restored, 5);
  skipEvents(a, 5);
  assert.deepEqual(restored, a);
});
