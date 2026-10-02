import { G, esc, money, pct, int, panel, table, statement, pill, ap, signed } from '../util.js';
import { worldMap, VIEWS, VIEW_LABELS } from '../map.js';
import { routePreview } from './routes.js';

export function render(c) {
  const s = c.state;
  const m = (c.ui.map ??= { view: 'world', showAll: true, selected: null, from: s.hubs[0].code });
  const sel = m.selected ? ap(m.selected) : null;
  const rivalHubs = m.rivals ? new Set(G.RIVALS.filter((r) => s.rivals[r.id].status === 'active').flatMap((r) => r.hubs)) : null;
  return `<div class="page-head"><h1>Map</h1>
    <div class="row wrap">${Object.keys(VIEWS).map((k) => `<button class="small ${m.view === k ? 'primary' : ''}" data-action="map-view" data-view="${k}">${VIEW_LABELS[k]}</button>`).join('')}
    <label class="check"><input type="checkbox" data-change="map-all" ${m.showAll ? 'checked' : ''}> All airports</label>
    <label class="check"><input type="checkbox" data-change="map-rivals" ${m.rivals ? 'checked' : ''}> Rival hubs</label></div></div>
  <div class="map-layout">
    <div class="panel map-panel">${worldMap(s, { view: m.view, interactive: true, showAll: m.showAll, selected: [m.selected, m.from].filter(Boolean), preview: m.selected && m.from !== m.selected ? [m.from, m.selected] : null, rivalHubs, highlight: m.selected })}
      <p class="muted small legend-line"><span class="dot hub"></span> hub <span class="dot served"></span> served <span class="dot"></span> not served · line width = passengers · <span class="bad">red</span> loss-making · dashed unscheduled · click an airport</p>
    </div>
    <div class="map-side">${sel ? airportPanel(c, sel) : panel('Explore', '<p class="muted">Click any airport to see its market, your service there, rivals based there, and to plan a route from it.</p>')}</div>
  </div>`;
}

function airportPanel(c, a) {
  const s = c.state;
  const m = c.ui.map;
  const mine = s.routes.filter((r) => r.a === a.code || r.b === a.code);
  const based = G.RIVALS.filter((r) => r.hubs.includes(a.code));
  const served = G.stations(s).includes(a.code);
  return `${panel(`${a.city} (${a.code})`, `${statement([
    ['Country', esc(G.COUNTRIES[a.country])],
    ['Catchment', `${a.pop}M people`],
    ['Business / tourism / cargo', `${a.biz} / ${a.tourism} / ${a.cargo}`],
    ['Runway', `${int(a.runway)} m`],
    ['Slots', a.slots === 2 ? 'Congested' : a.slots ? 'Coordinated' : 'Unrestricted'],
    ['Airport charges', `${Math.round(a.fee * 100)}% of average`],
    ['Based rivals', based.map((r) => `<a href="#competitors/${r.id}">${esc(r.code)}</a>`).join(', ') || 'None'],
  ])}
  ${mine.length ? `<h3>Your routes</h3>${table(mine, [
    { h: 'Route', v: (r) => `<a href="#routes/${r.id}">${r.a}–${r.b}</a>` },
    { h: 'Pax/wk', cls: 'num', v: (r) => int(r.last?.paxTotal ?? 0) },
    { h: 'Profit', cls: 'num', v: (r) => signed(r.last?.profit ?? 0) },
  ])}` : ''}
  <div class="row wrap">
    ${served ? `<button class="small" data-action="map-from" data-code="${a.code}">Plan routes from here</button>` : ''}
    ${G.sameMarket(s.airline.home, a.country) && !G.isHub(s, a.code) ? `<button class="small" data-action="open-hub-map" data-code="${a.code}">Open hub (${money(G.hubOpenCost(a.code))})</button>` : ''}
  </div>`)}
  ${m.from && m.from !== a.code ? panel(`Route ${m.from} → ${a.code}`, routePreview(s, m.from, a.code)) : ''}`;
}

export const actions = {
  'map-view': (el, ctx) => (ctx.ui.map.view = el.dataset.view),
  'map-ap'(el, ctx) {
    ctx.ui.map ??= { view: 'world', showAll: true };
    ctx.ui.map.selected = el.dataset.code;
  },
  'map-from': (el, ctx) => (ctx.ui.map.from = el.dataset.code),
  'open-hub-map': (el, ctx) => G.openHub(ctx.game, el.dataset.code),
};

export const changes = {
  'map-all': (el, ctx) => (ctx.ui.map.showAll = el.checked),
  'map-rivals': (el, ctx) => (ctx.ui.map.rivals = el.checked),
};
