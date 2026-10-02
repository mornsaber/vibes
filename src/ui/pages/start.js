import { G, esc, money, options, liverySvg } from '../util.js';
import { saves, slotTable, formValues } from '../app.js';

const COLORS = ['#4da3ff', '#e5484d', '#30a46c', '#f5a524', '#8e4ec6', '#12a594', '#e93d82', '#ffffff'];

function st(ctx) {
  return (ctx.ui.start ??= { name: 'Skyward Air', code: 'SK', color: COLORS[0], hub: 'ORD', difficulty: 'normal', region: 'NA', year: 2027, scenario: '', model: 'full', pattern: 'stripe', logo: '✈' });
}

export function startSettings(s) {
  return G.makeSettings(s.difficulty, s.overrides ?? {});
}

const fmt = (def, v) => (def.money ? money(v) : `${Math.round(v * 100)}%`);
function summary(st) {
  return G.SETTING_DEFS.filter((d) => d.key !== 'cash').map((d) => `${d.label} ${fmt(d, st[d.key])}`).join(' · ') + ` · Starting capital ${money(st.cash)}`;
}

// Shared by the start screen and Management › Airline (in-game, capital is fixed).
export function settingsEditor(st, change, { inGame = false } = {}) {
  return `<div class="settings-grid">${G.SETTING_DEFS.filter((d) => !(inGame && d.key === 'cash')).map((d) => {
    const v = st[d.key];
    const hard = d.higherIsHarder ? v > 1 : d.key === 'cash' ? v < 120e6 : v < 1;
    const easy = d.higherIsHarder ? v < 1 : d.key === 'cash' ? v > 120e6 : v > 1;
    return `<div class="field"><label>${esc(d.label)}: <b class="${hard ? 'bad' : easy ? 'good' : ''}">${fmt(d, v)}</b></label>
      <input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}" data-change="${change}" data-key="${d.key}"><small class="muted">${esc(d.desc)}</small></div>`;
  }).join('')}
  ${G.OPTION_DEFS.map((o) => `<div class="field"><label>${esc(o.label)}</label><select data-change="${change}" data-key="${o.key}">${options(o.options.map(([v, l]) => [String(v), l]), String(st[o.key]))}</select><small class="muted">${esc(o.desc)}</small></div>`).join('')}</div>`;
}

export function parseSetting(key, value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const n = Number(value);
  return Number.isFinite(n) && G.SETTING_DEFS.some((d) => d.key === key) ? n : value;
}

function modePicker(s) {
  return `<div class="field"><label>Game</label><div class="scenario-grid">
    <button class="${!s.scenario ? 'active' : ''}" data-action="start-scenario" data-id=""><b>Free play</b><small>Any year, any hub, no deadline. Grow however you like.</small></button>
    ${Object.entries(G.SCENARIOS).map(([id, sc]) => `<button class="${s.scenario === id ? 'active' : ''}" data-action="start-scenario" data-id="${id}"><b>${esc(sc.name)}</b><small>${sc.year} · ${sc.hub} · by ${sc.deadline}</small></button>`).join('')}
  </div></div>`;
}

function liveryPicker(s) {
  return `<div class="field"><label>Livery</label><div class="row wrap">
    ${liverySvg({ pattern: s.pattern, color: s.color, color2: '#ffffff', logo: s.logo }, { size: 44 })}
    <select data-change="start-pattern">${options(Object.entries(G.LIVERY_PATTERNS), s.pattern)}</select>
    <select data-change="start-logo">${options(G.LOGOS.map((l) => [l, l]), s.logo)}</select>
    ${COLORS.map((c) => `<button class="swatch ${c === s.color ? 'active' : ''}" style="background:${c}" data-action="start-color" data-color="${c}" aria-label="${c}"></button>`).join('')}
  </div></div>`;
}

export function render(ctx) {
  const s = st(ctx);
  const sc = G.SCENARIOS[s.scenario];
  const year = sc ? sc.year : s.year;
  const inflation = startSettings(s).inflation !== 'off';
  G.setPriceLevel(inflation ? G.cpiIndex(year) : 1);
  const slots = saves.list();
  const hubs = G.AIRPORTS.filter((a) => a.region === s.region && a.runway >= 2400).sort((a, b) => b.pop - a.pop);
  const hub = G.airportByCode[s.hub];
  const rivalsAtHub = G.RIVALS.filter((r) => r.hubs.includes(s.hub) && r.founded <= s.year && (r.ceased ?? 9999) > s.year);
  const identity = `<div class="grid cols-3">
      <div class="field"><label>Airline name</label><input name="name" maxlength="32" value="${esc(s.name)}"></div>
      <div class="field"><label>IATA code</label><input name="code" maxlength="2" value="${esc(s.code)}" style="text-transform:uppercase"></div>
      <div class="field"><label>Business model</label><select data-change="start-model">${options([['full', 'Full-service'], ['lcc', 'Low-cost']], s.model)}</select></div>
    </div>${liveryPicker(s)}`;
  const freePlay = `
    <div class="field"><label>Starting year</label>
      <div class="row wrap">${G.START_YEARS.map((y) => `<button class="small ${y === s.year ? 'primary' : ''}" data-action="start-year" data-year="${y}">${y}</button>`).join('')}
      <input type="number" name="year" min="1960" max="2035" value="${s.year}" class="w-90" data-change="start-year-input"></div>
      <p class="callout small"><b>${esc(G.eraOf(s.year).name)}</b> — ${esc(G.eraOf(s.year).blurb)}<br>
      <span class="muted">New aircraft on offer: ${G.AIRCRAFT.filter((t) => G.inProduction(t, s.year) && t.cat !== 'freighter').slice(0, 8).map((t) => esc(t.name)).join(', ')}${G.AIRCRAFT.filter((t) => G.inProduction(t, s.year) && t.cat !== 'freighter').length > 8 ? '…' : ''}.
      Rival airlines flying: ${G.RIVALS.filter((r) => r.founded <= s.year && (r.ceased ?? 9999) > s.year).length}. ${inflation ? `Money is shown in ${s.year} dollars (prices ${G.cpiIndex(s.year).toFixed(2)}× 2027 levels) and inflates as the years pass.` : 'Money is shown in constant 2027 dollars.'}</span></p>
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
    </div>`;
  const scenario = sc ? `<div class="callout"><b>${esc(sc.name)}</b> — ${esc(sc.blurb)}
      <ul class="plain small">${sc.goals.map((g) => `<li>🎯 ${esc(g.label)}</li>`).join('')}</ul>
      <span class="muted small">Starts ${sc.year} at ${esc(G.airportByCode[sc.hub].city)} with ${sc.fleet.reduce((t, f) => t + f[1], 0)} aircraft and ${sc.routes.length} routes. Deadline: 1 January ${sc.deadline}. Score: 1,000 per goal, a bonus for finishing early, plus profit and reputation.</span></div>` : '';
  return `<div class="start"><div class="start-card panel" data-form>
    <h1>✈ Airline Executive Simulator</h1>
    <p class="muted">You are the CEO. Plan a network, build a fleet with real lead times, run engineering, crew and finance, and fight real-world rivals — all while the board watches every quarter. Automation (pricing, aircraft assignment, staffing, maintenance) is on by default; take the controls when you want to.</p>
    ${slots.length ? `<div class="field"><label>Saved games</label>${slotTable(slots, { inGame: false })}<label class="button-like small">Import save file<input type="file" accept=".json" data-change="import-save" hidden></label></div><hr>` : '<label class="button-like small">Import a save file<input type="file" accept=".json" data-change="import-save" hidden></label>'}
    ${modePicker(s)}
    ${identity}
    ${sc ? scenario : freePlay}
    <div class="field"><label>Difficulty</label><div class="row wrap">${Object.entries(G.PRESETS).map(([k, d]) => `<button class="${k === s.difficulty ? 'primary' : ''}" data-action="start-diff" data-diff="${k}">${d.label}</button>`).join('')}
      <button class="small ghost" data-action="start-custom">${s.custom ? 'Hide' : 'Customise'} settings</button></div>
      ${s.custom ? settingsEditor(startSettings(s), 'start-setting') : `<p class="muted small">${esc(summary(startSettings(s)))}</p>`}
    </div>
    <button class="primary wide" data-action="start">${sc ? `Start scenario: ${esc(sc.name)}` : 'Found the airline'}</button>
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
  'start-diff': (el, ctx) => {
    keep(ctx, el);
    st(ctx).difficulty = el.dataset.diff;
    st(ctx).overrides = {};
  },
  'start-custom': (el, ctx) => (keep(ctx, el), (st(ctx).custom = !st(ctx).custom)),
  'start-year': (el, ctx) => (keep(ctx, el), (st(ctx).year = Number(el.dataset.year))),
  'start-scenario': (el, ctx) => {
    keep(ctx, el);
    const s = st(ctx);
    const sc = G.SCENARIOS[el.dataset.id];
    s.scenario = el.dataset.id;
    if (sc) Object.assign(s, { name: sc.airline.name, code: sc.airline.code, color: sc.airline.color, model: sc.airline.model ?? 'full' });
  },
  start(el, ctx) {
    keep(ctx, el);
    const s = st(ctx);
    const code = (s.code || 'XX').toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(2, 'X').slice(0, 2);
    ctx.slot = null;
    ctx.snapshot = null;
    ctx.game = G.newGame({
      name: s.name.trim() || 'Skyward Air', code, hub: s.hub, difficulty: s.difficulty, settings: s.overrides ?? {}, color: s.color, startYear: s.year,
      model: s.model, livery: { pattern: s.pattern, logo: s.logo, color2: '#ffffff' }, scenario: s.scenario || undefined,
    });
    location.hash = '#dashboard';
  },

};

export { options };

export const changes = {
  'start-setting': (el, ctx) => {
    const s = st(ctx);
    s.overrides = { ...(s.overrides ?? {}), [el.dataset.key]: parseSetting(el.dataset.key, el.value) };
  },
  'start-model': (el, ctx) => (st(ctx).model = el.value),
  'start-pattern': (el, ctx) => (st(ctx).pattern = el.value),
  'start-logo': (el, ctx) => (st(ctx).logo = el.value),
  'start-year-input': (el, ctx) => {
    const y = Math.round(Number(el.value));
    if (y >= 1960 && y <= 2035) st(ctx).year = y;
  },
};
