// Random events that interrupt the week and ask the CEO for a decision.
//
// Each event has:
//   id, weight            selection odds relative to other eligible events
//   canTrigger(state)     optional eligibility check
//   build(state, h)       returns { title, text, choices: [{ label, hint, tone }], data }
//   resolve(state, i, data, h)  applies choice i and returns a log message
//
// `data` must stay JSON-serialisable because pending events live in the save.

import { AIRCRAFT, aircraftById, cityByCode } from './data.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export const EVENTS = [
  {
    id: 'union_raise',
    weight: 3,
    canTrigger: (s) => s.fleet.length >= 2 && s.strikeWeeks === 0,
    build: () => ({
      title: 'Union pay demand',
      text: "The pilots' and cabin crew unions demand a 6% raise and threaten industrial action.",
      choices: [
        { label: 'Grant the raise', hint: 'Crew wages +6%, morale up', tone: 'good' },
        { label: 'Refuse', hint: 'Morale down, risk of a strike', tone: 'bad' },
      ],
    }),
    resolve(state, i, _d, h) {
      if (i === 0) {
        state.settings.wages = Math.round(clamp(state.settings.wages + 0.06, 0.7, 1.5) * 100) / 100;
        state.morale = clamp(state.morale + 12, 0, 100);
        return 'Raise granted. Crews are happier.';
      }
      state.morale = clamp(state.morale - 15, 0, 100);
      if (h.rand(state) < 0.4) {
        state.strikeWeeks = 2;
        return 'The unions walk out! Operations are cut to 30% for 2 weeks.';
      }
      return 'The unions back down, but resentment lingers.';
    },
  },
  {
    id: 'fuel_spike',
    weight: 2,
    build: () => ({
      title: 'Oil price shock',
      text: 'Conflict in a major producing region sends jet fuel prices soaring by roughly 35%.',
      choices: [
        { label: 'Absorb the cost', hint: 'Keep fares as they are' },
        { label: 'Add a fuel surcharge', hint: 'All fares +8%, reputation -4', tone: 'bad' },
      ],
    }),
    resolve(state, i) {
      state.fuelPrice = clamp(state.fuelPrice * 1.35, 0.45, 1.9);
      if (i === 1) {
        for (const r of state.routes) r.fare = Math.round(r.fare * 1.08);
        state.reputation = clamp(state.reputation - 4, 0, 100);
        return `Fuel is now $${state.fuelPrice.toFixed(2)}/kg. A surcharge has been added to every fare.`;
      }
      return `Fuel is now $${state.fuelPrice.toFixed(2)}/kg. You absorb the cost.`;
    },
  },
  {
    id: 'fuel_drop',
    weight: 1.5,
    build: () => ({
      title: 'Oil glut',
      text: 'Producers flood the market and jet fuel prices tumble about 25%.',
      choices: [{ label: 'Excellent', tone: 'good' }],
    }),
    resolve(state) {
      state.fuelPrice = clamp(state.fuelPrice * 0.75, 0.45, 1.9);
      return `Fuel falls to $${state.fuelPrice.toFixed(2)}/kg.`;
    },
  },
  {
    id: 'recession',
    weight: 1,
    canTrigger: (s) => s.week > 26 && !s.shocks.some((x) => x.name === 'Recession'),
    build: () => ({
      title: 'Recession',
      text: 'Economists declare a recession. Business travel budgets are being slashed.',
      choices: [{ label: 'Brace for impact', tone: 'bad' }],
    }),
    resolve(state) {
      state.shocks.push({ name: 'Recession', mult: 0.85, weeks: 20 });
      return 'Demand will be about 15% weaker for the next 20 weeks.';
    },
  },
  {
    id: 'boom',
    weight: 1,
    canTrigger: (s) => !s.shocks.some((x) => x.name === 'Travel boom'),
    build: () => ({
      title: 'Travel boom',
      text: 'Consumer confidence is at a record high and everyone wants to travel.',
      choices: [{ label: 'Fill those seats', tone: 'good' }],
    }),
    resolve(state) {
      state.shocks.push({ name: 'Travel boom', mult: 1.12, weeks: 12 });
      return 'Demand will be about 12% stronger for the next 12 weeks.';
    },
  },
  {
    id: 'pandemic',
    weight: 0.3,
    canTrigger: (s) => s.week > 52 && !s.shocks.some((x) => x.name === 'Health scare'),
    build: () => ({
      title: 'Global health scare',
      text: 'A new virus is spreading and governments are advising against non-essential travel.',
      choices: [{ label: 'Hold on tight', tone: 'bad' }],
    }),
    resolve(state) {
      state.shocks.push({ name: 'Health scare', mult: 0.6, weeks: 10 });
      return 'Demand collapses by 40% for 10 weeks.';
    },
  },
  {
    id: 'celebrity',
    weight: 1.5,
    build: (state) => {
      const fee = 1.5e6;
      return {
        title: 'Celebrity endorsement',
        text: 'A hugely popular pop star offers to front your next ad campaign.',
        data: { fee },
        choices: [
          { label: 'Sign the deal ($1.5M)', hint: 'Reputation +8', tone: 'good', disabled: state.cash < fee },
          { label: 'Pass', hint: 'Nothing happens' },
        ],
      };
    },
    resolve(state, i, data) {
      if (i === 0 && state.cash >= data.fee) {
        state.cash -= data.fee;
        state.reputation = clamp(state.reputation + 8, 0, 100);
        return 'The campaign is a hit. Bookings are buzzing.';
      }
      return 'You politely decline.';
    },
  },
  {
    id: 'competitor_enters',
    weight: 2,
    canTrigger: (s) => s.routes.length > 0,
    build: (state, h) => {
      const route = h.pick(state, state.routes);
      return {
        title: 'New competitor',
        text: `A rival carrier announces daily service on ${route.from}–${route.to}, undercutting fares by 15%.`,
        data: { routeId: route.id },
        choices: [
          { label: 'Start a fare war', hint: 'Your fare on this route -15%' },
          { label: 'Hold your fares', hint: 'Compete on service' },
        ],
      };
    },
    resolve(state, i, data) {
      const route = state.routes.find((r) => r.id === data.routeId);
      if (!route) return 'The rival entered a market you no longer serve.';
      route.competitors = Math.min(6, route.competitors + 1);
      route.compFare = Math.round(route.compFare * 0.85);
      if (i === 0) {
        route.fare = Math.round(route.fare * 0.85);
        return `You match them on ${route.from}–${route.to}. Margins will be thin.`;
      }
      return `You hold firm on ${route.from}–${route.to}.`;
    },
  },
  {
    id: 'competitor_exits',
    weight: 1.5,
    canTrigger: (s) => s.routes.some((r) => r.competitors > 0),
    build: (state, h) => {
      const route = h.pick(state, state.routes.filter((r) => r.competitors > 0));
      return {
        title: 'Competitor retreats',
        text: `A rival is pulling out of ${route.from}–${route.to} after heavy losses.`,
        data: { routeId: route.id },
        choices: [{ label: 'Their loss is our gain', tone: 'good' }],
      };
    },
    resolve(state, _i, data) {
      const route = state.routes.find((r) => r.id === data.routeId);
      if (!route) return '';
      route.competitors = Math.max(0, route.competitors - 1);
      return `${route.from}–${route.to} now has ${route.competitors} competitor(s).`;
    },
  },
  {
    id: 'used_aircraft',
    weight: 1.5,
    build: (state, h) => {
      const type = h.pick(state, AIRCRAFT.filter((a) => a.price < 100e6));
      const price = Math.round(type.price * 0.5);
      return {
        title: 'Distressed aircraft sale',
        text: `A bankrupt carrier is liquidating an 8-year-old ${type.name}. Asking price: ${h.money(price)} (new: ${h.money(type.price)}).`,
        data: { typeId: type.id, price },
        choices: [
          { label: `Buy it (${h.money(price)})`, hint: 'Available next week, condition 70%', disabled: state.cash < price },
          { label: 'Pass' },
        ],
      };
    },
    resolve(state, i, data, h) {
      if (i !== 0 || state.cash < data.price) return 'You let the deal go.';
      state.cash -= data.price;
      const ac = h.addAircraft(state, data.typeId, { owned: true, deliveryWeek: state.week + 1, ageWeeks: 8 * 52, condition: 70 });
      return `Acquired ${aircraftById[data.typeId].name} ${ac.reg} for ${h.money(data.price)}.`;
    },
  },
  {
    id: 'incident',
    weight: 3,
    canTrigger: (s) => s.fleet.some((a) => a.condition < 65 && a.routeId),
    build: (state, h) => {
      const ac = h.pick(state, state.fleet.filter((a) => a.condition < 65 && a.routeId));
      return {
        title: 'Technical incident',
        text: `${aircraftById[ac.type].name} ${ac.reg} made an emergency landing after an engine warning. Nobody was hurt, but the press is asking questions about your maintenance.`,
        data: { acId: ac.id, cost: state.fleet.length * 250_000 },
        choices: [
          { label: 'Ground and inspect the whole fleet', hint: `${h.money(state.fleet.length * 250_000)}, all aircraft condition +15, reputation -2` },
          { label: 'Issue a reassuring statement', hint: 'Reputation -8', tone: 'bad' },
        ],
      };
    },
    resolve(state, i, data) {
      if (i === 0) {
        state.cash -= data.cost;
        for (const a of state.fleet) a.condition = clamp(a.condition + 15, 0, 100);
        state.reputation = clamp(state.reputation - 2, 0, 100);
        return 'Inspections complete. The public appreciates the caution.';
      }
      state.reputation = clamp(state.reputation - 8, 0, 100);
      return 'The story runs for days. Travellers are nervous.';
    },
  },
  {
    id: 'data_breach',
    weight: 1,
    canTrigger: (s) => s.week > 10,
    build: () => ({
      title: 'Data breach',
      text: 'Hackers have stolen customer records from your booking system.',
      choices: [
        { label: 'Disclose and compensate ($3M)', hint: 'Reputation -2' },
        { label: 'Downplay it', hint: 'Reputation -10', tone: 'bad' },
      ],
    }),
    resolve(state, i) {
      if (i === 0) {
        state.cash -= 3e6;
        state.reputation = clamp(state.reputation - 2, 0, 100);
        return 'Customers appreciate your honesty.';
      }
      state.reputation = clamp(state.reputation - 10, 0, 100);
      return 'Journalists uncover the full scale. Trust takes a beating.';
    },
  },
  {
    id: 'service_award',
    weight: 1,
    canTrigger: (s) => s.settings.service >= 4 && s.reputation > 55,
    build: () => ({
      title: 'Industry award',
      text: 'You have been named "Best Cabin Service" at the World Airline Awards!',
      choices: [{ label: 'Pop the champagne', tone: 'good' }],
    }),
    resolve(state) {
      state.reputation = clamp(state.reputation + 6, 0, 100);
      state.morale = clamp(state.morale + 5, 0, 100);
      return 'Reputation and staff morale rise.';
    },
  },
  {
    id: 'subsidy',
    weight: 1,
    canTrigger: (s) => s.routes.some((r) => cityByCode[r.from].pop < 3 || cityByCode[r.to].pop < 3),
    build: (state, h) => {
      const route = h.pick(state, state.routes.filter((r) => cityByCode[r.from].pop < 3 || cityByCode[r.to].pop < 3));
      return {
        title: 'Tourism grant',
        text: `The regional government rewards your service on ${route.from}–${route.to} with a $2M tourism development grant.`,
        choices: [{ label: 'Accept graciously', tone: 'good' }],
      };
    },
    resolve(state) {
      state.cash += 2e6;
      return 'Received $2M.';
    },
  },
  {
    id: 'hub_fees',
    weight: 1,
    canTrigger: (s) => s.week > 13,
    build: (state) => ({
      title: 'Hub airport fee dispute',
      text: `${cityByCode[state.airline.hub].name} airport demands a one-off $1.5M infrastructure levy from its based carriers.`,
      choices: [
        { label: 'Pay the levy', hint: '$1.5M' },
        { label: 'Fight it in court', hint: '50%: pay nothing, 50%: pay $2.5M' },
      ],
    }),
    resolve(state, i, _d, h) {
      if (i === 0) {
        state.cash -= 1.5e6;
        return 'Levy paid.';
      }
      if (h.rand(state) < 0.5) return 'The court sides with you. No levy.';
      state.cash -= 2.5e6;
      return 'You lose the case and pay $2.5M including legal costs.';
    },
  },
  {
    id: 'staff_bonus',
    weight: 1.5,
    canTrigger: (s) => s.history.slice(-4).every((h) => h.profit > 0) && s.history.length >= 4,
    build: () => ({
      title: 'Bonus request',
      text: 'After a strong run of profits, staff representatives ask for a one-off $1M bonus pool.',
      choices: [
        { label: 'Pay the bonus ($1M)', hint: 'Morale +12', tone: 'good' },
        { label: 'Decline', hint: 'Morale -6' },
      ],
    }),
    resolve(state, i) {
      if (i === 0) {
        state.cash -= 1e6;
        state.morale = clamp(state.morale + 12, 0, 100);
        return 'Staff are delighted.';
      }
      state.morale = clamp(state.morale - 6, 0, 100);
      return 'Staff grumble about the decision.';
    },
  },
];

export const eventById = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
