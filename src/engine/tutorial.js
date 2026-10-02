// Guided first year: a short checklist that notices what you've done (or lets
// you acknowledge explanatory steps), shown as a dismissable card in the UI.

import { elapsed, ok, fail } from './core.js';
import { routeFreq } from './network.js';

const anyFlying = (s) => s.routes.some((r) => routeFreq(s, r) > 0);

export const TUTORIAL = [
  { id: 'welcome', title: 'Welcome aboard', href: '#dashboard', ack: true,
    text: 'This is your dashboard: cash, weekly profit, load factor and fleet up top, things needing attention, and the Advisor. Most systems run on autopilot until you take over — pricing, aircraft assignment, staffing, hub timetables and maintenance.' },
  { id: 'aircraft', title: 'Get an aircraft', href: '#fleet/market',
    text: 'Open Fleet › Acquire aircraft. Leases arrive in weeks, used aircraft soon after, factory orders take years. Start with one or two narrowbodies (or turboprops for short hops).',
    done: (s) => s.fleet.length >= 1 },
  { id: 'route', title: 'Open a route', href: '#routes',
    text: 'In Routes, pick a destination from your hub. The preview shows market size, competition and traffic rights. Big cities 500–2,500 km away are a good start.',
    done: (s) => s.routes.length >= 1 },
  { id: 'fly', title: 'Put it in the air', href: '#routes',
    text: 'Assign an aircraft on the route page — or simply wait: the autopilot puts idle aircraft on the routes that need seats. Each round trip uses block hours; an aircraft flies ~100–125 hours a week.',
    done: anyFlying },
  { id: 'advance', title: 'Advance time', href: '#dashboard',
    text: 'Use Week ▶ (or press Space) to play a week. Month, Quarter and Year run longer, pausing for decisions. You can always undo the last advance with ↶.',
    done: (s) => elapsed(s) >= 1 && s.lastReport?.flights > 0 },
  { id: 'results', title: 'Read your results', href: '#routes', ack: true,
    text: 'Load factor is the share of seats filled; profit per route includes crew and aircraft costs. Hover any metric with a dotted underline for an explanation. Routes below ~70% full or losing money for weeks deserve a look.' },
  { id: 'pricing', title: 'Fares and revenue management', href: '#management/autopilot', ack: true,
    text: 'The autopilot nudges fares toward a target load factor and manages the cheap advance-fare bucket. Set fares yourself on a route page to take that route off auto.' },
  { id: 'grow', title: 'Grow the network', href: '#map',
    text: 'Three or more routes from your hub start feeding each other with connecting passengers. Use the Map or Markets › Opportunities to find demand.',
    done: (s) => s.routes.length >= 3 && s.fleet.length >= 3 },
  { id: 'connect', title: 'Connections', href: '#network/hubs',
    text: 'Passengers now connect over your hub. Network › Hubs and Planning › Hubs show your connecting traffic and the hub’s timetable banks.',
    done: (s) => (s.lastReport?.connecting ?? 0) > 0 },
  { id: 'board', title: 'Meet the board', href: '#management/airline',
    text: 'The board reviews you every quarter and sets yearly objectives. Keep confidence above zero — and keep cash positive.',
    done: (s) => s.board.reviews >= 1 },
  { id: 'year', title: 'Finish your first year', href: '#history/reports',
    text: 'At year end you get an annual report (History) and new objectives. After that you’re on your own — good luck!',
    done: (s) => elapsed(s) >= 52 },
];

export const newTutorial = (on = true) => ({ on, acked: [], dismissed: false });

export function tutorialSteps(state) {
  const t = state.tutorial ?? newTutorial(false);
  return TUTORIAL.map((step) => ({ ...step, complete: step.ack ? t.acked.includes(step.id) : !!step.done?.(state) }));
}

// First step not yet complete (steps can complete out of order).
export function tutorialCurrent(state) {
  const t = state.tutorial;
  if (!t?.on || t.dismissed) return null;
  return tutorialSteps(state).find((x) => !x.complete) ?? null;
}

export function tutorialAck(state, id) {
  const t = state.tutorial;
  if (!t) return fail('No tutorial');
  const step = TUTORIAL.find((x) => x.id === id);
  if (!step) return fail('Unknown step');
  if (!t.acked.includes(id)) t.acked.push(id);
  return ok();
}

export function setTutorial(state, on) {
  state.tutorial = { ...(state.tutorial ?? newTutorial()), on: !!on, dismissed: !on };
  return ok();
}
