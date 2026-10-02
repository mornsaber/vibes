// Browser front end. Renders the whole screen from the game state on every
// change and routes clicks through `data-action` attributes.

import * as G from './engine.js';
import { CITIES, AIRCRAFT, SERVICE_LEVELS, cityByCode, aircraftById } from './data.js';

const SAVE_KEY = 'airline-exec-sim/save-v1';
const TABS = ['overview', 'network', 'fleet', 'finance', 'strategy'];

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const toastEl = document.getElementById('toast');

let game = loadGame();
const ui = {
  tab: 'overview',
  from: null,
  to: null,
  start: { name: 'Skyward Air', hub: 'ORD', difficulty: 'normal' },
};

// ---------------------------------------------------------------------------
// Persistence

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveGame() {
  try {
    if (game) localStorage.setItem(SAVE_KEY, JSON.stringify(game));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the game still works without saving.
  }
}

// ---------------------------------------------------------------------------
// Helpers

const money = G.money;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (x) => `${Math.round(x * 100)}%`;
const int = (x) => Math.round(x).toLocaleString();
const tone = (x) => (x >= 0 ? 'good' : 'bad');
const cityName = (code) => `${cityByCode[code].name} (${code})`;

let toastTimer;
function toast(text, kind = 'error') {
  toastEl.textContent = text;
  toastEl.className = `show ${kind === 'error' ? '' : 'info'}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.className = ''), 3200);
}

function act(result) {
  if (result && result.ok === false) toast(result.error);
  if (result?.skipRender) return result;
  saveGame();
  render();
  return result;
}

function bar(value) {
  const cls = value < 50 ? 'low' : value < 75 ? 'mid' : '';
  return `<div class="bar ${cls}" title="${Math.round(value)}%"><span style="width:${Math.round(value)}%"></span></div>`;
}

function aircraftStatus(ac) {
  if (ac.deliveryWeek > game.week) return `<span class="pill warn">Arrives wk ${G.weekOfYear(ac.deliveryWeek)}</span>`;
  if (ac.checkUntil > game.week) return '<span class="pill warn">Heavy check</span>';
  if (!ac.routeId) return '<span class="pill bad">Idle</span>';
  return '<span class="pill good">Flying</span>';
}

// ---------------------------------------------------------------------------
// Rendering

function render() {
  if (!game) {
    modalRoot.innerHTML = '';
    app.innerHTML = renderStart();
    return;
  }
  app.innerHTML = `
    ${renderTopbar()}
    <nav class="tabs">
      ${TABS.map((t) => `<button data-action="tab" data-tab="${t}" class="${ui.tab === t ? 'active' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
    </nav>
    <main>${{ overview: renderOverview, network: renderNetwork, fleet: renderFleet, finance: renderFinance, strategy: renderStrategy }[ui.tab]()}</main>
  `;
  modalRoot.innerHTML = renderModal();
  if (ui.tab === 'overview') drawChart();
}

function renderStart() {
  const s = ui.start;
  const saved = loadGame();
  const hubs = [...CITIES].sort((a, b) => a.name.localeCompare(b.name));
  return `
    <div class="start">
      <div class="panel card stack">
        <div>
          <h1>✈️ Airline Executive Simulator</h1>
          <div class="tagline">You've just been named CEO of a startup airline. Build a network, manage the fleet, and keep the board on side. Run out of cash or lose the board's confidence and you're out.</div>
        </div>
        ${saved ? `<button class="primary" data-action="continue">Continue ${esc(saved.airline.name)} — ${G.dateLabel(saved.week)}</button><hr style="border:none;border-top:1px solid var(--border);width:100%">` : ''}
        <div class="field">
          <label for="airline-name">Airline name</label>
          <input id="airline-name" data-input="start-name" maxlength="32" value="${esc(s.name)}" />
        </div>
        <div class="field">
          <label>Hub airport</label>
          <div class="hub-grid">
            ${hubs.map((c) => `<button data-action="start-hub" data-code="${c.code}" class="${s.hub === c.code ? 'active' : ''}">${c.code} · ${esc(c.name)}<small>${c.pop}M people · ${'★'.repeat(c.hub) || '–'} competition</small></button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>Difficulty</label>
          <div class="row">
            ${Object.entries(G.DIFFICULTY).map(([k, d]) => `<button data-action="start-diff" data-diff="${k}" class="${s.difficulty === k ? 'primary' : ''}">${d.label} · ${money(d.cash)}</button>`).join('')}
          </div>
        </div>
        <button class="primary" data-action="start">Take the controls</button>
      </div>
    </div>`;
}

function renderTopbar() {
  const price = G.sharePrice(game);
  const conf = game.board.confidence;
  return `
    <header class="topbar">
      <div class="brand"><strong>${esc(game.airline.name)}</strong><span>${G.dateLabel(game.week)} · Hub ${game.airline.hub}</span></div>
      <div class="stats">
        <div class="stat"><label>Cash</label><b class="${tone(game.cash)}">${money(game.cash)}</b></div>
        <div class="stat"><label>Share price</label><b>$${price.toFixed(2)}</b></div>
        <div class="stat"><label>Reputation</label><b>${Math.round(game.reputation)}</b></div>
        <div class="stat"><label>Morale</label><b class="${game.morale < 35 ? 'bad' : ''}">${Math.round(game.morale)}</b></div>
        <div class="stat"><label>Board</label><b class="${conf < 25 ? 'bad' : conf > 70 ? 'good' : ''}">${Math.round(conf)}</b></div>
        <div class="stat"><label>Fuel</label><b>$${game.fuelPrice.toFixed(2)}/kg</b></div>
      </div>
      <div class="controls">
        <button class="primary" data-action="next" data-weeks="1" ${game.status !== 'playing' ? 'disabled' : ''}>Next week ▶</button>
        <button data-action="next" data-weeks="4" ${game.status !== 'playing' ? 'disabled' : ''}>+4 ▶▶</button>
        <button data-action="menu" title="New game">☰</button>
      </div>
    </header>`;
}

function renderOverview() {
  const r = game.lastReport;
  const quarter = game.history.slice(-G.WEEKS_PER_QUARTER);
  const qProfit = quarter.reduce((s, h) => s + h.profit, 0);
  const idle = game.fleet.filter((a) => !a.routeId && a.deliveryWeek <= game.week).length;
  const tips = [];
  if (!game.routes.length) tips.push('Open your first route on the <b>Network</b> tab.');
  if (!game.fleet.length) tips.push('Lease or buy aircraft on the <b>Fleet</b> tab.');
  if (idle) tips.push(`${idle} aircraft ${idle === 1 ? 'is' : 'are'} sitting idle — assign ${idle === 1 ? 'it' : 'them'} to a route on the <b>Fleet</b> tab.`);
  for (const route of game.routes) {
    if (route.last && route.last.aircraft === 0) tips.push(`${route.from}–${route.to} has no aircraft assigned.`);
    else if (route.last && route.last.loadFactor > 0.97) tips.push(`${route.from}–${route.to} is full — consider raising the fare or adding capacity.`);
  }
  if (r && r.profit < 0 && game.routes.length) {
    const contribution = game.routes.reduce((s, x) => s + (x.last?.contribution ?? 0), 0);
    const fixed = r.cost.leases + r.cost.overhead + r.cost.marketing + r.cost.interest + r.cost.depreciation;
    tips.push(`Routes contributed ${money(contribution)} last week, but fixed costs (leases, overhead, marketing, financing) were ${money(fixed)}. Grow profitable routes or trim costs.`);
  }
  for (const s of game.shocks) tips.push(`${s.name}: demand ×${s.mult} for ${s.weeks} more weeks.`);
  if (game.strikeWeeks) tips.push(`<span class="bad">Strike in progress (${game.strikeWeeks} weeks left).</span>`);

  return `
    <div class="stack" style="gap:16px">
      ${game.status !== 'playing' ? `<div class="panel bad"><h2>${game.status === 'fired' ? 'You have been fired by the board.' : 'Your airline is bankrupt.'}</h2>Start a new game from the ☰ menu.</div>` : ''}
      <div class="grid kpis">
        <div class="kpi"><label>Revenue (last wk)</label><div>${money(r?.revenue ?? 0)}</div></div>
        <div class="kpi"><label>Profit (last wk)</label><div class="${tone(r?.profit ?? 0)}">${money(r?.profit ?? 0)}</div></div>
        <div class="kpi"><label>Profit (13 wks)</label><div class="${tone(qProfit)}">${money(qProfit)}</div></div>
        <div class="kpi"><label>Passengers (last wk)</label><div>${int(r?.pax ?? 0)}</div></div>
        <div class="kpi"><label>Load factor</label><div>${r ? pct(r.loadFactor) : '–'}</div></div>
        <div class="kpi"><label>Fleet / Routes</label><div>${game.fleet.length} / ${game.routes.length}</div></div>
      </div>
      <div class="grid cols-2">
        <div class="panel">
          <h2>Performance</h2>
          <canvas class="chart" id="chart"></canvas>
          <div class="legend"><span><i style="background:var(--good)"></i>Weekly profit</span><span><i style="background:var(--bad)"></i>Weekly loss</span><span><i style="background:var(--accent)"></i>Cash</span></div>
        </div>
        <div class="panel">
          <h2>Network</h2>
          ${renderMap(false)}
        </div>
      </div>
      <div class="grid cols-2">
        <div class="panel">
          <h2>Briefing</h2>
          ${tips.length ? `<ul class="stack" style="margin:0;padding-left:18px">${tips.slice(0, 8).map((t) => `<li>${t}</li>`).join('')}</ul>` : '<p class="muted">Operations are running smoothly.</p>'}
        </div>
        <div class="panel">
          <h2>News</h2>
          ${renderNews(30)}
        </div>
      </div>
    </div>`;
}

function renderNews(limit) {
  return `<ul class="news">${game.log
    .slice(0, limit)
    .map((n) => `<li class="${n.tone}"><span class="when">W${G.weekOfYear(n.week)}</span><span class="text">${esc(n.text)}</span></li>`)
    .join('')}</ul>`;
}

// Equirectangular projection cropped to where the airports are.
const MAP = { w: 1000, h: 330, latTop: 72, latBottom: -45 };
const project = (c) => [((c.lon + 180) / 360) * MAP.w, ((MAP.latTop - c.lat) / (MAP.latTop - MAP.latBottom)) * MAP.h];

function arc(a, b, cls, extra = '') {
  let [x1, y1] = project(a);
  let [x2, y2] = project(b);
  const paths = [];
  // Routes across the Pacific wrap around the map edge.
  const variants = Math.abs(x2 - x1) > MAP.w / 2 ? [[0, x2 < x1 ? MAP.w : -MAP.w], [x2 < x1 ? -MAP.w : MAP.w, 0]] : [[0, 0]];
  for (const [d1, d2] of variants) {
    const ax = x1 + d1, bx = x2 + d2;
    const mx = (ax + bx) / 2, my = (y1 + y2) / 2;
    const len = Math.hypot(bx - ax, y2 - y1);
    const cx = mx + ((y2 - y1) / (len || 1)) * len * 0.15;
    const cy = my - (Math.abs(bx - ax) / (len || 1)) * len * 0.15;
    paths.push(`<path class="${cls}" d="M${ax.toFixed(1)},${y1.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${bx.toFixed(1)},${y2.toFixed(1)}" ${extra}/>`);
  }
  return paths.join('');
}

function renderMap(interactive) {
  const served = new Set(G.stations(game));
  const grid = [];
  for (let lon = -150; lon <= 180; lon += 30) {
    const [x] = project({ lon, lat: 0 });
    grid.push(`<line class="grid-line" x1="${x}" y1="0" x2="${x}" y2="${MAP.h}"/>`);
  }
  for (let lat = -30; lat <= 60; lat += 30) {
    const [, y] = project({ lon: 0, lat });
    grid.push(`<line class="grid-line" x1="0" y1="${y}" x2="${MAP.w}" y2="${y}"/>`);
  }
  const routes = game.routes
    .map((r) => {
      const cls = !r.last || r.last.aircraft === 0 ? 'route idle' : r.last.contribution < 0 ? 'route loss' : 'route';
      const width = 1 + Math.min(4, (r.last?.roundTrips ?? 0) / 8);
      return arc(cityByCode[r.from], cityByCode[r.to], cls, `stroke-width="${width}"`);
    })
    .join('');
  const preview = interactive && ui.from && ui.to ? arc(cityByCode[ui.from], cityByCode[ui.to], 'preview') : '';
  const cities = CITIES.map((c) => {
    const [x, y] = project(c);
    const isServed = served.has(c.code);
    const cls = ['city', isServed && 'served', c.code === game.airline.hub && 'hub', interactive && (c.code === ui.from || c.code === ui.to) && 'selected'].filter(Boolean).join(' ');
    const r = 3 + Math.sqrt(c.pop) * 0.6;
    return `<g ${interactive ? `data-action="map-city" data-code="${c.code}" style="cursor:pointer"` : ''}>
      ${interactive ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="transparent"/>` : ''}
      <circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"><title>${esc(c.name)} (${c.code}) — ${c.pop}M</title></circle>
      <text class="label ${isServed ? 'served' : ''}" x="${(x + r + 2).toFixed(1)}" y="${(y + 4).toFixed(1)}">${c.code}</text>
    </g>`;
  }).join('');
  return `<svg class="map" viewBox="0 0 ${MAP.w} ${MAP.h}" role="img" aria-label="Route map">${grid.join('')}${routes}${preview}${cities}</svg>`;
}

function renderNetwork() {
  const served = G.stations(game);
  const allCodes = [...CITIES].sort((a, b) => a.name.localeCompare(b.name));
  let planner = '<p class="muted">Pick an origin and destination — or click two airports on the map.</p>';
  if (ui.from && ui.to && ui.from !== ui.to) {
    const d = G.distanceKm(ui.from, ui.to);
    const ref = G.referenceFare(d);
    const market = G.marketDemand(ui.from, ui.to) * 2;
    const cost = G.routeOpenCost(ui.from, ui.to);
    const exists = game.routes.some((r) => (r.from === ui.from && r.to === ui.to) || (r.from === ui.to && r.to === ui.from));
    const reachable = AIRCRAFT.filter((t) => t.range >= d);
    planner = `
      <table class="statement">
        <tr><td>Distance</td><td>${int(d)} km</td></tr>
        <tr><td>Market size (all airlines, both ways)</td><td>~${int(market)} pax/wk</td></tr>
        <tr><td>Typical one-way fare</td><td>$${ref}</td></tr>
        <tr><td>Airport competition</td><td>${'★'.repeat(Math.round((cityByCode[ui.from].hub + cityByCode[ui.to].hub) / 2)) || 'Low'}</td></tr>
        <tr><td>Start-up cost</td><td>${money(cost)}</td></tr>
      </table>
      <h3 style="margin-top:12px">Aircraft that can fly it</h3>
      ${reachable.length ? `<div class="table-wrap"><table><tr><th>Type</th><th class="right">Round trips/wk</th><th class="right">Seats/wk each way</th></tr>
        ${reachable.map((t) => `<tr><td>${t.name}</td><td class="right num">${G.roundTripsPerWeek(t, d)}</td><td class="right num">${int(G.roundTripsPerWeek(t, d) * t.seats)}</td></tr>`).join('')}
      </table></div>` : '<p class="bad">No aircraft has the range for this route.</p>'}
      <div class="row" style="margin-top:12px">
        <button class="primary" data-action="open-route" ${exists ? 'disabled' : ''}>${exists ? 'Already flown' : `Open route (${money(cost)})`}</button>
      </div>`;
  }

  const rows = game.routes
    .map((r) => {
      const l = r.last;
      const ref = G.referenceFare(r.distance);
      const planes = game.fleet.filter((a) => a.routeId === r.id);
      return `<tr>
        <td><b>${r.from}–${r.to}</b><br><small class="muted">${int(r.distance)} km · ${r.competitors} rival${r.competitors === 1 ? '' : 's'}</small></td>
        <td>${planes.map((a) => `<span class="pill" title="${aircraftById[a.type].name}">${a.reg}</span>`).join(' ') || '<span class="muted">none</span>'}</td>
        <td class="right num">${l ? int(l.roundTrips * 2) : '–'}</td>
        <td><input type="number" min="1" step="5" value="${r.fare}" data-change="fare" data-id="${r.id}" /> <small class="muted">ref $${ref} · rivals $${r.compFare}</small></td>
        <td class="right num">${l ? `${int(l.pax)} / ${int(l.demand)}` : '–'}</td>
        <td class="right num">${l && l.seats ? pct(l.loadFactor) : '–'}</td>
        <td class="right num">${l ? money(l.revenue) : '–'}</td>
        <td class="right num ${l ? tone(l.contribution) : ''}">${l ? money(l.contribution) : '–'}</td>
        <td><button class="small danger" data-action="close-route" data-id="${r.id}">Close</button></td>
      </tr>`;
    })
    .join('');

  return `
    <div class="stack" style="gap:16px">
      <div class="grid cols-2">
        <div class="panel">
          <h2>Route map</h2>
          ${renderMap(true)}
          <p class="muted" style="margin-bottom:0"><span class="warn">●</span> hub · <span style="color:var(--accent)">●</span> served · red lines lose money · dashed lines have no aircraft</p>
        </div>
        <div class="panel">
          <h2>Route planner</h2>
          <div class="row" style="margin-bottom:12px">
            <select data-change="from">
              <option value="">From…</option>
              ${served.map((c) => `<option value="${c}" ${ui.from === c ? 'selected' : ''}>${esc(cityName(c))}</option>`).join('')}
            </select>
            <span>→</span>
            <select data-change="to">
              <option value="">To…</option>
              ${allCodes.filter((c) => c.code !== ui.from).map((c) => `<option value="${c.code}" ${ui.to === c.code ? 'selected' : ''}>${esc(cityName(c.code))}</option>`).join('')}
            </select>
          </div>
          ${planner}
        </div>
      </div>
      <div class="panel">
        <h2>Routes</h2>
        ${game.routes.length ? `<div class="table-wrap"><table>
          <tr><th>Route</th><th>Aircraft</th><th class="right">Flights/wk</th><th>Fare</th><th class="right">Pax / demand</th><th class="right">Load</th><th class="right">Revenue</th><th class="right">Contribution</th><th></th></tr>
          ${rows}
        </table></div><p class="muted" style="margin-bottom:0">Contribution = route revenue minus fuel, crew, maintenance, fees, service and distribution. Leases and overhead are paid centrally.</p>` : '<p class="muted">No routes yet.</p>'}
      </div>
    </div>`;
}

function renderFleet() {
  const market = AIRCRAFT.map(
    (t) => `<tr>
      <td><b>${t.name}</b><br><small class="muted">${t.category}</small></td>
      <td class="right num">${t.seats}</td>
      <td class="right num">${int(t.range)} km</td>
      <td class="right num">${t.burn.toFixed(1)} kg/km</td>
      <td class="right num">${money(t.price)}</td>
      <td class="right num">${money(G.weeklyLease(t))}</td>
      <td><div class="row">
        <button class="small" data-action="lease" data-type="${t.id}">Lease</button>
        <button class="small" data-action="buy" data-type="${t.id}" ${game.cash < t.price ? 'disabled' : ''}>Buy</button>
      </div></td>
    </tr>`,
  ).join('');

  const fleet = game.fleet
    .map((ac) => {
      const t = aircraftById[ac.type];
      const options = game.routes
        .filter((r) => t.range >= r.distance)
        .map((r) => `<option value="${r.id}" ${ac.routeId === r.id ? 'selected' : ''}>${r.from}–${r.to}</option>`)
        .join('');
      return `<tr>
        <td><b>${ac.reg}</b><br><small class="muted">${t.name}</small></td>
        <td>${ac.owned ? 'Owned' : 'Leased'}</td>
        <td class="right num">${(ac.ageWeeks / 52).toFixed(1)} yrs</td>
        <td>${bar(ac.condition)}</td>
        <td>${aircraftStatus(ac)}</td>
        <td><select data-change="assign" data-id="${ac.id}"><option value="">— Unassigned —</option>${options}</select></td>
        <td><div class="row">
          <button class="small" data-action="check" data-id="${ac.id}" title="Restore condition to 100%. Out of service for 2 weeks." ${!G.isAvailable(game, ac) ? 'disabled' : ''}>Heavy check (${money(t.price * 0.015)})</button>
          <button class="small danger" data-action="sell" data-id="${ac.id}">${ac.owned ? `Sell (${money(G.aircraftValue(ac))})` : 'Return'}</button>
        </div></td>
      </tr>`;
    })
    .join('');

  return `
    <div class="stack" style="gap:16px">
      <div class="panel">
        <h2>Your fleet</h2>
        ${game.fleet.length ? `<div class="table-wrap"><table>
          <tr><th>Aircraft</th><th>Ownership</th><th class="right">Age</th><th>Condition</th><th>Status</th><th>Route</th><th></th></tr>
          ${fleet}
        </table></div>` : '<p class="muted">No aircraft yet. Leasing is cheap to start; buying avoids weekly lease payments.</p>'}
      </div>
      <div class="panel">
        <h2>Aircraft market</h2>
        <div class="table-wrap"><table>
          <tr><th>Type</th><th class="right">Seats</th><th class="right">Range</th><th class="right">Fuel burn</th><th class="right">Price</th><th class="right">Lease/wk</th><th></th></tr>
          ${market}
        </table></div>
        <p class="muted" style="margin-bottom:0">Purchases arrive in 4 weeks, leases in 2. Lease signing fee is 2 weeks' rent; returning a delivered lease early costs 6 weeks' rent.</p>
      </div>
    </div>`;
}

function renderFinance() {
  const r = game.lastReport;
  const quarter = game.history.slice(-G.WEEKS_PER_QUARTER);
  const labels = {
    fuel: 'Fuel', crew: 'Crew', maintenance: 'Maintenance', fees: 'Airport & navigation fees', service: 'Onboard service',
    distribution: 'Distribution', leases: 'Aircraft leases', marketing: 'Marketing', overhead: 'Overhead', interest: 'Interest', depreciation: 'Depreciation',
  };
  const statement = r
    ? `<table class="statement">
        <tr><td><b>Revenue</b></td><td class="good">${money(r.revenue)}</td></tr>
        ${Object.entries(r.cost).map(([k, v]) => `<tr><td class="muted">${labels[k] ?? k}</td><td>${money(-v)}</td></tr>`).join('')}
        <tr class="total"><td>Net profit</td><td class="${tone(r.profit)}">${money(r.profit)}</td></tr>
      </table>`
    : '<p class="muted">No weeks played yet.</p>';

  const equity = game.cash + G.ownedFleetValue(game) - G.totalDebt(game);
  const loans = game.loans
    .map((l) => `<tr>
      <td class="num">${money(l.original)}</td><td class="num">${(l.rate * 100).toFixed(1)}%</td><td class="num">${money(l.principal)}</td>
      <td class="num">${money(l.payment)}</td><td class="num">${l.weeksLeft}</td>
      <td><button class="small" data-action="repay" data-id="${l.id}" ${game.cash < l.principal ? 'disabled' : ''}>Repay</button></td>
    </tr>`)
    .join('');
  const limit = G.creditLimit(game);

  return `
    <div class="grid cols-2">
      <div class="panel">
        <h2>Last week's income statement</h2>
        ${statement}
      </div>
      <div class="stack" style="gap:16px">
        <div class="panel">
          <h2>Balance sheet</h2>
          <table class="statement">
            <tr><td>Cash</td><td>${money(game.cash)}</td></tr>
            <tr><td>Owned aircraft (market value)</td><td>${money(G.ownedFleetValue(game))}</td></tr>
            <tr><td>Debt</td><td>${money(-G.totalDebt(game))}</td></tr>
            <tr class="total"><td>Net assets</td><td class="${tone(equity)}">${money(equity)}</td></tr>
          </table>
          <p class="muted">13-week profit: <b class="${tone(quarter.reduce((s, h) => s + h.profit, 0))}">${money(quarter.reduce((s, h) => s + h.profit, 0))}</b> · Share price $${G.sharePrice(game).toFixed(2)}</p>
        </div>
        <div class="panel">
          <h2>Loans</h2>
          ${game.loans.length ? `<div class="table-wrap"><table><tr><th>Amount</th><th>Rate</th><th>Owed</th><th>Weekly</th><th>Weeks left</th><th></th></tr>${loans}</table></div>` : '<p class="muted">No outstanding loans.</p>'}
          <div class="row" style="margin-top:12px">
            <input type="number" id="loan-amount" min="1000000" step="1000000" value="${Math.min(10e6, Math.floor(limit / 1e6) * 1e6)}" style="width:150px" />
            <button data-action="loan" ${limit < 1e6 ? 'disabled' : ''}>Borrow</button>
            <span class="muted">Available ${money(limit)} at ${(G.loanRate(game) * 100).toFixed(1)}% · 5-year term</span>
          </div>
        </div>
      </div>
    </div>`;
}

function renderStrategy() {
  const s = game.settings;
  const svc = SERVICE_LEVELS[s.service - 1];
  return `
    <div class="grid cols-2">
      <div class="panel stack">
        <h2>Commercial strategy</h2>
        <div class="field">
          <label>Weekly marketing budget: <b>${money(s.marketing)}</b></label>
          <input type="range" min="0" max="2000000" step="25000" value="${s.marketing}" data-change="marketing" />
          <small class="muted">Boosts demand on every route (diminishing returns as your network grows) and slowly builds reputation.</small>
        </div>
        <div class="field">
          <label>Onboard service: <b>${svc.name}</b></label>
          <div class="row">${SERVICE_LEVELS.map((l) => `<button class="${l.level === s.service ? 'primary' : ''}" data-action="service" data-level="${l.level}">${l.name}</button>`).join('')}</div>
          <small class="muted">Costs ~$${svc.costPerPax} per passenger (more on long flights). Better service wins passengers and lifts reputation over time.</small>
        </div>
      </div>
      <div class="panel stack">
        <h2>People</h2>
        <div class="field">
          <label>Crew pay vs market: <b>${Math.round(s.wages * 100)}%</b></label>
          <input type="range" min="0.7" max="1.5" step="0.01" value="${s.wages}" data-change="wages" />
          <small class="muted">Higher pay raises morale; low morale damages reputation and can trigger strikes. Pay cuts hit morale immediately.</small>
        </div>
        <table class="statement">
          <tr><td>Staff morale</td><td>${Math.round(game.morale)} / 100</td></tr>
          <tr><td>Reputation</td><td>${Math.round(game.reputation)} / 100</td></tr>
          <tr><td>Board confidence</td><td>${Math.round(game.board.confidence)} / 100</td></tr>
        </table>
        <p class="muted" style="margin:0">The board reviews performance every quarter, judging profit and share price. If its confidence hits zero, you're fired. Six straight weeks with negative cash means bankruptcy.</p>
      </div>
    </div>`;
}

function renderModal() {
  if (ui.menu) {
    return `<div class="modal-backdrop"><div class="modal">
      <h2>Menu</h2>
      <p>Your game autosaves in this browser after every action.</p>
      <div class="choices">
        <button data-action="close-menu">Back to the game</button>
        <button class="danger" data-action="abandon">Abandon this airline and start over</button>
      </div>
    </div></div>`;
  }
  const ev = game.pendingEvent;
  if (!ev) return '';
  return `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">
    <h3>${G.dateLabel(game.week)}</h3>
    <h2>${esc(ev.title)}</h2>
    <p>${esc(ev.text)}</p>
    <div class="choices">
      ${ev.choices.map((c, i) => `<button data-action="choice" data-index="${i}" ${c.disabled ? 'disabled' : ''}><b>${esc(c.label)}</b>${c.hint ? `<small>${esc(c.hint)}</small>` : ''}</button>`).join('')}
    </div>
  </div></div>`;
}

function drawChart() {
  const canvas = document.getElementById('chart');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const color = (v) => css.getPropertyValue(v).trim();

  const data = game.history.slice(-52);
  ctx.font = '11px system-ui';
  if (!data.length) {
    ctx.fillStyle = color('--muted');
    ctx.fillText('Advance a week to see results.', 10, h / 2);
    return;
  }
  const pad = { l: 8, r: 8, t: 10, b: 18 };
  const pw = w - pad.l - pad.r;
  const ph = h - pad.t - pad.b;
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.profit)));
  const zero = pad.t + ph / 2;
  const step = pw / Math.max(data.length, 13);

  ctx.strokeStyle = color('--border');
  ctx.beginPath();
  ctx.moveTo(pad.l, zero);
  ctx.lineTo(w - pad.r, zero);
  ctx.stroke();

  data.forEach((d, i) => {
    const bh = (d.profit / maxAbs) * (ph / 2);
    ctx.fillStyle = d.profit >= 0 ? color('--good') : color('--bad');
    ctx.fillRect(pad.l + i * step + 1, d.profit >= 0 ? zero - bh : zero, Math.max(1, step - 2), Math.abs(bh));
  });

  const cashLo = Math.min(...data.map((d) => d.cash));
  const cashHi = Math.max(...data.map((d) => d.cash));
  const span = Math.max(cashHi - cashLo, Math.abs(cashHi) * 0.05, 1);
  const cashMin = cashLo - span * 0.1;
  const cashMax = cashHi + span * 0.1;
  ctx.strokeStyle = color('--accent');
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = pad.l + i * step + step / 2;
    const y = pad.t + ph - ((d.cash - cashMin) / (cashMax - cashMin || 1)) * ph;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = color('--muted');
  ctx.fillText(`±${money(maxAbs)}/wk`, pad.l, h - 4);
  const label = `Cash ${money(data[data.length - 1].cash)}`;
  ctx.fillText(label, w - pad.r - ctx.measureText(label).width, h - 4);
}

// ---------------------------------------------------------------------------
// Input handling

const actions = {
  'start-hub': (el) => (ui.start.hub = el.dataset.code),
  'start-diff': (el) => (ui.start.difficulty = el.dataset.diff),
  start() {
    game = G.newGame({ name: ui.start.name.trim() || 'Skyward Air', hub: ui.start.hub, difficulty: ui.start.difficulty });
    ui.tab = 'overview';
    ui.from = game.airline.hub;
    ui.to = null;
  },
  continue() {
    game = loadGame();
    ui.from = game?.airline.hub ?? null;
  },
  tab: (el) => (ui.tab = el.dataset.tab),
  next(el) {
    const weeks = Number(el.dataset.weeks);
    for (let i = 0; i < weeks; i++) {
      const res = G.advanceWeek(game);
      if (!res.ok) return res;
      if (game.pendingEvent || game.status !== 'playing') break;
    }
  },
  choice: (el) => G.resolveEvent(game, Number(el.dataset.index)),
  'map-city'(el) {
    const code = el.dataset.code;
    const served = G.stations(game).includes(code);
    if (!ui.from || (ui.from && ui.to)) {
      if (served) {
        ui.from = code;
        ui.to = null;
      } else {
        ui.to = code;
      }
    } else if (code !== ui.from) {
      ui.to = code;
    }
  },
  'open-route'() {
    const res = G.openRoute(game, ui.from, ui.to);
    if (res.ok) {
      ui.to = null;
      toast(`Route opened. Assign an aircraft to ${res.route.from}–${res.route.to} on the Fleet tab.`, 'info');
    }
    return res;
  },
  'close-route': (el) => (confirm('Close this route? Its aircraft become idle.') ? G.closeRoute(game, el.dataset.id) : null),
  lease: (el) => G.leaseAircraft(game, el.dataset.type),
  buy: (el) => G.buyAircraft(game, el.dataset.type),
  sell: (el) => (confirm('Are you sure?') ? G.sellAircraft(game, el.dataset.id) : null),
  check: (el) => G.heavyCheck(game, el.dataset.id),
  loan: () => G.takeLoan(game, document.getElementById('loan-amount').value),
  repay: (el) => G.repayLoan(game, el.dataset.id),
  service: (el) => G.updateSettings(game, { service: Number(el.dataset.level) }),
  menu: () => (ui.menu = true),
  'close-menu': () => (ui.menu = false),
  abandon() {
    if (!confirm('Abandon this airline? Your save will be deleted.')) return;
    ui.menu = false;
    game = null;
  },
};

const changes = {
  from: (el) => ((ui.from = el.value || null), ui.to === ui.from && (ui.to = null)),
  to: (el) => (ui.to = el.value || null),
  fare(el) {
    // Don't re-render: this fires on blur, and replacing the DOM would swallow the click that caused it.
    const res = G.setFare(game, el.dataset.id, el.value);
    if (res.ok) el.value = res.fare;
    saveGame();
    return { ok: true, skipRender: true };
  },
  assign: (el) => G.assignAircraft(game, el.dataset.id, el.value || null),
  marketing: (el) => G.updateSettings(game, { marketing: el.value }),
  wages: (el) => G.updateSettings(game, { wages: el.value }),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  act(actions[el.dataset.action]?.(el));
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  act(changes[el.dataset.change]?.(el));
});

// Keep the airline name in sync while typing without re-rendering (which would steal focus).
document.addEventListener('input', (e) => {
  if (e.target.dataset?.input === 'start-name') ui.start.name = e.target.value;
});

document.addEventListener('keydown', (e) => {
  if (!game || e.target.matches('input, select, textarea')) return;
  if (e.key === ' ' || e.key === 'Enter') {
    if (game.pendingEvent || ui.menu || game.status !== 'playing') return;
    e.preventDefault();
    act(actions.next({ dataset: { weeks: e.shiftKey ? 4 : 1 } }));
  }
});

window.addEventListener('resize', () => game && ui.tab === 'overview' && drawChart());

if (game) ui.from = game.airline.hub;
render();
