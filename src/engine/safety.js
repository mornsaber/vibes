// Safety & disruption: maintenance- and crew-driven incidents of differing
// severity (up to hull losses), hijackings, weather closures and damage,
// airspace closures, and the randomised historical timeline.

import { HISTORY, AIRSPACE, WEATHER } from '../data/history.js';
import { airportByCode } from '../data/airports.js';
import { CHECK_ORDER } from '../data/aircraft.js';
import { eraSafety } from '../data/eras.js';
import { clamp, rand, randInt, pick, log, money, yearOf, dateOf, weekOfYearStart, sum } from './core.js';
import { typeOf, ageYears, isDelivered, inDowntime, addWork, aircraftValue, removeAircraft } from './fleet.js';
import { stations, routeById } from './network.js';
import { checkStatus } from './maintenance.js';

const MINOR = ['bird strike', 'engine shutdown and diversion', 'tail strike', 'hard landing', 'lightning strike', 'severe turbulence injuries', 'cabin pressure loss and emergency descent', 'runway incursion near-miss'];
const SERIOUS = ['runway excursion', 'uncontained engine failure', 'landing gear collapse', 'cargo hold fire', 'controlled emergency landing short of the runway'];

// ---------------------------------------------------------------------------
// Risk

export function riskFactors(state, ac) {
  const type = typeOf(ac);
  const year = yearOf(state.week);
  const st = state.staffStatus ?? {};
  const overdue = CHECK_ORDER.some((k) => checkStatus(state, ac, k).overdue);
  const f = {
    era: eraSafety(year),
    reliability: 0.5 + (100 - ac.reliability) / 20,
    maintenance: overdue ? 3 : 1,
    pilots: (1.6 - 0.8 * (st.pilots?.experience ?? 0.6)) * ((st.pilots?.ratio ?? 1) < 0.95 ? 1.3 : 1),
    engineers: (st.engineers?.ratio ?? 1) < 0.9 ? 1.4 : 1,
    age: ageYears(state, ac) > 25 ? 1.3 : 1,
    design: type.intro < 1965 ? 1.5 : 1,
  };
  f.total = Object.values(f).reduce((a, b) => a * b, 1);
  return f;
}

// Hull losses per flight before multipliers (modern baseline ~0.15 per million).
const HULL_BASE = 0.15e-6;
export const incidentRates = (state, ac) => {
  const r = riskFactors(state, ac).total * HULL_BASE * (state.settings?.safety ?? 1);
  return { hull: r, serious: r * 25, minor: r * 300 };
};

export function hijackRate(state) {
  const y = yearOf(state.week);
  const era = y >= 1968 && y <= 1972 ? 3e-6 : y < 1968 ? 0.5e-6 : y < 2001 ? 0.4e-6 : y <= 2002 ? 0.2e-6 : 0.03e-6;
  return era * [2, 1.4, 1, 0.7, 0.45][(state.service.security ?? 3) - 1] * (state.settings?.safety ?? 1);
}

const poisson = (state, lambda) => Math.floor(lambda) + (rand(state) < lambda % 1 ? 1 : 0);

// ---------------------------------------------------------------------------
// Weekly safety tick (after operations; uses flights each aircraft flew)

export function safetyTick(state) {
  const out = { minor: 0, serious: 0, hull: 0, cost: 0 };
  for (const ac of [...state.fleet]) {
    const flights = ac.lastFlights ?? 0;
    if (!flights) continue;
    const r = incidentRates(state, ac);
    if (rand(state) < flights * r.hull) {
      hullLoss(state, ac);
      out.hull += 1;
      continue;
    }
    if (rand(state) < flights * r.serious) {
      out.serious += 1;
      seriousIncident(state, ac);
      continue;
    }
    const minors = poisson(state, flights * r.minor);
    for (let i = 0; i < minors; i++) {
      const cost = randInt(state, 50, 600) * 1000;
      out.minor += 1;
      out.cost += cost;
      ac.lostHours += randInt(state, 8, 40);
      record(state, { week: state.week, severity: 'minor', reg: ac.reg, type: ac.type, text: pick(state, MINOR), cost });
    }
    // Hijackings.
    if (rand(state) < flights * hijackRate(state) && !state.queue.some((q) => q.event === 'hijacking')) {
      state.queue.unshift({ event: 'hijacking', data: { acId: ac.id, reg: ac.reg } });
    }
  }
  state.cash -= out.cost;
  state.weekCosts.incidents = (state.weekCosts.incidents ?? 0) + out.cost;
  if (out.minor) state.reputation = clamp(state.reputation - out.minor * 0.2, 0, 100);
  return out;
}

function record(state, entry) {
  state.incidents.unshift(entry);
  if (state.incidents.length > 150) state.incidents.length = 150;
}

// Pick the likeliest cause from the aircraft's risk factors.
function cause(state, ac) {
  const f = riskFactors(state, ac);
  const causes = [
    ['maintenance lapses', f.maintenance * f.reliability * f.engineers],
    ['pilot error', f.pilots * 1.2],
    ['a design flaw', f.design * f.age * 0.8],
    ['weather', state.disruptions.some((d) => d.weather) ? 2 : 0.6],
  ];
  let roll = rand(state) * sum(causes, (c) => c[1]);
  return causes.find((c) => (roll -= c[1]) <= 0)?.[0] ?? 'pilot error';
}

export function seriousIncident(state, ac) {
  const what = pick(state, SERIOUS);
  const weeks = randInt(state, 2, 8);
  const cost = randInt(state, 2, 15) * 1e6;
  addWork(state, ac, weeks, 'Accident repair');
  state.cash -= cost * 0.3; // insurance covers the rest
  state.weekCosts.incidents = (state.weekCosts.incidents ?? 0) + cost * 0.3;
  const why = cause(state, ac);
  state.reputation = clamp(state.reputation - 4, 0, 100);
  record(state, { week: state.week, severity: 'serious', reg: ac.reg, type: ac.type, text: `${what} (investigators cite ${why})`, cost });
  state.queue.unshift({ event: 'serious_incident', data: { reg: ac.reg, type: ac.type, what, why } });
}

export function hullLoss(state, ac) {
  const type = typeOf(ac);
  const route = ac.schedule.length ? routeById(state, ac.schedule[0].routeId) : null;
  const onboard = Math.round((type.cat === 'freighter' ? 3 : (ac.config.F + ac.config.J + ac.config.W + ac.config.Y) * (route?.last?.lf ?? 0.75)) + 6);
  const survivable = rand(state) < 0.4;
  const fatalities = survivable ? randInt(state, 0, Math.ceil(onboard * 0.1)) : Math.round(onboard * (0.6 + rand(state) * 0.4));
  const why = cause(state, ac);
  const value = aircraftValue(state, ac);
  const insured = ac.owned ? value * 0.9 : 0;
  const liability = fatalities * 1.5e6 * 0.25; // after insurance
  state.cash += insured - liability - (ac.owned ? 0 : ac.lease.deposit * 0);
  state.weekCosts.incidents = (state.weekCosts.incidents ?? 0) + liability;
  removeAircraft(state, ac);
  const repHit = survivable ? 8 : 15 + Math.min(15, fatalities / 20);
  state.reputation = clamp(state.reputation - repHit, 0, 100);
  state.board.confidence = clamp(state.board.confidence - (survivable ? 5 : 15), 0, 100);
  state.brandShock = { mult: survivable ? 0.92 : 0.78, weeks: survivable ? 8 : 26 };
  if (why === 'maintenance lapses') {
    state.cash -= 10e6;
    state.typeRestrictions[type.id] = { factor: 0, weeks: 2 };
  }
  if (why === 'a design flaw') state.typeRestrictions[type.id] = { factor: 0.4, weeks: 6 };
  const where = route ? `${route.a}–${route.b}` : 'a positioning flight';
  record(state, { week: state.week, severity: 'hull loss', reg: ac.reg, type: ac.type, text: `Crashed on ${where}: ${fatalities} fatalities of ${onboard} aboard (cause: ${why})`, cost: value });
  log(state, `TRAGEDY: ${type.name} ${ac.reg} has crashed on ${where}. ${fatalities ? `${fatalities} people lost their lives.` : 'Remarkably, everyone survived.'} Investigators point to ${why}.`, 'bad', 'safety');
  state.queue.unshift({ event: 'crash', data: { reg: ac.reg, type: type.id, where, fatalities, onboard, why } });
}

// ---------------------------------------------------------------------------
// Weather

export function weatherTick(state) {
  const month = dateOf(state.week).getUTCMonth() + 1;
  for (const code of stations(state)) {
    const ap = airportByCode[code];
    for (const w of WEATHER) {
      if (!w.months.includes(month) || !w.match(ap) || rand(state) > w.p * (state.settings?.weather ?? 1)) continue;
      const days = randInt(state, w.days[0], w.days[1]);
      state.disruptions.push({ name: `${w.name} at ${code}`, codes: [code], factor: Math.max(0, 1 - days / 7), weeks: 1, weather: true });
      let damaged = '';
      if (w.damage && rand(state) < w.damage * Math.min(1.5, (state.settings?.weather ?? 1))) {
        const exposed = state.fleet.filter((a) => isDelivered(state, a) && !inDowntime(state, a) && a.schedule.some((s) => { const r = routeById(state, s.routeId); return r && (r.a === code || r.b === code); }));
        if (exposed.length) {
          const ac = pick(state, exposed);
          const weeks = randInt(state, 1, 5);
          const cost = randInt(state, 1, 8) * 1e6;
          addWork(state, ac, weeks, `${w.name} damage repair`);
          state.cash -= cost * 0.5;
          state.weekCosts.incidents = (state.weekCosts.incidents ?? 0) + cost * 0.5;
          damaged = ` ${ac.reg} was damaged on the ground (${weeks} weeks of repairs).`;
          record(state, { week: state.week, severity: 'weather', reg: ac.reg, type: ac.type, text: `${w.name} damage at ${code}`, cost });
        }
      }
      log(state, `${w.name} closes ${ap.city} (${code}) for ${days} day${days > 1 ? 's' : ''}.${damaged}`, 'bad', 'weather');
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Airspace

export function airspaceFuelMult(state, route) {
  let m = 1;
  const A = airportByCode[route.a];
  const B = airportByCode[route.b];
  // Sample the straight line between the endpoints for overflight.
  for (const d of state.disruptions.filter((x) => x.airspace)) {
    const box = AIRSPACE[d.airspace];
    let crosses = false;
    for (let t = 0.2; t <= 0.8; t += 0.2) {
      const lat = A.lat + (B.lat - A.lat) * t;
      let dl = B.lon - A.lon;
      if (Math.abs(dl) > 180) dl -= Math.sign(dl) * 360;
      let lon = A.lon + dl * t;
      if (lon > 180) lon -= 360;
      if (lon < -180) lon += 360;
      if (lat >= box.lat[0] && lat <= box.lat[1] && lon >= box.lon[0] && lon <= box.lon[1]) crosses = true;
    }
    if (crosses) m *= d.fuelMult ?? 1.15;
  }
  return m;
}

export function closeAirspace(state, name, weeks, fuelMult = 1.15) {
  const box = AIRSPACE[name];
  state.disruptions.push({ name: `${name} airspace closed`, airspace: name, codes: box.codes, factor: 0, weeks, fuelMult });
}

// ---------------------------------------------------------------------------
// Historical timeline

export function buildTimeline(state) {
  state.timeline = [];
  if (state.settings?.history === 'off') return;
  for (const h of HISTORY) {
    if (h.year < state.startYear || rand(state) > Math.min(1, h.p * Math.sqrt((state.settings?.events ?? 1)))) continue;
    const months = Math.round((rand(state) * 2 - 1) * h.jitter);
    const week = weekOfYearStart(h.year) + Math.round(((h.month - 1 + months) * 52) / 12);
    if (week <= state.week + 4) continue;
    state.timeline.push({ week, event: h.id, severity: 0.7 + rand(state) * 0.6 });
  }
  state.timeline.sort((a, b) => a.week - b.week);
}

export function timelineTick(state) {
  while (state.timeline?.length && state.timeline[0].week <= state.week) {
    const t = state.timeline.shift();
    state.queue.push({ event: t.event, data: { severity: t.severity } });
  }
}

export function tickShockRegions(state, a, b) {
  let m = 1;
  for (const s of state.macro.shocks) if (s.regions && (s.regions.includes(airportByCode[a].region) || s.regions.includes(airportByCode[b].region))) m *= s.mult;
  return m;
}
