// Random events that pause the game and ask the CEO for a decision.
//
// Each event: { id, weight, canTrigger(state), build(state) -> {title, text,
// choices:[{label, hint, tone, disabled}], data}, resolve(state, i, data) -> message }.
// `data` must stay JSON-serialisable because pending events live in the save.

import { AIRPORTS, airportByCode } from '../data/airports.js';
import { AIRCRAFT, aircraftById } from '../data/aircraft.js';
import { ROLES } from '../data/business.js';
import { rivalById, RIVALS, ALLIANCES } from '../data/rivals.js';
import { clamp, rand, pick, money, log } from './core.js';
import { makeAircraft, typeOf, isDelivered } from './fleet.js';
import { stations } from './network.js';
import { marketCap } from './finance.js';

const bump = (state, key, d) => (state[key] = clamp(state[key] + d, 0, 100));
const regionAirports = (region) => AIRPORTS.filter((a) => a.region === region).map((a) => a.code);

export const EVENTS = [
  {
    id: 'union_pay',
    weight: 3,
    canTrigger: (s) => s.fleet.length >= 3,
    build(state) {
      const role = pick(state, ['pilots', 'cabin', 'engineers'].filter((r) => !state.strikes[r]));
      return {
        title: `${ROLES[role].union}: pay claim`,
        text: `The ${ROLES[role].union.toLowerCase()} demands a 6% raise for ${ROLES[role].name.toLowerCase()} and is balloting members on industrial action.`,
        data: { role },
        choices: [
          { label: 'Agree to 6%', hint: 'Pay +6%, morale +12', tone: 'good' },
          { label: 'Offer 3%', hint: 'Pay +3%; 50% chance they accept' },
          { label: 'Refuse', hint: 'Morale -15; 45% chance of a 2-week strike', tone: 'bad' },
        ],
      };
    },
    resolve(state, i, { role }) {
      const s = state.staff[role];
      if (i === 0) {
        s.pay = Math.round((s.pay + 0.06) * 100) / 100;
        s.morale = clamp(s.morale + 12, 0, 100);
        return 'Deal agreed.';
      }
      if (i === 1) {
        s.pay = Math.round((s.pay + 0.03) * 100) / 100;
        if (rand(state) < 0.5) return 'The union accepts the compromise.';
        s.morale = clamp(s.morale - 8, 0, 100);
        state.strikes[role] = 1;
        return 'Members reject the offer and walk out for a week.';
      }
      s.morale = clamp(s.morale - 15, 0, 100);
      if (rand(state) < 0.45) {
        state.strikes[role] = 2;
        return `${ROLES[role].name} strike for 2 weeks!`;
      }
      return 'The union backs down, for now.';
    },
  },
  {
    id: 'fuel_spike',
    weight: 2,
    build: () => ({
      title: 'Oil price shock',
      text: 'Conflict in a major producing region sends jet fuel up about 35% overnight.',
      choices: [
        { label: 'Absorb the cost' },
        { label: 'Fuel surcharge on all fares', hint: 'Fares +6%, reputation -3', tone: 'bad' },
      ],
    }),
    resolve(state, i) {
      state.macro.fuel = clamp(state.macro.fuel * 1.35, 0.4, 2.2);
      if (i === 1) {
        for (const r of state.routes) for (const c of Object.keys(r.fares)) r.fares[c] = Math.round(r.fares[c] * 1.06);
        bump(state, 'reputation', -3);
      }
      return `Jet fuel now $${state.macro.fuel.toFixed(2)}/kg. Hedges soften the blow.`;
    },
  },
  {
    id: 'fuel_drop',
    weight: 1.5,
    build: () => ({ title: 'Oil glut', text: 'Producers flood the market; jet fuel falls about 25%.', choices: [{ label: 'Excellent', tone: 'good' }] }),
    resolve(state) {
      state.macro.fuel = clamp(state.macro.fuel * 0.75, 0.4, 2.2);
      return `Jet fuel falls to $${state.macro.fuel.toFixed(2)}/kg (hedged volumes stay at their locked price).`;
    },
  },
  {
    id: 'recession',
    weight: 1,
    canTrigger: (s) => s.week > 40 && !s.macro.shocks.some((x) => x.name === 'Recession'),
    build: () => ({ title: 'Recession', text: 'GDP has contracted for two quarters. Corporate travel budgets are frozen.', choices: [{ label: 'Brace for impact', tone: 'bad' }] }),
    resolve(state) {
      state.macro.shocks.push({ name: 'Recession', mult: 0.86, weeks: 30 });
      state.macro.economy = clamp(state.macro.economy - 0.05, 0.8, 1.2);
      return 'Demand ~14% weaker for 30 weeks.';
    },
  },
  {
    id: 'boom',
    weight: 1,
    canTrigger: (s) => !s.macro.shocks.some((x) => x.name === 'Travel boom'),
    build: () => ({ title: 'Travel boom', text: 'Record consumer confidence — everyone wants to fly.', choices: [{ label: 'Fill those seats', tone: 'good' }] }),
    resolve(state) {
      state.macro.shocks.push({ name: 'Travel boom', mult: 1.1, weeks: 16 });
      return 'Demand ~10% stronger for 16 weeks.';
    },
  },
  {
    id: 'pandemic',
    weight: 0.25,
    canTrigger: (s) => s.week > 104 && !s.macro.shocks.some((x) => x.name === 'Pandemic'),
    build: () => ({ title: 'Pandemic', text: 'A novel virus spreads globally. Governments impose travel restrictions.', choices: [{ label: 'Survive', tone: 'bad' }] }),
    resolve(state) {
      state.macro.shocks.push({ name: 'Pandemic', mult: 0.45, weeks: 16 });
      return 'Demand collapses by more than half for 16 weeks. Consider parking aircraft and drawing credit lines.';
    },
  },
  {
    id: 'volcano',
    weight: 0.6,
    canTrigger: (s) => s.routes.some((r) => [r.a, r.b].some((c) => airportByCode[c].region === 'EU')),
    build: () => ({ title: 'Volcanic ash cloud', text: 'An Icelandic eruption closes much of European airspace.', choices: [{ label: 'Ground and wait', tone: 'bad' }] }),
    resolve(state) {
      state.disruptions.push({ name: 'Volcanic ash', codes: regionAirports('EU'), factor: 0.2, weeks: 1 });
      return 'European flights cut by 80% this week.';
    },
  },
  {
    id: 'hurricane',
    weight: 0.8,
    canTrigger: (s) => stations(s).some((c) => ['MIA', 'MCO', 'TPA', 'SJU', 'CUN', 'IAH', 'EYW'].includes(c)),
    build(state) {
      const code = pick(state, stations(state).filter((c) => ['MIA', 'MCO', 'TPA', 'SJU', 'CUN', 'IAH', 'EYW'].includes(c)));
      return { title: `Hurricane approaching ${airportByCode[code].city}`, text: `${code} will close for the storm.`, data: { code }, choices: [{ label: 'Evacuate aircraft', tone: 'bad' }] };
    },
    resolve(state, _i, { code }) {
      state.disruptions.push({ name: 'Hurricane', codes: [code], factor: 0, weeks: 1 });
      return `${code} closed for a week.`;
    },
  },
  {
    id: 'atc_strike',
    weight: 0.8,
    canTrigger: (s) => s.routes.some((r) => [r.a, r.b].some((c) => airportByCode[c].country === 'FR')),
    build: () => ({ title: 'French ATC strike', text: 'Air traffic controllers in France walk out.', choices: [{ label: 'Reroute what we can', tone: 'bad' }] }),
    resolve(state) {
      state.disruptions.push({ name: 'ATC strike', codes: AIRPORTS.filter((a) => a.country === 'FR').map((a) => a.code), factor: 0.4, weeks: 1 });
      return 'French flights cut by 60% this week.';
    },
  },
  {
    id: 'airworthiness',
    weight: 1,
    canTrigger: (s) => s.fleet.some((a) => isDelivered(s, a)),
    build(state) {
      const ac = pick(state, state.fleet.filter((a) => isDelivered(state, a)));
      const type = typeOf(ac);
      return {
        title: `Airworthiness directive: ${type.name}`,
        text: `Regulators order repetitive engine inspections across the ${type.name} fleet worldwide.`,
        data: { typeId: type.id },
        choices: [
          { label: 'Comply with standard inspections', hint: 'This type loses 35% of flying hours for 6 weeks' },
          { label: 'Pay for expedited inspections', hint: `${money(state.fleet.filter((a) => a.type === type.id).length * 400e3)}; only 2 weeks affected` },
        ],
      };
    },
    resolve(state, i, { typeId }) {
      const n = state.fleet.filter((a) => a.type === typeId).length;
      if (i === 1) {
        state.cash -= n * 400e3;
        state.typeRestrictions[typeId] = { factor: 0.65, weeks: 2 };
        return 'Expedited inspections under way.';
      }
      state.typeRestrictions[typeId] = { factor: 0.65, weeks: 6 };
      return `${aircraftById[typeId].name} capacity reduced for 6 weeks.`;
    },
  },
  {
    id: 'manufacturer_delay',
    weight: 1.5,
    canTrigger: (s) => s.orders.length > 0,
    build(state) {
      const o = pick(state, state.orders);
      const weeks = 13 + Math.floor(rand(state) * 26);
      return {
        title: 'Delivery delay',
        text: `${aircraftById[o.type].maker} warns that supply-chain problems will push back ${aircraftById[o.type].name} deliveries by ${weeks} weeks.`,
        data: { type: o.type, weeks },
        choices: [{ label: 'Accept the delay' }, { label: 'Demand compensation', hint: '50%: 5% price credit; 50%: relationship sours, delay grows' }],
      };
    },
    resolve(state, i, { type, weeks }) {
      let extra = 0;
      let msg = `${aircraftById[type].name} deliveries slip ${weeks} weeks.`;
      if (i === 1) {
        if (rand(state) < 0.5) {
          for (const o of state.orders.filter((x) => x.type === type)) o.price *= 0.95;
          msg += ' You secure a 5% price credit.';
        } else {
          extra = 8;
          msg += ' The manufacturer pushes you further down the queue.';
        }
      }
      for (const o of state.orders.filter((x) => x.type === type)) o.deliveryWeek += weeks + extra;
      return msg;
    },
  },
  {
    id: 'pilot_poaching',
    weight: 1.5,
    canTrigger: (s) => s.staff.pilots.count >= 30,
    build(state) {
      const r = pick(state, RIVALS.filter((x) => x.type !== 'cargo' && state.rivals[x.id].status === 'active'));
      return {
        title: 'Pilots being poached',
        text: `${r.name} is offering your captains signing bonuses to defect.`,
        choices: [
          { label: 'Match with a retention bonus', hint: `${money(state.staff.pilots.count * 15e3)}, pilot morale +8`, tone: 'good' },
          { label: 'Raise pilot pay 5%', hint: 'Permanent cost, morale +10' },
          { label: 'Let them go', hint: 'Lose ~8% of pilots', tone: 'bad' },
        ],
      };
    },
    resolve(state, i) {
      const p = state.staff.pilots;
      if (i === 0) {
        state.cash -= p.count * 15e3;
        p.morale = clamp(p.morale + 8, 0, 100);
        return 'Retention bonuses paid.';
      }
      if (i === 1) {
        p.pay = Math.round((p.pay + 0.05) * 100) / 100;
        p.morale = clamp(p.morale + 10, 0, 100);
        return 'Pilot pay increased.';
      }
      const lost = Math.round(p.count * 0.08);
      p.count -= lost;
      return `${lost} pilots resign.`;
    },
  },
  {
    id: 'celebrity',
    weight: 1.2,
    build: (state) => ({
      title: 'Celebrity endorsement',
      text: 'A global pop star offers to front your next brand campaign.',
      choices: [{ label: 'Sign ($2M)', hint: 'Reputation +6', tone: 'good', disabled: state.cash < 2e6 }, { label: 'Pass' }],
    }),
    resolve(state, i) {
      if (i !== 0) return 'You pass.';
      state.cash -= 2e6;
      bump(state, 'reputation', 6);
      return 'The campaign goes viral.';
    },
  },
  {
    id: 'used_bargain',
    weight: 1.2,
    build(state) {
      const type = pick(state, AIRCRAFT.filter((a) => a.price < 130e6 && a.cat !== 'turboprop'));
      const price = Math.round(type.price * 0.42);
      return {
        title: 'Distressed aircraft sale',
        text: `A collapsed carrier's 9-year-old ${type.name} is available for a quick sale at ${money(price)}.`,
        data: { typeId: type.id, price },
        choices: [{ label: `Buy (${money(price)})`, hint: 'Arrives in 3 weeks; reliability 72', disabled: state.cash < price }, { label: 'Pass' }],
      };
    },
    resolve(state, i, { typeId, price }) {
      if (i !== 0 || state.cash < price) return 'You let it go.';
      state.cash -= price;
      const ac = makeAircraft(state, typeId, { owned: true, ageWeeks: 9 * 52, deliveryWeek: state.week + 3, reliability: 72, price });
      return `Acquired ${ac.reg}.`;
    },
  },
  {
    id: 'incident',
    weight: 3,
    canTrigger: (s) => s.fleet.some((a) => a.reliability < 70 && a.schedule.length),
    build(state) {
      const ac = pick(state, state.fleet.filter((a) => a.reliability < 70 && a.schedule.length));
      return {
        title: 'Technical incident',
        text: `${typeOf(ac).name} ${ac.reg} returned to the gate after an engine warning. Journalists ask about your maintenance standards.`,
        data: { acId: ac.id },
        choices: [
          { label: 'Fleet-wide inspection', hint: `${money(state.fleet.length * 200e3)}, reliability +12 across the fleet, reputation -1` },
          { label: 'Reassuring press statement', hint: 'Reputation -7', tone: 'bad' },
        ],
      };
    },
    resolve(state, i) {
      if (i === 0) {
        state.cash -= state.fleet.length * 200e3;
        for (const a of state.fleet) a.reliability = clamp(a.reliability + 12, 0, 100);
        bump(state, 'reputation', -1);
        return 'Inspections reassure the public.';
      }
      bump(state, 'reputation', -7);
      return 'The story runs for days.';
    },
  },
  {
    id: 'data_breach',
    weight: 0.8,
    canTrigger: (s) => s.week > 20,
    build: () => ({
      title: 'Data breach',
      text: 'Hackers have stolen frequent-flyer records.',
      choices: [{ label: 'Disclose and compensate ($4M)', hint: 'Reputation -2' }, { label: 'Downplay it', hint: 'Reputation -10', tone: 'bad' }],
    }),
    resolve(state, i) {
      if (i === 0) {
        state.cash -= 4e6;
        bump(state, 'reputation', -2);
        return 'Customers appreciate the honesty.';
      }
      bump(state, 'reputation', -10);
      return 'Regulators open an investigation.';
    },
  },
  {
    id: 'award',
    weight: 1,
    canTrigger: (s) => s.reputation > 65 && Object.values(s.service).reduce((a, b) => a + b, 0) >= 18,
    build: () => ({ title: 'Industry award', text: 'Named "Best Airline Service" at the World Airline Awards!', choices: [{ label: 'Celebrate', tone: 'good' }] }),
    resolve(state) {
      bump(state, 'reputation', 5);
      for (const s of Object.values(state.staff)) s.morale = clamp(s.morale + 4, 0, 100);
      return 'Reputation and morale rise.';
    },
  },
  {
    id: 'hub_levy',
    weight: 1,
    canTrigger: (s) => s.week > 13,
    build(state) {
      const hub = pick(state, state.hubs);
      return {
        title: 'Airport levy',
        text: `${airportByCode[hub.code].city} airport imposes a $2M terminal development levy on based carriers.`,
        choices: [{ label: 'Pay $2M' }, { label: 'Challenge in court', hint: '50%: nothing; 50%: $3.5M with costs' }],
      };
    },
    resolve(state, i) {
      if (i === 0) {
        state.cash -= 2e6;
        return 'Paid.';
      }
      if (rand(state) < 0.5) return 'The court sides with you.';
      state.cash -= 3.5e6;
      return 'You lose and pay $3.5M.';
    },
  },
  {
    id: 'staff_bonus',
    weight: 1.2,
    canTrigger: (s) => s.history.length >= 8 && s.history.slice(-8).every((h) => h.profit > 0),
    build: (state) => {
      const cost = Math.round(Object.values(state.staff).reduce((a, s) => a + s.count, 0) * 1500);
      return {
        title: 'Profit-sharing request',
        text: 'Staff representatives ask for a share of the recent profits.',
        data: { cost },
        choices: [{ label: `Pay bonus (${money(cost)})`, hint: 'All morale +10', tone: 'good' }, { label: 'Decline', hint: 'All morale -5' }],
      };
    },
    resolve(state, i, { cost }) {
      const d = i === 0 ? 10 : -5;
      if (i === 0) state.cash -= cost;
      for (const s of Object.values(state.staff)) s.morale = clamp(s.morale + d, 0, 100);
      return i === 0 ? 'Staff are delighted.' : 'Grumbling in the crew rooms.';
    },
  },
  {
    id: 'tourism_grant',
    weight: 0.8,
    canTrigger: (s) => s.routes.some((r) => [r.a, r.b].some((c) => airportByCode[c].tourism >= 1.7)),
    build(state) {
      const r = pick(state, state.routes.filter((x) => [x.a, x.b].some((c) => airportByCode[c].tourism >= 1.7)));
      const code = airportByCode[r.a].tourism >= 1.7 ? r.a : r.b;
      return { title: 'Tourism board partnership', text: `${airportByCode[code].city}'s tourism board offers $3M in co-marketing for your service.`, choices: [{ label: 'Accept', tone: 'good' }] };
    },
    resolve(state) {
      state.cash += 3e6;
      bump(state, 'reputation', 1);
      return 'Received $3M.';
    },
  },
  {
    id: 'alliance_invite',
    weight: 1,
    canTrigger: (s) => !s.partners.alliance && s.reputation >= 60 && s.fleet.length >= 25,
    build(state) {
      const name = pick(state, Object.keys(ALLIANCES));
      return {
        title: `${name} invitation`,
        text: `${name} invites ${state.airline.name} to join at a discounted entry fee of ${money(ALLIANCES[name].fee * 0.5)}.`,
        data: { name },
        choices: [{ label: 'Join', tone: 'good', disabled: state.cash < ALLIANCES[name].fee * 0.5 }, { label: 'Stay independent' }],
      };
    },
    resolve(state, i, { name }) {
      if (i !== 0) return 'You remain independent.';
      state.cash -= ALLIANCES[name].fee * 0.5;
      state.partners.alliance = name;
      for (const r of RIVALS.filter((x) => x.alliance === name)) state.rivals[r.id].hostility = 0;
      return `Welcome to ${name}.`;
    },
  },
  {
    id: 'rival_collapse',
    weight: 0,
    build(state, data) {
      const r = rivalById[data.rivalId];
      return {
        title: `${r.name} collapses`,
        text: `${r.name} has ceased operations. Administrators are selling assets and passengers are stranded.`,
        data,
        choices: [
          { label: 'Rescue stranded passengers', hint: 'Cost $1.5M, reputation +5', tone: 'good' },
          { label: 'Bid for two of their aircraft', hint: '$30M for two 7-year-old narrowbodies', disabled: state.cash < 30e6 },
          { label: 'Do nothing' },
        ],
      };
    },
    resolve(state, i) {
      if (i === 0) {
        state.cash -= 1.5e6;
        bump(state, 'reputation', 5);
        return 'Your rescue flights earn goodwill.';
      }
      if (i === 1) {
        state.cash -= 30e6;
        for (let k = 0; k < 2; k++) makeAircraft(state, 'a320n', { owned: true, ageWeeks: 7 * 52, deliveryWeek: state.week + 4, reliability: 78, price: 15e6 });
        return 'Two A320neos acquired — arriving in 4 weeks.';
      }
      return 'You watch from the sidelines.';
    },
  },
  {
    id: 'investor_interest',
    weight: 0.7,
    canTrigger: (s) => s.week > 26 && s.board.confidence > 55,
    build(state) {
      const amount = Math.round((marketCap(state) * 0.15) / 1e6) * 1e6;
      return {
        title: 'Sovereign wealth fund',
        text: `A sovereign wealth fund wants to buy a 15% stake via new shares for ${money(amount)}.`,
        data: { amount },
        choices: [{ label: 'Accept the investment', hint: 'Cash in, dilution; board confidence -3' }, { label: 'Decline' }],
      };
    },
    resolve(state, i, { amount }) {
      if (i !== 0) return 'You decline.';
      state.cash += amount;
      state.finance.shares *= 1.15;
      state.board.confidence = clamp(state.board.confidence - 3, 0, 100);
      return `Raised ${money(amount)}.`;
    },
  },
];

export const eventById = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

export function triggerEvent(state, id, data) {
  let def;
  if (id) {
    def = eventById[id];
    if (!def || (def.canTrigger && !def.canTrigger(state))) return null;
  }
  else {
    const eligible = EVENTS.filter((e) => e.weight > 0 && (!e.canTrigger || e.canTrigger(state)));
    if (!eligible.length) return null;
    let roll = rand(state) * eligible.reduce((s, e) => s + e.weight, 0);
    def = eligible.find((e) => (roll -= e.weight) <= 0) ?? eligible[eligible.length - 1];
  }
  const built = def.build(state, data);
  state.pendingEvent = { id: def.id, week: state.week, data: built.data ?? data ?? null, title: built.title, text: built.text, choices: built.choices };
  return state.pendingEvent;
}

export function resolveEvent(state, choiceIndex) {
  const p = state.pendingEvent;
  if (!p) return { ok: false, error: 'No event to resolve' };
  const choice = p.choices[choiceIndex];
  if (!choice) return { ok: false, error: 'Invalid choice' };
  if (choice.disabled) return { ok: false, error: 'That option is not available' };
  const msg = eventById[p.id].resolve(state, choiceIndex, p.data ?? {}) ?? '';
  state.pendingEvent = null;
  log(state, `${p.title}: ${choice.label}. ${msg}`, choice.tone ?? 'info', 'events');
  return { ok: true, message: msg };
}
