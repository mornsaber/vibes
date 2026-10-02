// SVG world map: Natural Earth land, airports, and route arcs.

import { LAND } from '../data/land.js';
import { G, esc } from './util.js';

const W = 1000;
const TOP = 80;
const BOTTOM = -58;
const H = Math.round((W * (TOP - BOTTOM)) / 360);
export const project = (lon, lat) => [((lon + 180) / 360) * W, ((TOP - lat) / (TOP - BOTTOM)) * H];

let landPath;
function land() {
  if (landPath) return landPath;
  landPath = LAND.map((ring) => {
    let d = '';
    for (let i = 0; i < ring.length; i += 2) {
      const [x, y] = project(ring[i], ring[i + 1]);
      d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return `${d}Z`;
  }).join('');
  return landPath;
}

export const VIEWS = {
  world: [0, 0, W, H],
  na: [40, 40, 330, 200],
  la: [180, 170, 260, 210],
  eu: [440, 20, 180, 120],
  me: [520, 90, 200, 130],
  as: [620, 60, 300, 220],
  oc: [760, 190, 240, 160],
};
export const VIEW_LABELS = { world: 'World', na: 'North America', la: 'Latin America', eu: 'Europe', me: 'Middle East & Africa', as: 'Asia', oc: 'Oceania' };

function arc(a, b, cls, attrs = '') {
  const A = G.airportByCode[a];
  const B = G.airportByCode[b];
  const [x1, y1] = project(A.lon, A.lat);
  const [x2, y2] = project(B.lon, B.lat);
  const variants = Math.abs(x2 - x1) > W / 2 ? [[0, x2 < x1 ? W : -W], [x2 < x1 ? -W : W, 0]] : [[0, 0]];
  return variants
    .map(([d1, d2]) => {
      const ax = x1 + d1;
      const bx = x2 + d2;
      const len = Math.hypot(bx - ax, y2 - y1) || 1;
      const bend = Math.min(0.2, 60 / len + 0.08);
      const cx = (ax + bx) / 2 + ((y2 - y1) / len) * len * bend * (ax < bx ? 1 : -1) * 0.3;
      const cy = (y1 + y2) / 2 - len * bend;
      return `<path class="${cls}" d="M${ax.toFixed(1)},${y1.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${bx.toFixed(1)},${y2.toFixed(1)}" ${attrs}/>`;
    })
    .join('');
}

// opts: { view, interactive, selected: [codes], showAll, preview: [a,b], rivalHubs, highlight }
export function worldMap(state, opts = {}) {
  const view = VIEWS[opts.view ?? 'world'];
  const served = new Set(G.stations(state));
  const hubs = new Set(state.hubs.map((h) => h.code));
  const maxPax = Math.max(1, ...state.routes.map((r) => r.last?.paxTotal ?? 0));
  const routes = state.routes
    .map((r) => {
      const l = r.last;
      const cls = !l || !l.freq ? 'route idle' : l.profit < 0 ? 'route loss' : l.cargoCap && !l.seatTotal ? 'route cargo' : 'route';
      const w = 0.8 + (Math.sqrt((l?.paxTotal ?? 0) / maxPax) * 3.2);
      const hl = opts.highlight && (r.a === opts.highlight || r.b === opts.highlight) ? ' hl' : '';
      return arc(r.a, r.b, cls + hl, `stroke-width="${w.toFixed(2)}" data-href="#routes/${r.id}"`);
    })
    .join('');
  const preview = opts.preview?.[0] && opts.preview?.[1] ? arc(opts.preview[0], opts.preview[1], 'preview') : '';
  const zoom = W / view[2];
  const airports = G.AIRPORTS.filter((a) => opts.showAll || served.has(a.code) || opts.selected?.includes(a.code))
    .map((a) => {
      const [x, y] = project(a.lon, a.lat);
      const isServed = served.has(a.code);
      const r = (isServed ? 2.6 : 1.8) + Math.sqrt(a.pop) * 0.35;
      const cls = ['ap', isServed && 'served', hubs.has(a.code) && 'hub', opts.selected?.includes(a.code) && 'selected', opts.rivalHubs?.has(a.code) && 'rival'].filter(Boolean).join(' ');
      const rr = r / Math.sqrt(zoom);
      const label = isServed || zoom > 2.5 || opts.selected?.includes(a.code) ? `<text class="label ${isServed ? 'served' : ''}" x="${(x + rr + 1.5 / zoom).toFixed(1)}" y="${(y + 3.5 / zoom).toFixed(1)}" style="font-size:${(10 / zoom).toFixed(2)}px">${a.code}</text>` : '';
      const hit = opts.interactive ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(8 / zoom).toFixed(2)}" fill="transparent"/>` : '';
      return `<g ${opts.interactive ? `data-action="map-ap" data-code="${a.code}" class="clickable"` : ''}>${hit}<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(2)}"><title>${esc(a.city)} (${a.code}) · ${a.pop}M · ${esc(G.COUNTRIES[a.country])}</title></circle>${label}</g>`;
    })
    .join('');
  return `<svg class="map" viewBox="${view.join(' ')}" role="img" aria-label="Network map" style="--z:${zoom}">
    <rect class="sea" x="-1000" y="-500" width="3000" height="2000"/>
    <path class="land" d="${land()}"/>
    <g style="stroke-width:${(1 / zoom).toFixed(3)}">${routes}${preview}</g>
    ${airports}
  </svg>`;
}
