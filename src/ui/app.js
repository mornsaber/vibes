// Application shell: hash router, sidebar navigation, top bar with time
// controls, decision modal, persistence and the global action dispatcher.

import { G, esc, money, pct, int, liverySvg } from './util.js';
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

const SAVE_KEY = 'airline-exec-sim/save-v3';

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

export const ctx = { game: loadGame(), ui: { navOpen: false } };

// ---------------------------------------------------------------------------
// Persistence

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? G.migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
export function saveGame() {
  try {
    if (ctx.game) localStorage.setItem(SAVE_KEY, JSON.stringify(ctx.game));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage unavailable (private mode or full) — play continues unsaved.
  }
}
export const hasSave = () => !!loadGame();
export const savedGame = loadGame;

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
      <div class="main-col">
        ${renderTopbar(g)}
        <main id="page">${body}</main>
      </div>
    </div>`;
  modalRoot.innerHTML = renderModal(g);
  mod.after?.({ ...ctx, state: g, params });
  if (keepScroll) window.scrollTo(0, y);
  else window.scrollTo(0, 0);
  lastHash = location.hash;
  document.title = `${g.airline.name} · ${G.dateLabel(g.week)}`;
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

function renderTopbar(g) {
  const r = g.lastReport;
  const playing = g.status === 'playing';
  const blocked = !playing || !!g.pendingEvent;
  const units = ['week', 'month', 'quarter', 'year'];
  return `<header class="topbar">
    <button class="icon-btn nav-toggle" data-action="toggle-nav" aria-label="Menu">☰</button>
    <div class="date"><b>${G.dateLabel(g.week)}</b><small>${esc(G.eraOf(G.yearOf(g.week)).name)} · ${G.quarterLabel(G.quarterKey(g.week))}</small></div>
    <div class="stats">
      <a class="stat" href="#finances"><label>Cash</label><b class="${g.cash < 0 ? 'bad' : ''}">${money(g.cash)}</b></a>
      <a class="stat" href="#finances"><label>Profit/wk</label><b class="${(r?.profit ?? 0) < 0 ? 'bad' : 'good'}">${money(r?.profit ?? 0)}</b></a>
      <a class="stat" href="#routes"><label>Load</label><b>${r ? pct(r.lf) : '–'}</b></a>
      <a class="stat" href="#fleet"><label>Fleet</label><b>${g.fleet.length}</b></a>
      <a class="stat hide-sm" href="#finances"><label>Rating</label><b>${g.finance.rating}</b></a>
      <a class="stat hide-sm" href="#management/airline"><label>Board</label><b class="${g.board.confidence < 25 ? 'bad' : ''}">${Math.round(g.board.confidence)}</b></a>
    </div>
    <div class="time">
      ${g.advanceRemaining > 0 && !g.pendingEvent && playing ? `<button class="primary" data-action="advance" data-unit="continue">Continue ${g.advanceRemaining} wk ▶</button>` : ''}
      ${units.map((u, i) => `<button class="${i === 0 ? 'primary' : ''}" data-action="advance" data-unit="${u}" ${blocked ? 'disabled' : ''} title="Advance one ${u}">${u[0].toUpperCase() + u.slice(1)} ${'▶'.repeat(i ? 2 : 1)}</button>`).join('')}
    </div>
  </header>`;
}

function renderModal(g) {
  if (ctx.ui.menu) {
    return `<div class="modal-backdrop"><div class="modal">
      <h2>Game menu</h2>
      <p class="muted">${esc(g.airline.name)} autosaves in this browser after every action.</p>
      <div class="choices">
        <button data-action="close-menu">Back to the game</button>
        <button data-action="export-save">Download save file</button>
        <label class="button-like">Load save file<input type="file" accept=".json" data-change="import-save" hidden></label>
        <button class="danger" data-action="abandon">Abandon airline and start over</button>
      </div>
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

const GLOBAL_ACTIONS = {
  advance(el) {
    const res = G.advance(ctx.game, el.dataset.unit);
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
  'free-play': () => G.continueFreePlay(ctx.game),
  abandon() {
    if (!confirm('Abandon this airline? Your save will be deleted.')) return;
    ctx.ui = { navOpen: false };
    ctx.game = null;
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
      const g = G.migrate(JSON.parse(await file.text()));
      if (!g) throw new Error('Not a compatible save file');
      ctx.game = g;
      ctx.ui = { navOpen: false };
      saveGame();
      render();
      toast('Save loaded.', 'info');
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
  saveGame();
  render();
}

function run(handler, el) {
  try {
    after(handler(el, ctx));
  } catch (err) {
    console.error(err);
    toast(`Error: ${err.message}`);
  }
}

document.addEventListener('click', (e) => {
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
  render();
});

render();
