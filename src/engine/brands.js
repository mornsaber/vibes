// Group brands (mainline plus low-cost, regional and premium subsidiaries),
// liveries, and marketing campaigns. Brands share the group's fleet, staff and
// finances but each has its own reputation, service standards and fares.

import { CLASSES } from '../data/aircraft.js';
import { clamp, sum, fail, ok, log, money, newId } from './core.js';
import { fareNow } from './market.js';

export const BRAND_KINDS = {
  main: { label: 'Mainline', desc: 'Your flagship full-service brand.' },
  lcc: {
    label: 'Low-cost', desc: 'No-frills: cheaper crew, direct sales and fees for extras. Wins price-sensitive travellers, loses business ones.',
    service: { catering: 1, comfort: 2, ground: 2, baggage: 1, security: 3, loyalty: 1 }, fareIdx: 0.8,
    appeal: { adv: 1.15, flex: 0.8, premium: 0.6 }, cost: { handling: 0.75, distribution: 0.4, service: 0.6, crew: 0.85 }, ancillary: 10, maxDistance: 5500,
  },
  regional: {
    label: 'Regional feeder', desc: 'Lower-cost crews on a separate scope agreement fly thin routes into your hubs. Connecting passengers like the seamless feed.',
    fareIdx: 1, appeal: { connect: 1.08 }, cost: { handling: 0.9, crew: 0.8, maintenance: 0.92 }, maxDistance: 2500,
  },
  premium: {
    label: 'Premium boutique', desc: 'Upmarket service at higher fares. Business travellers pay for it; leisure ones look elsewhere.',
    serviceBoost: 1, fareIdx: 1.15, appeal: { premium: 1.12, flex: 1.05, adv: 0.9 }, cost: { service: 1.3 },
  },
};
export const BRAND_LAUNCH_COST = 3e6;
export const BRAND_WEEKLY = 25e3;

export const LIVERY_PATTERNS = { solid: 'Solid tail', stripe: 'Cheatline stripe', split: 'Split tail', band: 'Diagonal band', dots: 'Spotted' };
export const LOGOS = ['✈', '★', '◆', '●', '▲', '☀', '❖', '✦', '⚡', '♛', '✿', '⬢', '❄', '☘'];
export const defaultLivery = (color) => ({ pattern: 'stripe', color2: '#ffffff', logo: '✈', color });

// The mainline brand is full-service unless the airline was founded as a low-cost carrier.
export const mainBrand = (state) => ({
  id: 'main', kind: state.airline.model === 'lcc' ? 'lcc' : 'main', name: state.airline.name, code: state.airline.code,
  color: state.airline.color, livery: state.airline.livery ?? defaultLivery(state.airline.color),
});
export const brands = (state) => [mainBrand(state), ...(state.brands ?? [])];
export const brandById = (state, id) => (!id || id === 'main' ? mainBrand(state) : state.brands?.find((b) => b.id === id) ?? mainBrand(state));
export const brandOf = (state, route) => brandById(state, route.brand);
export const brandKind = (b) => BRAND_KINDS[b.kind] ?? BRAND_KINDS.main;
export const brandRep = (state, b) => (b.id === 'main' ? state.reputation : b.rep);
export function brandService(state, b) {
  if (b.id === 'main') return state.service;
  const k = brandKind(b);
  if (k.service) return k.service;
  if (k.serviceBoost) return Object.fromEntries(Object.entries(state.service).map(([key, v]) => [key, clamp(v + k.serviceBoost, 1, 5)]));
  return state.service;
}

export function launchBrand(state, { name, code, kind = 'lcc', color = '#f5a524', rep } = {}) {
  if (!BRAND_KINDS[kind] || kind === 'main') return fail('Pick a brand type');
  name = String(name ?? '').trim();
  if (!name) return fail('Name the brand');
  if ((state.brands ?? []).length >= 4) return fail('Four subsidiary brands is plenty');
  if (rep == null && state.cash < BRAND_LAUNCH_COST) return fail(`Launching a brand costs ${money(BRAND_LAUNCH_COST)}`);
  if (rep == null) {
    state.cash -= BRAND_LAUNCH_COST;
    state.ledgerCapex.other += BRAND_LAUNCH_COST;
  }
  const brand = {
    id: newId(state, 'br'), kind, name, code: String(code || name).toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(2, 'X').slice(0, 2),
    color, livery: { ...defaultLivery(color), pattern: kind === 'lcc' ? 'split' : 'stripe' }, rep: rep ?? clamp(state.reputation - 10, 20, 70), founded: state.week,
  };
  (state.brands ??= []).push(brand);
  log(state, `Launched ${brand.name}, a ${BRAND_KINDS[kind].label.toLowerCase()} brand. Move routes onto it from Management › Subsidiaries or a route page.`, 'good', 'brand');
  return ok({ brand });
}

export function setRouteBrand(state, routeId, brandId) {
  const route = state.routes.find((r) => r.id === routeId);
  if (!route) return fail('No such route');
  const b = brandById(state, brandId);
  const k = brandKind(b);
  if (k.maxDistance && route.distance > k.maxDistance) return fail(`${b.name} only flies routes up to ${k.maxDistance.toLocaleString()} km`);
  route.brand = b.id === 'main' ? undefined : b.id;
  const idx = k.fareIdx ?? 1;
  for (const c of CLASSES) route.fares[c] = Math.round(fareNow(state, route.distance, c) * idx);
  return ok();
}

export function closeBrand(state, brandId) {
  const b = state.brands?.find((x) => x.id === brandId);
  if (!b) return fail('No such brand');
  for (const r of state.routes.filter((x) => x.brand === brandId)) setRouteBrand(state, r.id, 'main');
  state.brands = state.brands.filter((x) => x !== b);
  state.campaigns = (state.campaigns ?? []).filter((c) => c.brand !== brandId);
  log(state, `${b.name} has been folded back into ${state.airline.name}.`, 'info', 'brand');
  return ok();
}

// ---------------------------------------------------------------------------
// Liveries: repainting costs money unless a brand relaunch is running.

const REPAINT = { tiny: 20e3, small: 60e3, narrow: 150e3, wide: 300e3, jumbo: 400e3 };
export const repaintCost = (state, typeOf) => sum(state.fleet, (a) => REPAINT[typeOf(a).mx] ?? 150e3);

export function setLivery(state, brandId, livery, typeOf) {
  const b = brandById(state, brandId);
  const next = { ...b.livery, ...livery };
  if (!LIVERY_PATTERNS[next.pattern]) return fail('Unknown livery pattern');
  const free = (state.campaigns ?? []).some((c) => c.id === 'relaunch' && (c.brand ?? 'main') === b.id);
  const fleetShare = b.id === 'main' ? 1 : 0.3;
  const cost = free ? 0 : repaintCost(state, typeOf) * fleetShare;
  if (state.cash < cost) return fail(`Repainting costs ${money(cost)}`);
  state.cash -= cost;
  state.ledgerCapex.other += cost;
  if (b.id === 'main') {
    state.airline.livery = next;
    state.airline.color = next.color ?? state.airline.color;
  } else {
    const real = state.brands.find((x) => x.id === b.id);
    real.livery = next;
    real.color = next.color ?? real.color;
  }
  log(state, `${b.name} unveils a new livery${cost ? ` (${money(cost)} to repaint the fleet)` : ' as part of its relaunch'}.`, 'info', 'brand');
  return ok();
}

// ---------------------------------------------------------------------------
// Marketing campaigns

export const CAMPAIGNS = {
  sale: { name: 'Fare sale', desc: 'Advance fares 15% cheaper: fills empty seats but dilutes yield.', cost: 1.2e6, weeks: 6, advFare: 0.85, adv: 1.08 },
  business: { name: 'Corporate sales drive', desc: 'Account managers chase company travel budgets: more flexible and premium demand.', cost: 2.5e6, weeks: 13, flex: 1.1, premium: 1.08 },
  loyalty: { name: 'Double-miles promotion', desc: 'Frequent flyers earn double points: loyal flexible travellers book with you (small cost per passenger).', cost: 0.8e6, weeks: 13, flex: 1.06, premium: 1.05, perPax: 2 },
  sponsorship: { name: 'Sports sponsorship', desc: 'Shirt and stadium sponsorship builds awareness for a year.', cost: 10e6, weeks: 52, all: 1.03, rep: 4 },
  relaunch: { name: 'Brand relaunch', desc: 'New identity, new ads, and a free repaint into a new livery during the campaign.', cost: 7e6, weeks: 26, all: 1.05, rep: 6 },
  routes: { name: 'New-route launch ads', desc: 'Advertise routes opened in the last 6 months: +15% demand on them.', cost: 0.6e6, weeks: 8, newRoutes: 1.15 },
};
export const campaignCost = (state, id) => CAMPAIGNS[id].cost * clamp(0.4 + state.routes.length / 25, 0.4, 3);

export function startCampaign(state, id, brandId = 'main') {
  const c = CAMPAIGNS[id];
  if (!c) return fail('Unknown campaign');
  const b = brandById(state, brandId);
  if ((state.campaigns ?? []).some((x) => x.id === id && (x.brand ?? 'main') === b.id)) return fail('That campaign is already running');
  const cost = campaignCost(state, id);
  if (state.cash < cost) return fail(`${c.name} costs ${money(cost)}`);
  state.cash -= cost;
  state.weekCosts.campaigns = (state.weekCosts.campaigns ?? 0) + cost;
  (state.campaigns ??= []).push({ id, brand: b.id, weeksLeft: c.weeks, startWeek: state.week });
  log(state, `${b.name}: ${c.name} launched (${money(cost)}, ${c.weeks} weeks).`, 'info', 'brand');
  return ok();
}

// Demand multipliers for a brand this week. newRoute: route opened < 26 weeks ago.
export function campaignEffect(state, brandId = 'main', newRoute = false) {
  const e = { all: 1, adv: 1, flex: 1, premium: 1, advFare: 1, perPax: 0 };
  for (const x of state.campaigns ?? []) {
    if ((x.brand ?? 'main') !== brandId) continue;
    const c = CAMPAIGNS[x.id];
    for (const k of ['all', 'adv', 'flex', 'premium', 'advFare']) if (c[k]) e[k] *= c[k];
    if (c.newRoutes && newRoute) e.all *= c.newRoutes;
    e.perPax += c.perPax ?? 0;
  }
  return e;
}

export function campaignTick(state) {
  for (const x of state.campaigns ?? []) {
    const c = CAMPAIGNS[x.id];
    if (c.rep) {
      const b = brandById(state, x.brand);
      if (b.id === 'main') state.reputation = clamp(state.reputation + c.rep / c.weeks, 0, 100);
      else state.brands.find((y) => y.id === b.id).rep = clamp(b.rep + c.rep / c.weeks, 0, 100);
    }
    x.weeksLeft -= 1;
    if (x.weeksLeft <= 0) log(state, `${c.name} for ${brandById(state, x.brand).name} has ended.`, 'info', 'brand');
  }
  state.campaigns = (state.campaigns ?? []).filter((x) => x.weeksLeft > 0);
}

// Subsidiary reputations drift toward their own product and punctuality,
// with a halo from the parent.
export function brandTick(state, serviceAppeal) {
  for (const b of state.brands ?? []) {
    const legs = state.routes.filter((r) => r.brand === b.id && r.last?.flights);
    const flights = sum(legs, (r) => r.last.flights);
    const otp = flights ? sum(legs, (r) => r.last.otp * r.last.flights) / flights : 0.85;
    const target = clamp(40 + (serviceAppeal(state, false, brandService(state, b)) - 1) * 150 + (otp - 0.8) * 80 + (state.reputation - 50) * 0.3 + (b.kind === 'lcc' ? 8 : 0), 5, 95);
    b.rep = clamp(b.rep + (target - b.rep) * 0.04, 0, 100);
  }
}

// Weekly result per brand from route results.
export function brandResults(state) {
  return brands(state).map((b) => {
    const rs = state.routes.filter((r) => (r.brand ?? 'main') === b.id);
    const v = (f) => sum(rs, (r) => (r.last ? f(r.last) : 0));
    const seats = v((l) => l.seatTotal);
    const pax = v((l) => l.paxTotal);
    return { brand: b, routes: rs.length, pax, seats, lf: seats ? pax / seats : 0, revenue: v((l) => l.totalRevenue), profit: v((l) => l.profit ?? 0), rep: brandRep(state, b) };
  });
}
