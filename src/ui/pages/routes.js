import { G, esc, money, pct, int, num, kpi, panel, table, statement, airportOptions, options, pill, ap, apName, typeName, signed, lineChart, sparkline, tonnes } from '../util.js';
import { formValues } from '../app.js';

const CLASS_NAMES = { F: 'First', J: 'Business', W: 'Premium Eco', Y: 'Economy' };

export function render(c) {
  const { state: s, params } = c;
  if (params[0] && params[0] !== 'new') {
    const route = s.routes.find((r) => r.id === params[0]);
    if (route) return detail(c, route);
  }
  return list(c);
}

// ---------------------------------------------------------------------------

export function plannerPanel(c) {
  const s = c.state;
  const plan = (c.ui.plan ??= { from: s.hubs[0].code, to: '' });
  const served = G.stations(s);
  let body = '';
  if (plan.from && plan.to && plan.from !== plan.to) body = routePreview(s, plan.from, plan.to);
  return panel('Open a new route', `<div class="row wrap" data-form>
      <select data-change="plan-from">${airportOptions(served, plan.from)}</select>
      <span>→</span>
      <select data-change="plan-to">${airportOptions(G.AIRPORTS.map((a) => a.code).filter((x) => x !== plan.from), plan.to, 'Destination…')}</select>
      <a class="small muted" href="#markets/analyst">Market analyst ›</a>
    </div>${body}`);
}

export function routePreview(s, a, b) {
  const d = G.distanceKm(a, b);
  const rights = G.trafficRights(s, a, b);
  const exists = s.routes.find((r) => G.pairKey(r.a, r.b) === G.pairKey(a, b));
  const market = G.marketNow(s, a, b) * 2;
  const shares = G.classShares(a, b);
  const rivals = G.rivalsOn(s, a, b);
  const cost = rights.ok ? G.routeOpenCost(s, a, b) : 0;
  const able = s.fleet.filter((ac) => G.typeOf(ac).range >= d && [a, b].every((x) => ap(x).runway >= G.typeOf(ac).runway));
  const slotNotes = [a, b].map((x) => G.slotInfo(s, x)).map((info, i) => (info ? `${[a, b][i]}: ${info.held - info.used} spare slot pairs, ${info.pool} for sale at ${money(info.price)}` : null)).filter(Boolean);
  return `<div class="grid cols-2 tight">
    ${statement([
      ['Distance', `${int(d)} km`],
      ['Market (all airlines, both ways)', `~${int(market)} pax/wk`],
      ['Cargo market', `~${int(G.cargoNow(s, a, b) * 2)} t/wk`],
      ['Cabin demand', `F ${pct(shares.F, 1)} · J ${pct(shares.J, 1)} · W ${pct(shares.W)} · Y ${pct(shares.Y)}`],
      ['Economy reference fare', `$${G.fareNow(s, d, 'Y')}`],
      ['Business reference fare', `$${G.fareNow(s, d, 'J')}`],
      ['Traffic rights', rights.ok ? (rights.fifth ? '<span class="warn">Fifth freedom permit</span>' : 'Granted') : `<span class="bad">${esc(rights.reason)}</span>`],
      ['Launch cost', rights.ok ? money(cost) : '–'],
    ])}
    <div>
      <h3>Competition</h3>
      ${rivals.length ? `<ul class="plain">${rivals.map((r) => `<li>${esc(G.rivalById[r.id].name)} <span class="muted">${G.RIVAL_TYPES[G.rivalById[r.id].type].label}${r.nonstop ? ' · nonstop' : ` · via ${r.via ?? 'hub'}`}</span></li>`).join('')}</ul>` : '<p class="good">No rival flies this market.</p>'}
      <h3>Your aircraft able to fly it</h3>
      <p class="small">${able.length ? able.map((x) => x.reg).join(', ') : '<span class="muted">None in the fleet</span>'}</p>
      ${slotNotes.length ? `<p class="small warn">${slotNotes.join('<br>')}</p>` : ''}
      <button class="primary" data-action="open-route" data-a="${a}" data-b="${b}" ${!rights.ok || exists ? 'disabled' : ''}>${exists ? 'Already flown' : `Launch route (${money(cost)})`}</button>
    </div>
  </div>`;
}

function list(c) {
  const s = c.state;
  const sort = c.ui.routeSort ?? 'profit';
  const sorters = {
    profit: (r) => -(r.last?.profit ?? 0),
    revenue: (r) => -(r.last?.totalRevenue ?? 0),
    lf: (r) => -(r.last?.lf ?? 0),
    distance: (r) => -r.distance,
    name: (r) => `${r.a}${r.b}`,
  };
  const rows = [...s.routes].sort((x, y) => (sorters[sort](x) < sorters[sort](y) ? -1 : 1));
  const tot = s.lastReport;
  return `<div class="page-head"><h1>Routes</h1><div class="row">Sort by <select data-change="route-sort">${options([['profit', 'Profit'], ['revenue', 'Revenue'], ['lf', 'Load factor'], ['distance', 'Distance'], ['name', 'Name']], sort)}</select></div></div>
  <div class="grid kpis">
    ${kpi('Routes', s.routes.length)}
    ${kpi('Weekly flights', int(tot?.flights ?? 0))}
    ${kpi('Passengers / wk', int(tot?.pax ?? 0))}
    ${kpi('Load factor', tot ? pct(tot.lf) : '–')}
    ${kpi('On-time', tot?.flights ? pct(tot.otp) : '–')}
  </div>
  ${plannerPanel(c)}
  ${panel('All routes', table(rows, [
    { h: 'Route', v: (r) => `<a href="#routes/${r.id}"><b>${r.a}–${r.b}</b></a><br><small class="muted">${esc(ap(r.a).city)} – ${esc(ap(r.b).city)}</small>` },
    { h: 'Km', cls: 'num', v: (r) => int(r.distance) },
    { h: 'Freq/wk', cls: 'num', v: (r) => num(r.last?.freq ?? G.routeFreq(s, r), 1) },
    { h: 'Seats', cls: 'num', v: (r) => int(r.last?.seatTotal ?? 0) },
    { h: 'Pax', cls: 'num', v: (r) => int(r.last?.paxTotal ?? 0) },
    { h: 'Load', cls: 'num', v: (r) => (r.last?.seatTotal ? pct(r.last.lf) : '–') },
    { h: 'Share', cls: 'num', v: (r) => (r.last ? pct(r.last.share) : '–') },
    { h: 'Price', cls: 'num', v: (r) => pct(G.priceIndex(s, r)) },
    { h: 'Revenue', cls: 'num', v: (r) => money(r.last?.totalRevenue ?? 0) },
    { h: 'Profit', cls: 'num', v: (r) => signed(r.last?.profit ?? 0) },
    { h: 'Trend', v: (r) => sparkline((r.hist ?? []).map((h) => h.profit)) },
  ], { empty: 'No routes yet — launch one above.' }))}`;
}

// ---------------------------------------------------------------------------

function detail(c, route) {
  const s = c.state;
  const l = route.last;
  const rivals = G.rivalsOn(s, route.a, route.b);
  const planned = G.routeCapacity(s, route);
  const aircraft = G.routeAircraft(s, route);
  const candidates = s.fleet.filter((ac) => !aircraft.includes(ac) && G.canOperate(s, ac, route).ok && G.maxFrequency(s, ac, route) > 0);
  const classes = G.CLASSES.filter((k) => planned[k] > 0 || (l?.seats?.[k] ?? 0) > 0 || k === 'Y' || k === 'J');
  return `<div class="page-head"><h1><a href="#routes" class="muted">Routes ›</a> ${route.a}–${route.b}</h1>
    <div class="row"><span class="muted">${esc(apName(route.a))} ⇄ ${esc(apName(route.b))} · ${int(route.distance)} km${route.fifth ? ' · 5th freedom' : ''}</span>
    <button class="danger small" data-action="close-route" data-id="${route.id}">Close route</button></div></div>
  <div class="grid kpis">
    ${kpi('Passengers / wk', int(l?.paxTotal ?? 0), { sub: l ? `${int(l.local)} local · ${int(l.connecting)} connecting` : '' })}
    ${kpi('Load factor', l?.seatTotal ? pct(l.lf) : '–', { sub: `${int(l?.seatTotal ?? 0)} seats` })}
    ${kpi('Revenue / wk', money(l?.totalRevenue ?? 0), { sub: l ? `Yield ${(l.yield * 100).toFixed(1)}¢/km` : '' })}
    ${kpi('Profit / wk', money(l?.profit ?? 0), { cls: (l?.profit ?? 0) < 0 ? 'bad' : 'good', sub: `Contribution ${money(l?.contribution ?? 0)}` })}
    ${kpi('On-time', l?.flights ? pct(l.otp) : '–', { sub: `Market share ${l ? pct(l.share) : '–'}` })}
  </div>
  <div class="grid cols-2">
    ${panel('Cabins & fares', `<div data-form>${table(classes, [
      { h: 'Cabin', v: (k) => CLASS_NAMES[k] },
      { h: 'Seats/wk', cls: 'num', v: (k) => int(planned[k] * 2) },
      { h: 'Demand', cls: 'num', v: (k) => int(l?.demand?.[k] ?? 0) },
      { h: 'Pax', cls: 'num', v: (k) => int(l?.pax?.[k] ?? 0) },
      { h: 'Load', cls: 'num', v: (k) => (l?.seats?.[k] ? pct(l.pax[k] / l.seats[k]) : '–') },
      { h: 'Fare', v: (k) => `<input type="number" name="fare_${k}" value="${route.fares[k]}" min="1" step="5" class="w-90">` },
      { h: 'Ref', cls: 'num muted', v: (k) => `$${G.fareNow(s, route.distance, k)}` },
    ])}
    <div class="row wrap">
      <button class="primary small" data-action="save-fares" data-id="${route.id}">Save fares</button>
      <span class="muted small">Quick price level:</span>
      ${[0.8, 0.9, 1, 1.1, 1.2].map((x) => `<button class="small" data-action="price-index" data-id="${route.id}" data-x="${x}">${Math.round(x * 100)}%</button>`).join('')}
    </div></div>`)}
    ${panel('Aircraft & frequencies', `${table(aircraft, [
      { h: 'Aircraft', v: (ac) => `<a href="#fleet/ac/${ac.id}">${ac.reg}</a><br><small class="muted">${esc(typeName(ac.type))}</small>` },
      { h: 'Layout', v: (ac) => G.CLASSES.filter((k) => ac.config[k]).map((k) => `${k}${ac.config[k]}`).join(' ') || 'Freighter' },
      { h: 'Round trips/wk', v: (ac) => `<div class="row" data-form><input type="number" name="freq" min="0" max="${G.maxFrequency(s, ac, route)}" value="${ac.schedule.find((x) => x.routeId === route.id).freq}" class="w-70"><button class="small" data-action="set-freq" data-ac="${ac.id}" data-route="${route.id}">Set</button></div><small class="muted">max ${G.maxFrequency(s, ac, route)}</small>` },
      { h: 'Status', v: (ac) => pill(G.statusOf(s, ac).label, G.statusOf(s, ac).tone) },
      { h: '', v: (ac) => `<button class="small danger" data-action="unassign" data-ac="${ac.id}" data-route="${route.id}">Remove</button>` },
    ], { empty: 'No aircraft assigned.' })}
    <div class="row wrap" data-form>
      <select name="ac">${options(candidates.map((ac) => [ac.id, `${ac.reg} · ${typeName(ac.type)} · up to ${G.maxFrequency(s, ac, route)}/wk`]), '', { blank: candidates.length ? 'Add aircraft…' : 'No aircraft with spare hours can fly this' })}</select>
      <input type="number" name="freq" placeholder="max" min="1" class="w-70">
      <button class="primary small" data-action="add-ac" data-route="${route.id}" ${candidates.length ? '' : 'disabled'}>Assign</button>
    </div>
    <p class="muted small">Round-trip block ${l?.flights ? num((l.hours / l.flights) * 2, 1) : '–'} h. Frequencies need slots at congested airports — bought automatically when available.</p>`)}
  </div>
  <div class="grid cols-3">
    ${panel('Weekly economics', l ? statement([
      ['Passenger revenue', money(l.ticket)],
      ['Ancillary', money(l.ancillary)],
      ['Cargo revenue', money(l.cargoRev)],
      ['—'],
      ['Fuel', money(-l.cost.fuel)],
      ['Maintenance', money(-l.cost.maintenance)],
      ['Landing & navigation', money(-(l.cost.landing + l.cost.navigation))],
      ['Passenger fees & handling', money(-(l.cost.paxFees + l.cost.handling))],
      ['Onboard service', money(-l.cost.service)],
      ['Distribution & codeshare', money(-(l.cost.distribution + l.cost.codeshare))],
      ['Delays & crew travel', money(-(l.cost.delays + l.cost.crewTravel))],
      ['Contribution', signed(l.contribution), 'total'],
      ['Crew salaries (allocated)', money(-l.crewCost)],
      ['Aircraft ownership (allocated)', money(-l.ownership)],
      ['Route profit', signed(l.profit), 'total'],
    ]) : '<p class="muted">Results appear after the first week of flying.</p>')}
    ${panel('Competition', `${rivals.length ? table(rivals, [
      { h: 'Airline', v: (r) => `<a href="#competitors/${r.id}">${esc(G.rivalById[r.id].name)}</a>` },
      { h: 'Type', v: (r) => G.RIVAL_TYPES[G.rivalById[r.id].type].label },
      { h: 'Service', v: (r) => (r.nonstop ? 'Nonstop' : `Via ${r.via ?? 'hub'}`) },
      { h: 'Fares', cls: 'num', v: (r) => pct(G.RIVAL_TYPES[G.rivalById[r.id].type].fare * r.fare) },
      { h: 'Capacity', cls: 'num', v: (r) => pct(r.cap) },
    ]) : '<p class="good">You have this market to yourself.</p>'}`)}
    ${panel('Cargo', `${statement([
      ['Capacity / wk', tonnes(l?.cargoCap ?? planned.C * 2)],
      ['Carried / wk', tonnes(l?.cargoKg ?? 0)],
      ['Cargo load', l?.cargoCap ? pct(l.cargoLf) : '–'],
      ['Market rate', `$${G.refCargoRate(route.distance).toFixed(2)}/kg`],
    ])}<div class="row" data-form><label class="small">Rate index</label><input type="number" name="idx" value="${route.cargoIdx}" min="0.5" max="2" step="0.05" class="w-70"><button class="small" data-action="cargo-rate" data-id="${route.id}">Set</button></div>`)}
  </div>
  ${panel('Last 26 weeks', `${lineChart([{ values: (route.hist ?? []).map((h) => h.profit), cls: 'profit' }])}<div class="legend"><span><i class="sw profit"></i>Weekly route profit</span></div>`)}`;
}

// ---------------------------------------------------------------------------

export const actions = {
  'open-route'(el, ctx) {
    const res = G.openRoute(ctx.game, el.dataset.a, el.dataset.b);
    if (res.ok) {
      ctx.ui.plan = { from: ctx.ui.plan?.from ?? el.dataset.a, to: '' };
      location.hash = `#routes/${res.route.id}`;
      return { ok: true, message: 'Route launched. Assign aircraft to start flying.' };
    }
    return res;
  },
  'close-route'(el, ctx) {
    if (!confirm('Close this route? Its aircraft will be freed (slots are kept).')) return;
    const res = G.closeRoute(ctx.game, el.dataset.id);
    if (res.ok) location.hash = '#routes';
    return res;
  },
  'save-fares'(el, ctx) {
    const v = formValues(el);
    for (const k of G.CLASSES) if (v[`fare_${k}`] != null) G.setFare(ctx.game, el.dataset.id, k, v[`fare_${k}`]);
    return { ok: true, message: 'Fares updated.' };
  },
  'price-index': (el, ctx) => G.setPriceIndex(ctx.game, el.dataset.id, Number(el.dataset.x)),
  'set-freq': (el, ctx) => G.setFrequency(ctx.game, el.dataset.ac, el.dataset.route, formValues(el).freq),
  unassign: (el, ctx) => G.setFrequency(ctx.game, el.dataset.ac, el.dataset.route, 0),
  'add-ac'(el, ctx) {
    const v = formValues(el);
    if (!v.ac) return { ok: false, error: 'Pick an aircraft' };
    const max = G.maxFrequency(ctx.game, ctx.game.fleet.find((a) => a.id === v.ac), ctx.game.routes.find((r) => r.id === el.dataset.route));
    return G.setFrequency(ctx.game, v.ac, el.dataset.route, v.freq ? Number(v.freq) : max);
  },
  'cargo-rate': (el, ctx) => G.setCargoRate(ctx.game, el.dataset.id, formValues(el).idx),
};

export const changes = {
  'plan-from': (el, ctx) => {
    ctx.ui.plan = { ...(ctx.ui.plan ?? {}), from: el.value };
    if (ctx.ui.plan.to === el.value) ctx.ui.plan.to = '';
  },
  'plan-to': (el, ctx) => (ctx.ui.plan = { ...(ctx.ui.plan ?? {}), to: el.value }),
  'route-sort': (el, ctx) => (ctx.ui.routeSort = el.value),
};
