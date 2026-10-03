import { G, esc, money, pct, int, num, kpi, panel, table, tabs, options, statement, bar, pill, ap, typeName, statusPill, checkCell, liverySvg } from '../util.js';
import { formValues } from '../app.js';

const CAT_OPTS = [['all', 'All types'], ...Object.entries(G.CATEGORY_LABELS)];

export function render(c) {
  const [tab, id] = c.params;
  if (tab === 'ac') {
    const ac = c.state.fleet.find((a) => a.id === id);
    if (ac) return detail(c, ac);
  }
  const t = tab ?? 'aircraft';
  const body = { aircraft, groups, orders, market }[t] ?? aircraft;
  return `<div class="page-head"><h1>Fleet</h1></div>
  ${groundingNotes(c.state)}
  ${tabs('fleet', [['aircraft', 'Aircraft'], ['groups', 'Families & groups'], ['orders', 'On order'], ['market', 'Acquire aircraft']], t)}
  ${body(c)}`;
}

function groundingNotes(s) {
  const { groundings } = G.oemNews(s);
  return groundings.map((g) => `<div class="callout warn">${esc(g.reason)}: ${g.types.map((t) => esc(typeName(t))).join(' / ')} grounded for another ${g.until - s.week} weeks. Deliveries are frozen; the manufacturer pays partial compensation for grounded aircraft.</div>`).join('');
}

const engineName = (ac) => G.engineOf(ac)?.name ?? '';
const engineNote = (e) => [e.fuel !== 1 && `fuel ${e.fuel < 1 ? '−' : '+'}${Math.round(Math.abs(1 - e.fuel) * 1000) / 10}%`, e.mx !== 1 && `maintenance ${e.mx < 1 ? '−' : '+'}${Math.round(Math.abs(1 - e.mx) * 100)}%`, e.issue && `${e.issue.name.toLowerCase()} ${e.issue.from}–${e.issue.to}`].filter(Boolean).join(', ');

// Aircraft wear the livery of the brand whose routes they fly.
export function acLivery(s, ac) {
  const r = ac.schedule.length ? G.routeById(s, ac.schedule[0].routeId) : null;
  return (r ? G.brandOf(s, r) : G.brandById(s, 'main')).livery;
}
const layout = (ac) => [...G.CLASSES.filter((k) => ac.config[k]).map((k) => `${k}${ac.config[k]}`), ac.config.C ? `+${ac.config.C} t combi` : ''].filter(Boolean).join(' ');

export function fleetTable(s, list, { empty, select } = {}) {
  const pick = select ? [{
    h: `<input type="checkbox" data-change="fleet-pick-all" aria-label="Select all shown" ${list.length && list.every((a) => select.has(a.id)) ? 'checked' : ''}>`,
    v: (ac) => `<input type="checkbox" data-change="fleet-pick" data-id="${ac.id}" aria-label="Select ${ac.reg}" ${select.has(ac.id) ? 'checked' : ''}>`,
  }] : [];
  return table(list, [
    ...pick,
    { h: '', v: (ac) => liverySvg(acLivery(s, ac), { size: 20 }) },
    { h: 'Reg', v: (ac) => `<a href="#fleet/ac/${ac.id}"><b>${ac.reg}</b></a>${ac.group ? `<br><small class="muted">${esc(ac.group)}</small>` : ''}` },
    { h: 'Type', v: (ac) => `${esc(typeName(ac.type))}<br><small class="muted">${G.typeOf(ac).range.toLocaleString()} km range</small>` },
    { h: 'Layout', v: (ac) => layout(ac) || `${G.typeOf(ac).cargoT} t` },
    { h: 'Age', cls: 'num', v: (ac) => `${num(G.ageYears(s, ac), 1)} y` },
    { h: 'Terms', v: (ac) => (ac.owned ? 'Owned' : `Lease ${money(ac.lease.monthly)}/mo`) },
    { h: 'Status', v: (ac) => statusPill(s, ac) },
    { h: 'Utilisation', v: (ac) => bar(G.utilization(s, ac), 1) },
    { h: 'Reliability', v: (ac) => bar(ac.reliability, 100) },
    { h: 'Next check', v: (ac) => { const n = G.nextCheck(s, ac); return `${n.check} ${checkCell(s, ac, n.check)}`; } },
  ], { empty: empty ?? 'No aircraft. Visit "Acquire aircraft".' });
}

// ---------------------------------------------------------------------------
// Fleet list with filters and bulk actions.

const STATUS_FILTERS = [['all', 'Any status'], ['spare', 'Idle or spare hours'], ['idle', 'Idle'], ['flying', 'In service'], ['shop', 'In the shop'], ['grounded', 'Grounded'], ['delivery', 'Arriving'], ['old', '20+ years old']];
const spareHours = (s, ac) => G.availableHours(s, ac) - G.scheduledHours(s, ac);
function matches(s, ac, f) {
  const st = G.statusOf(s, ac).key;
  if (f.status === 'spare' && !(G.isDelivered(s, ac) && !ac.retired && spareHours(s, ac) >= 10)) return false;
  if (f.status === 'old' && G.ageYears(s, ac) < 20) return false;
  if (!['all', 'spare', 'old'].includes(f.status) && st !== f.status) return false;
  if (f.type && f.type !== 'all' && ac.type !== f.type) return false;
  if (f.terms === 'owned' && !ac.owned) return false;
  if (f.terms === 'leased' && ac.owned) return false;
  if (f.group && f.group !== 'all' && (ac.group ?? '') !== (f.group === '_none' ? '' : f.group)) return false;
  if (f.route && f.route !== 'all' && !ac.schedule.some((e) => e.routeId === f.route)) return false;
  return true;
}
const selection = (c) => {
  const ids = new Set(c.state.fleet.map((a) => a.id));
  c.ui.fleetSel = (c.ui.fleetSel ?? []).filter((id) => ids.has(id)); // drop aircraft that have gone
  return new Set(c.ui.fleetSel);
};

function aircraft(c) {
  const s = c.state;
  const owned = s.fleet.filter((a) => a.owned).length;
  const avgAge = s.fleet.length ? s.fleet.reduce((t, a) => t + G.ageYears(s, a), 0) / s.fleet.length : 0;
  const f = (c.ui.fleetFilter ??= { status: 'all', type: 'all', terms: 'all', group: 'all', route: 'all' });
  const shown = s.fleet.filter((ac) => matches(s, ac, f));
  const sel = selection(c);
  const types = [...new Set(s.fleet.map((a) => a.type))];
  const groups = [...new Set(s.fleet.map((a) => a.group).filter(Boolean))];
  const flown = s.routes.filter((r) => s.fleet.some((a) => a.schedule.some((e) => e.routeId === r.id)));
  const filter = (k, opts) => `<select data-change="fleet-filter" data-key="${k}">${options(opts, f[k])}</select>`;
  const spare = s.fleet.filter((ac) => matches(s, ac, { status: 'spare' }));
  return `<div class="grid kpis">
    ${kpi('Aircraft', s.fleet.length)}
    ${kpi('Owned / leased', `${owned} / ${s.fleet.length - owned}`)}
    ${kpi('Average age', `${num(avgAge, 1)} yrs`)}
    ${kpi('Fleet value (owned)', money(G.ownedFleetValue(s)))}
    ${kpi('On order', s.orders.length, { href: '#fleet/orders' })}
  </div>
  ${panel(`Aircraft${shown.length !== s.fleet.length ? ` — ${shown.length} of ${s.fleet.length} shown` : ''}`, `
    <div class="row filters">
      ${filter('status', STATUS_FILTERS)}
      ${filter('type', [['all', 'Any type'], ...types.map((t) => [t, typeName(t)])])}
      ${filter('terms', [['all', 'Owned & leased'], ['owned', 'Owned'], ['leased', 'Leased']])}
      ${groups.length ? filter('group', [['all', 'Any group'], ['_none', 'No group'], ...groups.map((g) => [g, g])]) : ''}
      ${flown.length ? filter('route', [['all', 'Any route'], ...flown.map((r) => [r.id, `${r.a}–${r.b}`])]) : ''}
      ${Object.values(f).some((v) => v !== 'all') ? '<button class="small ghost" data-action="fleet-filter-reset">Reset</button>' : ''}
    </div>
    <div class="row small quick-pick">Select:
      <button class="small" data-action="sel-shown" ${shown.length ? '' : 'disabled'}>All shown (${shown.length})</button>
      <button class="small" data-action="sel-spare" ${spare.length ? '' : 'disabled'}>Idle or spare hours (${spare.length})</button>
      ${sel.size ? `<button class="small ghost" data-action="sel-clear">None</button>` : ''}
    </div>
    ${sel.size ? bulkBar(s, sel) : ''}
    ${fleetTable(s, shown, { select: sel, empty: s.fleet.length ? 'No aircraft match these filters.' : undefined })}`)}`;
}

function bulkBar(s, sel) {
  const ids = [...sel];
  const q = G.bulkDisposalQuote(s, ids);
  const list = s.fleet.filter((a) => sel.has(a.id));
  // Routes at least one selected aircraft can fly, longest first.
  const routes = s.routes.filter((r) => list.some((ac) => G.canOperate(s, ac, r).ok)).sort((a, b) => b.distance - a.distance);
  return `<div class="bulkbar" data-form>
    <div class="row"><b>${sel.size} selected</b>
      <button class="small primary" data-action="bulk-auto" title="Each selected aircraft with spare hours goes to its best-estimated route">Auto-assign</button>
      ${routes.length ? `<select name="route" aria-label="Route">${options(routes.map((r) => [r.id, `${r.a}–${r.b} (${int(r.distance)} km)`]))}</select>
      <input type="number" name="freq" min="0" placeholder="max" class="w-60" title="Weekly round trips per aircraft (blank = as many as it can)">
      <button class="small" data-action="bulk-route">Assign to route</button>` : '<span class="muted small">None of these can fly your routes.</span>'}
      <button class="small" data-action="bulk-unassign">Unassign</button>
    </div>
    <div class="row">
      <input name="group" placeholder="Group name" class="w-140"><button class="small" data-action="bulk-group">Set group</button>
      <button class="small danger" data-action="bulk-dispose">${q.sold && q.returned ? 'Sell / return' : q.sold ? 'Sell' : 'Return'} ${q.count} (${q.cash >= 0 ? '+' : '−'}${money(Math.abs(q.cash))})</button>
      <small class="muted">${[q.sold && `${q.sold} sold at 95% of market value${q.loans ? `, repaying ${money(q.loans)} of secured loans` : ''}`, q.returned && `${q.returned} lease${q.returned > 1 ? 's' : ''} ended early (${money(q.penalties)} in penalties)`].filter(Boolean).join(' · ')}</small>
    </div>
  </div>`;
}

function groups(c) {
  const s = c.state;
  const byType = Object.entries(s.fleet.reduce((m, a) => ((m[a.type] ??= []).push(a), m), {}));
  const custom = Object.entries(s.fleet.filter((a) => a.group).reduce((m, a) => ((m[a.group] ??= []).push(a), m), {}));
  const typeCards = byType.map(([type, list]) => {
    const t = G.aircraftById[type];
    const configs = Object.entries(list.reduce((m, a) => {
      const k = G.CLASSES.map((x) => `${x}${a.config[x] || 0}`).join(' ');
      m[k] = (m[k] ?? 0) + 1;
      return m;
    }, {}));
    return panel(`${t.name} × ${list.length}`, `${statement([
      ['Category', G.CATEGORY_LABELS[t.cat]],
      ['Range / speed', `${int(t.range)} km · ${t.speed} km/h`],
      ['Average reliability', `${int(list.reduce((x, a) => x + a.reliability, 0) / list.length)}`],
      ['Average utilisation', pct(list.reduce((x, a) => x + G.utilization(s, a), 0) / list.length)],
      ['Cabin layouts', configs.map(([k, n]) => `${n}× ${k}`).join('<br>')],
    ])}<p class="small">${list.map((a) => `<a href="#fleet/ac/${a.id}">${a.reg}</a>`).join(' · ')}</p>`);
  }).join('');
  return `${commonalityPanel(s)}<div class="grid cols-3">${typeCards || '<p class="muted">No aircraft yet.</p>'}</div>
  ${panel('Custom groups', custom.length ? custom.map(([g, list]) => `<p><b>${esc(g)}</b>: ${list.map((a) => `<a href="#fleet/ac/${a.id}">${a.reg}</a>`).join(', ')}</p>`).join('') : '<p class="muted">Assign aircraft to sub-fleets (e.g. "Long-haul", "Shuttle") from each aircraft\'s page.</p>')}`;
}

// Fleet families and what the mix costs or saves.
export function commonalityPanel(s) {
  const com = G.commonality(s);
  if (!com.families) return '';
  const tag = (f) => (f.count >= 12 ? pill('Scale −10% mx', 'good') : f.count >= 6 ? pill('Scale −5% mx', 'good') : f.count <= 2 ? pill('Orphan +12% mx', 'warn') : '');
  return panel('Fleet commonality', `<div class="grid kpis">
      ${kpi('Families', com.families, { sub: com.families <= 2 ? 'Simple fleet' : com.families <= 4 ? 'Mixed fleet' : 'Complex fleet', cls: com.families > 4 ? 'bad' : com.families <= 2 ? 'good' : '' })}
      ${kpi('Extra pilots needed', pct(com.pilotFactor - 1), { sub: 'type ratings & reserves' })}
      ${kpi('Extra engineers', pct(com.engineerFactor - 1))}
      ${kpi('Family overhead', `${money(com.overhead)}/wk`, { sub: 'spares, tooling, training' })}
    </div>
    ${table(com.list, [
      { h: 'Family', v: (f) => `<b>${esc(f.family)}</b><br><small class="muted">${[...f.types].map((t) => esc(typeName(t))).join(', ')}</small>` },
      { h: 'Aircraft', cls: 'num', v: (f) => f.count },
      { h: 'Maintenance', v: tag },
    ])}
    <p class="muted small">Each aircraft family beyond the first needs its own type-rated pilots and engineers, spares and training (+5% pilots, +4% engineers and ${money(G.FAMILY_OVERHEAD)}/wk each). Families of 6+ aircraft get cheaper maintenance; one or two orphans cost more.</p>`);
}

function orders(c) {
  const s = c.state;
  const arriving = s.fleet.filter((a) => !G.isDelivered(s, a)).sort((a, b) => a.deliveryWeek - b.deliveryWeek);
  const programmes = G.oemNews(s).programmes;
  return `${panel('Factory orders', table([...s.orders].sort((a, b) => a.deliveryWeek - b.deliveryWeek), [
    { h: 'Type', v: (o) => `${esc(typeName(o.type))}${o.launch ? ` ${pill('Launch customer', 'info')}` : ''}${o.engine ? `<br><small class="muted">${esc(G.engineOptions(o.type).find((e) => e.id === o.engine)?.name ?? '')}</small>` : ''}` },
    { h: 'Ordered', v: (o) => G.dateLabel(o.orderedWeek) },
    { h: 'Delivery', v: (o) => `${G.dateLabel(o.deliveryWeek)} <small class="muted">(${o.deliveryWeek - s.week} wk)</small>` },
    { h: 'Price', cls: 'num', v: (o) => money(o.price) },
    { h: 'Paid', cls: 'num', v: (o) => money(o.paid) },
    { h: 'Due on delivery', cls: 'num', v: (o) => money(o.price - o.paid) },
    { h: 'Layout', v: (o) => G.CLASSES.filter((k) => o.config[k]).map((k) => `${k}${o.config[k]}`).join(' ') || '—' },
    { h: '', v: (o) => `<button class="small danger" data-action="cancel-order" data-id="${o.id}">Cancel</button>` },
  ], { empty: 'No factory orders. New aircraft take 1.5–5 years to arrive.' }))}
  ${programmes.length ? panel('New aircraft programmes', table(programmes, [
    { h: 'Type', v: (p) => esc(p.type.name) },
    { h: 'Entry into service', v: (p) => `${p.type.intro}` },
    { h: 'Status', v: (p) => (!p.announced ? '<span class="muted">Manufacturer says on schedule — revealed a year before first delivery</span>' : p.delay ? pill(`Delayed ${Math.round(p.delay / 4.3)} months`, 'bad') : pill('On schedule', 'good')) },
  ])) : ''}
  ${panel('Lease deliveries & used aircraft in induction', fleetTable(s, arriving, { empty: 'Nothing arriving.' }))}`;
}

function market(c) {
  const s = c.state;
  const cat = c.ui.marketCat ?? 'all';
  const match = (typeId) => cat === 'all' || G.aircraftById[typeId].cat === cat;
  const leases = s.market.leases.filter((o) => match(o.type)).sort((a, b) => a.lead - b.lead);
  const used = s.market.used.filter((o) => match(o.type)).sort((a, b) => a.price - b.price);
  const year = G.yearOf(s.week);
  const ended = (t) => t.out != null && year > t.out && year <= t.out + 10;
  const types = G.AIRCRAFT.filter((t) => match(t.id) && (G.inProduction(t, year) || (c.ui.showEnded && ended(t))));
  const endedCount = G.AIRCRAFT.filter((t) => match(t.id) && ended(t)).length;
  return `<div class="row">Show <select data-change="market-cat">${options(CAT_OPTS, cat)}</select><span class="muted small">Lease and used offers refresh monthly. Factory lead times reflect manufacturer backlogs.</span></div>
  ${panel('Operating lease offers', table(leases, [
    { h: 'Aircraft', v: (o) => `<b>${esc(typeName(o.type))}</b>${vintage(s, o.type)}${newFamily(s, o.type)}<br><small class="muted">${o.age ? `${o.age} years old` : 'New build'} · ${G.aircraftById[o.type].range.toLocaleString()} km</small>` },
    { h: 'Lessor', v: (o) => esc(o.lessor) },
    { h: 'Rent / month', cls: 'num', v: (o) => money(o.monthly) },
    { h: 'Term', cls: 'num', v: (o) => `${o.termMonths} mo` },
    { h: 'Delivery', v: (o) => `${o.lead} wk <small class="muted">(${G.dateLabel(s.week + o.lead)})</small>` },
    { h: 'Deposit', cls: 'num', v: (o) => money(o.monthly * 2) },
    { h: 'Offer ends', v: (o) => `${o.expiresWeek - s.week} wk` },
    { h: '', v: (o) => `<button class="small primary" data-action="lease-offer" data-id="${o.id}">Sign lease</button>` },
  ], { empty: 'No lease offers for this category right now.' }))}
  ${panel('Used aircraft for sale', table(used, [
    { h: 'Aircraft', v: (o) => `<b>${esc(typeName(o.type))}</b>${vintage(s, o.type)}${newFamily(s, o.type)}<br><small class="muted">${o.age} years old · ${G.aircraftById[o.type].range.toLocaleString()} km</small>` },
    { h: 'Seller', v: (o) => esc(o.seller) },
    { h: 'Reliability', v: (o) => bar(o.reliability, 100) },
    { h: 'Price', cls: 'num', v: (o) => money(o.price) },
    { h: 'Induction', v: (o) => `${o.lead} wk` },
    { h: '', v: (o) => `<button class="small" data-action="buy-used" data-id="${o.id}" ${s.cash < o.price ? 'disabled' : ''}>Buy</button>` },
  ], { empty: 'No used aircraft of this category on the market.' }))}
  ${panel('Order new from the manufacturer', `${endedCount ? `<label class="check small"><input type="checkbox" data-change="show-ended" ${c.ui.showEnded ? 'checked' : ''}> Also show ${endedCount} recently out-of-production type${endedCount > 1 ? 's' : ''} (for reference — lease or buy used instead)</label>` : ''}` + table(types, [
    { h: 'Type', v: (t) => `<b>${esc(t.name)}</b>${newFamily(s, t.id)}${t.fe ? ' <small class="pill">flight engineer</small>' : ''}${t.noise === 2 ? ' <small class="pill warn">Chapter 2</small>' : ''}<br><small class="muted">${esc(t.maker)} · ${G.CATEGORY_LABELS[t.cat]} · built ${t.intro}–${t.out ?? 'today'}</small>` },
    { h: 'Capacity', v: (t) => (t.cat === 'freighter' ? `${t.cargoT} t` : `${G.seatCount(t.config)} seats <small class="muted">(max ${t.maxSeats})</small>`) },
    { h: 'Range', cls: 'num', v: (t) => `${int(t.range)} km` },
    { h: 'Runway', cls: 'num', v: (t) => `${int(t.runway)} m` },
    { h: 'Fuel', cls: 'num', v: (t) => `${t.burn} kg/km` },
    { h: 'List price', cls: 'num', v: (t) => money(t.price) },
    { h: 'Lead time', v: (t) => (G.inProduction(t, year) ? `${t.lead} wk <small class="muted">(~${Math.max(G.yearOf(s.week + t.lead), t.intro)})</small>` : `<span class="muted">Production ended ${t.out}</span>`) },
    { h: '', v: (t) => (G.inProduction(t, year) ? orderForm(s, t, year) : '') },
  ]))}
  <p class="muted small">Orders need a 20% pre-delivery deposit; the balance is due on delivery (financed automatically with an aircraft loan if cash is short). Volume discounts of 2% per extra aircraft, up to 25%. Types not yet flying can be ordered as a <b>launch customer</b>: ${Math.round(G.LAUNCH_DISCOUNT * 100)}% extra discount, ${Math.round(G.LAUNCH_DEPOSIT * 100)}% deposit and the first deliveries — but new programmes often slip, and you only learn how badly about a year before entry into service (the manufacturer pays some compensation).</p>`;
}

function orderForm(s, t, year) {
  const engines = G.engineOptions(t.id);
  const launch = year < t.intro;
  const terms = launch ? G.launchTerms(s, t.id) : null;
  const grounded = G.activeGrounding(s, t.id);
  return `<div class="stack tight" data-form>
    ${engines.length > 1 ? `<select name="engine" title="Engine choice">${options(engines.map((e) => [e.id, `${e.name}${engineNote(e) ? ` (${engineNote(e)})` : ''}`]))}</select>` : engines.length ? `<small class="muted">${esc(engines[0].name)}</small>` : ''}
    <div class="row nowrap"><input type="number" name="qty" value="${launch ? terms.minQty : 1}" min="1" max="50" class="w-60"><button class="small" data-action="order" data-type="${t.id}">Order</button>${launch ? `<button class="small primary" data-action="order-launch" data-type="${t.id}" title="Minimum ${terms.minQty}; programme delay risk ${Math.round(terms.risk * 100)}%">Launch customer</button>` : ''}</div>
    ${grounded ? '<small class="bad">Grounded — deliveries frozen</small>' : launch ? `<small class="muted">Enters service ${t.intro} · delay risk ${terms.risk >= 0.7 ? 'high' : terms.risk >= 0.4 ? 'moderate' : 'low'}</small>` : ''}
  </div>`;
}

// ---------------------------------------------------------------------------

const SEG_COLORS = { F: '#c08a2b', J: '#7b61ff', W: '#2fa3a0', Y: 'var(--accent)', C: '#8a6d4d' };

// Floor-plan bar: how much of the cabin floor each class takes.
function floorPlan(t, cfg, cabin) {
  const segs = G.CLASSES.filter((k) => cfg[k]).map((k) => [k, cfg[k] * G.seatUnits(t, k, cabin[k]), `${cfg[k]} ${G.CABIN[k].short}`]);
  if (cfg.C) segs.push(['C', cfg.C * G.COMBI_UNITS_PER_T, `${cfg.C} t cargo`]);
  const used = segs.reduce((a, x) => a + x[1], 0);
  const scale = Math.max(t.maxSeats, used);
  return `<div class="floorplan" title="Cabin floor, nose on the left">${segs.map(([k, u, label]) => `<span style="flex:${u / scale};background:${SEG_COLORS[k]}" title="${esc(label)} · ${num(u, 0)} units">${u / scale > 0.08 ? esc(label) : ''}</span>`).join('')}${used < t.maxSeats ? `<span class="free" style="flex:${(t.maxSeats - used) / scale}" title="${num(t.maxSeats - used, 0)} units free"></span>` : ''}</div>`;
}

function readCabinForm(root) {
  const cfg = Object.fromEntries([...G.CLASSES, 'C'].map((k) => [k, Math.max(0, Math.round(Number(root.querySelector(`[name=${k}]`)?.value) || 0))]));
  const cabin = Object.fromEntries(G.CLASSES.map((k) => [k, root.querySelector(`[name=seat_${k}]`)?.value]).filter(([, v]) => v));
  return { cfg, cabin };
}

// The layout the editor starts from: the one in the shop if a refit is under way.
function baseLayout(s, ac) {
  const p = G.pendingCabin(s, ac);
  return p ? { config: p.config, cabin: p.cabin, pending: p } : { config: ac.config, cabin: ac.cabin };
}

function cabinSummary(s, ac, t, cfg, cabin) {
  const base = baseLayout(s, ac);
  const full = { ...G.defaultCabin(t), ...(base.cabin ?? {}), ...cabin };
  const units = G.cabinUnits(t, cfg, full);
  const seats = G.seatCount(cfg);
  const changed = [...G.CLASSES, 'C'].some((k) => (base.config[k] || 0) !== cfg[k]) || G.CLASSES.some((k) => cfg[k] && (base.cabin?.[k] ?? G.defaultCabin(t)[k]) !== full[k]);
  const problems = [units > t.maxSeats + 1e-9 && `${num(units - t.maxSeats, 0)} floor units too many`, seats > t.maxSeats && `over the ${t.maxSeats}-passenger exit limit`].filter(Boolean);
  return {
    plan: floorPlan(t, cfg, full),
    text: `${seats} seats · ${num(units, 0)} of ${t.maxSeats} floor units · ${G.cabinCrewPerFlight(cfg)} cabin crew per flight${problems.length ? ` — ${problems.join(', ')}` : ''}`,
    bad: problems.length > 0,
    cost: !changed ? (base.pending ? 'Refit under way' : 'Current layout') : `Retrofit ≈ ${money(G.retrofitCost(ac, cfg, full) * (G.isDelivered(s, ac) ? 1 : 0.5))}`,
  };
}

// draft: unsaved edits kept across re-renders.
function cabinEditor(s, ac, t, draft) {
  const year = G.yearOf(s.week);
  const base = baseLayout(s, ac);
  const config = draft?.cfg ?? base.config;
  const cabin = { ...G.defaultCabin(t), ...(base.cabin ?? {}), ...(draft?.cabin ?? {}) };
  const presets = G.cabinPresets(t, year);
  const sameType = s.fleet.filter((a) => a.type === t.id && !a.retired).length;
  const std = s.layouts?.[t.id];
  const sum = cabinSummary(s, ac, t, { F: 0, J: 0, W: 0, Y: 0, C: 0, ...config }, cabin);
  return `<div data-form data-cabin="${ac.id}">
    ${base.pending ? `<div class="callout info small">Refit in the shop: showing the new layout (${G.CLASSES.filter((k) => base.config[k]).map((k) => `${G.CABIN[k].short}${base.config[k]}`).join(' ')}), back in service in ${base.pending.untilWeek - s.week} wk.</div>` : ''}
    <div class="row" style="gap:6px;margin-bottom:8px"><span class="muted small">Start from:</span>${presets.map((p) => `<button class="small" data-action="cfg-preset" data-type="${t.id}" data-preset="${p.id}" title="${esc(p.desc)} (${G.CLASSES.filter((k) => p.config[k]).map((k) => `${k}${p.config[k]}`).join(' ')})">${esc(p.name)}</button>`).join('')}</div>
    <div id="cfg-plan">${sum.plan}</div>
    <div class="grid cols-4 tight">${G.CLASSES.map((k) => {
      const prods = G.seatProducts(t, k, year);
      const off = k === 'F' && !['wide', 'jumbo'].includes(t.cat);
      return `<div class="field"><label><span class="dot" style="background:${SEG_COLORS[k]}"></span>${G.CABIN[k].name}</label><input type="number" name="${k}" value="${config[k] || 0}" min="0" data-live="cfg" data-type="${t.id}" ${off ? 'disabled' : ''}>
      ${off ? '<small class="muted">Widebodies only</small>' : prods.length < 2 ? `<small class="muted">${esc(G.SEAT_PRODUCTS[k][prods[0] ?? cabin[k]]?.name ?? '')}</small>` : `<select name="seat_${k}" data-live="cfg" data-type="${t.id}" title="Seat type (floor units per seat)">${options(prods.map((p) => [p, `${G.SEAT_PRODUCTS[k][p].name.replace(/ \(.*\)$/, '')} (${num(G.seatUnits(t, k, p), 1)})`]), cabin[k])}</select>`}</div>`;
    }).join('')}</div>
    ${G.canCombi(t) ? `<div class="row"><label class="small">Combi main-deck cargo <input type="number" name="C" value="${config.C || 0}" min="0" max="${Math.floor(t.maxSeats / G.COMBI_UNITS_PER_T)}" class="w-60" data-live="cfg" data-type="${t.id}"> tonnes</label><small class="muted">${G.COMBI_UNITS_PER_T} seat units per tonne — handy on thin routes to remote places</small></div>` : ''}
    <p class="small ${sum.bad ? 'bad' : ''}" id="cfg-summary">${sum.text}</p>
    <div class="row" style="gap:6px">
      <button class="small" data-action="cfg-fill" data-type="${t.id}" title="Use all remaining floor for economy seats, up to the exit limit">Fill rest with economy</button>
      <button class="primary small" data-action="retrofit" data-id="${ac.id}">Refit this aircraft</button>
      ${sameType > 1 ? `<button class="small" data-action="retrofit-type" data-type="${t.id}">Refit all ${sameType} ${esc(t.name)}</button>` : ''}
      <button class="small" data-action="std-layout" data-type="${t.id}" title="New factory orders of this type will be built to this layout">Standard for new orders</button>
      <span class="muted small" id="cfg-cost">${sum.cost}</span>
    </div>
    ${std ? `<p class="muted small">New ${esc(t.name)} orders: ${G.CLASSES.filter((k) => std.config[k]).map((k) => `${G.CABIN[k].short}${std.config[k]}`).join(' ')}.</p>` : ''}
    <p class="muted small">Seat types change how much floor each seat needs and how attractive the cabin is (flat beds and suites matter most on long flights; dense economy saves space but passengers notice). Every type is certified for at most ${t.maxSeats} passengers. Retrofits take ${['wide', 'jumbo'].includes(t.cat) ? 4 : 2} weeks out of service — or none if done during a C/D check. Before delivery, spec changes cost half.</p>
  </div>`;
}

function updateCabinEditor(root, ctx) {
  const ac = ctx.game.fleet.find((a) => a.id === root.dataset.cabin);
  if (!ac) return;
  const t = G.typeOf(ac);
  const { cfg, cabin } = readCabinForm(root);
  const sum = cabinSummary(ctx.game, ac, t, cfg, cabin);
  ctx.ui.cabinDraft = { id: ac.id, cfg, cabin };
  root.querySelector('#cfg-plan').innerHTML = sum.plan;
  const out = root.querySelector('#cfg-summary');
  out.textContent = sum.text;
  out.className = `small ${sum.bad ? 'bad' : ''}`;
  root.querySelector('#cfg-cost').textContent = sum.cost;
}

function setCabinForm(root, config, cabin) {
  for (const k of [...G.CLASSES, 'C']) {
    const input = root.querySelector(`[name=${k}]`);
    if (input && !input.disabled) input.value = config[k] || 0;
  }
  for (const k of G.CLASSES) {
    const sel = root.querySelector(`[name=seat_${k}]`);
    if (sel && cabin?.[k] && [...sel.options].some((o) => o.value === cabin[k])) sel.value = cabin[k];
  }
}

function detail(c, ac) {
  const s = c.state;
  const t = G.typeOf(ac);
  const st = G.statusOf(s, ac);
  const loan = s.loans.find((l) => l.aircraftId === ac.id);
  const conv = G.CONVERSIONS[ac.type];
  const warnings = [ac.retired && 'Withdrawn: this airframe has reached its life limit. Sell it for scrap or return it.', t.noise === 2 && G.yearOf(s.week) >= 1998 && 'Chapter 2 noise category: banned from North American and European airports from 2002.', t.fe && 'Three-person cockpit: needs a flight engineer on every flight.'].filter(Boolean);
  return `${warnings.map((x) => `<div class="callout warn">${esc(x)}</div>`).join('')}<div class="page-head"><h1>${liverySvg(acLivery(s, ac), { size: 40 })} <a href="#fleet" class="muted">Fleet ›</a> ${ac.reg}</h1><div class="row">${pill(st.label, st.tone)} <span class="muted">${esc(t.name)}</span></div></div>
  <div class="grid kpis">
    ${kpi('Range', `${int(t.range)} km`, { sub: `needs ${int(t.runway)} m of runway` })}
    ${G.engineOf(ac) ? kpi('Engines', esc(engineName(ac)), { sub: engineNote(G.engineOf(ac)) || 'baseline', cls: 'small-value' }) : ''}
    ${kpi('Age', `${num(G.ageYears(s, ac), 1)} yrs`)}
    ${kpi('Flight hours', int(ac.fh), { sub: `${int(ac.cycles)} cycles` })}
    ${kpi('Reliability', int(ac.reliability), { cls: ac.reliability < 70 ? 'bad' : '', sub: `Dispatch ${pct(G.dispatchReliability(ac), 1)}` })}
    ${kpi('Utilisation', pct(G.utilization(s, ac)), { sub: `${int(G.scheduledHours(s, ac))} h scheduled` })}
    ${kpi('Market value', money(G.aircraftValue(s, ac)))}
  </div>
  ${routeFinder(s, ac)}
  <div class="grid cols-2">
    ${panel('Schedule', `${table(ac.schedule, [
      { h: 'Route', v: (x) => { const r = G.routeById(s, x.routeId); return `<a href="#routes/${r.id}">${r.a}–${r.b}</a> <small class="muted">${int(r.distance)} km${x.season ? ` · ${x.season}` : ''}</small>`; } },
      { h: 'Round trips/wk', cls: 'num', v: (x) => x.freq },
      { h: 'Hours/wk', cls: 'num', v: (x) => int(x.freq * G.roundTripHours(t, G.routeById(s, x.routeId).distance)) },
      { h: '', v: (x) => `<button class="small danger" data-action="unassign" data-ac="${ac.id}" data-route="${x.routeId}" data-season="${x.season ?? 'all'}">Remove</button>` },
    ], { empty: 'Not scheduled. Assign it from a route page or Planning.' })}
    <p class="muted small">${int(G.scheduledHours(s, ac) + (ac.contractHours || 0))} of ${G.weeklyHours(t)} available block hours/week used${ac.contractHours ? ' (including contract flying)' : ''}.</p>
    <div class="row" data-form><input name="group" placeholder="Sub-fleet group" value="${esc(ac.group ?? '')}"><button class="small" data-action="set-group" data-id="${ac.id}">Set group</button></div>`)}
    ${t.cat === 'freighter' ? panel('Freighter', `<p>Main-deck capacity ${t.cargoT} tonnes. Freighters carry cargo only.</p>`) : panel('Cabin layout', cabinEditor(s, ac, t, c.ui.cabinDraft?.id === ac.id ? c.ui.cabinDraft : null))}
  </div>
  <div class="grid cols-2">
    ${panel('Maintenance', `${table(G.CHECK_ORDER, [
      { h: 'Check', v: (k) => G.CHECKS[k].name },
      { h: 'Interval', v: (k) => [G.CHECKS[k].fh ? `${int(G.CHECKS[k].fh)} FH` : '', `${G.CHECKS[k].weeks} wk`].filter(Boolean).join(' / ') },
      { h: 'Used', v: (k) => bar(G.checkStatus(s, ac, k).ratio, 1, { invert: true }) },
      { h: 'Due in', v: (k) => checkCell(s, ac, k) },
      { h: '', v: (k) => `<button class="small" data-action="do-check" data-id="${ac.id}" data-check="${k}" ${G.isDelivered(s, ac) && !ac.booked ? '' : 'disabled'}>Do now (${money(G.quoteCheck(s, ac, k).cost)})</button>` },
    ])}
    ${ac.booked ? `<p class="warn small">Booked: ${ac.booked.check}-check starting ${G.dateLabel(ac.booked.startWeek)}. <button class="small" data-action="cancel-booking" data-id="${ac.id}">Cancel booking</button></p>` : ''}
    ${ac.mxLog?.length ? `<h3>History</h3><ul class="plain small">${ac.mxLog.map((m) => `<li>${G.dateLabel(m.week)} — ${m.check}-check, ${esc(m.where)}, ${money(m.cost)}</li>`).join('')}</ul>` : ''}`)}
    ${panel('Upgrades & modifications', `${table(Object.entries(G.UPGRADES), [
      { h: 'Upgrade', cls: 'wrap', v: ([, u]) => `<b>${esc(u.name)}</b><br><small class="muted">${esc(u.desc)}</small>` },
      { h: 'Cost', cls: 'num', v: ([, u]) => `${money(u.cost[t.mx])}<br><small class="muted">${u.days} days</small>` },
      { h: '', v: ([k, u]) => (ac.upgrades.includes(k) ? pill('Installed', 'good') : (u.minYear ?? 0) > G.yearOf(s.week) ? `<small class="muted">From ${u.minYear}</small>` : `<button class="small" data-action="upgrade" data-id="${ac.id}" data-up="${k}">Install</button>`) },
    ])}
    ${conv ? `<p class="small">Freighter conversion: becomes a <b>${esc(typeName(conv.to))}</b> for ${money(conv.cost)} (${Math.round(conv.days / 7)} weeks). Requires ${conv.minAgeYears}+ years and ownership. <button class="small" data-action="convert" data-id="${ac.id}">Convert</button></p>` : ''}`)}
  </div>
  ${panel('Ownership & finance', `<div class="grid cols-2 tight">${statement(ac.owned ? [
      ['Ownership', 'Owned'],
      ['Purchase price', money(ac.acquiredPrice)],
      ['Market value', money(G.aircraftValue(s, ac))],
      ['Secured loan', loan ? `${money(loan.principal)} at ${pct(loan.rate, 2)}` : 'None'],
    ] : [
      ['Ownership', `Leased from ${esc(ac.lease.lessor)}`],
      ['Rent', `${money(ac.lease.monthly)}/month`],
      ['Lease ends', `${G.dateLabel(ac.lease.endWeek)} (${ac.lease.endWeek - s.week} wk)`],
      ['Deposit held', money(ac.lease.deposit)],
    ])}
    <div class="stack">${ac.owned ? `
      <button data-action="secured-loan" data-id="${ac.id}" ${loan ? 'disabled' : ''}>Raise a secured loan (${money(G.securedLoanQuote(s, ac).amount)})</button>
      <button data-action="leaseback" data-id="${ac.id}" ${loan ? 'disabled' : ''}>Sale and leaseback (${money(G.aircraftValue(s, ac))})</button>
      <button class="danger" data-action="sell-ac" data-id="${ac.id}">Sell aircraft (${money(G.aircraftValue(s, ac) * 0.95)})</button>` : `
      <button data-action="extend-lease" data-id="${ac.id}">Extend 24 months at 15% lower rent</button>
      <button class="danger" data-action="return-lease" data-id="${ac.id}">Return early (30% of remaining rent)</button>`}
    </div></div>`)}`;
}

// Flag types that would add a new family to the fleet.
export function newFamily(s, typeId) {
  if (!s.fleet.length) return '';
  const fam = G.familyOf(typeId);
  return G.fleetFamilies(s).some((f) => f.family === fam) ? ` <small class="pill good" title="${esc(fam)}">In fleet family</small>` : ` <small class="pill warn" title="Adds ${esc(fam)} — extra crews, spares and overhead">New family</small>`;
}

function vintage(s, typeId) {
  const t = G.aircraftById[typeId];
  const year = G.yearOf(s.week);
  if (t.out != null && year > t.out) return ' <small class="pill warn">out of production</small>';
  return '';
}

// Routes this aircraft could fly profitably: existing ones needing seats and
// new ones from your hubs, ranked by estimated weekly profit.
function routeFinder(s, ac) {
  const t = G.typeOf(ac);
  if (t.cat === 'freighter' || ac.retired) return '';
  const spare = G.availableHours(s, ac) - G.scheduledHours(s, ac);
  if (spare < 4 && ac.schedule.length) return '';
  const list = G.routesForAircraft(s, ac, { limit: 5 });
  return panel(`Best routes for this ${t.name}`, `${table(list, [
    { h: 'Route', v: (x) => `${x.routeId ? `<a href="#routes/${x.routeId}"><b>${x.a}–${x.b}</b></a>` : `<b>${x.a}–${x.b}</b> ${pill('New route', 'info')}`}<br><small class="muted">${esc(ap(x.a).city)} – ${esc(ap(x.b).city)} · ${int(x.distance)} km${x.kind === 'existing' && !x.served ? ' · unserved' : ''}</small>` },
    { h: 'Trips/wk', cls: 'num', v: (x) => x.freq },
    { h: 'Est. pax/wk', cls: 'num', v: (x) => int(x.pax) },
    { h: 'Est. load', cls: 'num', v: (x) => pct(x.lf) },
    { h: 'Est. profit/wk', cls: 'num', v: (x) => `<span class="${x.profit >= 0 ? 'good' : 'bad'}">${money(x.profit)}</span>` },
    { h: '', cls: 'num', v: (x) => `<button class="small ${x.profit > 0 ? 'primary' : ''}" data-action="fit-assign" data-ac="${ac.id}" data-a="${x.a}" data-b="${x.b}" data-route="${x.routeId ?? ''}" data-freq="${x.freq}">${x.kind === 'new' ? 'Open & assign' : 'Assign'}</button>` },
  ], { empty: `No route in range (${int(t.range)} km) with demand left for it. Open a route from Routes, or check the Market analyst.` })}
  <p class="muted small">Estimates use current demand, rival fares and your costs at an 85% target load; new routes also cost a launch fee. ${int(spare)} spare block hours a week.</p>`, {
    actions: `<button class="small" data-action="fit-auto" data-ac="${ac.id}">Auto-assign</button>`,
  });
}

export const actions = {
  'fit-assign'(el, ctx) {
    const d = el.dataset;
    return G.assignSuggestion(ctx.game, d.ac, { routeId: d.route || null, a: d.a, b: d.b, freq: Number(d.freq) });
  },
  'fit-auto': (el, ctx) => G.autoAssignAircraft(ctx.game, el.dataset.ac),
  'order-one': (el, ctx) => G.orderAircraft(ctx.game, el.dataset.type, 1),
  'lease-offer': (el, ctx) => G.leaseFromOffer(ctx.game, el.dataset.id),
  'buy-used': (el, ctx) => G.buyUsed(ctx.game, el.dataset.id),
  order: (el, ctx) => {
    const v = formValues(el);
    return G.orderAircraft(ctx.game, el.dataset.type, Number(v.qty || 1), null, null, { engine: v.engine });
  },
  'order-launch': (el, ctx) => {
    const v = formValues(el);
    return G.orderAircraft(ctx.game, el.dataset.type, Number(v.qty || 1), null, null, { engine: v.engine, launch: true });
  },
  'cancel-order': (el, ctx) => (confirm('Cancel this order and forfeit the deposit?') ? G.cancelOrder(ctx.game, el.dataset.id) : null),
  retrofit(el, ctx) {
    const { cfg, cabin } = readCabinForm(el.closest('[data-form]'));
    const res = G.retrofitCabin(ctx.game, el.dataset.id, cfg, cabin);
    if (res.ok) ctx.ui.cabinDraft = null;
    return res;
  },
  'retrofit-type'(el, ctx) {
    const { cfg, cabin } = readCabinForm(el.closest('[data-form]'));
    const t = G.aircraftById[el.dataset.type];
    if (!confirm(`Refit every ${t.name} to this layout?`)) return;
    const res = G.retrofitFleetType(ctx.game, t.id, cfg, { ...G.defaultCabin(t), ...cabin });
    if (res.ok) ctx.ui.cabinDraft = null;
    return res;
  },
  'std-layout'(el, ctx) {
    const { cfg, cabin } = readCabinForm(el.closest('[data-form]'));
    const t = G.aircraftById[el.dataset.type];
    return G.setStandardLayout(ctx.game, t.id, cfg, { ...G.defaultCabin(t), ...cabin });
  },
  'cfg-preset'(el, ctx) {
    const root = el.closest('[data-form]');
    const p = G.cabinPresets(G.aircraftById[el.dataset.type], G.yearOf(ctx.game.week)).find((x) => x.id === el.dataset.preset);
    if (p) setCabinForm(root, p.config, p.cabin);
    updateCabinEditor(root, ctx);
    return { skipRender: true };
  },
  'cfg-fill'(el, ctx) {
    const root = el.closest('[data-form]');
    const t = G.aircraftById[el.dataset.type];
    const { cfg, cabin } = readCabinForm(root);
    setCabinForm(root, G.fillEconomy(t, cfg, { ...G.defaultCabin(t), ...cabin }), {});
    updateCabinEditor(root, ctx);
    return { skipRender: true };
  },
  upgrade: (el, ctx) => G.startUpgrade(ctx.game, el.dataset.id, el.dataset.up),
  convert: (el, ctx) => (confirm('Convert this aircraft to a freighter? It will lose its passenger cabin.') ? G.startConversion(ctx.game, el.dataset.id) : null),
  'do-check': (el, ctx) => G.scheduleCheck(ctx.game, el.dataset.id, el.dataset.check),
  'cancel-booking': (el, ctx) => G.cancelBooking(ctx.game, el.dataset.id),
  'set-group': (el, ctx) => G.setGroup(ctx.game, el.dataset.id, formValues(el).group),
  'secured-loan': (el, ctx) => G.takeSecuredLoan(ctx.game, el.dataset.id),
  leaseback: (el, ctx) => (confirm('Sell this aircraft to a lessor and lease it back?') ? G.saleLeaseback(ctx.game, el.dataset.id) : null),
  'sell-ac'(el, ctx) {
    if (!confirm('Sell this aircraft?')) return;
    const res = G.sellAircraft(ctx.game, el.dataset.id);
    if (res.ok) location.hash = '#fleet';
    return res;
  },
  'return-lease'(el, ctx) {
    if (!confirm('Return this aircraft early?')) return;
    const res = G.returnLease(ctx.game, el.dataset.id);
    if (res.ok) location.hash = '#fleet';
    return res;
  },
  'extend-lease': (el, ctx) => G.extendLease(ctx.game, el.dataset.id),
  'live:cfg': (el, ctx) => updateCabinEditor(el.closest('[data-form]'), ctx),
};

const pickIds = (ctx) => ctx.ui.fleetSel ?? [];
const done = (ctx, res) => (res?.ok ? ((ctx.ui.fleetSel = []), res) : res);
Object.assign(actions, {
  'fleet-filter-reset': (el, ctx) => {
    ctx.ui.fleetFilter = { status: 'all', type: 'all', terms: 'all', group: 'all', route: 'all' };
  },
  'sel-shown': (el, ctx) => {
    const f = ctx.ui.fleetFilter ?? {};
    ctx.ui.fleetSel = [...new Set([...pickIds(ctx), ...ctx.game.fleet.filter((ac) => matches(ctx.game, ac, { status: 'all', type: 'all', terms: 'all', group: 'all', route: 'all', ...f })).map((a) => a.id)])];
  },
  'sel-spare': (el, ctx) => {
    ctx.ui.fleetSel = ctx.game.fleet.filter((ac) => matches(ctx.game, ac, { status: 'spare' })).map((a) => a.id);
  },
  'sel-clear': (el, ctx) => {
    ctx.ui.fleetSel = [];
  },
  'bulk-auto': (el, ctx) => G.bulkAutoAssign(ctx.game, pickIds(ctx)),
  'bulk-route': (el, ctx) => {
    const v = formValues(el);
    return G.bulkAssignRoute(ctx.game, pickIds(ctx), v.route, Number(v.freq) || 0);
  },
  'bulk-unassign': (el, ctx) => (confirm(`Clear the schedules of ${pickIds(ctx).length} aircraft?`) ? G.bulkUnassign(ctx.game, pickIds(ctx)) : null),
  'bulk-group': (el, ctx) => G.bulkSetGroup(ctx.game, pickIds(ctx), formValues(el).group),
  'bulk-dispose': (el, ctx) => {
    const q = G.bulkDisposalQuote(ctx.game, pickIds(ctx));
    const what = [q.sold && `sell ${q.sold} owned`, q.returned && `return ${q.returned} leased`].filter(Boolean).join(' and ');
    if (!confirm(`${what[0].toUpperCase()}${what.slice(1)} aircraft for a net ${q.cash >= 0 ? 'gain' : 'cost'} of ${G.money(Math.abs(q.cash))}? This can't be undone (except with ↶ revert).`)) return null;
    return done(ctx, G.bulkDispose(ctx.game, pickIds(ctx)));
  },
});

export const changes = {
  'fleet-filter': (el, ctx) => {
    (ctx.ui.fleetFilter ??= {})[el.dataset.key] = el.value;
  },
  'fleet-pick': (el, ctx) => {
    const set = new Set(pickIds(ctx));
    if (el.checked) set.add(el.dataset.id);
    else set.delete(el.dataset.id);
    ctx.ui.fleetSel = [...set];
  },
  'fleet-pick-all': (el, ctx) => {
    const f = { status: 'all', type: 'all', terms: 'all', group: 'all', route: 'all', ...(ctx.ui.fleetFilter ?? {}) };
    const shown = ctx.game.fleet.filter((ac) => matches(ctx.game, ac, f)).map((a) => a.id);
    const set = new Set(pickIds(ctx));
    for (const id of shown) el.checked ? set.add(id) : set.delete(id);
    ctx.ui.fleetSel = [...set];
  },
  'market-cat': (el, ctx) => (ctx.ui.marketCat = el.value),
  'show-ended': (el, ctx) => (ctx.ui.showEnded = el.checked),
};
