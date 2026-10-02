import { G, statement, esc, money, pct, int, num, kpi, panel, table, tabs, options, airportOptions, bar, pill, ap, typeName, statusPill } from '../util.js';
import { formValues } from '../app.js';

export function render(c) {
  const tab = c.params[0] ?? 'hubs';
  const body = { hubs, capacity, crew, slots }[tab] ?? hubs;
  return `<div class="page-head"><h1>Planning</h1></div>
  ${tabs('planning', [['hubs', 'Hubs'], ['capacity', 'Fleet capacity & idle'], ['crew', 'Crew & bases'], ['slots', 'Slots']], tab)}
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
    { h: 'Timetable', v: (r) => `${r.h.banks ? `${r.h.banks} banks/day` : 'Rolling'}${r.h.autoBanks ? ' <small class="muted">auto</small>' : ''}` },
    { h: 'Terminal', v: (r) => (r.h.terminalBuild ? pill(`${G.TERMINALS[r.h.terminalBuild.level].name} in ${r.h.terminalBuild.readyWeek - s.week} wk`, 'warn') : r.h.terminal ? pill(G.TERMINALS[r.h.terminal].name, 'good') : '<span class="muted">Shared</span>') },
    { h: 'Lounge', v: (r) => (r.h.lounge ? pill('Open', 'good') : `<button class="small" data-action="hub-lounge" data-code="${r.h.code}">Build ($6M)</button>`) },
    { h: 'Engineering', v: (r) => Object.keys(r.h.facilities).map((k) => pill(G.FACILITIES[k].name.split(' ')[0] + (r.h.facilities[k].readyWeek > s.week ? ' (building)' : ''), r.h.facilities[k].readyWeek > s.week ? 'warn' : 'good')).join(' ') || '<a href="#engineering/mro">None</a>' },
  ])}
  <div class="row wrap" data-form><select name="code">${airportOptions(candidates, '', 'Open a new hub at…')}</select><button data-action="open-hub">Open hub</button>
  <span class="muted small">Hubs let passengers connect, base crews (avoiding overnight costs) and host engineering. Must be in your home market.</span></div>`)
  + `<div class="grid cols-2">${s.hubs.map((h) => hubCard(s, h)).join('')}</div>`;
}

// Timetable banks and terminal investment for one hub.
function hubCard(s, h) {
  const spokes = s.routes.filter((r) => r.a === h.code || r.b === h.code);
  const sample = spokes.length >= 2 ? G.hubConnectionQuality(h, 14, 14, G.hubDepartures(s, h.code)) : null;
  const next = (h.terminal ?? 0) + 1;
  const T = G.TERMINALS[next];
  const E = G.TERMINAL_EFFECT;
  return panel(`${h.code} · ${ap(h.code).city}`, `<div class="stack" data-form>
    <div class="row wrap">Connection banks
      <select name="banks">${options([[0, 'Rolling (no banks)'], ...[1, 2, 3, 4, 5, 6].map((n) => [n, `${n} bank${n > 1 ? 's' : ''} a day`])], h.banks)}</select>
      <button class="small" data-action="hub-timetable" data-code="${h.code}">Re-time (${money(G.RETIME_COST)})</button>
      <label class="check"><input type="checkbox" data-change="hub-auto" data-code="${h.code}" ${h.autoBanks ? 'checked' : ''}> Auto <small class="muted">(suggests ${G.suggestedBanks(s, h.code) || 'rolling'})</small></label></div>
    <div class="field narrow"><label>Bank discipline: <b>${pct(h.discipline)}</b></label><input type="range" min="0" max="1" step="0.05" value="${h.discipline}" data-change="hub-discipline" data-code="${h.code}">
    <small class="muted">Tighter banks make connections quicker and more reliable, but aircraft wait for the wave (−${pct(0.06 * h.discipline, 1)} utilisation on hub flights) and peaks hurt punctuality.</small></div>
    <p class="small">Connection quality for two daily spokes: <b>${sample ? pct(sample) : '–'}</b> of ideal ${h.banks ? '' : '(a rolling hub relies on sheer frequency)'} · Coordination ${money(h.banks * 8e3 * (0.5 + h.discipline))}/wk</p>
    <hr>
    ${T ? `<p class="small"><b>${T.name}</b>: ${money(G.terminalCost(h.code, next))}, ${T.weeks} weeks to build. Each level cuts airport charges ${pct(E.fees)}, adds ${E.slots} slot pairs at slot-controlled airports, lifts passenger appeal ${pct(E.appeal, 1)} and punctuality ${pct(E.otp, 1)}; upkeep ${money(50e3)}/wk.</p>
    <div class="row"><button class="small" data-action="hub-terminal" data-code="${h.code}" ${h.terminalBuild ? 'disabled' : ''}>${h.terminalBuild ? 'Under construction' : `Build ${T.name.toLowerCase()}`}</button></div>` : `<p class="small good">${G.TERMINALS[h.terminal].name}: fully developed.</p>`}
  </div>`);
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
    { h: 'Aircraft', v: (ac) => `<a href="#fleet/ac/${ac.id}">${ac.reg}</a> <small class="muted">${esc(typeName(ac.type))} · ${G.typeOf(ac).range.toLocaleString()} km</small>` },
    { h: 'Status', v: (ac) => statusPill(s, ac) },
    { h: 'Utilisation', v: (ac) => `${bar(G.utilization(s, ac), 1)} <small>${int(G.scheduledHours(s, ac) + (ac.contractHours || 0))}/${G.weeklyHours(G.typeOf(ac))} h</small>` },
    { h: 'Routes', v: (ac) => ac.schedule.map((x) => { const r = G.routeById(s, x.routeId); return r ? `<a href="#routes/${r.id}">${r.a}–${r.b}</a>×${x.freq}${x.season ? `<small class="muted"> ${x.season[0].toUpperCase()}</small>` : ''}` : ''; }).join(', ') || (ac.contractHours ? 'Contract' : '<span class="muted">—</span>') },
    { h: 'Assign to', v: (ac) => {
      const spare = G.availableHours(s, ac) - G.scheduledHours(s, ac);
      const t = G.typeOf(ac);
      // Only the ten routes that need seats most, to keep big fleets snappy.
      const opts = spare < 4 ? [] : s.routes.filter((r) => spare >= G.roundTripHours(t, r.distance) && G.canOperate(s, ac, r).ok)
        .sort((a, b) => (G.routeFreq(s, a) ? G.spill(a) / Math.max(1, a.last?.seatTotal ?? 1) : 99) < (G.routeFreq(s, b) ? G.spill(b) / Math.max(1, b.last?.seatTotal ?? 1) : 99) ? 1 : -1)
        .slice(0, 10);
      const find = `<a class="small" href="#fleet/ac/${ac.id}">Find routes ›</a>`;
      return opts.length ? `${find}<div class="row" data-form><select name="route">${options(opts.map((r) => [r.id, `${r.a}–${r.b} (≤${G.maxFrequency(s, ac, r)})`]), '')}</select><button class="small" data-action="quick-assign" data-ac="${ac.id}">Add</button></div>` : '<span class="muted small">No hours / routes</span>';
    } },
  ]), { actions: `<button class="small primary" data-action="auto-idle" ${idle.length ? '' : 'disabled'}>Auto-assign ${idle.length} idle aircraft</button>` })}`;
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
  ])}<p class="muted small">Requirements come from scheduled block hours: long flights need augmented cockpit crews (3 pilots over 8 h, 4 over 12 h) and premium cabins need more flight attendants. <a href="#management/staffing">Manage staffing ›</a></p>
  ${furloughRow(s)}`) + crewBases(s) + scopePanel(s);
}

function furloughRow(s) {
  const rows = ['pilots', 'cabin'].map((r) => {
    const w = s.staff[r];
    const back = Math.floor(w.furloughed ?? 0);
    return `<div class="row" data-form><b class="w-140">${G.ROLES[r].name}</b><input type="number" name="n" value="5" min="1" class="w-60"><button class="small danger" data-action="furlough" data-role="${r}">Furlough juniors</button>${back ? `<button class="small" data-action="recall" data-role="${r}">Recall ${back}</button><small class="muted">on the recall list</small>` : ''}</div>`;
  }).join('');
  return `<h3>Seniority</h3>${rows}<p class="muted small">Furloughs go by reverse seniority: the most junior crew leave first, cheaply, and keep recall rights — recalling them is far quicker than hiring. Your remaining crew are more senior and better paid.${s.crewIntegration?.until > s.week ? ` Seniority arbitration runs for another ${s.crewIntegration.until - s.week} weeks (+10% crews needed).` : ''}</p>`;
}

function crewBases(s) {
  const hubs = s.hubs.map((h) => h.code);
  const bases = G.crewBaseCodes(s);
  const remote = s.routes.filter((r) => G.routeBase(s, r).remote);
  const candidates = G.stations(s).filter((x) => !bases.includes(x)).map((x) => G.crewBaseTerms(s, x)).sort((a, b) => a.wage - b.wage).slice(0, 12);
  return panel('Crew bases', `${table(bases, [
    { h: 'Base', v: (x) => `<b>${x}</b> ${esc(ap(x).city)}${hubs.includes(x) ? ` ${pill('Hub', 'info')}` : ''}` },
    { h: 'Crew pay vs home', cls: 'num', v: (x) => pct(G.REGIONS[ap(x).region].wage / G.REGIONS[ap(hubs[0]).region].wage) },
    { h: 'Routes crewed', cls: 'num', v: (x) => s.routes.filter((r) => G.routeBase(s, r).code === x && !G.routeBase(s, r).remote).length },
    { h: 'Crew based here', cls: 'num', v: (x) => int(G.crewAtBase(s, x)) },
    { h: '', v: (x) => (hubs.includes(x) ? '' : `<button class="small danger" data-action="close-crew-base" data-code="${x}">Close</button>`) },
  ])}
  ${remote.length ? `<div class="callout warn small">${remote.length} route${remote.length > 1 ? 's' : ''} touch no crew base (${remote.slice(0, 4).map((r) => `${r.a}–${r.b}`).join(', ')}${remote.length > 4 ? '…' : ''}): crews are positioned in at ${money(G.POSITIONING)} per crew member per flight and need ${Math.round((G.REMOTE_PRODUCTIVITY - 1) * 100)}% more crew hours.</div>` : ''}
  ${candidates.length ? `<h3>Open a base</h3>${table(candidates, [
    { h: 'Airport', v: (t) => `<b>${t.code}</b> ${esc(ap(t.code).city)}${t.foreign ? ` ${pill('Abroad', 'warn')}` : ''}` },
    { h: 'Crew pay vs home', cls: 'num', v: (t) => pct(t.wage) },
    { h: '', v: (t) => (t.reasons.length ? `<small class="muted">${esc(t.reasons[0])}</small>` : `<button class="small" data-action="open-crew-base" data-code="${t.code}" title="${t.objection ? 'The pilots’ union will object' : ''}">Open (${money(t.cost)})${t.objection ? ' ⚠' : ''}</button>`) },
  ])}` : ''}
  <p class="muted small">Crews live at bases; every hub is one. A route is crewed from a base at either end (the cheaper one if both are bases), at that base's local pay. A base costs ${money(G.CREW_BASE_COST)} to set up and ${money(G.CREW_BASE_WEEKLY)} a week. Closing one means relocating its crews, and some quit rather than move.</p>`);
}

function scopePanel(s) {
  const st = G.scopeStatus(s);
  if (!st.applies) return panel('Scope clauses', '<p class="muted">Your pilots have no union contract, so there are no limits on subsidiary flying.</p>');
  const sc = s.scope;
  return panel('Scope clauses (pilots’ contract)', `${statement([
    ['Regional brands', `aircraft up to ${sc.regionalSeats} seats`],
    ['Subsidiary share of group flying', `${pct(st.share)} of ${pct(sc.subsidiaryShare)} allowed`],
    ['Low-cost brand crews', sc.lccSeparate ? 'Own cheaper contract' : 'Mainline contract (no crew saving)'],
    ['Foreign crew bases', sc.foreignBases ? 'Allowed' : 'Disputed by the union'],
  ])}
  ${st.violations.map((v) => `<div class="callout warn small">Scope violation: ${esc(v)}. Expect monthly grievances and possible work-to-rule.</div>`).join('')}
  <h3>Negotiate relief</h3>${table(Object.entries(G.SCOPE_RELIEF), [
    { h: 'Change', v: ([, r]) => `<b>${esc(r.label)}</b><br><small class="muted">${esc(r.desc)}</small>` },
    { h: 'Price', v: ([, r]) => `+${pct(r.pay)} pilot pay${r.fee ? ` + ${money(r.fee)}` : ''}` },
    { h: '', v: ([k]) => `<button class="small" data-action="scope-relief" data-kind="${k}">Negotiate</button>` },
  ])}`);
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
  furlough: (el, ctx) => (confirm('Furlough the most junior crew?') ? G.furlough(ctx.game, el.dataset.role, Number(formValues(el).n || 0)) : null),
  recall: (el, ctx) => G.recall(ctx.game, el.dataset.role, Math.floor(ctx.game.staff[el.dataset.role].furloughed ?? 0)),
  'open-crew-base': (el, ctx) => G.openCrewBase(ctx.game, el.dataset.code),
  'close-crew-base': (el, ctx) => (confirm('Close this crew base? Its crews must relocate.') ? G.closeCrewBase(ctx.game, el.dataset.code) : null),
  'scope-relief': (el, ctx) => (confirm('Offer the pilots’ union a pay rise for this change?') ? G.buyScopeRelief(ctx.game, el.dataset.kind) : null),
  'open-hub': (el, ctx) => G.openHub(ctx.game, formValues(el).code),
  'auto-idle': (el, ctx) => G.autoAssignIdle(ctx.game),
  'hub-timetable': (el, ctx) => G.setHubTimetable(ctx.game, el.dataset.code, { banks: Number(formValues(el).banks) }),
  'hub-terminal': (el, ctx) => (confirm('Commit to this terminal project? The cost is paid up front.') ? G.buildTerminal(ctx.game, el.dataset.code) : null),
  'hub-lounge': (el, ctx) => G.buildLounge(ctx.game, el.dataset.code),
  'quick-assign'(el, ctx) {
    const v = formValues(el);
    const ac = ctx.game.fleet.find((a) => a.id === el.dataset.ac);
    const route = ctx.game.routes.find((r) => r.id === v.route);
    if (!route) return { ok: false, error: 'Pick a route' };
    return G.setFrequency(ctx.game, ac.id, route.id, G.maxFrequency(ctx.game, ac, route));
  },
  'buy-slots': (el, ctx) => G.buySlots(ctx.game, el.dataset.code, formValues(el).n),
  'sell-slots': (el, ctx) => G.sellSlots(ctx.game, el.dataset.code, formValues(el).n),
};

export const changes = {
  'hub-auto': (el, ctx) => G.setHubTimetable(ctx.game, el.dataset.code, { auto: el.checked }),
  'hub-discipline': (el, ctx) => G.setHubTimetable(ctx.game, el.dataset.code, { discipline: Number(el.value) }),
};
