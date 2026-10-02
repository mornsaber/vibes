import { G, esc, money, options } from '../util.js';
import { savedGame, formValues } from '../app.js';

const COLORS = ['#4da3ff', '#e5484d', '#30a46c', '#f5a524', '#8e4ec6', '#12a594', '#e93d82', '#ffffff'];

function st(ctx) {
  return (ctx.ui.start ??= { name: 'Skyward Air', code: 'SK', color: COLORS[0], hub: 'ORD', difficulty: 'normal', region: 'NA', year: 2027 });
}

export function render(ctx) {
  const s = st(ctx);
  const saved = savedGame();
  const hubs = G.AIRPORTS.filter((a) => a.region === s.region && a.runway >= 2400).sort((a, b) => b.pop - a.pop);
  const hub = G.airportByCode[s.hub];
  const rivalsAtHub = G.RIVALS.filter((r) => r.hubs.includes(s.hub) && r.founded <= s.year && (r.ceased ?? 9999) > s.year);
  return `<div class="start"><div class="start-card panel" data-form>
    <h1>✈ Airline Executive Simulator</h1>
    <p class="muted">You are the founding CEO of a new airline. Plan a network, build a fleet with real lead times, run engineering, crew and finance, and fight real-world rivals — all while the board watches every quarter.</p>
    ${saved ? `<button class="primary wide" data-action="continue">Continue ${esc(saved.airline.name)} — ${G.dateLabel(saved.week)}</button><hr>` : ''}
    <div class="grid cols-3">
      <div class="field"><label>Airline name</label><input name="name" maxlength="32" value="${esc(s.name)}"></div>
      <div class="field"><label>IATA code</label><input name="code" maxlength="2" value="${esc(s.code)}" style="text-transform:uppercase"></div>
      <div class="field"><label>Livery colour</label><div class="row">${COLORS.map((c) => `<button class="swatch ${c === s.color ? 'active' : ''}" style="background:${c}" data-action="start-color" data-color="${c}" aria-label="${c}"></button>`).join('')}</div></div>
    </div>
    <div class="field"><label>Starting year</label>
      <div class="row wrap">${G.START_YEARS.map((y) => `<button class="small ${y === s.year ? 'primary' : ''}" data-action="start-year" data-year="${y}">${y}</button>`).join('')}
      <input type="number" name="year" min="1960" max="2035" value="${s.year}" class="w-90" data-change="start-year-input"></div>
      <p class="callout small"><b>${esc(G.eraOf(s.year).name)}</b> — ${esc(G.eraOf(s.year).blurb)}<br>
      <span class="muted">New aircraft on offer: ${G.AIRCRAFT.filter((t) => G.inProduction(t, s.year) && t.cat !== 'freighter').slice(0, 8).map((t) => esc(t.name)).join(', ')}${G.AIRCRAFT.filter((t) => G.inProduction(t, s.year) && t.cat !== 'freighter').length > 8 ? '…' : ''}.
      Rival airlines flying: ${G.RIVALS.filter((r) => r.founded <= s.year && (r.ceased ?? 9999) > s.year).length}. All money is in constant 2027 dollars.</span></p>
    </div>
    <div class="field"><label>Home region</label><div class="row wrap">${Object.entries(G.REGIONS).map(([k, r]) => `<button class="small ${k === s.region ? 'primary' : ''}" data-action="start-region" data-region="${k}">${r.name}</button>`).join('')}</div></div>
    <div class="field"><label>Hub airport</label>
      <div class="hub-grid">${hubs.map((a) => `<button data-action="start-hub" data-code="${a.code}" class="${a.code === s.hub ? 'active' : ''}"><b>${a.code}</b> ${esc(a.city)}<small>${esc(G.COUNTRIES[a.country])} · ${a.pop}M · ${'★'.repeat(a.tier) || '☆'}${a.slots ? ` · ${a.slots === 2 ? 'congested' : 'slot-controlled'}` : ''}</small></button>`).join('')}</div>
    </div>
    <div class="callout">
      <b>${esc(hub.city)} (${hub.code})</b> — ${esc(G.COUNTRIES[hub.country])}. Catchment ${hub.pop}M, business ${hub.biz}, tourism ${hub.tourism}, runway ${hub.runway.toLocaleString()} m.
      ${rivalsAtHub.length ? `<br>Incumbents based here: ${rivalsAtHub.map((r) => esc(r.name)).join(', ')}.` : '<br>No rival is based here — an open field.'}
      ${hub.slots === 2 ? '<br><span class="warn">Congested airport: slots are scarce and expensive.</span>' : ''}
      <br>Staff costs: ${Math.round(G.REGIONS[hub.region].wage * 100)}% of North American levels.
    </div>
    <div class="field"><label>Difficulty</label><div class="row">${Object.entries(G.DIFFICULTY).map(([k, d]) => `<button class="${k === s.difficulty ? 'primary' : ''}" data-action="start-diff" data-diff="${k}">${d.label} · ${money(d.cash)}</button>`).join('')}</div></div>
    <button class="primary wide" data-action="start">Found the airline</button>
  </div></div>`;
}

function keep(ctx, el) {
  const v = formValues(el);
  const s = st(ctx);
  if (v.name != null) s.name = v.name;
  if (v.code != null) s.code = v.code;
}

export const actions = {
  'start-color': (el, ctx) => (keep(ctx, el), (st(ctx).color = el.dataset.color)),
  'start-region': (el, ctx) => {
    keep(ctx, el);
    const s = st(ctx);
    s.region = el.dataset.region;
    s.hub = G.AIRPORTS.filter((a) => a.region === s.region && a.runway >= 2400).sort((a, b) => b.pop - a.pop)[0].code;
  },
  'start-hub': (el, ctx) => (keep(ctx, el), (st(ctx).hub = el.dataset.code)),
  'start-diff': (el, ctx) => (keep(ctx, el), (st(ctx).difficulty = el.dataset.diff)),
  'start-year': (el, ctx) => (keep(ctx, el), (st(ctx).year = Number(el.dataset.year))),
  start(el, ctx) {
    keep(ctx, el);
    const s = st(ctx);
    const code = (s.code || 'XX').toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(2, 'X').slice(0, 2);
    ctx.game = G.newGame({ name: s.name.trim() || 'Skyward Air', code, hub: s.hub, difficulty: s.difficulty, color: s.color, startYear: s.year });
    location.hash = '#dashboard';
  },
  continue(el, ctx) {
    ctx.game = savedGame();
    location.hash = '#dashboard';
  },
};

export { options };

export const changes = {
  'start-year-input': (el, ctx) => {
    const y = Math.round(Number(el.value));
    if (y >= 1960 && y <= 2035) st(ctx).year = y;
  },
};
