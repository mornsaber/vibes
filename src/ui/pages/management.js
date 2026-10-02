import { G, esc, money, pct, int, num, kpi, panel, table, tabs, statement, options, bar, pill, ap, tonnes, usd, nominal, fromNominal, liverySvg, signed } from '../util.js';
import { formValues } from '../app.js';
import { hubsPanel } from './planning.js';
import { settingsEditor, parseSetting } from './start.js';
import { render as cargoRender } from './cargo.js';

const TABS = [['airline', 'Airline'], ['autopilot', 'Autopilot'], ['brands', 'Subsidiaries'], ['branding', 'Brand & campaigns'], ['subsidies', 'Subsidies'], ['stats', 'Statistics'], ['hubs', 'Hubs'], ['service', 'Service standards'], ['codeshare', 'Codeshare & alliances'], ['staffing', 'Staffing'], ['cargo', 'Cargo']];

export function render(c) {
  const tab = c.params[0] ?? 'airline';
  const body = { airline, autopilot, brands, branding, subsidies, stats, hubs: (x) => hubsPanel(x.state), service, codeshare, staffing, cargo: (x) => cargoRender({ ...x, params: ['overview'] }, true) }[tab] ?? airline;
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
    ${panel('Game settings', `${settingsEditor(s.settings, 'game-setting', { inGame: true })}<p class="muted small">Preset at founding: ${esc(G.PRESETS[s.settings.preset]?.label ?? 'Custom')}. Changes apply from next week. Prices are ${num(s.macro.priceLevel ?? 1, 2)}× 2027 levels; inflation is running at ${pct(s.macro.inflation ?? 0, 1)} a year.</p>`)}
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

function autopilot(c) {
  const s = c.state;
  const ap = s.autopilot ?? G.defaultAutopilot();
  const manual = s.routes.filter((r) => r.autoPrice === false);
  const toggle = (k, label, desc) => `<label class="check"><input type="checkbox" data-change="autopilot" data-key="${k}" ${ap[k] ? 'checked' : ''}> <b>${label}</b> <small class="muted">${desc}</small></label>`;
  return `<div class="grid cols-2">
    ${panel('Autopilot', `<div class="stack">
      ${toggle('pricing', 'Auto-pricing', 'Each week, nudge fares on every route toward the target load factor (within 80–160% of the brand’s normal level).')}
      ${toggle('rm', 'Revenue management', 'Open the advance-purchase bucket when planes run empty; close it to protect seats for flexible buyers when they fill.')}
      ${toggle('fleet', 'Fleet assignment', 'Put idle aircraft on the routes turning away the most passengers, and top up full routes with spare hours.')}
      <div class="field"><label>Target load factor: <b>${pct(ap.targetLF)}</b></label><input type="range" min="0.65" max="0.95" step="0.01" value="${ap.targetLF}" data-change="autopilot-lf"><small class="muted">Higher fills more seats at lower fares; lower holds yield but spills more passengers.</small></div>
    </div>`)}
    ${panel('Routes priced by hand', `${table(manual, [
      { h: 'Route', v: (r) => `<a href="#routes/${r.id}">${r.a}–${r.b}</a>` },
      { h: 'Price level', cls: 'num', v: (r) => pct(G.priceIndex(s, r)) },
      { h: 'Load', cls: 'num', v: (r) => (r.last?.seatTotal ? pct(r.last.lf) : '–') },
      { h: '', v: (r) => `<button class="small" data-action="route-auto" data-id="${r.id}">Hand back to autopilot</button>` },
    ], { empty: 'Every route follows the autopilot. Setting fares on a route page takes it off auto-pricing.' })}`)}
  </div>
  ${panel('Advisor suggestions', table(G.adviseRoutes(s), [
    { h: 'Route', v: (a) => `<a href="#routes/${a.routeId}">${a.route}</a>` },
    { h: 'Finding', v: (a) => `<span class="${a.tone}">${esc(a.text)}</span>` },
    { h: '', v: (a) => (a.label ? `<button class="small" data-action="apply-advice" data-route="${a.routeId}" data-kind="${a.kind}">${esc(a.label)}</button>` : '') },
  ], { empty: 'Nothing to suggest — the network looks healthy.' }))}`;
}

const kindOptions = Object.entries(G.BRAND_KINDS).filter(([k]) => k !== 'main').map(([k, v]) => [k, v.label]);

function brands(c) {
  const s = c.state;
  const results = G.brandResults(s);
  return `${panel('Group brands', table(results, [
    { h: '', v: (r) => liverySvg(r.brand.livery, { size: 28 }) },
    { h: 'Brand', v: (r) => `<b>${esc(r.brand.name)}</b> <small class="muted">${esc(r.brand.code)}</small><br><small class="muted">${esc(G.brandKind(r.brand).label)}</small>` },
    { h: 'Routes', cls: 'num', v: (r) => r.routes },
    { h: 'Pax/wk', cls: 'num', v: (r) => int(r.pax) },
    { h: 'Load', cls: 'num', v: (r) => (r.seats ? pct(r.lf) : '–') },
    { h: 'Revenue/wk', cls: 'num', v: (r) => money(r.revenue) },
    { h: 'Route profit/wk', cls: 'num', v: (r) => signed(r.profit) },
    { h: 'Reputation', v: (r) => `${bar(r.rep, 100)} ${int(r.rep)}` },
    { h: '', v: (r) => (r.brand.id === 'main' ? '' : `<button class="small danger" data-action="close-brand" data-id="${r.brand.id}">Fold in</button>`) },
  ]))}
  <div class="grid cols-2">
    ${panel('Launch a brand', `<div class="stack" data-form>
      <div class="grid cols-2 tight"><div class="field"><label>Name</label><input name="name" placeholder="e.g. ${esc(s.airline.name.split(' ')[0])} Express" maxlength="28"></div>
      <div class="field"><label>Code</label><input name="code" maxlength="2" placeholder="XX"></div></div>
      <div class="grid cols-2 tight"><div class="field"><label>Type</label><select name="kind">${options(kindOptions, 'lcc')}</select></div>
      <div class="field"><label>Colour</label><input type="color" name="color" value="#f5a524"></div></div>
      <button class="primary" data-action="launch-brand">Launch (${money(G.BRAND_LAUNCH_COST)} + ${money(G.BRAND_WEEKLY)}/wk)</button>
    </div>
    <ul class="plain small">${kindOptions.map(([k, l]) => `<li><b>${esc(l)}</b> — ${esc(G.BRAND_KINDS[k].desc)}</li>`).join('')}</ul>`)}
    ${panel('Assign routes', `${table(s.routes, [
      { h: 'Route', v: (r) => `<a href="#routes/${r.id}">${r.a}–${r.b}</a> <small class="muted">${int(r.distance)} km</small>` },
      { h: 'Profit/wk', cls: 'num', v: (r) => signed(r.last?.profit ?? 0) },
      { h: 'Brand', v: (r) => `<select data-change="route-brand" data-id="${r.id}">${options(G.brands(s).map((b) => [b.id, b.name]), r.brand ?? 'main')}</select>` },
    ], { empty: 'No routes yet.' })}<p class="muted small">Moving a route resets its fares to the brand’s normal price level. Acquired airlines can be kept as subsidiaries from the Competitors page.</p>`)}
  </div>`;
}

function branding(c) {
  const s = c.state;
  const list = G.brands(s);
  const sel = G.brandById(s, c.ui.brandSel ?? 'main');
  const l = sel.livery;
  const relaunch = (s.campaigns ?? []).some((x) => x.id === 'relaunch' && (x.brand ?? 'main') === sel.id);
  return `<div class="row wrap">${list.map((b) => `<button class="small ${b.id === sel.id ? 'primary' : ''}" data-action="brand-sel" data-id="${b.id}">${esc(b.name)}</button>`).join('')}</div>
  <div class="grid cols-2">
    ${panel(`${sel.name}: livery`, `<div class="livery-editor" data-form>
      <div class="livery-preview">${liverySvg(l, { size: 120, title: sel.name })}</div>
      <div class="stack">
        <div class="field"><label>Pattern</label><select name="pattern">${options(Object.entries(G.LIVERY_PATTERNS), l.pattern)}</select></div>
        <div class="grid cols-2 tight"><div class="field"><label>Tail colour</label><input type="color" name="color" value="${esc(l.color)}"></div><div class="field"><label>Accent</label><input type="color" name="color2" value="${esc(l.color2)}"></div></div>
        <div class="field"><label>Logo</label><div class="row wrap">${G.LOGOS.map((g) => `<label class="logo-pick"><input type="radio" name="logo" value="${esc(g)}" ${g === l.logo ? 'checked' : ''}><span>${esc(g)}</span></label>`).join('')}</div></div>
        <button class="primary" data-action="save-livery" data-id="${sel.id}">${relaunch ? 'Apply new livery (free during relaunch)' : `Repaint the fleet (${money(G.repaintCost(s, G.typeOf) * (sel.id === 'main' ? 1 : 0.3))})`}</button>
      </div></div>`)}
    ${panel(`${sel.name}: campaigns`, `${table(Object.entries(G.CAMPAIGNS), [
      { h: 'Campaign', v: ([, x]) => `<b>${esc(x.name)}</b><br><small class="muted">${esc(x.desc)}</small>` },
      { h: 'Weeks', cls: 'num', v: ([, x]) => x.weeks },
      { h: 'Cost', cls: 'num', v: ([k]) => money(G.campaignCost(s, k)) },
      { h: '', v: ([k]) => { const run = (s.campaigns ?? []).find((x) => x.id === k && (x.brand ?? 'main') === sel.id); return run ? pill(`${run.weeksLeft} wk left`, 'good') : `<button class="small" data-action="campaign" data-id="${k}" data-brand="${sel.id}">Launch</button>`; } },
    ])}<p class="muted small">Campaigns stack with the weekly marketing budget (Service standards). Costs scale with network size.</p>`)}
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
      ['Average fare', s.lastReport?.pax ? usd(s.lastReport.revenue.passenger / s.lastReport.pax) : '–'],
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
        <small class="muted">appeal ×${d.appeal[s.service[k] - 1]} · ${d.cost[s.service[k] - 1] ? `${usd(d.cost[s.service[k] - 1], 2)}${d.perPax ? '/pax' : '/pax-hour'}` : 'no cost'}${d.ancillary ? ` · ancillary ${pct(d.ancillary[s.service[k] - 1])} of eco revenue` : ''}</small></div></div>`;
    }).join('')}`)}
    ${panel('Marketing & brand', `${statement([
      ['Weekly marketing budget', money(s.marketing)],
      ['Demand effect', `+${pct(G.marketingEffect(s) - 1, 1)}`],
      ['Product appeal (long-haul)', `×${num(G.serviceAppeal(s, true), 3)}`],
      ['Product appeal (short-haul)', `×${num(G.serviceAppeal(s, false), 3)}`],
      ['Reputation', int(s.reputation)],
    ])}<div class="row" data-form><input type="number" name="marketing" value="${nominal(s.marketing)}" step="5000" min="0" class="w-140"><button data-action="set-marketing">Set budget</button></div>
    <p class="muted small">Marketing has diminishing returns that scale with network size. Reputation drifts toward a target set by service, punctuality, product, morale and marketing.</p>`)}
  </div>`;
}

function codeshare(c) {
  const s = c.state;
  const partners = s.partners.codeshares.map((id) => G.rivalById[id]);
  const idx = G.overlapIndex(s);
  const prospects = G.RIVALS.filter((r) => r.type !== 'cargo' && !s.partners.codeshares.includes(r.id) && s.rivals[r.id].status === 'active')
    .map((r) => ({ r, t: G.codeshareTerms(s, r.id), overlap: (idx.get(r.id) ?? []).length, feeds: s.routes.filter((x) => r.hubs.includes(x.a) || r.hubs.includes(x.b)).length }))
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
  const role = G.ROLE_IDS.includes(c.params[1]) ? c.params[1] : null;
  const pay = G.payroll(s);
  const head = `<div class="grid kpis">
    ${kpi('Employees', int(G.headcount(s)), { sub: `${int(G.ROLE_IDS.reduce((t, r) => t + s.staff[r].contractors, 0))} contractors` })}
    ${kpi('Weekly payroll', money(Object.values(pay).reduce((a, b) => a + b, 0)))}
    ${kpi('Wage level', `${Math.round(G.wageIndex(s) * 100)}%`, { sub: `of US market (${esc(G.REGIONS[ap(s.hubs[0].code).region].name)})` })}
    ${kpi('Industrial action', Object.keys(s.strikes).length ? Object.entries(s.strikes).map(([r, a]) => `${G.ROLES[r].name}: ${G.ACTIONS[a.kind].name}`).join(', ') : 'None', { cls: Object.keys(s.strikes).length ? 'bad' : '' })}
  </div>
  <nav class="subtabs">${[['', 'Overview'], ...G.ROLE_IDS.map((r) => [r, G.ROLES[r].name])].map(([k, l]) => `<a href="#management/staffing${k ? `/${k}` : ''}" class="${(role ?? '') === k ? 'active' : ''}">${l}</a>`).join('')}</nav>`;
  return head + (role ? roleDetail(c, role) : staffOverview(c, pay));
}

function staffOverview(c, pay) {
  const s = c.state;
  return `${panel('Workforces', table(G.ROLE_IDS, [
    { h: 'Role', v: (r) => `<a href="#management/staffing/${r}"><b>${G.ROLES[r].name}</b></a>` },
    { h: 'Employees', cls: 'num', v: (r) => int(s.staff[r].count) },
    { h: 'Contractors', cls: 'num', v: (r) => int(s.staff[r].contractors) },
    { h: 'Needed', cls: 'num', v: (r) => { const st = s.staffStatus?.[r]; return st ? `<span class="${st.ratio < 0.95 ? 'bad' : ''}">${int(st.required)}</span>` : '–'; } },
    { h: 'Coverage', v: (r) => bar(Math.min(1, s.staffStatus?.[r]?.ratio ?? 1), 1) },
    { h: 'Supervision', v: (r) => bar(Math.min(1, s.staffStatus?.[r]?.supCover ?? 1), 1) },
    { h: 'Experience', v: (r) => bar(s.staffStatus?.[r]?.experience ?? 0, 1) },
    { h: 'Morale', v: (r) => `${bar(s.staff[r].morale, 100)} ${int(s.staff[r].morale)}` },
    { h: 'Union', v: (r) => (s.staff[r].union.recognized ? pill(`${Math.round(s.staff[r].union.strength * 100)}%`, s.staff[r].union.strength > 0.7 ? 'bad' : 'warn') : pill('None', 'good')) },
    { h: 'Run by', v: (r) => (s.staff[r].delegated ? pill(G.ROLES[r].grades[G.MANAGER].title, 'good') : 'You') },
    { h: 'Weekly cost', cls: 'num', v: (r) => money(pay[r]) },
  ]))}
  ${panel('HR policy for delegated departments', `<div class="row wrap">${Object.entries(G.HR_POLICIES).map(([k, p]) => `<button class="small ${s.hrPolicy === k ? 'primary' : ''}" data-action="hr-policy" data-p="${k}" title="${esc(p.desc)}">${p.name}</button>`).join('')}</div>
  <p class="muted small">${esc(G.HR_POLICIES[s.hrPolicy ?? 'balanced'].desc)} Once a workforce has a manager and ${G.DELEGATION_MIN}+ people (or the company has 500+), you can hand it to its department head: they hire, promote and negotiate with the union for you.</p>`)}`;
}

function roleDetail(c, role) {
  const s = c.state;
  const R = G.ROLES[role];
  const w = s.staff[role];
  const st = s.staffStatus?.[role];
  const plan = st?.plan ?? G.staffPlan(s, role, 0);
  const targets = [null, null, plan.seniors || null, plan.sup, plan.mgr];
  const action = s.strikes[role];
  return `<div class="grid cols-2">
    ${panel(`${R.name}: career ladder`, `${table([0, 1, 2, 3, 4], [
      { h: 'Grade', v: (g) => `<b>${esc(R.grades[g].title)}</b>${g === G.SUPERVISOR ? ' <small class="muted">supervisor</small>' : g === G.MANAGER ? ' <small class="muted">manager</small>' : ''}` },
      { h: 'Staff', cls: 'num', v: (g) => `${int(w.grades[g])}${targets[g] != null ? `<small class="muted"> / ${int(targets[g])}</small>` : ''}` },
      { h: 'Salary', cls: 'num', v: (g) => money(G.weeklySalary(s, role, g) * 52) },
      { h: 'Avg tenure', cls: 'num', v: (g) => `${num(w.tenure[g], 1)} y` },
      { h: '', v: (g) => `<div class="row" data-form><input type="number" name="n" value="1" min="1" class="w-60">
        ${g < 4 ? `<button class="small" data-action="promote" data-role="${role}" data-g="${g}" title="Promote to ${esc(R.grades[g + 1].title)}">▲</button>` : ''}
        ${g > 0 ? `<button class="small" data-action="demote" data-role="${role}" data-g="${g}" title="Demote to ${esc(R.grades[g - 1].title)}">▼</button>` : ''}
        <button class="small" data-action="hire" data-role="${role}" data-g="${g}" title="Hire from outside">+ Hire</button>
        <button class="small danger" data-action="fire" data-role="${role}" data-g="${g}" title="Lay off">✕</button></div>` },
    ])}
    ${w.pipeline.length ? `<p class="small">In training: ${w.pipeline.map((p) => `${p.n} ${esc(R.grades[p.grade ?? 0].title)}${p.n > 1 ? 's' : ''} (${p.ready - s.week} wk)`).join(', ')}</p>` : ''}
    <p class="muted small">Typical time in grade before promotion: ${R.promote.map((y, i) => `${esc(R.grades[i].title)} ${y} y`).join(' · ')}. Career length ~${R.career} years.${role === 'pilots' ? ' Every cockpit needs a captain; captains can be promoted from first officers or hired direct-entry.' : ''}</p>`)}
    <div class="stack">
      ${panel('Staffing plan', statement([
        ['Frontline needed', int(plan.frontline)],
        ['…of which contractors', `${int(plan.contractors)} <small class="muted">(${esc(R.contractor)})</small>`],
        ['Supervisors needed', `${int(plan.sup)} <small class="muted">(1 per ${R.span})</small>`],
        ['Managers needed', int(plan.mgr)],
        ['Coverage', st ? pct(Math.min(st.ratio, 9)) : '–'],
        ['Supervision coverage', st ? pct(Math.min(st.supCover, 1.5)) : '–'],
        ['Experience', st ? pct(st.experience) : '–'],
        ...(role === 'pilots' ? [['Captain coverage', st ? pct(Math.min(st.captains, 2)) : '–']] : []),
      ]))}
      ${panel('Policy', `<div class="stack">
        <div class="row" data-form>Pay vs market <input type="number" name="pay" value="${Math.round(w.pay * 100)}" min="70" max="160" class="w-60">% <button class="small" data-action="set-pay" data-role="${role}">Set</button></div>
        <div class="row">Contracted out <select data-change="contract-share" data-role="${role}">${options([[0, 'None (all employees)'], [0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, 'All frontline work']], w.contract)}</select>
          <small class="muted">contractors cost ${Math.round(R.contract * 100)}% of market pay, need no hiring and never strike</small></div>
        <label class="check"><input type="checkbox" data-change="auto-staff" data-role="${role}" ${s.staffAuto[role] ? 'checked' : ''}> Auto-hire 13 weeks ahead</label>
        <label class="check"><input type="checkbox" data-change="auto-promote" data-role="${role}" ${w.autoPromote ? 'checked' : ''}> Auto-promote to fill captain/supervisor/manager posts</label>
        <label class="check"><input type="checkbox" data-change="delegate" data-role="${role}" ${w.delegated ? 'checked' : ''} ${G.canDelegate(s, role) || w.delegated ? '' : 'disabled'}> Delegate to the ${esc(R.grades[G.MANAGER].title)} ${G.canDelegate(s, role) ? '' : `<small class="muted">(needs a manager and ${G.DELEGATION_MIN}+ staff)</small>`}</label>
        ${w.poach > 0.0008 ? `<p class="bad small">Rivals are poaching your people with better offers (${pct(w.poach * 52, 0)} a year leaving). Raise pay to stem it.</p>` : ''}
      </div>`)}
      ${panel(R.union, w.union.recognized ? `${statement([
        ['Status', action ? `<span class="bad">${G.ACTIONS[action.kind].name} — ${action.weeks} wk left</span>` : 'Recognised'],
        ['Strength', `${bar(w.union.strength, 1, { invert: true })} ${pct(w.union.strength)}`],
        ['Agreement expires', `${G.dateLabel(w.union.agreementEnds)}`],
        ['Next claim (est.)', `+${pct(G.unionDemand(s, role))}`],
      ])}<p class="muted small">Strong unions demand more and strike harder. Strength grows when morale is low and shrinks as work is contracted out.</p>` : `<p>No union. Staff may organise if morale falls below 45.</p>`)}
    </div>
  </div>`;
}

export const actions = {
  'save-airline'(el, ctx) {
    const v = formValues(el);
    const a = ctx.game.airline;
    a.name = v.name.trim() || a.name;
    a.code = (v.code || a.code).toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(2, 'X').slice(0, 2);
    a.color = v.color || a.color;
    if (a.livery) a.livery.color = a.color;
    a.slogan = v.slogan.trim();
    return { ok: true, message: 'Airline updated.' };
  },
  'accept-subsidy': (el, ctx) => G.acceptSubsidy(ctx.game, el.dataset.id),
  'set-service'(el, ctx) {
    ctx.game.service[el.dataset.k] = Number(el.dataset.lv);
  },
  'set-marketing'(el, ctx) {
    ctx.game.marketing = Math.max(0, Math.min(10e6, Math.round(fromNominal(formValues(el).marketing) || 0)));
  },
  'propose-codeshare': (el, ctx) => G.proposeCodeshare(ctx.game, el.dataset.id),
  'end-codeshare': (el, ctx) => (confirm('End this codeshare?') ? G.endCodeshare(ctx.game, el.dataset.id) : null),
  'join-alliance': (el, ctx) => G.joinAlliance(ctx.game, el.dataset.name),
  'leave-alliance': (el, ctx) => (confirm('Leave the alliance?') ? G.leaveAlliance(ctx.game) : null),
  'set-pay': (el, ctx) => G.setPay(ctx.game, el.dataset.role, Number(formValues(el).pay) / 100),
  hire(el, ctx) {
    const res = G.hire(ctx.game, el.dataset.role, formValues(el).n, Number(el.dataset.g ?? 0));
    return res.ok ? { ok: true, message: `Recruiting — ready in ${res.weeks} weeks (${money(res.cost)}).` } : res;
  },
  fire: (el, ctx) => (confirm('Lay off staff? Severance and morale costs apply.') ? G.fire(ctx.game, el.dataset.role, formValues(el).n, Number(el.dataset.g ?? 0)) : null),
  promote: (el, ctx) => G.promote(ctx.game, el.dataset.role, Number(el.dataset.g), formValues(el).n),
  demote: (el, ctx) => (confirm('Demote? Some will resign and morale will suffer.') ? G.demote(ctx.game, el.dataset.role, Number(el.dataset.g), formValues(el).n) : null),
  'hr-policy': (el, ctx) => G.setHrPolicy(ctx.game, el.dataset.p),
  'route-auto': (el, ctx) => G.setRouteRm(ctx.game, el.dataset.id, { autoPrice: true }),
  'launch-brand'(el, ctx) {
    const v = formValues(el);
    return G.launchBrand(ctx.game, { name: v.name, code: v.code, kind: v.kind, color: v.color });
  },
  'close-brand': (el, ctx) => (confirm('Fold this brand back into the mainline? Its routes move to the main brand.') ? G.closeBrand(ctx.game, el.dataset.id) : null),
  'brand-sel': (el, ctx) => (ctx.ui.brandSel = el.dataset.id),
  'save-livery'(el, ctx) {
    const v = formValues(el);
    const logo = el.closest('[data-form]').querySelector('[name=logo]:checked')?.value;
    return G.setLivery(ctx.game, el.dataset.id, { pattern: v.pattern, color: v.color, color2: v.color2, logo }, G.typeOf);
  },
  campaign: (el, ctx) => G.startCampaign(ctx.game, el.dataset.id, el.dataset.brand),
};

export const changes = {
  'game-setting': (el, ctx) => {
    ctx.game.settings[el.dataset.key] = parseSetting(el.dataset.key, el.value);
    if (el.dataset.key === 'inflation' && el.value === 'off') {
      ctx.game.macro.inflation = 0;
      ctx.game.macro.priceLevel = 1;
    }
  },
  'auto-staff': (el, ctx) => G.setAutoStaff(ctx.game, el.dataset.role, el.checked),
  'auto-promote': (el, ctx) => G.setAutoPromote(ctx.game, el.dataset.role, el.checked),
  delegate: (el, ctx) => G.setDelegated(ctx.game, el.dataset.role, el.checked),
  'contract-share': (el, ctx) => G.setContractShare(ctx.game, el.dataset.role, Number(el.value)),
  autopilot: (el, ctx) => G.setAutopilot(ctx.game, { [el.dataset.key]: el.checked }),
  'autopilot-lf': (el, ctx) => G.setAutopilot(ctx.game, { targetLF: Number(el.value) }),
  'route-brand': (el, ctx) => G.setRouteBrand(ctx.game, el.dataset.id, el.value),
};
