import { G, esc, money, pct, int, num, kpi, panel, table, tabs, options, statement, bar, pill, ap, typeName, statusPill, checkCell } from '../util.js';
import { formValues } from '../app.js';

export function render(c) {
  const tab = c.params[0] ?? 'schedule';
  const body = { mro, outsource, schedule, upgrades, cabin }[tab] ?? schedule;
  const s = c.state;
  const delivered = s.fleet.filter((a) => G.isDelivered(s, a));
  const inShop = delivered.filter((a) => a.downtime && a.downtime.untilWeek > s.week).length;
  const avgRel = delivered.length ? delivered.reduce((t, a) => t + a.reliability, 0) / delivered.length : 0;
  const eng = s.staffStatus?.engineers;
  return `<div class="page-head"><h1>Engineering</h1></div>
  <div class="grid kpis">
    ${kpi('Fleet reliability', delivered.length ? int(avgRel) : '–', { cls: avgRel < 75 ? 'bad' : '' })}
    ${kpi('In the shop', inShop)}
    ${kpi('Grounded', s.fleet.filter((a) => a.grounded).length, { cls: s.fleet.some((a) => a.grounded) ? 'bad' : '' })}
    ${kpi('Engineers', `${int(s.staff.engineers.count)}${eng ? ` / ${int(eng.required)}` : ''}`, { href: '#management/staffing' })}
    ${kpi('Check spend (last wk)', money(s.lastReport?.cost.maintenance ?? 0))}
  </div>
  ${tabs('engineering', [['schedule', 'Check schedule'], ['mro', 'MRO facilities'], ['outsource', 'Outsourcing'], ['upgrades', 'Upgrades'], ['cabin', 'Cabin']], tab)}
  ${body(c)}`;
}

function schedule(c) {
  const s = c.state;
  const list = s.fleet.filter((a) => G.isDelivered(s, a)).sort((a, b) => G.nextCheck(s, a).weeksLeft - G.nextCheck(s, b).weeksLeft);
  return `${panel('Automatic scheduling', `<div class="row wrap">${G.CHECK_ORDER.map((k) => `<label class="check"><input type="checkbox" data-change="auto-check" data-check="${k}" ${s.engineering.auto[k] ? 'checked' : ''}> Auto ${G.CHECKS[k].name}</label>`).join('')}</div>
    <p class="muted small">Automatic scheduling books each check when 90% of its interval is used. Aircraft more than 10% past any limit are grounded by the regulator until the check is done. A heavier check includes all lighter ones (D ⊃ C ⊃ B ⊃ A).</p>`)}
  ${panel('Fleet check status', table(list, [
    { h: 'Aircraft', v: (ac) => `<a href="#fleet/ac/${ac.id}">${ac.reg}</a><br><small class="muted">${esc(typeName(ac.type))}</small>` },
    { h: 'Status', v: (ac) => statusPill(s, ac) },
    { h: 'Reliability', v: (ac) => bar(ac.reliability, 100) },
    ...G.CHECK_ORDER.map((k) => ({ h: G.CHECKS[k].name, v: (ac) => checkCell(s, ac, k) })),
    { h: 'Booked', v: (ac) => (ac.booked ? `${ac.booked.check} · ${G.dateLabel(ac.booked.startWeek)}` : '—') },
    { h: 'Schedule now', v: (ac) => `<div class="row" data-form><select name="check">${options(G.CHECK_ORDER.map((k) => [k, k]), G.nextCheck(s, ac).check)}</select><button class="small" data-action="eng-check" data-id="${ac.id}" ${ac.booked ? 'disabled' : ''}>Go</button></div>` },
  ], { empty: 'No aircraft in service.' }))}`;
}

function mro(c) {
  const s = c.state;
  return `${table(s.hubs, [
    { h: 'Hub', v: (h) => `<b>${h.code}</b> ${esc(ap(h.code).city)}` },
    ...Object.entries(G.FACILITIES).map(([k, f]) => ({
      h: f.name,
      v: (h) => {
        const fac = h.facilities[k];
        if (fac && fac.readyWeek > s.week) return pill(`Building · ${fac.readyWeek - s.week} wk`, 'warn');
        if (fac) {
          const busy = s.fleet.filter((a) => a.downtime?.site === `${h.code}:${k}` && a.downtime.untilWeek > s.week).length;
          return `${pill('Operational', 'good')}${f.bays ? ` <small>${busy}/${f.bays} bays busy</small>` : ''}`;
        }
        return `<button class="small" data-action="build-facility" data-hub="${h.code}" data-key="${k}">Build ${money(f.cost)}</button>`;
      },
    })),
  ])}
  <div class="grid cols-3">${Object.values(G.FACILITIES).map((f) => panel(f.name, `<p class="small">${esc(f.desc)}</p>${statement([
    ['Build cost', money(f.cost)],
    ['Construction', `${f.weeks} weeks`],
    ['Checks', f.checks.join(', ')],
    ['Bays', f.bays],
    ['Engineers needed', f.engineers],
    ['Upkeep', `${money(G.FACILITY_UPKEEP[Object.keys(G.FACILITIES).find((k) => G.FACILITIES[k] === f)])}/wk`],
  ])}`)).join('')}</div>
  <p class="muted small">In-house work costs 60% of an outside shop and starts immediately if a bay is free, but needs enough engineers (shortages slow every check). A line station also cuts routine maintenance costs by 15%.</p>`;
}

function outsource(c) {
  const s = c.state;
  const home = ap(s.hubs[0].code).region;
  return `${panel('Policy', `<div class="row wrap"><label class="check"><input type="checkbox" data-change="prefer-inhouse" ${s.engineering.preferInHouse ? 'checked' : ''}> Prefer in-house facilities when available</label>
    <span>Default heavy-check provider: <select data-change="mro-provider">${options(G.MRO_PROVIDERS.map((m) => [m.id, m.name]), s.engineering.provider)}</select></span></div>`)}
  ${panel('MRO providers', table(G.MRO_PROVIDERS, [
    { h: 'Provider', v: (m) => `<b>${esc(m.name)}</b>${m.id === s.engineering.provider ? ` ${pill('Default', 'good')}` : ''}` },
    { h: 'Region', v: (m) => `${G.REGIONS[m.region].name}${m.region !== home ? ' <small class="warn">+1 wk ferry</small>' : ''}` },
    { h: 'Quality', v: (m) => bar(m.quality, 1.3) },
    { h: 'Price', cls: 'num', v: (m) => pct(m.price) },
    { h: 'Slot wait', cls: 'num', v: (m) => `${m.wait} wk` },
    { h: 'Narrowbody C-check', cls: 'num', v: (m) => money(G.CHECKS.C.cost.narrow * m.price) },
    { h: 'Widebody D-check', cls: 'num', v: (m) => money(G.CHECKS.D.cost.wide * m.price) },
  ]))}
  <p class="muted small">Quality determines how much reliability a heavy check restores. Light A/B checks go to local line contractors when you have no line station.</p>`;
}

function upgrades(c) {
  const s = c.state;
  const list = s.fleet.filter((a) => G.typeOf(a).cat !== 'freighter' || true);
  return panel('Fleet modifications', table(list, [
    { h: 'Aircraft', v: (ac) => `<a href="#fleet/ac/${ac.id}">${ac.reg}</a><br><small class="muted">${esc(typeName(ac.type))}</small>` },
    ...Object.entries(G.UPGRADES).map(([k, u]) => ({
      h: u.name,
      v: (ac) => (ac.upgrades.includes(k) ? pill('✓', 'good') : `<button class="small" data-action="upgrade" data-id="${ac.id}" data-up="${k}">${money(u.cost[G.typeOf(ac).mx])}</button>`),
    })),
    { h: 'P2F', v: (ac) => (G.CONVERSIONS[ac.type] ? `<button class="small" data-action="convert" data-id="${ac.id}">${money(G.CONVERSIONS[ac.type].cost)}</button>` : '—') },
  ], { empty: 'No aircraft.' }));
}

function cabin(c) {
  const s = c.state;
  const pax = s.fleet.filter((a) => G.typeOf(a).cat !== 'freighter');
  return `${panel('Cabin layouts', table(pax, [
    { h: 'Aircraft', v: (ac) => `<a href="#fleet/ac/${ac.id}">${ac.reg}</a><br><small class="muted">${esc(typeName(ac.type))}</small>` },
    ...G.CLASSES.map((k) => ({ h: G.CABIN[k].name, cls: 'num', v: (ac) => ac.config[k] || '—' })),
    { h: 'Seats', cls: 'num', v: (ac) => G.seatCount(ac.config) },
    { h: 'Floor used', v: (ac) => `${bar(G.cabinUnits(G.typeOf(ac), ac.config), G.typeOf(ac).maxSeats)}` },
    { h: 'Product', v: (ac) => ac.upgrades.filter((u) => G.UPGRADES[u].quality).map((u) => G.UPGRADES[u].name).join(', ') || '<span class="muted">Basic</span>' },
    { h: '', v: (ac) => `<a class="small" href="#fleet/ac/${ac.id}">Edit layout ›</a>` },
  ], { empty: 'No passenger aircraft.' }))}
  ${panel('How cabins work', `<p class="small">Each type has a floor area measured in economy-seat units. Premium seats use more: premium economy ${G.CABIN.W.units.narrow}–${G.CABIN.W.units.wide}, business ${G.CABIN.J.units.narrow} on narrowbodies (recliners) and ${G.CABIN.J.units.wide} on widebodies (lie-flat beds), first ${G.CABIN.F.units.wide}. Business travellers on long flights pay ~4× economy; dense all-economy layouts suit leisure routes. Seat counts drive cabin crew requirements too.</p>`)}`;
}

export const actions = {
  'eng-check': (el, ctx) => G.scheduleCheck(ctx.game, el.dataset.id, formValues(el).check),
  'build-facility': (el, ctx) => G.buildFacility(ctx.game, el.dataset.hub, el.dataset.key),
};

export const changes = {
  'auto-check': (el, ctx) => G.setAutoCheck(ctx.game, el.dataset.check, el.checked),
  'prefer-inhouse': (el, ctx) => G.setPreferInHouse(ctx.game, el.checked),
  'mro-provider': (el, ctx) => G.setProvider(ctx.game, el.value),
};
