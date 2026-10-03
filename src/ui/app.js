// Application shell: hash router, sidebar navigation, top bar with time
// controls, decision modal, persistence and the global action dispatcher.

import { G, esc, money, pct, int, liverySvg, tipLabel } from './util.js';
import * as dashboard from './pages/dashboard.js';
import * as routes from './pages/routes.js';
import * as planning from './pages/planning.js';
import * as fleet from './pages/fleet.js';
import * as map from './pages/map.js';
import * as engineering from './pages/engineering.js';
import * as network from './pages/network.js';
import * as markets from './pages/markets.js';
import * as finances from './pages/finances.js';
import * as management from './pages/management.js';
import * as competitors from './pages/competitors.js';
import * as cargo from './pages/cargo.js';
import * as charter from './pages/charter.js';
import * as special from './pages/special.js';
import * as start from './pages/start.js';
import * as history from './pages/history.js';
import { createSaves } from './storage.js';


export const NAV = [
  { section: 'Operations', items: [
    ['dashboard', 'Dashboard', '◉', dashboard],
    ['routes', 'Routes', '⇄', routes],
    ['planning', 'Planning', '▦', planning],
    ['fleet', 'Fleet', '✈', fleet],
    ['map', 'Map', '◍', map],
    ['engineering', 'Engineering', '⚙', engineering],
    ['network', 'Network', '⋈', network],
    ['markets', 'Markets', '◔', markets],
  ] },
  { section: 'Finance & Strategy', items: [
    ['finances', 'Finances', '$', finances],
    ['management', 'Management', '♜', management],
    ['competitors', 'Competitors', '⚑', competitors],
    ['history', 'History', '❦', history],
    ['cargo', 'Cargo', '▣', cargo],
    ['charter', 'Charter', '☀', charter],
    ['special', 'Special Ops', '★', special],
  ] },
];
const PAGES = Object.fromEntries(NAV.flatMap((s) => s.items.map(([k, , , m]) => [k, m])));

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const toastEl = document.getElementById('toast');

export const ctx = { game: null, slot: null, snapshot: null, ui: { navOpen: false } };

// ---------------------------------------------------------------------------
// Persistence: named save slots (gzip in localStorage) with a one-step undo.

// localStorage can be missing or throw (private mode); reads fail soft.
const store = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => localStorage.setItem(k, v),
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};
export const saves = createSaves(store, { migrate: G.migrate });

let saving = Promise.resolve();
// Serialise now (so later mutations don't leak in), compress and write in the background.
export function saveGame() {
  const game = ctx.game;
  if (!game) return saving;
  const snapshot = JSON.parse(JSON.stringify(game));
  // The slot is fixed now, so a later slot switch can't redirect this write.
  if (!ctx.slot) ctx.slot = saves.newId();
  const id = ctx.slot;
  saving = saving.then(async () => {
    const res = await saves.save(snapshot, { id });
    if (!res.ok) toast(res.error);
    else if (ctx.slot === id) saves.setActive(id);
  });
  return saving;
}

// Open a slot as the current game.
export async function openSlot(id) {
  const g = await saves.load(id);
  if (!g) return { ok: false, error: 'That save could not be read' };
  ctx.game = g;
  ctx.slot = id;
  ctx.snapshot = saves.hasSnapshot(id) ? { week: null } : null;
  ctx.ui = { navOpen: false };
  saves.setActive(id);
  return { ok: true };
}

// Remember the game before an advance so it can be reverted.
function takeSnapshot() {
  if (!ctx.game) return;
  const json = JSON.stringify(ctx.game);
  ctx.snapshot = { json, week: ctx.game.week };
  const slot = ctx.slot;
  if (slot) saving = saving.then(() => saves.snapshot(slot, JSON.parse(json)));
}

async function revert() {
  let g = ctx.snapshot?.json ? G.migrate(JSON.parse(ctx.snapshot.json)) : null;
  if (!g && ctx.slot) g = await saves.loadSnapshot(ctx.slot);
  if (!g) return { ok: false, error: 'Nothing to revert to' };
  ctx.game = g;
  ctx.snapshot = null;
  if (ctx.slot) saves.clearSnapshot(ctx.slot);
  ctx.ui.dismissedEnd = false;
  return { ok: true, message: `Reverted to ${G.dateLabel(g.week)}.` };
}

async function boot() {
  const adopted = await saves.adoptLegacy();
  const id = saves.activeId() ?? adopted;
  if (id && saves.list().some((x) => x.id === id)) await openSlot(id);
  render();
}

// ---------------------------------------------------------------------------
// Feedback

let toastTimer;
export function toast(text, kind = 'error') {
  toastEl.textContent = text;
  toastEl.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.className = ''), kind === 'error' ? 4200 : 3000);
}

// ---------------------------------------------------------------------------
// Routing & rendering

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { page: PAGES[parts[0]] ? parts[0] : 'dashboard', params: parts.slice(1) };
}

let lastHash = '';
export function render() {
  const g = ctx.game;
  G.setPriceLevel(g?.macro?.priceLevel ?? 1);
  if (g?.airline?.color) document.documentElement.style.setProperty('--brand', g.airline.color);
  if (!g) {
    app.innerHTML = start.render(ctx);
    modalRoot.innerHTML = '';
    return;
  }
  const { page, params } = parseHash();
  const mod = PAGES[page];
  const keepScroll = location.hash === lastHash;
  const y = window.scrollY;
  let body;
  try {
    body = mod.render({ ...ctx, state: g, params });
  } catch (err) {
    console.error(err);
    body = `<section class="panel"><h2>Something went wrong rendering this page</h2><pre class="muted">${esc(err.stack ?? err)}</pre></section>`;
  }
  app.innerHTML = `
    <div class="shell ${ctx.ui.navOpen ? 'nav-open' : ''}">
      ${renderSidebar(page)}
      ${ctx.ui.navOpen ? '<div class="nav-scrim" data-action="toggle-nav" aria-hidden="true"></div>' : ''}
      <div class="main-col">
        ${renderTopbar(g)}
        <main id="page">${body}</main>
      </div>
      ${tutorialCard(g)}
    </div>`;
  modalRoot.innerHTML = renderModal(g) || (g.pendingEvent ? '' : renderCelebration());
  mod.after?.({ ...ctx, state: g, params });
  if (keepScroll) window.scrollTo(0, y);
  else window.scrollTo(0, 0);
  lastHash = location.hash;
  document.title = `${g.airline.name} · ${G.dateLabel(g.week)}`;
}

// Floating step tracker for the guided first year.
function tutorialCard(g) {
  const step = G.tutorialCurrent(g);
  if (!step) return '';
  const steps = G.tutorialSteps(g);
  const done = steps.filter((x) => x.complete).length;
  const n = steps.indexOf(steps.find((x) => x.id === step.id)) + 1;
  return `<aside class="tutorial" aria-label="Tutorial">
    <div class="tut-head"><small class="muted">First year · step ${n} of ${steps.length} · ${done} done</small><button class="icon-btn" data-action="tut-hide" title="Hide the tutorial" aria-label="Hide tutorial">✕</button></div>
    <div class="tut-bar"><span style="width:${((done / steps.length) * 100).toFixed(0)}%"></span></div>
    <h3>${esc(step.title)}</h3>
    <p>${esc(step.text)}</p>
    <div class="row wrap">${step.href && location.hash !== step.href ? `<a class="button-like small" href="${step.href}">Take me there</a>` : ''}
      ${step.ack ? `<button class="small primary" data-action="tut-ack" data-id="${step.id}">Got it</button>` : '<small class="muted">Ticks off automatically when done.</small>'}
      <button class="small ghost" data-action="tut-list">${ctx.ui.tutList ? 'Hide steps' : 'All steps'}</button></div>
    ${ctx.ui.tutList ? `<ol class="tut-steps">${steps.map((x) => `<li class="${x.complete ? 'done' : x.id === step.id ? 'now' : ''}"><a href="${x.href}">${esc(x.title)}</a></li>`).join('')}</ol>` : ''}
  </aside>`;
}

function renderSidebar(active) {
  const g = ctx.game;
  return `<aside class="sidebar">
    <div class="logo">${liverySvg(g.airline.livery ?? { color: g.airline.color }, { size: 34, title: g.airline.name })}<div><b>${esc(g.airline.name)}</b><small>${esc(g.scenario?.name ?? g.airline.homeName)}</small></div></div>
    ${NAV.map((s) => `<div class="nav-section">${esc(s.section)}</div>${s.items
      .map(([key, label, icon]) => `<a href="#${key}" class="nav-item ${key === active ? 'active' : ''}"><span class="ico">${icon}</span>${label}${badge(key)}</a>`)
      .join('')}`).join('')}
    <div class="nav-foot"><button class="small ghost" data-action="menu">☰ Game menu</button></div>
  </aside>`;
}

function badge(key) {
  const g = ctx.game;
  const n = {
    dashboard: dashboard.issues(g).filter((i) => i.level === 'bad').length,
    charter: g.contracts.offers.filter((o) => o.category === 'charter').length,
    special: g.contracts.offers.filter((o) => o.category === 'special').length,
    management: g.subsidies.offers.length,
  }[key];
  return n ? `<span class="badge">${n}</span>` : '';
}

// A brief up/down flash on top-bar numbers that moved since the last turn.
function flashes(g) {
  const r = g.lastReport;
  const now = { week: g.week, cash: g.cash, profit: r?.profit ?? 0, lf: r?.lf ?? 0, fleet: g.fleet.length };
  const prev = ctx.ui.topPrev;
  if (!prev || prev.week !== now.week) ctx.ui.topFlash = prev && prev.week < now.week ? Object.fromEntries(['cash', 'profit', 'lf', 'fleet'].map((k) => [k, now[k] > prev[k] * (1 + 1e-6) + 1e-9 ? 'flash-up' : now[k] < prev[k] - 1e-9 ? 'flash-down' : ''])) : {};
  if (!prev || prev.week !== now.week) ctx.ui.topPrev = now;
  return ctx.ui.topFlash ?? {};
}

function renderTopbar(g) {
  const f = flashes(g);
  const r = g.lastReport;
  const playing = g.status === 'playing';
  const blocked = !playing || !!g.pendingEvent;
  const units = ['week', 'month', 'quarter', 'year'];
  return `<header class="topbar">
    <button class="icon-btn nav-toggle" data-action="toggle-nav" aria-label="Menu">☰</button>
    <div class="date"><b>${G.dateLabel(g.week)}</b><small>${esc(G.eraOf(G.yearOf(g.week)).name)} · ${G.quarterLabel(G.quarterKey(g.week))}</small></div>
    <div class="stats">
      <a class="stat" href="#finances"><label>${tipLabel('Cash')}</label><b class="${g.cash < 0 ? 'bad' : ''} ${f.cash ?? ''}">${money(g.cash)}</b></a>
      <a class="stat" href="#finances"><label>${tipLabel('Profit/wk')}</label><b class="${(r?.profit ?? 0) < 0 ? 'bad' : 'good'} ${f.profit ?? ''}">${money(r?.profit ?? 0)}</b></a>
      <a class="stat" href="#routes"><label>${tipLabel('Load')}</label><b class="${f.lf ?? ''}">${r ? pct(r.lf) : '–'}</b></a>
      <a class="stat" href="#fleet"><label>Fleet</label><b class="${f.fleet ?? ''}">${g.fleet.length}</b></a>
      <a class="stat hide-sm" href="#finances"><label>${tipLabel('Rating')}</label><b>${g.finance.rating}</b></a>
      <a class="stat hide-sm" href="#management/airline"><label>${tipLabel('Board')}</label><b class="${g.board.confidence < 25 ? 'bad' : ''}">${Math.round(g.board.confidence)}</b></a>
    </div>
    <div class="time">
      ${ctx.snapshot ? `<button class="ghost" data-action="revert" title="Revert to before the last time advance">↶</button>` : ''}
      ${g.advanceRemaining > 0 && !g.pendingEvent && playing ? `<button class="primary" data-action="advance" data-unit="continue">Continue ${g.advanceRemaining} wk ▶</button>` : ''}
      ${units.map((u, i) => `<button class="${i === 0 ? 'primary' : ''}" data-action="advance" data-unit="${u}" ${blocked ? 'disabled' : ''} title="Advance one ${u}">${u[0].toUpperCase() + u.slice(1)} ${'▶'.repeat(i ? 2 : 1)}</button>`).join('')}
    </div>
  </header>`;
}

export function slotTable(slots, { inGame = true } = {}) {
  if (!slots.length) return '<p class="muted small">No saved games yet.</p>';
  return `<table class="slots"><tbody>${slots.map((x) => `<tr class="${x.id === ctx.slot ? 'current' : ''}">
    <td><span class="dot" style="background:${esc(x.color ?? '#888')}"></span></td>
    <td><b>${esc(x.name)}</b><br><small class="muted">${esc(x.airline ?? '')}${x.scenario ? ` · ${esc(x.scenario)}` : ''} · ${G.dateLabel(x.week)}${x.status && x.status !== 'playing' ? ` · ${esc(x.status)}` : ''}</small></td>
    <td class="num"><small class="muted">${new Date(x.savedAt).toLocaleString()}<br>${Math.round((x.size ?? 0) / 1024)} KB</small></td>
    <td class="num">${x.id === ctx.slot && inGame ? '<small class="muted">playing</small>' : `<button class="small primary" data-action="slot-load" data-id="${x.id}">Load</button>`}
      <button class="small" data-action="slot-copy" data-id="${x.id}" title="Duplicate">⧉</button>
      ${x.id === ctx.slot && inGame ? '' : `<button class="small danger" data-action="slot-delete" data-id="${x.id}" title="Delete">✕</button>`}</td>
  </tr>`).join('')}</tbody></table>`;
}

function renderModal(g) {
  if (ctx.ui.menu) {
    const slots = saves.list();
    const current = slots.find((x) => x.id === ctx.slot);
    return `<div class="modal-backdrop"><div class="modal wide">
      <h2>Game menu</h2>
      <p class="muted">${esc(g.airline.name)} autosaves to its slot after every action.</p>
      ${current ? `<div class="row" data-form><input name="slotname" value="${esc(current.name)}" maxlength="40"><button class="small" data-action="slot-rename" data-id="${current.id}">Rename slot</button></div>` : ''}
      <div class="choices">
        <button data-action="close-menu">Back to the game</button>
        ${ctx.snapshot ? `<button data-action="revert">↶ Revert to before the last time advance${ctx.snapshot.week ? ` (${G.dateLabel(ctx.snapshot.week)})` : ''}</button>` : ''}
        ${G.tutorialCurrent(g) ? '' : '<button data-action="tut-show">Show the first-year tutorial</button>'}
        <button data-action="slot-new">Save as a new slot</button>
        <button data-action="export-save">Download save file</button>
        <label class="button-like">Import save file<input type="file" accept=".json" data-change="import-save" hidden></label>
        <button data-action="close-game">Close game (back to the title screen)</button>
        <button class="danger" data-action="abandon">Abandon airline (delete its slot)</button>
      </div>
      <h3>Saved games</h3>
      ${slotTable(slots)}
    </div></div>`;
  }
  if (['won', 'lost'].includes(g.status) && !ctx.ui.dismissedEnd) {
    const won = g.status === 'won';
    const goals = G.scenarioGoals(g);
    return `<div class="modal-backdrop"><div class="modal">
      <h3>${G.dateLabel(g.week)} · Scenario ${won ? 'complete' : 'over'}</h3>
      <h2>${won ? '🏆 ' : ''}${esc(g.scenario.name)}: ${won ? 'you did it' : 'out of time'}</h2>
      <ul class="plain">${goals.map((x) => `<li>${g.scenario.met[x.id] ? '✅' : '❌'} ${esc(x.label)}</li>`).join('')}</ul>
      <p>Score <b>${int(g.scenario.score)}</b>. You carried ${int(g.stats.pax)} passengers and earned ${money(g.stats.revenue)} in revenue.</p>
      <div class="choices"><button class="primary" data-action="free-play">Keep flying in free play</button><button data-action="dismiss-end">Review the airline</button><button data-action="abandon">Start a new game</button></div>
    </div></div>`;
  }
  if (g.status !== 'playing' && !ctx.ui.dismissedEnd) {
    const fired = g.status === 'fired';
    return `<div class="modal-backdrop"><div class="modal">
      <h3>${G.dateLabel(g.week)}</h3>
      <h2>${g.status === 'sold' ? `${esc(g.airline.name)} has been sold` : fired ? 'The board has fired you' : `${esc(g.airline.name)} has collapsed`}</h2>
      <p>${g.status === 'sold' ? `Shareholders accepted ${money(g.soldFor ?? 0)} for the airline.` : fired ? 'Shareholders lost patience with your results.' : 'Creditors have forced the airline into administration.'} You lasted ${(G.elapsed(g) / 52).toFixed(1)} years${g.scenario ? ` (scenario score ${int(g.scenario.score)})` : ` (score ${int(G.freeScore(g))})`}, carried ${int(g.stats.pax)} passengers and earned ${money(g.stats.revenue)} in revenue.</p>
      <div class="choices"><button data-action="dismiss-end">Review the wreckage</button><button class="primary" data-action="abandon">Start a new airline</button></div>
    </div></div>`;
  }
  const ev = g.pendingEvent;
  if (!ev) return '';
  return `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">
    <h3>Decision required · ${G.dateLabel(g.week)}</h3>
    <h2>${esc(ev.title)}</h2>
    <p>${esc(ev.text)}</p>
    <div class="choices">${ev.choices.map((c, i) => `<button data-action="choice" data-index="${i}" ${c.disabled ? 'disabled' : ''}><b>${esc(c.label)}</b>${c.hint ? `<small>${esc(c.hint)}</small>` : ''}</button>`).join('')}</div>
    ${g.advanceRemaining > 0 ? `<p class="muted small">Time will continue for ${g.advanceRemaining} more week(s) after you decide.</p>` : ''}
  </div></div>`;
}

// ---------------------------------------------------------------------------
// Actions

export function formValues(el) {
  const root = el.closest('[data-form]') ?? document;
  const out = {};
  for (const input of root.querySelectorAll('[name]')) {
    if (input.type === 'checkbox') out[input.name] = input.checked;
    else out[input.name] = input.value;
  }
  return out;
}

// Milestones and records reached during a time advance get a moment of glory.
function celebrate(before) {
  const g = ctx.game;
  const items = [];
  for (const m of (g.milestones ?? []).slice(before.milestones)) if (m.tone !== 'bad') items.push({ icon: '🏆', text: m.label });
  for (const l of g.log) {
    if (l.week <= before.week) break;
    if (l.category === 'record') items.push({ icon: l.text.startsWith('New record') ? '📈' : '🥇', text: l.text });
  }
  if (items.length) ctx.ui.celebrate = items.slice(0, 5);
}

function renderCelebration() {
  const items = ctx.ui.celebrate;
  if (!items?.length) return '';
  const confetti = Array.from({ length: 28 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-delay:${(i % 7) * 0.08}s;background:hsl(${(i * 47) % 360} 85% 60%)"></i>`).join('');
  return `<div class="celebrate" role="dialog" aria-label="Achievement"><div class="confetti">${confetti}</div>
    <div class="celebrate-card"><h2>${items.length > 1 ? 'Big week!' : 'Well done!'}</h2>
    <ul>${items.map((x) => `<li><span class="big">${x.icon}</span> ${esc(x.text)}</li>`).join('')}</ul>
    <div class="row"><button class="primary" data-action="dismiss-celebrate">Onwards ✈</button><a href="#history/timeline" class="small">Trophy cabinet ›</a></div></div></div>`;
}

const GLOBAL_ACTIONS = {
  'dismiss-celebrate': () => ((ctx.ui.celebrate = null), { skipRender: false }),
  advance(el) {
    if (el.dataset.unit !== 'continue') takeSnapshot();
    ctx.ui.celebrate = null;
    const before = { milestones: (ctx.game.milestones ?? []).length, week: ctx.game.week };
    const res = G.advance(ctx.game, el.dataset.unit);
    celebrate(before);
    if (res.ok && ctx.game.pendingEvent) return res;
    if (res.ok && res.ran > 1 && !ctx.game.pendingEvent) toast(`Advanced ${res.ran} weeks.`, 'info');
    return res;
  },
  choice(el) {
    const res = G.resolveEvent(ctx.game, Number(el.dataset.index));
    if (res.ok && ctx.game.advanceRemaining > 0) {
      const more = G.advance(ctx.game, 'continue');
      if (more.ok && !ctx.game.pendingEvent) toast(`Continued ${more.ran} more week(s).`, 'info');
    }
    return res;
  },
  'toggle-nav': () => (ctx.ui.navOpen = !ctx.ui.navOpen),
  menu: () => (ctx.ui.menu = true),
  'close-menu': () => (ctx.ui.menu = false),
  'dismiss-end': () => (ctx.ui.dismissedEnd = true),
  'tut-ack': (el) => G.tutorialAck(ctx.game, el.dataset.id),
  'tut-hide': () => G.setTutorial(ctx.game, false),
  'tut-show': () => ((ctx.ui.menu = false), G.setTutorial(ctx.game, true)),
  'tut-list': () => (ctx.ui.tutList = !ctx.ui.tutList),
  revert: () => (confirm(`Revert to the game as it was before your last time advance${ctx.snapshot?.week ? ` (${G.dateLabel(ctx.snapshot.week)})` : ''}?`) ? revert() : null),
  'slot-load': (el) => openSlot(el.dataset.id).then((r) => (r.ok && (location.hash = '#dashboard'), r)),
  'slot-delete': (el) => (confirm('Delete this saved game for good?') ? (saves.remove(el.dataset.id), el.dataset.id === ctx.slot && (ctx.slot = null), { ok: true, message: 'Save deleted.' }) : null),
  'slot-copy': (el) => saveGame().then(() => saves.duplicate(el.dataset.id)).then((r) => (r.ok ? { ok: true, message: 'Copied to a new slot.' } : r)),
  'slot-rename'(el) {
    const v = formValues(el);
    return saves.rename(el.dataset.id, v.slotname);
  },
  'slot-new'() {
    // "Save as": the current game continues in a new slot.
    ctx.slot = null;
    ctx.snapshot = null;
    return saveGame().then(() => ({ ok: true, message: 'Saved to a new slot — you are now playing in it.' }));
  },
  'close-game'() {
    return saveGame().then(() => {
      ctx.game = null;
      ctx.slot = null;
      ctx.snapshot = null;
      saves.setActive(null);
      ctx.ui = { navOpen: false };
      location.hash = '';
    });
  },
  'free-play': () => G.continueFreePlay(ctx.game),
  abandon() {
    if (!confirm('Abandon this airline? Its save slot will be deleted.')) return;
    if (ctx.slot) saves.remove(ctx.slot);
    ctx.ui = { navOpen: false };
    ctx.game = null;
    ctx.slot = null;
    ctx.snapshot = null;
    location.hash = '';
  },
  'export-save'() {
    const blob = new Blob([JSON.stringify(ctx.game)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${ctx.game.airline.name.replace(/\W+/g, '-')}-week${ctx.game.week}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};

const GLOBAL_CHANGES = {
  async 'import-save'(el) {
    const file = el.files?.[0];
    if (!file) return;
    try {
      const res = await saves.importText(await file.text(), file.name.replace(/\.json$/i, ''));
      if (!res.ok) throw new Error(res.error);
      await openSlot(res.id);
      render();
      toast('Save imported into a new slot.', 'info');
    } catch (err) {
      toast(`Could not load: ${err.message}`);
    }
    return { skipRender: true };
  },
};

const ACTIONS = { ...GLOBAL_ACTIONS };
const CHANGES = { ...GLOBAL_CHANGES };
for (const mod of [start, ...Object.values(PAGES)]) {
  Object.assign(ACTIONS, mod.actions ?? {});
  Object.assign(CHANGES, mod.changes ?? {});
}

function after(result) {
  if (result instanceof Promise) return result.then(after);
  if (result?.ok === false) toast(result.error);
  else if (result?.message && result.ok) toast(result.message, 'info');
  if (result?.skipRender) return;
  if (ctx.game) G.scheduleChanged(ctx.game);
  saveGame();
  render();
  return result;
}

function run(handler, el) {
  try {
    after(handler(el, ctx));
  } catch (err) {
    console.error(err);
    toast(`Error: ${err.message}`);
  }
}

// Touch screens have no hover: a tap on a tooltip label shows it instead of following the link around it.
const touchOnly = matchMedia('(hover: none)');
document.addEventListener('click', (e) => {
  const tip = touchOnly.matches && e.target.closest('.tip');
  for (const t of document.querySelectorAll('.tip.open')) if (t !== tip) t.classList.remove('open');
  if (tip) {
    e.preventDefault();
    tip.classList.toggle('open');
    return;
  }
  const el = e.target.closest('[data-action]');
  if (el && !el.disabled) {
    const handler = ACTIONS[el.dataset.action];
    if (handler) {
      e.preventDefault();
      run(handler, el);
    }
    return;
  }
  const link = e.target.closest('[data-href]');
  if (link) location.hash = link.dataset.href;
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  const handler = el && CHANGES[el.dataset.change];
  if (handler) run(handler, el);
});

// <details data-ui="key"> remember whether they're open across re-renders.
document.addEventListener('toggle', (e) => {
  const key = e.target?.dataset?.ui;
  if (key) ctx.ui[key] = e.target.open;
}, true);

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-live]');
  const handler = el && ACTIONS[`live:${el.dataset.live}`];
  if (handler) handler(el, ctx);
});

document.addEventListener('keydown', (e) => {
  if (!ctx.game || e.target.matches('input, select, textarea') || ctx.game.pendingEvent || ctx.ui.menu) return;
  const unit = { ' ': 'week', w: 'week', m: 'month', q: 'quarter', y: 'year' }[e.key];
  if (unit && ctx.game.status === 'playing') {
    e.preventDefault();
    after(GLOBAL_ACTIONS.advance({ dataset: { unit } }));
  }
});

window.addEventListener('hashchange', () => {
  ctx.ui.navOpen = false;
  ctx.ui.celebrate = null;
  render();
});

boot();
