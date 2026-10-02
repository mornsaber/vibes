// Random events that pause the game and ask the CEO for a decision.
//
// Each event: { id, weight, canTrigger(state), build(state) -> {title, text,
// choices:[{label, hint, tone, disabled}], data}, resolve(state, i, data) -> message }.
// `data` must stay JSON-serialisable because pending events live in the save.

import { AIRPORTS, airportByCode, COUNTRIES } from '../data/airports.js';
import { AIRCRAFT, aircraftById, inService } from '../data/aircraft.js';
import { ROLES } from '../data/business.js';
import { startAction, setDelegated, canDelegate, recognizeUnion, removeFrontline } from './staff.js';
import { closeAirspace } from './safety.js';
import { rivalDef } from './market.js';
import { spawnStartup } from './rivals.js';
import { AIRSPACE } from '../data/history.js';
import { rivalById, RIVALS, ALLIANCES } from '../data/rivals.js';
import { clamp, rand, pick, money, log, elapsed, yearOf } from './core.js';
import { makeAircraft, typeOf, isDelivered, addWork as addWorkFn } from './fleet.js';
import { stations } from './network.js';
import { marketCap } from './finance.js';

const bump = (state, key, d) => (state[key] = clamp(state[key] + d, 0, 100));
const regionAirports = (region) => AIRPORTS.filter((a) => a.region === region).map((a) => a.code);

export const EVENTS = [
  {
    id: 'union_pay',
    weight: 0, // queued when a collective agreement expires
    build(state, data) {
      const { role, demand } = data;
      const r = ROLES[role];
      return {
        title: `${r.union}: new agreement`,
        text: `The ${r.union.toLowerCase()} agreement for ${r.name.toLowerCase()} has expired. The union (strength ${Math.round(state.staff[role].union.strength * 100)}%) demands a ${Math.round(demand * 100)}% raise. Morale is ${Math.round(state.staff[role].morale)}.`,
        data,
        choices: [
          { label: `Agree ${Math.round(demand * 100)}%`, hint: '3-year deal, morale +10', tone: 'good' },
          { label: `Offer ${Math.round((demand * 100) / 2)}%`, hint: 'Union may accept; otherwise work-to-rule' },
          { label: 'Offer 1% and productivity changes', hint: 'Cheap; high risk of a strike', tone: 'bad' },
          { label: `Let the department handle it`, hint: 'Your manager settles by HR policy', disabled: !canDelegate(state, role) },
        ],
      };
    },
    resolve(state, i, { role, demand }) {
      const w = state.staff[role];
      w.union.agreementEnds = state.week + 156;
      if (i === 0) {
        w.pay = Math.round((w.pay + demand) * 100) / 100;
        w.morale = clamp(w.morale + 10, 0, 100);
        return 'Deal signed.';
      }
      if (i === 1) {
        w.pay = Math.round((w.pay + demand / 2) * 100) / 100;
        if (rand(state) < 0.55 - w.union.strength * 0.3) return 'The union accepts the compromise.';
        startAction(state, role, 'work-to-rule', 2 + Math.floor(rand(state) * 3), 'while members reject the offer');
        return 'Members reject the offer.';
      }
      if (i === 3) {
        setDelegated(state, role, true);
        w.union.agreementEnds = state.week;
        return 'Negotiations handed to the department head.';
      }
      w.pay = Math.round((w.pay + 0.01) * 100) / 100;
      w.morale = clamp(w.morale - 12, 0, 100);
      if (rand(state) < 0.35 + w.union.strength * 0.5) {
        startAction(state, role, 'strike', 1 + Math.floor(rand(state) * 3));
        return 'The union walks out.';
      }
      return 'The union grudgingly signs.';
    },
  },
  {
    id: 'union_drive',
    weight: 0, // queued when unhappy non-union staff organise
    build(state, data) {
      const r = ROLES[data.role];
      return {
        title: `${r.name} are organising`,
        text: `Unhappy ${r.name.toLowerCase()} (morale ${Math.round(state.staff[data.role].morale)}) have launched a drive to form a ${r.union.toLowerCase()} and are asking for recognition.`,
        data,
        choices: [
          { label: 'Recognise the union voluntarily', hint: 'Morale +8; a moderate union', tone: 'good' },
          { label: 'Stay neutral and let staff vote', hint: 'Union likely wins if morale is low' },
          { label: 'Run an anti-union campaign', hint: `${money(state.staff[data.role].count * 1500)}; 50% it fails and backfires`, tone: 'bad' },
        ],
      };
    },
    resolve(state, i, { role }) {
      const w = state.staff[role];
      if (i === 0) {
        recognizeUnion(state, role, 0.45);
        w.morale = clamp(w.morale + 8, 0, 100);
        return 'Union recognised. Talks on a first agreement begin.';
      }
      if (i === 1) {
        if (rand(state) < 0.35 + (50 - w.morale) / 60) {
          recognizeUnion(state, role, 0.6);
          return 'Staff vote to unionise.';
        }
        w.morale = clamp(w.morale - 2, 0, 100);
        return 'The vote narrowly fails.';
      }
      state.cash -= w.count * 1500;
      if (rand(state) < 0.5) {
        w.morale = clamp(w.morale - 5, 0, 100);
        return 'The drive fizzles out.';
      }
      recognizeUnion(state, role, 0.85);
      w.morale = clamp(w.morale - 15, 0, 100);
      return 'The campaign backfires: a militant union wins recognition.';
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
    canTrigger: (s) => elapsed(s) > 40 && !s.macro.shocks.some((x) => x.name === 'Recession'),
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
    canTrigger: (s) => elapsed(s) > 104 && !s.macro.shocks.some((x) => x.name === 'Pandemic'),
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
      const r = pick(state, [...RIVALS, ...state.newRivals].filter((x) => x.type !== 'cargo' && state.rivals[x.id]?.status === 'active'));
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
      const lost = removeFrontline(p, Math.round(p.count * 0.08));
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
      const year = yearOf(state.week);
      const type = pick(state, AIRCRAFT.filter((a) => a.price < 130e6 && a.cat !== 'turboprop' && a.cat !== 'sst' && inService(a, year) && year - a.intro >= 9));
      if (!type) return { title: 'Quiet week', text: 'Nothing for sale.', choices: [{ label: 'OK' }] };
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
    canTrigger: (s) => elapsed(s) > 20 && yearOf(s.week) >= 1998,
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
    canTrigger: (s) => elapsed(s) > 13,
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
    canTrigger: (s) => !s.partners.alliance && s.reputation >= 60 && s.fleet.length >= 25 && yearOf(s.week) >= 2000,
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
      for (const r of RIVALS.filter((x) => x.alliance === name && state.rivals[x.id]?.status === 'active')) state.rivals[r.id].hostility = 0;
      return `Welcome to ${name}.`;
    },
  },
  {
    id: 'rival_collapse',
    weight: 0,
    build(state, data) {
      const r = rivalDef(state, data.rivalId);
      return {
        title: `${r.name} collapses`,
        text: `${r.name} has ceased operations. Administrators are selling assets and passengers are stranded.`,
        data,
        choices: [
          { label: 'Rescue stranded passengers', hint: 'Cost $1.5M, reputation +5', tone: 'good' },
          { label: 'Bid for two of their aircraft', hint: '$30M for two 7-year-old narrowbodies', disabled: state.cash < 30e6 || !secondHandNarrowbody(state) },
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
        const type = secondHandNarrowbody(state);
        for (let k = 0; k < 2; k++) makeAircraft(state, type.id, { owned: true, ageWeeks: 7 * 52, deliveryWeek: state.week + 4, reliability: 78, price: 15e6 });
        return `Two ${type.name}s acquired — arriving in 4 weeks.`;
      }
      return 'You watch from the sidelines.';
    },
  },
  {
    id: 'investor_interest',
    weight: 0.7,
    canTrigger: (s) => elapsed(s) > 26 && s.board.confidence > 55,
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

// ---------------------------------------------------------------------------
// Safety events (queued by the safety model)

EVENTS.push(
  {
    id: 'crash',
    weight: 0,
    build: (state, d) => ({
      title: d.fatalities ? 'Fatal accident' : 'Hull loss',
      text: `${d.reg} has been destroyed on ${d.where}. ${d.fatalities ? `${d.fatalities} of the ${d.onboard} people aboard were killed.` : `All ${d.onboard} aboard survived.`} Early findings point to ${d.why}. The world's press is camped outside headquarters.`,
      data: d,
      choices: [
        { label: 'Public apology, family assistance fund and independent safety review', hint: `${money(5e6 + d.fatalities * 0.2e6)}; reputation +6, morale +3`, tone: 'good' },
        { label: 'Cooperate quietly with investigators', hint: 'No further cost' },
        { label: 'Contest liability in court', hint: 'Save money; reputation -6', tone: 'bad' },
      ],
    }),
    resolve(state, i, d) {
      if (i === 0) {
        state.cash -= 5e6 + d.fatalities * 0.2e6;
        state.reputation = clamp(state.reputation + 6, 0, 100);
        for (const w of Object.values(state.staff)) w.morale = clamp(w.morale + 3, 0, 100);
        return 'Your response is widely praised, though the brand will take time to recover.';
      }
      if (i === 2) {
        state.cash += d.fatalities * 0.1e6;
        state.reputation = clamp(state.reputation - 6, 0, 100);
        return 'Lawyers save some money; the public is appalled.';
      }
      return 'The investigation will take months.';
    },
  },
  {
    id: 'serious_incident',
    weight: 0,
    build: (state, d) => ({
      title: 'Serious incident',
      text: `${d.reg} suffered a ${d.what}. Passengers were evacuated with injuries. Investigators cite ${d.why}.`,
      data: d,
      choices: [
        { label: `Ground the ${G_name(d.type)} fleet for inspection`, hint: 'All of this type out for a week; reliability +15 for them; reputation +2' },
        { label: 'Standard response', hint: 'Reputation -3' },
      ],
    }),
    resolve(state, i, d) {
      if (i === 0) {
        state.typeRestrictions[d.type] = { factor: 0, weeks: 1 };
        for (const a of state.fleet.filter((x) => x.type === d.type)) a.reliability = clamp(a.reliability + 15, 0, 100);
        state.reputation = clamp(state.reputation + 2, 0, 100);
        return 'The fleet is grounded for a week of inspections.';
      }
      state.reputation = clamp(state.reputation - 3, 0, 100);
      return 'The story fades, slowly.';
    },
  },
  {
    id: 'hijacking',
    weight: 0,
    build: (state, d) => ({
      title: 'Hijacking in progress',
      text: `Armed hijackers have seized ${d.reg} and are demanding to be flown to another country. Passengers and crew are being held.`,
      data: d,
      choices: [
        { label: 'Negotiate and comply with demands', hint: 'Most likely ends peacefully; aircraft out ~2 weeks; costs $1–3M' },
        { label: 'Let security forces storm the aircraft', hint: 'Risky: heroes or tragedy' },
      ],
    }),
    resolve(state, i, d) {
      const ac = state.fleet.find((a) => a.id === d.acId);
      if (ac) addWorkSafe(state, ac, 2, 'Hijacking aftermath');
      if (i === 0) {
        state.cash -= (1 + rand(state) * 2) * 1e6;
        if (rand(state) < 0.88) {
          state.reputation = clamp(state.reputation - 2, 0, 100);
          return 'After a tense standoff, everyone is released unharmed.';
        }
        state.reputation = clamp(state.reputation - 10, 0, 100);
        return 'The hijackers kill a hostage before surrendering. A grim day.';
      }
      if (rand(state) < 0.65) {
        state.reputation = clamp(state.reputation + 3, 0, 100);
        return 'A textbook rescue: all hostages freed. Your crew are hailed as heroes.';
      }
      state.reputation = clamp(state.reputation - 14, 0, 100);
      return 'The assault goes wrong and passengers are killed in the crossfire.';
    },
  },
);

// ---------------------------------------------------------------------------
// Historical timeline (randomised timing and severity)

const shock = (state, name, mult, weeks, regions) => state.macro.shocks.push({ name, mult, weeks, regions });
const ack = (label = 'Understood', tone = 'bad') => [{ label, tone }];
const sev = (d) => d?.severity ?? 1;

EVENTS.push(
  {
    id: 'oil_embargo', weight: 0,
    build: (s, d) => ({ title: 'Oil embargo', text: 'Producing nations embargo oil exports to the West. Jet fuel prices quadruple in weeks and economies tip into recession.', data: d, choices: ack() }),
    resolve(state, _i, d) {
      state.macro.fuel *= 1 + 1.4 * sev(d);
      shock(state, 'Oil crisis recession', 1 - 0.12 * sev(d), 52);
      return `Fuel now $${state.macro.fuel.toFixed(2)}/kg.`;
    },
  },
  {
    id: 'deregulation', weight: 0,
    build: (s, d) => ({ title: 'Airline deregulation', text: 'Governments scrap fare and route controls. Fares will fall and upstart airlines are already raising money.', data: d, choices: ack('Embrace competition', 'info') }),
    resolve(state) {
      for (let i = 0; i < 3; i++) spawnStartup(state, { type: 'lcc' });
      return 'New low-fare competitors are launching.';
    },
  },
  {
    id: 'oil_revolution', weight: 0,
    build: (s, d) => ({ title: 'Second oil shock', text: 'Revolution in a major producer sends crude prices soaring again.', data: d, choices: ack() }),
    resolve(state, _i, d) {
      state.macro.fuel *= 1 + 0.7 * sev(d);
      shock(state, 'Stagflation', 1 - 0.08 * sev(d), 40);
      return `Fuel now $${state.macro.fuel.toFixed(2)}/kg.`;
    },
  },
  {
    id: 'atc_walkout', weight: 0,
    build: (s, d) => ({ title: 'Air traffic controllers walk out', text: 'Controllers strike nationwide; the government fires them and runs a skeleton service for months.', data: d, choices: ack() }),
    resolve(state, _i, d) {
      state.disruptions.push({ name: 'ATC staffing crisis', codes: AIRPORTS.filter((a) => a.country === 'US').map((a) => a.code), factor: 0.8, weeks: Math.round(8 * sev(d)) });
      return 'US capacity is capped for weeks.';
    },
  },
  {
    id: 'security_mandate', weight: 0,
    build: (s, d) => ({ title: 'Bombing prompts security overhaul', text: 'After a bomb destroys an airliner, regulators mandate baggage reconciliation and screening upgrades.', data: d, choices: [{ label: 'Comply ($3M)' }, { label: 'Go beyond: raise security standard', hint: 'Security level +1' }] }),
    resolve(state, i) {
      state.cash -= 3e6;
      if (i === 1) state.service.security = Math.min(5, (state.service.security ?? 3) + 1);
      return 'New procedures in place.';
    },
  },
  {
    id: 'gulf_war', weight: 0,
    build: (s, d) => ({ title: 'War in the Gulf', text: 'An invasion triggers war. Middle Eastern airspace closes, oil spikes and travellers stay home.', data: d, choices: ack() }),
    resolve(state, _i, d) {
      closeAirspace(state, 'Middle East', Math.round(26 * sev(d)), 1.2);
      state.macro.fuel *= 1 + 0.6 * sev(d);
      shock(state, 'War fears', 1 - 0.12 * sev(d), 26);
      return 'Gulf airspace closed; reroutes burn more fuel.';
    },
  },
  {
    id: 'asian_crisis', weight: 0,
    build: (s, d) => ({ title: 'Asian financial crisis', text: 'Currencies collapse across Asia; travel demand in the region slumps.', data: d, choices: ack() }),
    resolve(state, _i, d) {
      shock(state, 'Asian crisis', 1 - 0.18 * sev(d), 40, ['AS']);
      return 'Asian demand weakens for most of a year.';
    },
  },
  {
    id: 'terror_attacks', weight: 0,
    build: (s, d) => ({ title: 'Terror attacks using airliners', text: 'Hijacked airliners are used as weapons. All North American airspace is closed; when it reopens, passengers are terrified and security is transformed forever.', data: d, choices: ack('Ground everything') }),
    resolve(state, _i, d) {
      state.disruptions.push({ name: 'Airspace shutdown', codes: AIRPORTS.filter((a) => a.region === 'NA').map((a) => a.code), factor: 0.2, weeks: 1 });
      shock(state, 'Fear of flying', 1 - 0.25 * sev(d), 26, ['NA']);
      shock(state, 'Global aviation slump', 1 - 0.08 * sev(d), 30);
      state.service.security = Math.max(state.service.security ?? 3, 3);
      return 'Demand collapses; security costs rise permanently.';
    },
  },
  {
    id: 'sars', weight: 0,
    build: (s, d) => ({ title: 'Respiratory epidemic in Asia', text: 'A new coronavirus spreads through Asian cities. Travellers cancel en masse.', data: d, choices: ack() }),
    resolve(state, _i, d) {
      shock(state, 'Epidemic', 1 - 0.4 * sev(d), 14, ['AS']);
      return 'Asian demand plunges for a season.';
    },
  },
  {
    id: 'oil_spike', weight: 0,
    build: (s, d) => ({ title: 'Oil hits record highs', text: 'Speculation and tight supply push crude to unheard-of prices.', data: d, choices: [{ label: 'Absorb' }, { label: 'Fuel surcharges', hint: 'Fares +8%, reputation -3', tone: 'bad' }] }),
    resolve(state, i, d) {
      state.macro.fuel *= 1 + 0.5 * sev(d);
      if (i === 1) {
        for (const r of state.routes) for (const c of Object.keys(r.fares)) r.fares[c] = Math.round(r.fares[c] * 1.08);
        state.reputation = clamp(state.reputation - 3, 0, 100);
      }
      return `Fuel now $${state.macro.fuel.toFixed(2)}/kg.`;
    },
  },
  {
    id: 'financial_crisis', weight: 0,
    build: (s, d) => ({ title: 'Global financial crisis', text: 'Banks collapse, credit freezes and the world tips into the worst recession in decades.', data: d, choices: ack() }),
    resolve(state, _i, d) {
      shock(state, 'Great recession', 1 - 0.15 * sev(d), 60);
      state.macro.economy = clamp(state.macro.economy - 0.08, 0.8, 1.2);
      state.macro.fuel *= 0.7;
      return 'Demand falls sharply; at least fuel gets cheaper.';
    },
  },
  {
    id: 'tsunami', weight: 0,
    build: (s, d) => ({ title: 'Earthquake and tsunami in Japan', text: 'A massive earthquake devastates north-east Japan. Airports close and visitors stay away.', data: d, choices: ack() }),
    resolve(state, _i, d) {
      state.disruptions.push({ name: 'Japan disaster', codes: AIRPORTS.filter((a) => a.country === 'JP').map((a) => a.code), factor: 0.4, weeks: 2 });
      shock(state, 'Japan travel slump', 1 - 0.3 * sev(d), 16, ['AS']);
      return 'Japanese flights disrupted.';
    },
  },
  {
    id: 'airspace_east', weight: 0,
    build: (s, d) => ({ title: 'Airliner shot down over a war zone', text: 'A passenger jet is destroyed by a missile over a conflict region. Regulators close the airspace.', data: d, choices: ack() }),
    resolve(state, _i, d) {
      closeAirspace(state, 'Eastern Europe', Math.round(104 * sev(d)), 1.06);
      state.service.security = Math.max(state.service.security ?? 3, 3);
      return 'Eastern European airspace closed; Europe–Asia flights reroute.';
    },
  },
  {
    id: 'airspace_russia', weight: 0,
    build: (s, d) => ({ title: 'Russian airspace closed', text: 'Sanctions and counter-sanctions close Russian airspace to most carriers. Europe–Asia flights face long detours and fuel jumps.', data: d, choices: ack() }),
    resolve(state, _i, d) {
      closeAirspace(state, 'Russia', Math.round(260 * sev(d)), 1.2);
      state.macro.fuel *= 1 + 0.35 * sev(d);
      return 'Detours add hours to Europe–Asia flights.';
    },
  },
);

// ---------------------------------------------------------------------------
// Random disruptions

EVENTS.push(
  {
    id: 'oil_workers_strike', weight: 0.8,
    build: (state) => ({ title: 'Oil workers strike', text: `Oil field and terminal workers in a major producer walk out. Crude supply tightens.`, choices: ack() }),
    resolve(state) {
      state.macro.fuel *= 1.15 + rand(state) * 0.15;
      return `Fuel climbs to $${state.macro.fuel.toFixed(2)}/kg.`;
    },
  },
  {
    id: 'refinery_strike', weight: 0.6,
    canTrigger: (s) => s.routes.length > 0,
    build(state) {
      const country = pick(state, [...new Set(stations(state).map((c) => airportByCode[c].country))]);
      return { title: `Refinery strike in ${COUNTRIES[country]}`, text: `Refinery workers in ${COUNTRIES[country]} strike; airports are rationing jet fuel.`, data: { country }, choices: [{ label: 'Tanker fuel in from elsewhere', hint: 'Flights continue; fuel costs +10% this month', tone: 'info' }, { label: 'Cut flights', hint: 'Capacity -40% at affected airports for 2 weeks' }] };
    },
    resolve(state, i, { country }) {
      if (i === 0) {
        state.macro.fuel *= 1.1;
        return 'Tankering fuel keeps the schedule intact.';
      }
      state.disruptions.push({ name: 'Fuel rationing', codes: AIRPORTS.filter((a) => a.country === country).map((a) => a.code), factor: 0.6, weeks: 2 });
      return 'Flights trimmed until supplies recover.';
    },
  },
  {
    id: 'airspace_conflict', weight: 0.5,
    canTrigger: (s) => elapsed(s) > 26,
    build(state) {
      const region = pick(state, Object.keys(AIRSPACE));
      const weeks = 2 + Math.floor(rand(state) * 10);
      return { title: `${region} airspace closed`, text: `Military tensions close ${region} airspace for an estimated ${weeks} weeks. Overflights must detour.`, data: { region, weeks }, choices: ack() };
    },
    resolve(state, _i, { region, weeks }) {
      closeAirspace(state, region, weeks, 1.12);
      return 'Routes over the region are rerouted.';
    },
  },
);

function addWorkSafe(state, ac, weeks, label) {
  if (state.fleet.includes(ac)) addWorkFn(state, ac, weeks, label);
}
// The most common narrowbody that existed at least seven years ago.
function secondHandNarrowbody(state) {
  const year = yearOf(state.week);
  return AIRCRAFT.filter((t) => t.cat === 'narrow' && inService(t, year) && year - t.intro >= 7).sort((a, b) => b.intro - a.intro)[0];
}
function G_name(typeId) {
  return aircraftById[typeId]?.name ?? typeId;
}

EVENTS.push({
  id: 'takeover_bid',
  weight: 0,
  build: (state, d) => ({
    title: 'Hostile takeover bid',
    text: `${rivalDef(state, d.rivalId)?.name} has offered shareholders ${money(d.price)} for ${state.airline.name} — a premium to your share price. The board is listening.`,
    data: d,
    choices: [
      { label: 'Recommend the offer', hint: 'Sell the airline. Game over — on your terms.', tone: 'good' },
      { label: 'Reject and fight on', hint: 'Board confidence -5 unless results improve' },
      { label: 'Adopt a poison pill', hint: '$5M in fees; board confidence -2; blocks future bids for a while' },
    ],
  }),
  resolve(state, i, d) {
    if (i === 0) {
      state.status = 'sold';
      state.soldFor = d.price;
      return `${state.airline.name} is sold for ${money(d.price)}.`;
    }
    if (i === 1) {
      state.board.confidence = clamp(state.board.confidence - 5, 0, 100);
      return 'You reject the bid. Shareholders expect results.';
    }
    state.cash -= 5e6;
    state.board.confidence = clamp(state.board.confidence - 2, 0, 100);
    state.board.confidence = Math.max(state.board.confidence, 40);
    return 'Defences in place.';
  },
});

export const eventById = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

export function triggerEvent(state, id, data, force = false) {
  let def;
  if (id) {
    def = eventById[id];
    if (!def || (!force && def.canTrigger && !def.canTrigger(state))) return null;
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
