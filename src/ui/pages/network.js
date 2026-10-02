import { G, esc, money, pct, int, num, kpi, panel, table, tabs, pill, ap, signed, hbars, usd, nominal, fromNominal } from '../util.js';
import { worldMap } from '../map.js';
import { hubsPanel } from './planning.js';

export function render(c) {
  const tab = c.params[0] ?? 'overview';
  const body = { overview, hubs, flow, health, regulation }[tab] ?? overview;
  return `<div class="page-head"><h1>Network</h1></div>
  ${tabs('network', [['overview', 'Overview'], ['hubs', 'Hubs'], ['flow', 'Pax flow'], ['health', 'Health'], ['regulation', 'Regulation']], tab)}
  ${body(c)}`;
}

function overview(c) {
  const s = c.state;
  const r = s.lastReport;
  const st = G.stations(s);
  const countries = new Set(st.map((x) => ap(x).country)).size;
  const byRegion = Object.entries(st.reduce((m, x) => ((m[ap(x).region] = (m[ap(x).region] ?? 0) + 1), m), {})).map(([k, n]) => ({ label: G.REGIONS[k].name, value: n }));
  const top = [...s.routes].sort((a, b) => (b.last?.paxTotal ?? 0) - (a.last?.paxTotal ?? 0)).slice(0, 8);
  return `<div class="grid kpis">
    ${kpi('Destinations', st.length, { sub: `${countries} countries` })}
    ${kpi('Routes', s.routes.length)}
    ${kpi('ASK / wk', `${num((r?.ask ?? 0) / 1e6, 1)}M`)}
    ${kpi('RPK / wk', `${num((r?.rpk ?? 0) / 1e6, 1)}M`)}
    ${kpi('Connecting pax', r?.pax ? pct(r.connecting / r.pax) : '–', { sub: `${int(r?.flows ?? 0)} O&D markets sold` })}
  </div>
  <div class="grid cols-2">
    ${panel('Network map', `<a href="#map">${worldMap(s, {})}</a>`, { href: '#map' })}
    <div class="stack">
      ${panel('Destinations by region', hbars(byRegion))}
      ${panel('Busiest routes', table(top, [
        { h: 'Route', v: (x) => `<a href="#routes/${x.id}">${x.a}–${x.b}</a>` },
        { h: 'Pax/wk', cls: 'num', v: (x) => int(x.last?.paxTotal ?? 0) },
        { h: 'Load', cls: 'num', v: (x) => (x.last?.seatTotal ? pct(x.last.lf) : '–') },
        { h: 'Profit', cls: 'num', v: (x) => signed(x.last?.profit ?? 0) },
      ]))}
    </div>
  </div>`;
}

function hubs(c) {
  const s = c.state;
  const flows = s.lastReport?.topFlows ?? [];
  return `${hubsPanel(s)}
  <div class="grid cols-2">${s.hubs.map((h) => {
    const via = flows.filter((f) => f.via === h.code).slice(0, 10);
    return panel(`Top connections over ${h.code}`, table(via, [
      { h: 'Market', v: (f) => `${f.a}–${f.b}` },
      { h: 'Pax/wk', cls: 'num', v: (f) => int(f.pax) },
      { h: 'Revenue', cls: 'num', v: (f) => money(f.revenue) },
    ], { empty: 'No connecting traffic yet. Connections need two routes from the hub with a sensible detour (<50%).' }));
  }).join('')}</div>`;
}

function flow(c) {
  const s = c.state;
  const filter = c.ui.flowFilter ?? 'all';
  const flows = (s.lastReport?.topFlows ?? []).filter((f) => filter === 'all' || (filter === 'local' ? !f.via : !!f.via));
  const local = (s.lastReport?.topFlows ?? []).filter((f) => !f.via).reduce((t, f) => t + f.pax, 0);
  const conn = (s.lastReport?.topFlows ?? []).filter((f) => f.via).reduce((t, f) => t + f.pax, 0);
  return `<div class="grid kpis">${kpi('Local pax (top markets)', int(local))}${kpi('Connecting pax (top markets)', int(conn))}${kpi('Markets served', int(s.lastReport?.flows ?? 0))}</div>
  ${panel('Origin & destination flows (last week)', `<div class="row">${['all', 'local', 'connecting'].map((k) => `<button class="small ${filter === k ? 'primary' : ''}" data-action="flow-filter" data-f="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
  ${table(flows.slice(0, 80), [
    { h: 'Market', v: (f) => `<b>${f.a}–${f.b}</b> <small class="muted">${esc(ap(f.a).city)} – ${esc(ap(f.b).city)}</small>` },
    { h: 'Routing', v: (f) => (f.via ? `via ${f.via}` : 'Nonstop') },
    { h: 'Your demand', cls: 'num', v: (f) => int(f.demand) },
    { h: 'Carried', cls: 'num', v: (f) => int(f.pax) },
    { h: 'Spill', cls: 'num', v: (f) => `<span class="${f.demand - f.pax > 50 ? 'warn' : 'muted'}">${int(Math.max(0, f.demand - f.pax))}</span>` },
    { h: 'Revenue', cls: 'num', v: (f) => money(f.revenue) },
    { h: 'Avg fare', cls: 'num', v: (f) => (f.pax ? usd(f.revenue / f.pax) : '–') },
  ], { empty: 'Advance a week to see passenger flows.' })}`)}`;
}

export function diagnose(r) {
  const l = r.last;
  if (!l || !l.freq) return { tag: 'Unscheduled', tone: 'warn', advice: 'Assign aircraft or close the route.' };
  const margin = l.totalRevenue ? l.profit / l.totalRevenue : 0;
  if (l.profit > 0 && l.lf > 0.9) return { tag: 'Star', tone: 'good', advice: 'Full and profitable: raise fares 5–10% or add frequencies.' };
  if (l.profit > 0) return { tag: 'Healthy', tone: 'good', advice: margin > 0.15 ? 'Strong margin. Defend against entrants.' : 'Profitable. Watch costs.' };
  if (l.lf > 0.85) return { tag: 'Underpriced', tone: 'warn', advice: 'Planes are full but losing money: raise fares or use a larger/cheaper aircraft.' };
  if (l.lf < 0.6) return { tag: 'Overcapacity', tone: 'bad', advice: 'Too many seats: cut frequencies, downgauge, or lower fares to stimulate demand.' };
  return { tag: 'Loss maker', tone: 'bad', advice: 'Review fares, aircraft choice and competition — consider closing.' };
}

function health(c) {
  const s = c.state;
  const routes = s.routes.filter((r) => r.last);
  const W = 600;
  const H = 260;
  const margins = routes.map((r) => (r.last.totalRevenue ? r.last.profit / r.last.totalRevenue : -1));
  const lo = Math.min(-0.3, ...margins);
  const hi = Math.max(0.3, ...margins);
  const y = (m) => 10 + (1 - (m - lo) / (hi - lo)) * (H - 30);
  const x = (lf) => 30 + lf * (W - 40);
  const dots = routes.map((r, i) => `<a href="#routes/${r.id}"><circle class="${r.last.profit >= 0 ? 'pos' : 'neg'}" cx="${x(r.last.lf).toFixed(1)}" cy="${y(margins[i]).toFixed(1)}" r="${(4 + Math.sqrt(r.last.paxTotal) / 12).toFixed(1)}"><title>${r.a}–${r.b}: LF ${pct(r.last.lf)}, margin ${pct(margins[i])}</title></circle></a>`).join('');
  const scatter = `<svg class="chart scatter" viewBox="0 0 ${W} ${H}"><line class="zero" x1="30" x2="${W}" y1="${y(0)}" y2="${y(0)}"/><line class="grid-line" x1="${x(0.8)}" x2="${x(0.8)}" y1="0" y2="${H - 20}"/>${dots}<text class="axis" x="${W - 4}" y="${H - 4}" text-anchor="end">Load factor →</text><text class="axis" x="32" y="12">Margin ↑</text></svg>`;
  return `${panel('Route portfolio', `${scatter}<p class="muted small">Each bubble is a route (size = passengers). Top-right is where you want to be; bottom-left routes burn cash.</p>`)}
  ${panel('Diagnosis', table(s.routes, [
    { h: 'Route', v: (r) => `<a href="#routes/${r.id}">${r.a}–${r.b}</a>` },
    { h: 'Health', v: (r) => { const d = diagnose(r); return pill(d.tag, d.tone); } },
    { h: 'Load', cls: 'num', v: (r) => (r.last?.seatTotal ? pct(r.last.lf) : '–') },
    { h: 'Spill', cls: 'num', v: (r) => int(r.last ? Math.max(0, Object.values(r.last.demand).reduce((a, b) => a + b, 0) - r.last.paxTotal) : 0) },
    { h: 'OTP', cls: 'num', v: (r) => (r.last?.flights ? pct(r.last.otp) : '–') },
    { h: 'Profit', cls: 'num', v: (r) => signed(r.last?.profit ?? 0) },
    { h: 'Recommendation', v: (r) => `<small>${esc(diagnose(r).advice)}</small>` },
  ]))}`;
}

function regulation(c) {
  const s = c.state;
  const home = s.airline.home;
  const pairs = new Map();
  for (const r of s.routes) {
    const ca = ap(r.a).country;
    const cb = ap(r.b).country;
    if (ca === cb) continue;
    const k = G.pairKey(ca, cb);
    if (!pairs.has(k)) pairs.set(k, { ca, cb, routes: 0 });
    pairs.get(k).routes += 1;
  }
  const rows = [...pairs.values()].map((p) => ({ ...p, t: G.treatyFor(s, p.ca, p.cb), used: G.bilateralUse(s, p.ca, p.cb) }));
  const pol = G.carbonPolicies(s);
  const co2 = (s.history.slice(-52).reduce((t, h) => t + (h.co2 ?? 0), 0)) / 1000;
  const on = s.settings.regulation !== 'off';
  return `<div class="grid kpis">
    ${kpi('Bilateral cap', on ? `${G.bilateralCap(G.yearOf(s.week))}/wk` : 'Off', { sub: 'per country pair without open skies' })}
    ${kpi('Foreign ownership cap', pct(G.foreignStakeCap(s)), { sub: 'largest stake in a foreign airline' })}
    ${kpi('CO₂ (12 months)', `${int(co2 / 1000)} kt`, { sub: `carbon cost ${money(s.lastReport?.cost.carbon ?? 0)}/wk` })}
    ${kpi('EU ETS price', pol.ets ? `${G.money(pol.ets)}/t` : 'Not yet', { sub: pol.saf ? `SAF mandate ${pct(pol.saf, 1)}` : pol.corsia ? 'CORSIA in force' : '' })}
  </div>
  ${panel('Air service agreements on your network', table(rows, [
    { h: 'Countries', v: (p) => `${esc(G.COUNTRIES[p.ca])} – ${esc(G.COUNTRIES[p.cb])}` },
    { h: 'Agreement', v: (p) => (Number.isFinite(p.t.cap) ? pill('Bilateral', 'warn') : pill(p.t.label, 'good')) },
    { h: 'Routes', cls: 'num', v: (p) => p.routes },
    { h: 'Weekly frequencies', cls: 'num', v: (p) => (Number.isFinite(p.t.cap) ? `<span class="${p.used >= p.t.cap ? 'bad' : ''}">${p.used}</span> / ${p.t.cap}` : int(p.used)) },
  ], { empty: 'You fly no international routes yet.' }))}
  ${panel('How regulation works', `<ul class="plain small">
    <li><b>Bilateral agreements</b> cap how many weekly flights one airline may fly between two countries: ${G.bilateralCap(1970)} before 1978, ${G.bilateralCap(1985)} until 1992, ${G.bilateralCap(2000)} afterwards.</li>
    <li><b>Open skies</b> remove the cap. Real agreements arrive around their historical dates (US–Netherlands 1992, US–EU 2008, …), and ${esc(G.COUNTRIES[home])} may sign new ones in any year from 1992${(s.regulation?.openSkies ?? []).length ? ` — so far: ${s.regulation.openSkies.map((k) => k.split('|').map((x) => G.COUNTRIES[x]).join('–')).join(', ')}` : ''}.</li>
    <li><b>The European single market</b> (from 1997) lets EU airlines fly anywhere inside Europe, including domestic routes in other member states.</li>
    <li><b>Ownership</b>: you can never buy a foreign airline outright; stakes are capped at 25% until rules relax (possible from 2005) to 49%.</li>
    <li><b>Carbon</b>: the EU ETS charges flights within Europe from 2012, CORSIA offsets international growth from 2021, and from 2025 flights leaving Europe must burn a rising share of expensive sustainable fuel.</li>
  </ul>${on ? '' : '<p class="warn small">Regulation is switched off in your game settings.</p>'}`)}`;
}

export const actions = {
  'flow-filter': (el, ctx) => (ctx.ui.flowFilter = el.dataset.f),
};
