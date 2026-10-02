// Homepage: KPIs, monthly profit, issues needing attention, operations,
// fleet by type, network, staffing and upcoming deliveries.

import { G, esc, money, pct, int, kpi, panel, barChart, hbars, pill, ap, typeName, tonnes } from '../util.js';
import { worldMap } from '../map.js';

// Everything the CEO should look at, most severe first.
export function issues(s) {
  const out = [];
  const add = (level, text, href) => out.push({ level, text, href });
  const r = s.lastReport;
  if (s.cash < 0) add('bad', `Cash is negative (${money(s.cash)}). ${8 - s.lowCashWeeks} weeks until administration.`, '#finances');
  else if (r && s.cash < Math.abs(Math.min(0, r.profit)) * 8) add('bad', `Cash runway under 8 weeks at the current burn.`, '#finances');
  for (const [role, a] of Object.entries(s.strikes)) add('bad', `${G.ROLES[role].name}: ${G.ACTIONS[a.kind].name.toLowerCase()} (${a.weeks} week(s) left).`, `#management/staffing/${role}`);
  for (const role of G.ROLE_IDS) if (s.staff[role].poach > 0.0008) add('warn', `Rivals are poaching your ${G.ROLES[role].name.toLowerCase()} with better pay.`, `#management/staffing/${role}`);
  const recent = s.incidents.filter((i) => s.week - i.week < 8 && (i.severity === 'hull loss' || i.severity === 'serious'));
  for (const i of recent.slice(0, 2)) add('bad', `${i.severity === 'hull loss' ? 'Accident' : 'Serious incident'}: ${i.reg} — ${i.text}.`, '#engineering/safety');
  const retired = s.fleet.filter((a) => a.retired);
  if (retired.length) add('warn', `${retired.length} aircraft past their airframe life limit — sell or return them.`, '#fleet');
  const banned = s.fleet.filter((a) => a.schedule.some((x) => { const r = G.routeById(s, x.routeId); return r && G.noiseBanned(s, G.typeOf(a), r); }));
  if (banned.length) add('bad', `${banned.length} aircraft scheduled on routes where Chapter 2 noise rules ban them.`, '#planning/capacity');
  const grounded = s.fleet.filter((a) => a.grounded);
  if (grounded.length) add('bad', `${grounded.length} aircraft grounded: ${grounded.map((a) => a.reg).join(', ')}.`, '#engineering/schedule');
  const overdue = s.fleet.filter((a) => G.isDelivered(s, a) && !a.grounded && G.CHECK_ORDER.some((k) => G.checkStatus(s, a, k).overdue));
  if (overdue.length) add('bad', `${overdue.length} aircraft past a maintenance limit.`, '#engineering/schedule');
  const idle = s.fleet.filter((a) => G.statusOf(s, a).key === 'idle');
  if (idle.length) add('warn', `${idle.length} aircraft idle: ${idle.slice(0, 5).map((a) => a.reg).join(', ')}${idle.length > 5 ? '…' : ''}.`, '#planning');
  const unscheduled = s.fleet.filter((a) => !G.isDelivered(s, a) && a.deliveryWeek - s.week <= 4 && !a.schedule.length);
  if (unscheduled.length) add('warn', `${unscheduled.length} aircraft arriving within 4 weeks have no schedule.`, '#planning');
  for (const [role, st] of Object.entries(s.staffStatus ?? {})) {
    if (st.required > 0 && st.ratio < 0.95) add(st.ratio < 0.85 ? 'bad' : 'warn', `${G.ROLES[role].name} shortage: ${st.count} of ${st.required} needed.`, '#management/staffing');
    if (s.staff[role].morale < 35) add('warn', `${G.ROLES[role].name} morale is low (${Math.round(s.staff[role].morale)}). Strike risk.`, '#management/staffing');
  }
  const losers = s.routes.filter((x) => x.last && x.last.freq > 0 && x.last.profit < 0).sort((a, b) => a.last.profit - b.last.profit);
  if (losers.length) add('warn', `${losers.length} route(s) losing money — worst ${losers[0].a}–${losers[0].b} (${money(losers[0].last.profit)}/wk).`, `#routes/${losers[0].id}`);
  const empty = s.routes.filter((x) => !G.routeFreq(s, x));
  if (empty.length) add('warn', `${empty.length} route(s) with no aircraft scheduled.`, '#routes');
  const full = s.routes.filter((x) => x.last && x.last.lf > 0.96);
  if (full.length) add('info', `${full.length} route(s) are full — raise fares or add capacity.`, '#network/health');
  const ending = s.fleet.filter((a) => !a.owned && a.lease.endWeek - s.week <= 13 && a.lease.endWeek > s.week);
  if (ending.length) add('warn', `${ending.length} lease(s) end within 13 weeks.`, '#finances');
  for (const c of s.contracts.active) if (c.startWeek <= s.week && !s.fleet.some((a) => a.id === c.aircraftId)) add('bad', `Contract with ${c.client} has no aircraft.`, c.category === 'charter' ? '#charter' : '#special');
  for (const sub of s.subsidies.active) if (s.week - sub.startWeek > 8 && G.subsidyServed(s, sub) < sub.minFreq * 0.8) add('bad', `${sub.program} at ${sub.code}: fly ${sub.minFreq}/wk to a hub or lose the contract.`, '#management/subsidies');
  if (['CCC', 'D'].includes(s.finance.rating)) add('bad', `Credit rating ${s.finance.rating}: lenders are nervous.`, '#finances');
  if (s.board.confidence < 30) add('bad', `Board confidence is ${Math.round(s.board.confidence)}. You could be fired at the next review.`, '#management/airline');
  for (const code of G.stations(s)) {
    const info = G.slotInfo(s, code);
    if (info && info.used > info.held) add('bad', `Using more slots at ${code} than you hold.`, '#planning/slots');
  }
  if (s.contracts.offers.length) add('info', `${s.contracts.offers.length} contract offer(s) available.`, '#charter');
  if (s.subsidies.offers.length) add('info', `${s.subsidies.offers.length} government subsidy offer(s).`, '#management/subsidies');
  if (!s.routes.length) add('info', 'Open your first route from the Routes page or the Map.', '#routes');
  if (!s.fleet.length) add('info', 'Acquire aircraft: leases arrive fastest, used aircraft next, factory orders take years.', '#fleet/market');
  const order = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

export function render({ state: s }) {
  const r = s.lastReport;
  const months = Object.entries(s.months).sort((a, b) => a[0] - b[0]).slice(-18);
  const monthly = months.map(([k, m]) => ({ label: G.MONTHS[k % 12].slice(0, 1) + (k % 12 === 0 ? `'${String(Math.floor(k / 12)).slice(2)}` : ''), value: m.profit }));
  const list = issues(s);
  const delivered = s.fleet.filter((a) => G.isDelivered(s, a));
  const util = delivered.length ? delivered.reduce((t, a) => t + G.utilization(s, a), 0) / delivered.length : 0;
  const byType = Object.entries(s.fleet.reduce((m, a) => ((m[a.type] = (m[a.type] ?? 0) + 1), m), {})).map(([t, n]) => ({ label: typeName(t), value: n })).sort((a, b) => b.value - a.value);
  const upcoming = [
    ...s.orders.map((o) => ({ week: o.deliveryWeek, text: `${typeName(o.type)} (factory)` })),
    ...s.fleet.filter((a) => !G.isDelivered(s, a)).map((a) => ({ week: a.deliveryWeek, text: `${typeName(a.type)} ${a.reg} (${a.owned ? 'used' : 'lease'})` })),
  ].sort((a, b) => a.week - b.week);
  const destinations = G.stations(s).length;
  const headcount = G.headcount(s);

  return `
  <div class="page-head"><h1>Dashboard</h1><span class="muted">${esc(s.airline.slogan || `${s.airline.homeName}'s newest airline`)}</span></div>
  <div class="grid kpis">
    ${kpi('Cash', money(s.cash), { href: '#finances', cls: s.cash < 0 ? 'bad' : '', sub: `Rating ${s.finance.rating}` })}
    ${kpi('Profit / week', money(r?.profit ?? 0), { href: '#finances', cls: (r?.profit ?? 0) < 0 ? 'bad' : 'good', sub: `Revenue ${money(r?.totalRevenue ?? 0)}` })}
    ${kpi('Load factor', r ? pct(r.lf) : '–', { href: '#routes', sub: `${int(r?.pax ?? 0)} pax last week` })}
    ${kpi('Fleet', String(s.fleet.length), { href: '#fleet', sub: `${s.orders.length} on order` })}
  </div>
  <div class="grid cols-2">
    ${panel('Monthly profit', barChart(monthly, { href: '#finances' }), { href: '#finances' })}
    ${panel('Needs attention', list.length ? `<ul class="issues">${list.slice(0, 12).map((i) => `<li class="${i.level}"><a href="${i.href}">${esc(i.text)}</a></li>`).join('')}</ul>` : '<p class="good">All clear. Operations are running smoothly.</p>')}
  </div>
  <div class="grid cols-3">
    ${panel('Operations', `<div class="mini-stats">
      <div><label>Flights / wk</label><b>${int(r?.flights ?? 0)}</b></div>
      <div><label>On-time</label><b>${r?.flights ? pct(r.otp) : '–'}</b></div>
      <div><label>Passengers / wk</label><b>${int(r?.pax ?? 0)}</b></div>
      <div><label>Connecting</label><b>${r?.pax ? pct(r.connecting / r.pax) : '–'}</b></div>
      <div><label>Cargo / wk</label><b>${tonnes(r?.cargoKg ?? 0)}</b></div>
      <div><label>Utilisation</label><b>${pct(util)}</b></div>
    </div>`, { href: '#planning' })}
    ${panel('Fleet by type', hbars(byType), { href: '#fleet/groups' })}
    ${panel('Staffing', `<div class="mini-stats">${G.ROLE_IDS.map((role) => {
      const st = s.staffStatus?.[role];
      const short = st && st.required && st.ratio < 0.95;
      return `<div><label>${G.ROLES[role].name}</label><b class="${short ? 'bad' : ''}">${int(s.staff[role].count)}${st?.required ? `<small> / ${int(st.required)}</small>` : ''}</b></div>`;
    }).join('')}<div><label>Total</label><b>${int(headcount)}</b></div></div>`, { href: '#management/staffing' })}
  </div>
  <div class="grid cols-2">
    ${panel('Network', `<div class="mini-stats three">
      <div><label>Hubs</label><b>${s.hubs.length}</b></div><div><label>Routes</label><b>${s.routes.length}</b></div><div><label>Destinations</label><b>${destinations}</b></div>
    </div><a href="#map" class="map-link">${worldMap(s, { view: mapView(s) })}</a>`, { href: '#network' })}
    ${panel('Upcoming deliveries', upcoming.length ? `<ul class="plain">${upcoming.slice(0, 8).map((u) => `<li><span class="muted mono">${G.dateLabel(u.week)}</span> ${esc(u.text)} <span class="muted">(${u.week - s.week} wk)</span></li>`).join('')}</ul>` : '<p class="muted">Nothing on order. <a href="#fleet/market">Visit the aircraft market</a>.</p>', { href: '#fleet/orders' })}
  </div>
  <div class="grid cols-2">
    ${panel('Board objectives', `<ul class="plain">${s.board.objectives.map((o) => {
      const p = G.objectiveProgress(s, o);
      return `<li>${p.met ? pill('On track', 'good') : pill('Open', 'warn')} ${esc(o.label)} <span class="muted">— now ${esc(p.value)}</span></li>`;
    }).join('')}</ul><p class="muted small">Board confidence ${Math.round(s.board.confidence)}/100. Reviews each quarter; objectives judged at year end.</p>`, { href: '#management/airline' })}
    ${panel('News', `<ul class="news">${s.log.slice(0, 10).map((n) => `<li class="${n.tone}"><span class="when">${G.dateLabel(n.week)}</span><span>${esc(n.text)}</span></li>`).join('')}</ul>`)}
  </div>`;
}

function mapView(s) {
  const region = G.airportByCode[s.hubs[0].code].region;
  const longHaul = s.routes.some((r) => r.distance > 4500);
  if (longHaul) return 'world';
  return { NA: 'na', LA: 'la', EU: 'eu', ME: 'me', AF: 'me', AS: 'as', OC: 'oc' }[region];
}

export { ap };
