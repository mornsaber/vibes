import { G, esc, money, pct, int, num, kpi, panel, table, tabs, options, statement, bar, pill, ap, typeName, statusPill, checkCell } from '../util.js';
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
  ${tabs('fleet', [['aircraft', 'Aircraft'], ['groups', 'Groups'], ['orders', 'On order'], ['market', 'Acquire aircraft']], t)}
  ${body(c)}`;
}

export function fleetTable(s, list, { empty } = {}) {
  return table(list, [
    { h: 'Reg', v: (ac) => `<a href="#fleet/ac/${ac.id}"><b>${ac.reg}</b></a>${ac.group ? `<br><small class="muted">${esc(ac.group)}</small>` : ''}` },
    { h: 'Type', v: (ac) => esc(typeName(ac.type)) },
    { h: 'Layout', v: (ac) => G.CLASSES.filter((k) => ac.config[k]).map((k) => `${k}${ac.config[k]}`).join(' ') || `${G.typeOf(ac).cargoT} t` },
    { h: 'Age', cls: 'num', v: (ac) => `${num(G.ageYears(s, ac), 1)} y` },
    { h: 'Terms', v: (ac) => (ac.owned ? 'Owned' : `Lease ${money(ac.lease.monthly)}/mo`) },
    { h: 'Status', v: (ac) => statusPill(s, ac) },
    { h: 'Utilisation', v: (ac) => bar(G.utilization(s, ac), 1) },
    { h: 'Reliability', v: (ac) => bar(ac.reliability, 100) },
    { h: 'Next check', v: (ac) => { const n = G.nextCheck(s, ac); return `${n.check} ${checkCell(s, ac, n.check)}`; } },
  ], { empty: empty ?? 'No aircraft. Visit "Acquire aircraft".' });
}

function aircraft(c) {
  const s = c.state;
  const owned = s.fleet.filter((a) => a.owned).length;
  const avgAge = s.fleet.length ? s.fleet.reduce((t, a) => t + G.ageYears(s, a), 0) / s.fleet.length : 0;
  return `<div class="grid kpis">
    ${kpi('Aircraft', s.fleet.length)}
    ${kpi('Owned / leased', `${owned} / ${s.fleet.length - owned}`)}
    ${kpi('Average age', `${num(avgAge, 1)} yrs`)}
    ${kpi('Fleet value (owned)', money(G.ownedFleetValue(s)))}
    ${kpi('On order', s.orders.length, { href: '#fleet/orders' })}
  </div>${panel('All aircraft', fleetTable(s, s.fleet))}`;
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
  return `<div class="grid cols-3">${typeCards || '<p class="muted">No aircraft yet.</p>'}</div>
  ${panel('Custom groups', custom.length ? custom.map(([g, list]) => `<p><b>${esc(g)}</b>: ${list.map((a) => `<a href="#fleet/ac/${a.id}">${a.reg}</a>`).join(', ')}</p>`).join('') : '<p class="muted">Assign aircraft to sub-fleets (e.g. "Long-haul", "Shuttle") from each aircraft\'s page.</p>')}`;
}

function orders(c) {
  const s = c.state;
  const arriving = s.fleet.filter((a) => !G.isDelivered(s, a)).sort((a, b) => a.deliveryWeek - b.deliveryWeek);
  return `${panel('Factory orders', table([...s.orders].sort((a, b) => a.deliveryWeek - b.deliveryWeek), [
    { h: 'Type', v: (o) => esc(typeName(o.type)) },
    { h: 'Ordered', v: (o) => G.dateLabel(o.orderedWeek) },
    { h: 'Delivery', v: (o) => `${G.dateLabel(o.deliveryWeek)} <small class="muted">(${o.deliveryWeek - s.week} wk)</small>` },
    { h: 'Price', cls: 'num', v: (o) => money(o.price) },
    { h: 'Paid', cls: 'num', v: (o) => money(o.paid) },
    { h: 'Due on delivery', cls: 'num', v: (o) => money(o.price - o.paid) },
    { h: 'Layout', v: (o) => G.CLASSES.filter((k) => o.config[k]).map((k) => `${k}${o.config[k]}`).join(' ') || '—' },
    { h: '', v: (o) => `<button class="small danger" data-action="cancel-order" data-id="${o.id}">Cancel</button>` },
  ], { empty: 'No factory orders. New aircraft take 1.5–5 years to arrive.' }))}
  ${panel('Lease deliveries & used aircraft in induction', fleetTable(s, arriving, { empty: 'Nothing arriving.' }))}`;
}

function market(c) {
  const s = c.state;
  const cat = c.ui.marketCat ?? 'all';
  const match = (typeId) => cat === 'all' || G.aircraftById[typeId].cat === cat;
  const leases = s.market.leases.filter((o) => match(o.type)).sort((a, b) => a.lead - b.lead);
  const used = s.market.used.filter((o) => match(o.type)).sort((a, b) => a.price - b.price);
  const year = G.yearOf(s.week);
  const types = G.AIRCRAFT.filter((t) => match(t.id) && (G.inProduction(t, year) || (t.out != null && year > t.out && year <= t.out + 10)));
  return `<div class="row">Show <select data-change="market-cat">${options(CAT_OPTS, cat)}</select><span class="muted small">Lease and used offers refresh monthly. Factory lead times reflect manufacturer backlogs.</span></div>
  ${panel('Operating lease offers', table(leases, [
    { h: 'Aircraft', v: (o) => `<b>${esc(typeName(o.type))}</b>${vintage(s, o.type)}<br><small class="muted">${o.age ? `${o.age} years old` : 'New build'}</small>` },
    { h: 'Lessor', v: (o) => esc(o.lessor) },
    { h: 'Rent / month', cls: 'num', v: (o) => money(o.monthly) },
    { h: 'Term', cls: 'num', v: (o) => `${o.termMonths} mo` },
    { h: 'Delivery', v: (o) => `${o.lead} wk <small class="muted">(${G.dateLabel(s.week + o.lead)})</small>` },
    { h: 'Deposit', cls: 'num', v: (o) => money(o.monthly * 2) },
    { h: 'Offer ends', v: (o) => `${o.expiresWeek - s.week} wk` },
    { h: '', v: (o) => `<button class="small primary" data-action="lease-offer" data-id="${o.id}">Sign lease</button>` },
  ], { empty: 'No lease offers for this category right now.' }))}
  ${panel('Used aircraft for sale', table(used, [
    { h: 'Aircraft', v: (o) => `<b>${esc(typeName(o.type))}</b>${vintage(s, o.type)}<br><small class="muted">${o.age} years old</small>` },
    { h: 'Seller', v: (o) => esc(o.seller) },
    { h: 'Reliability', v: (o) => bar(o.reliability, 100) },
    { h: 'Price', cls: 'num', v: (o) => money(o.price) },
    { h: 'Induction', v: (o) => `${o.lead} wk` },
    { h: '', v: (o) => `<button class="small" data-action="buy-used" data-id="${o.id}" ${s.cash < o.price ? 'disabled' : ''}>Buy</button>` },
  ], { empty: 'No used aircraft of this category on the market.' }))}
  ${panel('Order new from the manufacturer', table(types, [
    { h: 'Type', v: (t) => `<b>${esc(t.name)}</b>${t.fe ? ' <small class="pill">flight engineer</small>' : ''}${t.noise === 2 ? ' <small class="pill warn">Chapter 2</small>' : ''}<br><small class="muted">${esc(t.maker)} · ${G.CATEGORY_LABELS[t.cat]} · built ${t.intro}–${t.out ?? 'today'}</small>` },
    { h: 'Capacity', v: (t) => (t.cat === 'freighter' ? `${t.cargoT} t` : `${G.seatCount(t.config)} seats <small class="muted">(max ${t.maxSeats})</small>`) },
    { h: 'Range', cls: 'num', v: (t) => `${int(t.range)} km` },
    { h: 'Runway', cls: 'num', v: (t) => `${int(t.runway)} m` },
    { h: 'Fuel', cls: 'num', v: (t) => `${t.burn} kg/km` },
    { h: 'List price', cls: 'num', v: (t) => money(t.price) },
    { h: 'Lead time', v: (t) => (G.inProduction(t, year) ? `${t.lead} wk <small class="muted">(~${Math.max(G.yearOf(s.week + t.lead), t.intro)})</small>` : `<span class="muted">Production ended ${t.out}</span>`) },
    { h: '', v: (t) => (G.inProduction(t, year) ? `<div class="row" data-form><input type="number" name="qty" value="1" min="1" max="50" class="w-60"><button class="small" data-action="order" data-type="${t.id}">Order</button></div>` : '') },
  ]))}
  <p class="muted small">Orders need a 20% pre-delivery deposit; the balance is due on delivery (financed automatically with an aircraft loan if cash is short). Volume discounts of 2% per extra aircraft, up to 25%.</p>`;
}

// ---------------------------------------------------------------------------

function detail(c, ac) {
  const s = c.state;
  const t = G.typeOf(ac);
  const st = G.statusOf(s, ac);
  const loan = s.loans.find((l) => l.aircraftId === ac.id);
  const conv = G.CONVERSIONS[ac.type];
  const units = G.cabinUnits(t, ac.config);
  const warnings = [ac.retired && 'Withdrawn: this airframe has reached its life limit. Sell it for scrap or return it.', t.noise === 2 && G.yearOf(s.week) >= 1998 && 'Chapter 2 noise category: banned from North American and European airports from 2002.', t.fe && 'Three-person cockpit: needs a flight engineer on every flight.'].filter(Boolean);
  return `${warnings.map((x) => `<div class="callout warn">${esc(x)}</div>`).join('')}<div class="page-head"><h1><a href="#fleet" class="muted">Fleet ›</a> ${ac.reg}</h1><div class="row">${pill(st.label, st.tone)} <span class="muted">${esc(t.name)}</span></div></div>
  <div class="grid kpis">
    ${kpi('Age', `${num(G.ageYears(s, ac), 1)} yrs`)}
    ${kpi('Flight hours', int(ac.fh), { sub: `${int(ac.cycles)} cycles` })}
    ${kpi('Reliability', int(ac.reliability), { cls: ac.reliability < 70 ? 'bad' : '', sub: `Dispatch ${pct(G.dispatchReliability(ac), 1)}` })}
    ${kpi('Utilisation', pct(G.utilization(s, ac)), { sub: `${int(G.scheduledHours(s, ac))} h scheduled` })}
    ${kpi('Market value', money(G.aircraftValue(s, ac)))}
  </div>
  <div class="grid cols-2">
    ${panel('Schedule', `${table(ac.schedule, [
      { h: 'Route', v: (x) => { const r = G.routeById(s, x.routeId); return `<a href="#routes/${r.id}">${r.a}–${r.b}</a> <small class="muted">${int(r.distance)} km</small>`; } },
      { h: 'Round trips/wk', cls: 'num', v: (x) => x.freq },
      { h: 'Hours/wk', cls: 'num', v: (x) => int(x.freq * G.roundTripHours(t, G.routeById(s, x.routeId).distance)) },
      { h: '', v: (x) => `<button class="small danger" data-action="unassign" data-ac="${ac.id}" data-route="${x.routeId}">Remove</button>` },
    ], { empty: 'Not scheduled. Assign it from a route page or Planning.' })}
    <p class="muted small">${int(G.scheduledHours(s, ac) + (ac.contractHours || 0))} of ${G.weeklyHours(t)} available block hours/week used${ac.contractHours ? ' (including contract flying)' : ''}.</p>
    <div class="row" data-form><input name="group" placeholder="Sub-fleet group" value="${esc(ac.group ?? '')}"><button class="small" data-action="set-group" data-id="${ac.id}">Set group</button></div>`)}
    ${t.cat === 'freighter' ? panel('Freighter', `<p>Main-deck capacity ${t.cargoT} tonnes. Freighters carry cargo only.</p>`) : panel('Cabin layout', `<div data-form>
      <div class="grid cols-4 tight">${G.CLASSES.map((k) => `<div class="field"><label>${G.CABIN[k].name} <small class="muted">(${G.CABIN[k].units[t.cat]} units)</small></label><input type="number" name="${k}" value="${ac.config[k] || 0}" min="0" data-live="cfg" data-type="${t.id}" ${k === 'F' && !['wide', 'jumbo'].includes(t.cat) ? 'disabled' : ''}></div>`).join('')}</div>
      <p class="small" id="cfg-summary">${units.toFixed(0)} of ${t.maxSeats} floor units used · ${G.seatCount(ac.config)} seats</p>
      <button class="primary small" data-action="retrofit" data-id="${ac.id}">Retrofit cabin</button>
      <p class="muted small">Retrofits take ${['wide', 'jumbo'].includes(t.cat) ? 4 : 2} weeks out of service — or none if done during a C/D check. Before delivery, spec changes cost half.</p>
    </div>`)}
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
      { h: 'Upgrade', v: ([, u]) => `<b>${esc(u.name)}</b><br><small class="muted">${esc(u.desc)}</small>` },
      { h: 'Cost', cls: 'num', v: ([, u]) => money(u.cost[t.mx]) },
      { h: 'Downtime', cls: 'num', v: ([, u]) => `${u.days} d` },
      { h: '', v: ([k]) => (ac.upgrades.includes(k) ? pill('Installed', 'good') : `<button class="small" data-action="upgrade" data-id="${ac.id}" data-up="${k}">Install</button>`) },
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

function vintage(s, typeId) {
  const t = G.aircraftById[typeId];
  const year = G.yearOf(s.week);
  if (t.out != null && year > t.out) return ' <small class="pill warn">out of production</small>';
  return '';
}

export const actions = {
  'lease-offer': (el, ctx) => G.leaseFromOffer(ctx.game, el.dataset.id),
  'buy-used': (el, ctx) => G.buyUsed(ctx.game, el.dataset.id),
  order: (el, ctx) => G.orderAircraft(ctx.game, el.dataset.type, Number(formValues(el).qty || 1)),
  'cancel-order': (el, ctx) => (confirm('Cancel this order and forfeit the deposit?') ? G.cancelOrder(ctx.game, el.dataset.id) : null),
  retrofit: (el, ctx) => G.retrofitCabin(ctx.game, el.dataset.id, formValues(el)),
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
  'live:cfg'(el) {
    const t = G.aircraftById[el.dataset.type];
    const root = el.closest('[data-form]');
    const cfg = Object.fromEntries(G.CLASSES.map((k) => [k, Number(root.querySelector(`[name=${k}]`).value) || 0]));
    const units = G.cabinUnits(t, cfg);
    const out = root.querySelector('#cfg-summary');
    out.textContent = `${units.toFixed(0)} of ${t.maxSeats} floor units used · ${G.seatCount(cfg)} seats${units > t.maxSeats ? ' — too many!' : ''}`;
    out.className = `small ${units > t.maxSeats ? 'bad' : ''}`;
  },
};

export const changes = {
  'market-cat': (el, ctx) => (ctx.ui.marketCat = el.value),
};
