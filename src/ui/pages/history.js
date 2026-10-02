// History: market share against home-market rivals, annual reports and the
// milestone timeline.

import { G, esc, money, pct, int, num, kpi, panel, table, tabs, signed, liverySvg } from '../util.js';

const PALETTE = ['#f5a524', '#e5484d', '#30a46c', '#8e4ec6', '#12a594', '#e93d82', '#a18072'];

export function render(c) {
  const tab = c.params[0] ?? 'share';
  const body = { share, reports, timeline }[tab] ?? share;
  return `<div class="page-head"><h1>History</h1><span class="muted">Founded ${G.dateLabel(c.state.startWeek)} · ${int((G.elapsed(c.state) / 52) * 10) / 10} years · score ${int(c.state.scenario?.score || G.freeScore(c.state))}</span></div>
  ${tabs('history', [['share', 'Market share'], ['reports', 'Annual reports'], ['timeline', 'Milestones']], tab)}
  ${body(c)}`;
}

// Multi-series line chart of shares (0–1) over months.
function shareChart(series, labels) {
  const n = Math.max(...series.map((s) => s.values.length));
  if (n < 2) return '<p class="muted">Market share is recorded monthly — advance a couple of months.</p>';
  const w = 600;
  const h = 220;
  const hi = Math.max(0.05, ...series.flatMap((s) => s.values)) * 1.1;
  const x = (i) => 30 + (i / (n - 1)) * (w - 36);
  const y = (v) => 8 + (1 - v / hi) * (h - 30);
  const grid = [0.25, 0.5, 0.75, 1].map((f) => f * hi).map((v) => `<line class="grid-line" x1="30" x2="${w}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="axis" x="2" y="${(y(v) + 3).toFixed(1)}">${Math.round(v * 100)}%</text>`).join('');
  const lines = series.map((s) => `<polyline fill="none" stroke="${s.color}" stroke-width="${s.us ? 3 : 1.6}" points="${s.values.map((v, i) => `${x(i + n - s.values.length).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"><title>${esc(s.label)}</title></polyline>`).join('');
  const ticks = labels.map((l, i) => (i % Math.max(1, Math.round(n / 8)) === 0 ? `<text class="axis" x="${x(i).toFixed(1)}" y="${h - 4}" text-anchor="middle">${esc(l)}</text>` : '')).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Market share history">${grid}${lines}${ticks}</svg>
  <div class="legend">${series.map((s) => `<span><i class="sw" style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>`;
}

function share(c) {
  const s = c.state;
  const hist = (s.shareHistory ?? []).slice(-240);
  const ids = [...new Set(hist.flatMap((h) => Object.keys(h.rivals)))];
  const total = (h) => h.us + Object.values(h.rivals).reduce((a, b) => a + b, 0) || 1;
  const series = [
    { label: s.airline.name, color: s.airline.color, us: true, values: hist.map((h) => h.us / total(h)) },
    ...ids.slice(0, 6).map((id, i) => ({ label: G.rivalDef(s, id)?.name ?? id, color: PALETTE[i % PALETTE.length], values: hist.map((h) => (h.rivals[id] ?? 0) / total(h)) })),
  ];
  const labels = hist.map((h) => `${G.MONTHS[h.key % 12][0]}'${String(Math.floor(h.key / 12)).slice(2)}`);
  const now = hist[hist.length - 1];
  const rows = now ? [{ name: s.airline.name, pax: now.us, us: true }, ...Object.entries(now.rivals).map(([id, pax]) => ({ name: G.rivalDef(s, id)?.name ?? id, pax, id }))].sort((a, b) => b.pax - a.pax) : [];
  return `<div class="grid kpis">
    ${kpi('Home-market share', pct(G.shareNow(s), 1), { sub: `vs the ${Math.max(0, rows.length - 1)} biggest ${esc(s.airline.homeName)} airlines` })}
    ${kpi('Rank', now ? `#${rows.findIndex((r) => r.us) + 1}` : '–', { sub: 'by weekly passengers' })}
    ${kpi('Milestones', (s.milestones ?? []).length, { href: '#history/timeline' })}
    ${kpi('Annual reports', (s.annual ?? []).length, { href: '#history/reports' })}
  </div>
  ${panel('Passenger share against home-market rivals', shareChart(series, labels))}
  ${panel('This month', table(rows, [
    { h: 'Airline', v: (r) => (r.us ? `<b>${esc(r.name)}</b>` : r.id ? `<a href="#competitors/${r.id}">${esc(r.name)}</a>` : esc(r.name)) },
    { h: 'Passengers / wk', cls: 'num', v: (r) => int(r.pax) },
    { h: 'Share', cls: 'num', v: (r) => pct(r.pax / (rows.reduce((t, x) => t + x.pax, 0) || 1), 1) },
  ], { empty: 'No data yet.' }))}
  <p class="muted small">Rival traffic is estimated from their fleets; yours is what you actually carried.</p>`;
}

function reports(c) {
  const s = c.state;
  const list = [...(s.annual ?? [])].reverse();
  const pick = c.ui.report ?? list[0]?.year;
  const r = list.find((x) => x.year === Number(pick));
  return `${panel('Year by year', table(list, [
    { h: 'Year', v: (a) => `<a href="#history/reports" data-action="pick-report" data-year="${a.year}"><b>${a.year}</b></a>` },
    { h: 'Revenue', cls: 'num', v: (a) => money(a.revenue) },
    { h: 'Net result', cls: 'num', v: (a) => signed(a.profit) },
    { h: 'Margin', cls: 'num', v: (a) => (a.revenue ? pct(a.profit / a.revenue, 1) : '–') },
    { h: 'Passengers', cls: 'num', v: (a) => int(a.pax) },
    { h: 'Load', cls: 'num', v: (a) => pct(a.lf) },
    { h: 'On-time', cls: 'num', v: (a) => pct(a.otp) },
    { h: 'Fleet', cls: 'num', v: (a) => a.fleet },
    { h: 'Routes', cls: 'num', v: (a) => a.routes },
    { h: 'Share', cls: 'num', v: (a) => pct(a.share, 1) },
    { h: 'CO₂', cls: 'num', v: (a) => `${int(a.co2 / 1e6)} kt` },
    { h: 'Rating', v: (a) => a.rating },
  ], { empty: 'The first annual report is published at the end of your first calendar year.' }))}
  ${r ? panel(`Annual report ${r.year}`, `<div class="report">
    <div class="report-head">${liverySvg(s.airline.livery, { size: 48 })}<div><h2>${esc(s.airline.name)}</h2><p class="muted">Annual report and accounts ${r.year}</p></div></div>
    <p>${esc(s.airline.name)} carried <b>${int(r.pax)}</b> passengers on <b>${int(r.flights)}</b> flights in ${r.year}, filling ${pct(r.lf)} of seats with ${pct(r.otp)} of flights on time. Revenue was <b>${money(r.revenue)}</b> and the airline made a ${r.profit >= 0 ? 'profit' : 'loss'} of <b>${money(Math.abs(r.profit))}</b>.</p>
    <p>At year end it flew ${r.fleet} aircraft on ${r.routes} routes to ${r.destinations} destinations, held ${money(r.cash)} in cash and was rated ${r.rating}. Its share of home-market traffic was ${pct(r.share, 1)}.</p>
    ${r.milestones.length ? `<p><b>Highlights:</b> ${r.milestones.map(esc).join(' · ')}.</p>` : ''}
    <p class="muted small">Emissions: ${int(r.co2 / 1e6)} thousand tonnes of CO₂.</p></div>`) : ''}`;
}

function timeline(c) {
  const s = c.state;
  const items = [
    { week: s.startWeek, label: `${s.airline.name} founded at ${s.hubs[0]?.code ?? ''}`, tone: 'info' },
    ...(s.milestones ?? []),
    ...s.incidents.filter((i) => i.severity === 'hull loss').map((i) => ({ week: i.week, label: `Accident: ${i.reg} — ${i.text}`, tone: 'bad' })),
  ].sort((a, b) => a.week - b.week);
  return panel('Timeline', `<ol class="timeline">${items.map((m) => `<li class="${m.tone ?? 'good'}"><span class="when">${G.dateLabel(m.week)}</span><span>${esc(m.label)}</span></li>`).join('')}</ol>`);
}

export const actions = {
  'pick-report': (el, ctx) => (ctx.ui.report = Number(el.dataset.year)),
};

export { num };
