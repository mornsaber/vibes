import { G, esc, money, pct, int, num, kpi, panel, table, tabs, pill, ap, typeName, tonnes, statusPill, bar } from '../util.js';
import { formValues } from '../app.js';

export function render(c, embedded = false) {
  const tab = c.params[0] ?? 'overview';
  const body = { overview, network, fleet }[tab] ?? overview;
  if (embedded) return `${overview(c)}<p><a href="#cargo">Open the Cargo section ›</a></p>`;
  return `<div class="page-head"><h1>Cargo</h1></div>${tabs('cargo', [['overview', 'Overview'], ['network', 'Network'], ['fleet', 'Fleet']], tab)}${body(c)}`;
}

const freighters = (s) => s.fleet.filter((a) => G.typeOf(a).cat === 'freighter');

function overview(c) {
  const s = c.state;
  const r = s.lastReport;
  const routes = s.routes.filter((x) => x.last?.cargoCap);
  const cap = routes.reduce((t, x) => t + x.last.cargoCap, 0);
  const kg = routes.reduce((t, x) => t + x.last.cargoKg, 0);
  const bellyCap = s.routes.reduce((t, x) => t + G.routeCapacity(s, x).C, 0) * 2;
  const top = [...routes].sort((a, b) => b.last.cargoRev - a.last.cargoRev).slice(0, 10);
  return `<div class="grid kpis">
    ${kpi('Cargo revenue / wk', money(r?.revenue.cargo ?? 0))}
    ${kpi('Tonnes / wk', tonnes(kg))}
    ${kpi('Cargo load factor', cap ? pct(kg / cap) : '–')}
    ${kpi('Freighters', freighters(s).length)}
    ${kpi('Share of revenue', r?.totalRevenue ? pct((r.revenue.cargo) / r.totalRevenue, 1) : '–')}
  </div>
  ${panel('Top cargo routes', table(top, [
    { h: 'Route', v: (x) => `<a href="#routes/${x.id}">${x.a}–${x.b}</a>` },
    { h: 'Capacity', cls: 'num', v: (x) => tonnes(x.last.cargoCap) },
    { h: 'Carried', cls: 'num', v: (x) => tonnes(x.last.cargoKg) },
    { h: 'Load', v: (x) => bar(x.last.cargoLf, 1) },
    { h: 'Revenue', cls: 'num', v: (x) => money(x.last.cargoRev) },
    { h: 'Rate', cls: 'num', v: (x) => `$${(G.refCargoRate(x.distance) * x.cargoIdx).toFixed(2)}/kg` },
  ], { empty: 'No cargo carried yet. Every passenger aircraft carries belly cargo once it flies.' }))}
  <p class="muted small">Planned capacity across the network: ${tonnes(bellyCap)} per week. Integrators (FedEx, UPS, DHL) and widebody passenger airlines compete for freight.</p>`;
}

function network(c) {
  const s = c.state;
  const opps = [];
  for (const h of s.hubs) for (const x of G.AIRPORTS) if (x.code !== h.code && x.cargo >= 1.2 && G.trafficRights(s, h.code, x.code).ok) opps.push({ a: h.code, b: x.code, t: G.cargoMarket(h.code, x.code) * 2, d: G.distanceKm(h.code, x.code) });
  opps.sort((p, q) => q.t * G.refCargoRate(q.d) - p.t * G.refCargoRate(p.d));
  return `${panel('Cargo on your routes', table(s.routes, [
    { h: 'Route', v: (x) => `<a href="#routes/${x.id}">${x.a}–${x.b}</a>` },
    { h: 'Market', cls: 'num', v: (x) => tonnes(G.cargoMarket(x.a, x.b) * 2000) },
    { h: 'Capacity', cls: 'num', v: (x) => tonnes(x.last?.cargoCap ?? 0) },
    { h: 'Carried', cls: 'num', v: (x) => tonnes(x.last?.cargoKg ?? 0) },
    { h: 'Revenue', cls: 'num', v: (x) => money(x.last?.cargoRev ?? 0) },
    { h: 'Rate index', v: (x) => `<div class="row" data-form><input type="number" name="idx" value="${x.cargoIdx}" step="0.05" min="0.5" max="2" class="w-70"><button class="small" data-action="cargo-rate" data-id="${x.id}">Set</button></div>` },
  ]))}
  ${panel('Biggest freight markets from your hubs', table(opps.slice(0, 15), [
    { h: 'Market', v: (o) => `<b>${o.a}–${o.b}</b> <small class="muted">${esc(ap(o.b).city)}</small>` },
    { h: 'Km', cls: 'num', v: (o) => int(o.d) },
    { h: 'Freight market', cls: 'num', v: (o) => `${int(o.t)} t/wk` },
    { h: 'Rate', cls: 'num', v: (o) => `$${G.refCargoRate(o.d).toFixed(2)}/kg` },
    { h: 'Flown', v: (o) => (s.routes.some((r) => G.pairKey(r.a, r.b) === G.pairKey(o.a, o.b)) ? pill('Yes', 'good') : '') },
  ]))}`;
}

function fleet(c) {
  const s = c.state;
  const fr = freighters(s);
  const convertible = s.fleet.filter((a) => G.CONVERSIONS[a.type]);
  const offers = s.market.leases.filter((o) => G.aircraftById[o.type].cat === 'freighter');
  const used = s.market.used.filter((o) => G.aircraftById[o.type].cat === 'freighter');
  return `${panel('Freighter fleet', table(fr, [
    { h: 'Aircraft', v: (a) => `<a href="#fleet/ac/${a.id}">${a.reg}</a> <small class="muted">${esc(typeName(a.type))}</small>` },
    { h: 'Payload', cls: 'num', v: (a) => `${G.typeOf(a).cargoT} t` },
    { h: 'Status', v: (a) => statusPill(s, a) },
    { h: 'Routes', v: (a) => a.schedule.map((x) => { const r = G.routeById(s, x.routeId); return `${r.a}–${r.b}×${x.freq}`; }).join(', ') || '—' },
  ], { empty: 'No freighters. Lease, buy or convert one below.' }))}
  <div class="grid cols-2">
    ${panel('Freighters for lease', table(offers, [
      { h: 'Type', v: (o) => `${esc(typeName(o.type))} <small class="muted">${o.age ? `${o.age} y` : 'new'}</small>` },
      { h: 'Rent', cls: 'num', v: (o) => `${money(o.monthly)}/mo` },
      { h: 'Delivery', v: (o) => `${o.lead} wk` },
      { h: '', v: (o) => `<button class="small" data-action="lease-offer" data-id="${o.id}">Lease</button>` },
    ], { empty: 'No freighter leases this month.' }))}
    ${panel('Used freighters', table(used, [
      { h: 'Type', v: (o) => `${esc(typeName(o.type))} <small class="muted">${o.age} y</small>` },
      { h: 'Price', cls: 'num', v: (o) => money(o.price) },
      { h: '', v: (o) => `<button class="small" data-action="buy-used" data-id="${o.id}">Buy</button>` },
    ], { empty: 'None for sale.' }))}
  </div>
  ${panel('Conversion candidates (P2F)', table(convertible, [
    { h: 'Aircraft', v: (a) => `<a href="#fleet/ac/${a.id}">${a.reg}</a> ${esc(typeName(a.type))}` },
    { h: 'Age', cls: 'num', v: (a) => `${num(G.ageYears(s, a), 1)} y` },
    { h: 'Becomes', v: (a) => esc(typeName(G.CONVERSIONS[a.type].to)) },
    { h: 'Eligible', v: (a) => (G.ageYears(s, a) >= G.CONVERSIONS[a.type].minAgeYears && a.owned ? pill('Yes', 'good') : pill(`From ${G.CONVERSIONS[a.type].minAgeYears} y, owned`, 'warn')) },
    { h: '', v: (a) => `<button class="small" data-action="convert" data-id="${a.id}">Convert (${money(G.CONVERSIONS[a.type].cost)})</button>` },
  ], { empty: 'No convertible types (A321neo after 10 years, 777-300ER after 12).' }))}
  <p class="muted small">Order new freighters (777F, A350F, 767-300F, ATR 72F) under <a href="#fleet/market">Fleet › Acquire aircraft</a>.</p>`;
}

export const actions = {};
export { formValues };
