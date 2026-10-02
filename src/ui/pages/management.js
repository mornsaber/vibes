import { G, esc, money, pct, int, num, kpi, panel, table, tabs, statement, options, bar, pill, ap, tonnes } from '../util.js';
import { formValues } from '../app.js';
import { hubsPanel } from './planning.js';
import { render as cargoRender } from './cargo.js';

const TABS = [['airline', 'Airline'], ['subsidies', 'Subsidies'], ['stats', 'Statistics'], ['hubs', 'Hubs'], ['service', 'Service standards'], ['codeshare', 'Codeshare & alliances'], ['staffing', 'Staffing'], ['cargo', 'Cargo']];

export function render(c) {
  const tab = c.params[0] ?? 'airline';
  const body = { airline, subsidies, stats, hubs: (x) => hubsPanel(x.state), service, codeshare, staffing, cargo: (x) => cargoRender({ ...x, params: ['overview'] }, true) }[tab] ?? airline;
  return `<div class="page-head"><h1>Management</h1></div>${tabs('management', TABS, tab)}${body(c)}`;
}

function airline(c) {
  const s = c.state;
  const a = s.airline;
  return `<div class="grid cols-2">
    ${panel('Customise your airline', `<div class="stack" data-form>
      <div class="field"><label>Name</label><input name="name" value="${esc(a.name)}" maxlength="32"></div>
      <div class="grid cols-2 tight"><div class="field"><label>IATA code</label><input name="code" value="${esc(a.code)}" maxlength="2"></div>
      <div class="field"><label>Livery colour</label><input type="color" name="color" value="${esc(a.color)}"></div></div>
      <div class="field"><label>Slogan</label><input name="slogan" value="${esc(a.slogan)}" maxlength="60" placeholder="e.g. The friendly skies"></div>
      <button class="primary" data-action="save-airline">Save</button>
    </div>`)}
    ${panel('Board of directors', `${statement([
      ['Confidence', `${bar(s.board.confidence, 100)} ${Math.round(s.board.confidence)}/100`],
      ['Quarterly reviews held', s.board.reviews],
      ['Reputation', `${Math.round(s.reputation)}/100`],
      ['Founded', `${G.dateLabel(0)} in ${esc(a.homeName)}`],
    ])}<h3>Objectives for ${s.board.objectives[0]?.year ?? ''}</h3>
    ${table(s.board.objectives, [
      { h: 'Objective', v: (o) => esc(o.label) },
      { h: 'Now', v: (o) => esc(G.objectiveProgress(s, o).value) },
      { h: '', v: (o) => (G.objectiveProgress(s, o).met ? pill('Met', 'good') : pill('Open', 'warn')) },
    ])}<p class="muted small">Each objective met at year end adds 7 confidence; each missed costs 6.</p>`)}
  </div>`;
}

function subsidies(c) {
  const s = c.state;
  return `${panel('Programs on offer', table(s.subsidies.offers, [
    { h: 'Program', v: (o) => esc(o.program) },
    { h: 'Airport', v: (o) => `<b>${o.code}</b> ${esc(ap(o.code).city)} <small class="muted">${ap(o.code).runway} m runway</small>` },
    { h: 'Requirement', v: (o) => `${o.minFreq}+ round trips/wk to any hub` },
    { h: 'Pays', cls: 'num', v: (o) => `${money(o.weekly)}/wk` },
    { h: 'Term', v: (o) => `${o.weeks} wk` },
    { h: 'Offer ends', v: (o) => `${o.expiresWeek - s.week} wk` },
    { h: '', v: (o) => `<button class="small primary" data-action="accept-subsidy" data-id="${o.id}">Bid</button>` },
  ], { empty: 'No subsidy programs on offer this month. Governments tender thin routes to small home-market airports.' }))}
  ${panel('Active contracts', table(s.subsidies.active, [
    { h: 'Program', v: (o) => `${esc(o.program)} · <b>${o.code}</b>` },
    { h: 'Flying', v: (o) => { const f = G.subsidyServed(s, o); return `<span class="${f >= o.minFreq * 0.8 ? 'good' : 'bad'}">${num(f, 1)}</span> / ${o.minFreq} per wk`; } },
    { h: 'Paid so far', cls: 'num', v: (o) => money(o.paid) },
    { h: 'Missed weeks', cls: 'num', v: (o) => o.missed },
    { h: 'Ends', v: (o) => G.dateLabel(o.endWeek) },
  ], { empty: 'None. Win a contract, then open a route from the airport to a hub.' }))}`;
}

function stats(c) {
  const s = c.state;
  const st = s.stats;
  const yr = s.history.slice(-52);
  const sum = (f) => yr.reduce((t, h) => t + f(h), 0);
  const ask = s.lastReport?.ask ?? 0;
  const rpk = s.lastReport?.rpk ?? 0;
  const cost = s.lastReport?.totalCost ?? 0;
  const rev = s.lastReport?.totalRevenue ?? 0;
  const staff = G.headcount(s);
  const years = Object.entries(s.history.reduce((m, h) => {
    const y = G.yearOf(h.week);
    const e = (m[y] ??= { revenue: 0, profit: 0, pax: 0, flights: 0 });
    e.revenue += h.revenue;
    e.profit += h.profit;
    e.pax += h.pax;
    e.flights += h.flights;
    return m;
  }, {}));
  return `<div class="grid kpis">
    ${kpi('Passengers (lifetime)', int(st.pax))}
    ${kpi('Flights (lifetime)', int(st.flights))}
    ${kpi('Revenue (lifetime)', money(st.revenue))}
    ${kpi('Profit (lifetime)', money(st.profit), { cls: st.profit < 0 ? 'bad' : 'good' })}
    ${kpi('Cargo (lifetime)', tonnes(st.cargoKg))}
  </div>
  <div class="grid cols-2">
    ${panel('Unit economics (last week)', statement([
      ['ASK', `${num(ask / 1e6, 2)}M`],
      ['RPK', `${num(rpk / 1e6, 2)}M`],
      ['Load factor (RPK/ASK)', ask ? pct(rpk / ask, 1) : '–'],
      ['RASK', ask ? `${num((rev / ask) * 100, 2)}¢` : '–'],
      ['CASK', ask ? `${num((cost / ask) * 100, 2)}¢` : '–'],
      ['CASK ex-fuel', ask ? `${num(((cost - (s.lastReport?.cost.fuel ?? 0)) / ask) * 100, 2)}¢` : '–'],
      ['Passenger yield', rpk ? `${num(((s.lastReport?.revenue.passenger ?? 0) / rpk) * 100, 2)}¢/km` : '–'],
      ['Average fare', s.lastReport?.pax ? `$${int((s.lastReport.revenue.passenger) / s.lastReport.pax)}` : '–'],
      ['On-time performance (12 mo)', yr.some((h) => h.flights) ? pct(sum((h) => h.otp * h.flights) / Math.max(1, sum((h) => h.flights))) : '–'],
    ]))}
    ${panel('Organisation', statement([
      ['Employees', int(staff)],
      ['Employees per aircraft', s.fleet.length ? num(staff / s.fleet.length, 0) : '–'],
      ['Revenue per employee (annualised)', staff ? money((sum((h) => h.revenue) / Math.max(1, yr.length)) * 52 / staff) : '–'],
      ['Average fleet age', s.fleet.length ? `${num(s.fleet.reduce((t, a) => t + G.ageYears(s, a), 0) / s.fleet.length, 1)} yrs` : '–'],
      ['Destinations', G.stations(s).length],
      ['Countries', new Set(G.stations(s).map((x) => ap(x).country)).size],
      ['Reputation', int(s.reputation)],
    ]))}
  </div>
  ${panel('By year', table(years, [
    { h: 'Year', v: ([y]) => y },
    { h: 'Revenue', cls: 'num', v: ([, e]) => money(e.revenue) },
    { h: 'Profit', cls: 'num', v: ([, e]) => `<span class="${e.profit < 0 ? 'bad' : 'good'}">${money(e.profit)}</span>` },
    { h: 'Passengers', cls: 'num', v: ([, e]) => int(e.pax) },
    { h: 'Flights', cls: 'num', v: ([, e]) => int(e.flights) },
  ]))}`;
}

function service(c) {
  const s = c.state;
  return `<div class="grid cols-2">
    ${panel('Service standards', `${G.SERVICE_IDS.map((k) => {
      const d = G.SERVICE[k];
      return `<div class="field svc"><label><b>${esc(d.name)}</b> <small class="muted">${esc(d.desc)}</small></label>
        <div class="row">${[1, 2, 3, 4, 5].map((lv) => `<button class="small ${s.service[k] === lv ? 'primary' : ''}" data-action="set-service" data-k="${k}" data-lv="${lv}">${lv}</button>`).join('')}
        <small class="muted">appeal ×${d.appeal[s.service[k] - 1]} · ${d.cost[s.service[k] - 1] ? `$${d.cost[s.service[k] - 1]}${d.perPax ? '/pax' : '/pax-hour'}` : 'no cost'}${d.ancillary ? ` · ancillary ${pct(d.ancillary[s.service[k] - 1])} of eco revenue` : ''}</small></div></div>`;
    }).join('')}`)}
    ${panel('Marketing & brand', `${statement([
      ['Weekly marketing budget', money(s.marketing)],
      ['Demand effect', `+${pct(G.marketingEffect(s) - 1, 1)}`],
      ['Product appeal (long-haul)', `×${num(G.serviceAppeal(s, true), 3)}`],
      ['Product appeal (short-haul)', `×${num(G.serviceAppeal(s, false), 3)}`],
      ['Reputation', int(s.reputation)],
    ])}<div class="row" data-form><input type="number" name="marketing" value="${s.marketing}" step="25000" min="0" class="w-140"><button data-action="set-marketing">Set budget</button></div>
    <p class="muted small">Marketing has diminishing returns that scale with network size. Reputation drifts toward a target set by service, punctuality, product, morale and marketing.</p>`)}
  </div>`;
}

function codeshare(c) {
  const s = c.state;
  const partners = s.partners.codeshares.map((id) => G.rivalById[id]);
  const prospects = G.RIVALS.filter((r) => r.type !== 'cargo' && !s.partners.codeshares.includes(r.id) && s.rivals[r.id].status === 'active')
    .map((r) => ({ r, t: G.codeshareTerms(s, r.id), overlap: G.overlapRoutes(s, r.id).length, feeds: s.routes.filter((x) => r.hubs.includes(x.a) || r.hubs.includes(x.b)).length }))
    .sort((a, b) => b.feeds - a.feeds || b.t.score - a.t.score)
    .slice(0, 25);
  return `${panel('Codeshare partners', table(partners, [
    { h: 'Airline', v: (r) => `<a href="#competitors/${r.id}">${esc(r.name)}</a>` },
    { h: 'Hubs', v: (r) => r.hubs.join(', ') },
    { h: 'Your routes into their hubs', cls: 'num', v: (r) => s.routes.filter((x) => r.hubs.includes(x.a) || r.hubs.includes(x.b)).length },
    { h: 'Relationship', v: (r) => bar(s.rivals[r.id].relation, 100) },
    { h: '', v: (r) => `<button class="small danger" data-action="end-codeshare" data-id="${r.id}">End</button>` },
  ], { empty: 'No partners yet.' }))}
  <p class="muted small">A codeshare feeds partner passengers onto your routes touching their hubs (+12% demand) and softens competition with them, for a 3% revenue share on those routes.</p>
  ${panel('Potential partners', table(prospects, [
    { h: 'Airline', v: (p) => `<a href="#competitors/${p.r.id}">${esc(p.r.name)}</a> <small class="muted">${esc(p.r.alliance ?? 'Independent')}</small>` },
    { h: 'Feed routes', cls: 'num', v: (p) => p.feeds },
    { h: 'Overlap', cls: 'num', v: (p) => p.overlap },
    { h: 'Relationship', v: (p) => bar(s.rivals[p.r.id].relation, 100) },
    { h: 'Hostility', v: (p) => bar(s.rivals[p.r.id].hostility * 100, 100, { invert: true }) },
    { h: '', v: (p) => (p.t.reasons.length ? `<small class="muted">${esc(p.t.reasons[0])}</small>` : `<button class="small" data-action="propose-codeshare" data-id="${p.r.id}">Propose (${money(p.t.fee)})</button>`) },
  ]))}
  ${panel('Global alliances', table(Object.entries(G.ALLIANCES), [
    { h: 'Alliance', v: ([n]) => `<b>${esc(n)}</b>${s.partners.alliance === n ? ` ${pill('Member', 'good')}` : ''}` },
    { h: 'Members', v: ([n]) => `<small>${G.RIVALS.filter((r) => r.alliance === n).map((r) => r.code).join(' ')}</small>` },
    { h: 'Requirements', v: ([, a]) => `Rep ${a.minRep}+, ${a.minFleet}+ aircraft, ${money(a.fee)}` },
    { h: '', v: ([n]) => (s.partners.alliance === n ? '<button class="small danger" data-action="leave-alliance">Leave</button>' : (() => { const t = G.allianceTerms(s, n); return t.reasons.length ? `<small class="muted">${esc(t.reasons[0])}</small>` : `<button class="small primary" data-action="join-alliance" data-name="${esc(n)}">Join</button>`; })()) },
  ]))}`;
}

function staffing(c) {
  const s = c.state;
  const pay = G.payroll(s);
  return `<div class="grid kpis">
    ${kpi('Employees', int(G.headcount(s)))}
    ${kpi('Weekly payroll', money(Object.values(pay).reduce((a, b) => a + b, 0)))}
    ${kpi('Wage level', `${Math.round(G.wageIndex(s) * 100)}%`, { sub: `of US market (${esc(G.REGIONS[ap(s.hubs[0].code).region].name)})` })}
    ${kpi('Strikes', Object.keys(s.strikes).length ? Object.keys(s.strikes).map((r) => G.ROLES[r].name).join(', ') : 'None', { cls: Object.keys(s.strikes).length ? 'bad' : '' })}
  </div>
  ${panel('Workforce', table(G.ROLE_IDS, [
    { h: 'Role', v: (r) => `<b>${G.ROLES[r].name}</b>${G.ROLES[r].union ? `<br><small class="muted">${G.ROLES[r].union}</small>` : ''}` },
    { h: 'Employed', cls: 'num', v: (r) => int(s.staff[r].count) },
    { h: 'Needed', cls: 'num', v: (r) => { const st = s.staffStatus?.[r]; return st ? `<span class="${st.ratio < 0.95 ? 'bad' : ''}">${int(st.required)}</span>` : '–'; } },
    { h: 'In training', v: (r) => s.staff[r].pipeline.map((p) => `${p.n} (${p.ready - s.week}w)`).join(', ') || '—' },
    { h: 'Pay vs market', v: (r) => `<div class="row" data-form><input type="number" name="pay" value="${Math.round(s.staff[r].pay * 100)}" min="70" max="160" step="1" class="w-60">%<button class="small" data-action="set-pay" data-role="${r}">Set</button></div>` },
    { h: 'Weekly cost', cls: 'num', v: (r) => money(pay[r]) },
    { h: 'Morale', v: (r) => `${bar(s.staff[r].morale, 100)} ${int(s.staff[r].morale)}` },
    { h: 'Auto-hire', v: (r) => `<input type="checkbox" data-change="auto-staff" data-role="${r}" ${s.staffAuto[r] ? 'checked' : ''}>` },
    { h: 'Hire / lay off', v: (r) => `<div class="row" data-form><input type="number" name="n" value="10" min="1" class="w-60"><button class="small" data-action="hire" data-role="${r}">Hire</button><button class="small danger" data-action="fire" data-role="${r}">Lay off</button></div>` },
  ]))}
  <p class="muted small">Hiring takes training time (pilots ${G.ROLES.pilots.train} weeks for a type rating). A pilot academy cuts the cost and time. Shortages of pilots or cabin crew cancel flights; engineer shortages slow checks and erode reliability; ground staff shortages hurt punctuality. Layoffs cost severance and morale.</p>`;
}

export const actions = {
  'save-airline'(el, ctx) {
    const v = formValues(el);
    const a = ctx.game.airline;
    a.name = v.name.trim() || a.name;
    a.code = (v.code || a.code).toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(2, 'X').slice(0, 2);
    a.color = v.color || a.color;
    a.slogan = v.slogan.trim();
    return { ok: true, message: 'Airline updated.' };
  },
  'accept-subsidy': (el, ctx) => G.acceptSubsidy(ctx.game, el.dataset.id),
  'set-service'(el, ctx) {
    ctx.game.service[el.dataset.k] = Number(el.dataset.lv);
  },
  'set-marketing'(el, ctx) {
    ctx.game.marketing = Math.max(0, Math.min(10e6, Math.round(Number(formValues(el).marketing) || 0)));
  },
  'propose-codeshare': (el, ctx) => G.proposeCodeshare(ctx.game, el.dataset.id),
  'end-codeshare': (el, ctx) => (confirm('End this codeshare?') ? G.endCodeshare(ctx.game, el.dataset.id) : null),
  'join-alliance': (el, ctx) => G.joinAlliance(ctx.game, el.dataset.name),
  'leave-alliance': (el, ctx) => (confirm('Leave the alliance?') ? G.leaveAlliance(ctx.game) : null),
  'set-pay': (el, ctx) => G.setPay(ctx.game, el.dataset.role, Number(formValues(el).pay) / 100),
  hire(el, ctx) {
    const res = G.hire(ctx.game, el.dataset.role, formValues(el).n);
    return res.ok ? { ok: true, message: `Recruiting — ready in ${res.weeks} weeks (${money(res.cost)}).` } : res;
  },
  fire: (el, ctx) => (confirm('Lay off staff? Severance and morale costs apply.') ? G.fire(ctx.game, el.dataset.role, formValues(el).n) : null),
};

export const changes = {
  'auto-staff': (el, ctx) => G.setAutoStaff(ctx.game, el.dataset.role, el.checked),
};
