import { G, esc, money, pct, int, num, kpi, panel, table, tabs, options, airportOptions, bar, pill, ap, typeName, statusPill } from '../util.js';
import { formValues } from '../app.js';

export function render(c) {
  const tab = c.params[0] ?? 'hubs';
  const body = { hubs, capacity, crew, slots }[tab] ?? hubs;
  return `<div class="page-head"><h1>Planning</h1></div>
  ${tabs('planning', [['hubs', 'Hubs'], ['capacity', 'Fleet capacity & idle'], ['crew', 'Crew plan'], ['slots', 'Slots']], tab)}
  ${body(c)}`;
}

export function hubRows(s) {
  return s.hubs.map((h) => {
    const spokes = s.routes.filter((r) => r.a === h.code || r.b === h.code);
    return {
      h,
      spokes: spokes.length,
      deps: spokes.reduce((t, r) => t + (r.last?.flights ?? 0) / 2, 0),
      connecting: spokes.reduce((t, r) => t + (r.last?.connecting ?? 0), 0) / 2,
      pax: spokes.reduce((t, r) => t + (r.last?.paxTotal ?? 0), 0),
    };
  });
}

export function hubsPanel(s) {
  const candidates = G.AIRPORTS.filter((a) => G.sameMarket(s.airline.home, a.country) && !G.isHub(s, a.code) && a.runway >= 1800).map((a) => a.code);
  return panel('Your hubs', `${table(hubRows(s), [
    { h: 'Hub', v: (r) => `<b>${r.h.code}</b> ${esc(ap(r.h.code).city)}` },
    { h: 'Spokes', cls: 'num', v: (r) => r.spokes },
    { h: 'Departures/wk', cls: 'num', v: (r) => int(r.deps) },
    { h: 'Pax/wk', cls: 'num', v: (r) => int(r.pax) },
    { h: 'Connecting/wk', cls: 'num', v: (r) => int(r.connecting) },
    { h: 'Connections', v: (r) => ['', 'Basic', 'Banked', 'Wave-optimised'][r.h.bank] + (r.h.bank < 3 ? ` <button class="small" data-action="hub-bank" data-code="${r.h.code}">Upgrade (${money(r.h.bank === 1 ? 3e6 : 8e6)})</button>` : '') },
    { h: 'Lounge', v: (r) => (r.h.lounge ? pill('Open', 'good') : `<button class="small" data-action="hub-lounge" data-code="${r.h.code}">Build ($6M)</button>`) },
    { h: 'Engineering', v: (r) => Object.keys(r.h.facilities).map((k) => pill(G.FACILITIES[k].name.split(' ')[0] + (r.h.facilities[k].readyWeek > s.week ? ' (building)' : ''), r.h.facilities[k].readyWeek > s.week ? 'warn' : 'good')).join(' ') || '<a href="#engineering/mro">None</a>' },
  ])}
  <div class="row wrap" data-form><select name="code">${airportOptions(candidates, '', 'Open a new hub at…')}</select><button data-action="open-hub">Open hub</button>
  <span class="muted small">Hubs let passengers connect, base crews (avoiding overnight costs) and host engineering. Must be in your home market.</span></div>`);
}

function hubs(c) {
  return hubsPanel(c.state);
}

function capacity(c) {
  const s = c.state;
  const fleet = [...s.fleet].sort((a, b) => G.utilization(s, a) - G.utilization(s, b));
  const delivered = s.fleet.filter((a) => G.isDelivered(s, a));
  const idle = s.fleet.filter((a) => !a.schedule.length && !a.contractHours && G.typeOf(a).cat !== 'freighter');
  const byType = Object.values(s.fleet.reduce((m, a) => {
    const t = (m[a.type] ??= { type: a.type, n: 0, util: 0, free: 0 });
    t.n += 1;
    t.util += G.utilization(s, a);
    t.free += Math.max(0, G.weeklyHours(G.typeOf(a)) - G.scheduledHours(s, a) - (a.contractHours || 0));
    return m;
  }, {}));
  return `<div class="grid kpis">
    ${kpi('Aircraft', s.fleet.length, { sub: `${delivered.length} in fleet, ${s.fleet.length - delivered.length} arriving` })}
    ${kpi('Average utilisation', pct(delivered.length ? delivered.reduce((t, a) => t + G.utilization(s, a), 0) / delivered.length : 0))}
    ${kpi('Idle aircraft', idle.length, { cls: idle.length ? 'bad' : '' })}
    ${kpi('Spare block hours/wk', int(byType.reduce((t, x) => t + x.free, 0)))}
  </div>
  ${panel('By type', table(byType, [
    { h: 'Type', v: (t) => typeName(t.type) },
    { h: 'Aircraft', cls: 'num', v: (t) => t.n },
    { h: 'Avg utilisation', v: (t) => `${bar(t.util / t.n, 1)} ${pct(t.util / t.n)}` },
    { h: 'Spare hours/wk', cls: 'num', v: (t) => int(t.free) },
  ]))}
  ${panel('Every aircraft', table(fleet, [
    { h: 'Aircraft', v: (ac) => `<a href="#fleet/ac/${ac.id}">${ac.reg}</a> <small class="muted">${esc(typeName(ac.type))}</small>` },
    { h: 'Status', v: (ac) => statusPill(s, ac) },
    { h: 'Utilisation', v: (ac) => `${bar(G.utilization(s, ac), 1)} <small>${int(G.scheduledHours(s, ac) + (ac.contractHours || 0))}/${G.weeklyHours(G.typeOf(ac))} h</small>` },
    { h: 'Routes', v: (ac) => ac.schedule.map((x) => { const r = G.routeById(s, x.routeId); return r ? `<a href="#routes/${r.id}">${r.a}–${r.b}</a>×${x.freq}` : ''; }).join(', ') || (ac.contractHours ? 'Contract' : '<span class="muted">—</span>') },
    { h: 'Assign to', v: (ac) => {
      const opts = s.routes.filter((r) => G.canOperate(s, ac, r).ok && G.maxFrequency(s, ac, r) > 0);
      return opts.length ? `<div class="row" data-form><select name="route">${options(opts.map((r) => [r.id, `${r.a}–${r.b} (≤${G.maxFrequency(s, ac, r)})`]), '')}</select><button class="small" data-action="quick-assign" data-ac="${ac.id}">Add</button></div>` : '<span class="muted small">No hours / routes</span>';
    } },
  ]))}`;
}

function crew(c) {
  const s = c.state;
  const now = G.staffRequirements(s);
  const ahead = G.staffRequirements(s, 13);
  return panel('Crew & staff plan', `${table(G.ROLE_IDS, [
    { h: 'Role', v: (r) => G.ROLES[r].name },
    { h: 'Employed', cls: 'num', v: (r) => int(s.staff[r].count) },
    { h: 'In training', cls: 'num', v: (r) => int(s.staff[r].pipeline.reduce((t, p) => t + p.n, 0)) },
    { h: 'Needed now', cls: 'num', v: (r) => int(now[r]) },
    { h: 'Needed in 13 wks', cls: 'num', v: (r) => int(ahead[r]) },
    { h: 'Gap', cls: 'num', v: (r) => { const gap = s.staff[r].count + s.staff[r].pipeline.reduce((t, p) => t + p.n, 0) - ahead[r]; return `<span class="${gap < 0 ? 'bad' : 'good'}">${gap >= 0 ? '+' : ''}${int(gap)}</span>`; } },
    { h: 'Auto-hire', v: (r) => (s.staffAuto[r] ? pill('On', 'good') : pill('Off', 'warn')) },
  ])}<p class="muted small">Requirements come from scheduled block hours: long flights need augmented cockpit crews (3 pilots over 8 h, 4 over 12 h) and premium cabins need more flight attendants. <a href="#management/staffing">Manage staffing ›</a></p>`);
}

function slots(c) {
  const s = c.state;
  const codes = [...new Set([...G.stations(s), ...Object.keys(s.slots)])].filter((x) => ap(x).slots);
  return panel('Slot-controlled airports', `${table(codes, [
    { h: 'Airport', v: (x) => `<b>${x}</b> ${esc(ap(x).city)} ${ap(x).slots === 2 ? pill('Congested', 'bad') : pill('Coordinated', 'warn')}` },
    { h: 'Held', cls: 'num', v: (x) => G.slotInfo(s, x).held },
    { h: 'Used', cls: 'num', v: (x) => { const i = G.slotInfo(s, x); return `<span class="${i.used > i.held ? 'bad' : ''}">${i.used}</span>`; } },
    { h: 'For sale', cls: 'num', v: (x) => G.slotInfo(s, x).pool },
    { h: 'Price / pair', cls: 'num', v: (x) => money(G.slotInfo(s, x).price) },
    { h: '', v: (x) => `<div class="row" data-form><input type="number" name="n" value="1" min="1" class="w-60"><button class="small" data-action="buy-slots" data-code="${x}">Buy</button><button class="small" data-action="sell-slots" data-code="${x}">Sell</button></div>` },
  ], { empty: 'None of your airports are slot-controlled.' })}<p class="muted small">One slot pair = one weekly round trip. The pool of slots for sale refreshes monthly; congested airports release very few.</p>`);
}

export const actions = {
  'open-hub': (el, ctx) => G.openHub(ctx.game, formValues(el).code),
  'hub-bank': (el, ctx) => G.upgradeHubBank(ctx.game, el.dataset.code),
  'hub-lounge': (el, ctx) => G.buildLounge(ctx.game, el.dataset.code),
  'quick-assign'(el, ctx) {
    const v = formValues(el);
    const ac = ctx.game.fleet.find((a) => a.id === el.dataset.ac);
    const route = ctx.game.routes.find((r) => r.id === v.route);
    if (!route) return { ok: false, error: 'Pick a route' };
    return G.setFrequency(ctx.game, ac.id, route.id, (ac.schedule.find((x) => x.routeId === route.id)?.freq ?? 0) + G.maxFrequency(ctx.game, ac, route) - (ac.schedule.find((x) => x.routeId === route.id)?.freq ?? 0));
  },
  'buy-slots': (el, ctx) => G.buySlots(ctx.game, el.dataset.code, formValues(el).n),
  'sell-slots': (el, ctx) => G.sellSlots(ctx.game, el.dataset.code, formValues(el).n),
};
