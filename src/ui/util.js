// Small rendering helpers shared by every page. Pages return HTML strings.

import * as G from '../engine/index.js';

export { G };
export const money = G.money;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const pct = (x, d = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '–');
export const int = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString() : '–');
export const num = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '–');
export const tone = (x) => (x >= 0 ? 'good' : 'bad');
export const signed = (x) => `<span class="${tone(x)}">${money(x)}</span>`;
export const ap = (code) => G.airportByCode[code];
export const apName = (code) => `${ap(code).city} (${code})`;
export const typeName = (id) => G.aircraftById[id]?.name ?? id;
export const tonnes = (kg) => `${int(kg / 1000)} t`;
// Engine amounts are constant 2027 dollars; show them in the current year's dollars.
export const P = () => G.priceLevel();
export const usd = (x, digits = 0) => (Number.isFinite(x) ? `$${(x * P()).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}` : '–');
export const nominal = (x) => Math.round(x * P());
export const fromNominal = (v) => Number(v) / P();

export function pill(text, kind = '') {
  return `<span class="pill ${kind}">${esc(text)}</span>`;
}

export function bar(value, max = 100, { invert = false, label } = {}) {
  const p = Math.max(0, Math.min(1, value / max));
  const level = invert ? 1 - p : p;
  const cls = level < 0.5 ? 'low' : level < 0.75 ? 'mid' : '';
  return `<div class="bar ${cls}" title="${esc(label ?? Math.round(p * 100) + '%')}"><span style="width:${(p * 100).toFixed(1)}%"></span></div>`;
}

// A label with an explanatory tooltip when the glossary knows it.
export function tipLabel(label, html = esc(label)) {
  const t = G.explain(label);
  return t ? `<span class="tip" tabindex="0" data-tip="${esc(t)}">${html}</span>` : html;
}

export function kpi(label, value, { sub = '', href = '', cls = '' } = {}) {
  const inner = `<label>${tipLabel(label)}</label><div class="${cls}">${value}</div>${sub ? `<small>${sub}</small>` : ''}`;
  return href ? `<a class="kpi link" href="${href}">${inner}</a>` : `<div class="kpi">${inner}</div>`;
}

export function panel(title, body, { href = '', actions = '', cls = '' } = {}) {
  const head = title ? `<div class="panel-head"><h2>${href ? `<a href="${href}">${esc(title)} ›</a>` : esc(title)}</h2>${actions}</div>` : '';
  return `<section class="panel ${cls}">${head}${body}</section>`;
}

export function tabs(base, items, active) {
  return `<nav class="subtabs">${items.map(([key, label]) => `<a href="#${base}/${key}" class="${key === active ? 'active' : ''}">${esc(label)}</a>`).join('')}</nav>`;
}

// Generic table. columns: [{ h, cls, v: (row) => html }]
export function table(rows, columns, { empty = 'Nothing here yet.', rowAttr } = {}) {
  if (!rows.length) return `<p class="muted">${empty}</p>`;
  return `<div class="table-wrap"><table>
    <thead><tr>${columns.map((c) => `<th class="${c.cls ?? ''}">${c.h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr ${rowAttr ? rowAttr(r) : ''}>${columns.map((c) => `<td class="${c.cls ?? ''}">${c.v(r)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

export function statement(rows) {
  return `<table class="statement">${rows
    .map(([label, value, cls = '']) => (label === '—' ? '<tr class="sep"><td colspan="2"></td></tr>' : `<tr class="${cls}"><td>${tipLabel(label, label)}</td><td>${value}</td></tr>`))
    .join('')}</table>`;
}

export function options(list, selected, { blank } = {}) {
  return (blank ? `<option value="">${esc(blank)}</option>` : '') + list.map(([v, label]) => `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`).join('');
}

export function airportOptions(codes, selected, blank) {
  const list = codes.map((c) => ap(c)).sort((a, b) => a.city.localeCompare(b.city));
  return options(list.map((a) => [a.code, `${a.city} (${a.code}) — ${G.COUNTRIES[a.country]}`]), selected, { blank });
}

// ---------------------------------------------------------------------------
// SVG charts (theme-aware via CSS variables)

export function barChart(data, { height = 180, href = '', format = money, labelEvery = 1 } = {}) {
  if (!data.length) return '<p class="muted">No data yet — advance time to see results.</p>';
  const w = 600;
  const pad = { l: 4, r: 4, t: 14, b: 22 };
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const hasNeg = data.some((d) => d.value < 0);
  const ph = height - pad.t - pad.b;
  const zero = hasNeg ? pad.t + ph / 2 : pad.t + ph;
  const scale = hasNeg ? ph / 2 / max : ph / max;
  const step = (w - pad.l - pad.r) / data.length;
  const bars = data
    .map((d, i) => {
      const h = Math.abs(d.value) * scale;
      const x = pad.l + i * step + step * 0.12;
      const y = d.value >= 0 ? zero - h : zero;
      const cls = d.value >= 0 ? 'pos' : 'neg';
      const label = i % labelEvery === 0 ? `<text class="axis" x="${x + step * 0.38}" y="${height - 6}" text-anchor="middle">${esc(d.label)}</text>` : '';
      return `<g><rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(step * 0.76).toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="2"><title>${esc(d.label)}: ${esc(format(d.value))}</title></rect>${label}</g>`;
    })
    .join('');
  const svg = `<svg class="chart" viewBox="0 0 ${w} ${height}" preserveAspectRatio="none" role="img"><line class="zero" x1="0" x2="${w}" y1="${zero}" y2="${zero}"/>${bars}<text class="axis" x="${w - 4}" y="11" text-anchor="end">max ${esc(format(max))}</text></svg>`;
  return href ? `<a href="${href}" class="chart-link" title="Open details">${svg}</a>` : svg;
}

export function lineChart(series, { height = 160, format = money } = {}) {
  const all = series.flatMap((s) => s.values);
  if (all.length < 2) return '<p class="muted">Not enough history yet.</p>';
  const w = 600;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const n = Math.max(...series.map((s) => s.values.length));
  const x = (i) => 4 + (i / Math.max(1, n - 1)) * (w - 8);
  const y = (v) => 10 + (1 - (v - lo) / span) * (height - 24);
  const lines = series
    .map((s) => `<polyline class="line ${s.cls ?? ''}" points="${s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`)
    .join('');
  const zero = lo < 0 && hi > 0 ? `<line class="zero" x1="0" x2="${w}" y1="${y(0)}" y2="${y(0)}"/>` : '';
  return `<svg class="chart" viewBox="0 0 ${w} ${height}" preserveAspectRatio="none" role="img">${zero}${lines}<text class="axis" x="4" y="${height - 2}">${esc(format(lo))}</text><text class="axis" x="${w - 4}" y="10" text-anchor="end">${esc(format(hi))}</text></svg>`;
}

export function hbars(items, { format = (x) => x, href } = {}) {
  if (!items.length) return '<p class="muted">None yet.</p>';
  const max = Math.max(...items.map((i) => i.value), 1);
  return `<div class="hbars">${items
    .map((i) => `<div class="hbar-row"><span class="hbar-label">${esc(i.label)}</span><div class="hbar"><span style="width:${((i.value / max) * 100).toFixed(1)}%"></span></div><span class="hbar-val">${esc(format(i.value))}</span></div>`)
    .join('')}</div>`;
}

export function sparkline(values, { width = 90, height = 24 } = {}) {
  if (values.length < 2) return '';
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - lo) / span) * (height - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polyline points="${pts}"/></svg>`;
}

export function statusPill(state, ac) {
  const s = G.statusOf(state, ac);
  return pill(s.label, s.tone);
}

export function checkCell(state, ac, check) {
  const s = G.checkStatus(state, ac, check);
  const cls = s.critical ? 'bad' : s.overdue ? 'bad' : s.due ? 'warn' : '';
  return `<span class="${cls}" title="${Math.round(s.ratio * 100)}% of interval used">${s.weeksLeft <= 0 ? 'Due' : `${s.weeksLeft}w`}</span>`;
}

// Tail-fin livery illustration. livery: { pattern, color, color2, logo }.
export function liverySvg(livery, { size = 34, title = '' } = {}) {
  const l = { pattern: 'stripe', color: '#4da3ff', color2: '#ffffff', logo: '✈', ...(livery ?? {}) };
  const c = esc(l.color);
  const c2 = esc(l.color2);
  const fin = 'M8,44 L22,4 L38,4 L32,44 Z';
  const art = {
    solid: '',
    stripe: `<path d="M12,36 L40,30 L40,35 L11,41 Z" fill="${c2}"/>`,
    split: `<path d="M22,4 L38,4 L35,22 L16,22 Z" fill="${c2}"/>`,
    band: `<path d="M14,30 L32,4 L38,4 L18,40 Z" fill="${c2}"/>`,
    dots: `<circle cx="27" cy="14" r="2.4" fill="${c2}"/><circle cx="21" cy="25" r="2.4" fill="${c2}"/><circle cx="30" cy="31" r="2.4" fill="${c2}"/><circle cx="16" cy="37" r="2" fill="${c2}"/>`,
  }[l.pattern] ?? '';
  const id = `fin${Math.random().toString(36).slice(2, 8)}`;
  return `<svg class="livery" width="${size}" height="${Math.round(size * 1.05)}" viewBox="0 0 46 48" role="img" aria-label="${esc(title || 'Livery')}">${title ? `<title>${esc(title)}</title>` : ''}
    <defs><clipPath id="${id}"><path d="${fin}"/></clipPath></defs>
    <path d="${fin}" fill="${c}"/><g clip-path="url(#${id})">${art}</g>
    <text x="25" y="${l.pattern === 'split' ? 34 : 22}" text-anchor="middle" font-size="12" fill="${l.pattern === 'split' ? c : c2}">${esc(l.logo)}</text>
    <path d="M2,46 L44,46" stroke="var(--muted)" stroke-width="2" stroke-linecap="round"/></svg>`;
}

export const brandLivery = (state, brandId) => G.brandById(state, brandId).livery;
