import { G, esc, money, int, kpi, panel, table, options, pill, ap, typeName } from '../util.js';
import { formValues } from '../app.js';

export function offerTable(s, offers) {
  return table(offers, [
    { h: 'Client', v: (o) => `<b>${esc(o.client)}</b><br><small class="muted">${esc(o.kind)}</small>` },
    { h: 'Details', v: (o) => (o.category === 'charter' ? `${o.a}–${o.b} (${int(o.distance)} km)<br><small class="muted">${o.rt}× round trips/wk · ${o.seats}+ seats</small>` : `<small>${esc(o.desc)}</small>`) },
    { h: 'Duration', v: (o) => `${o.weeks} wk from ${G.dateLabel(s.week + o.startIn)}` },
    { h: 'Pays', cls: 'num', v: (o) => `${money(o.weekly)}/wk<br><small class="muted">${money(o.weekly * o.weeks)} total</small>` },
    { h: 'Expires', v: (o) => `${o.expiresWeek - s.week} wk` },
    { h: 'Accept with', v: (o) => {
      const fits = G.eligibleAircraft(s, o);
      return fits.length ? `<div class="row" data-form><select name="ac">${options(fits.map((a) => [a.id, `${a.reg} · ${typeName(a.type)}`]), '')}</select><button class="small primary" data-action="accept-contract" data-id="${o.id}">Accept</button></div>` : '<small class="muted">No suitable aircraft with free time</small>';
    } },
  ], { empty: 'No offers this month. New offers arrive monthly.' });
}

export function activeTable(s, list) {
  return table(list, [
    { h: 'Client', v: (c) => `<b>${esc(c.client)}</b><br><small class="muted">${esc(c.kind)}</small>` },
    { h: 'Aircraft', v: (c) => { const a = s.fleet.find((x) => x.id === c.aircraftId); return a ? `<a href="#fleet/ac/${a.id}">${a.reg}</a>` : pill('None!', 'bad'); } },
    { h: 'Period', v: (c) => `${G.dateLabel(c.startWeek)} – ${G.dateLabel(c.endWeek)}${c.startWeek > s.week ? ` ${pill('Starts soon', 'warn')}` : ''}` },
    { h: 'Weekly', cls: 'num', v: (c) => money(c.weekly) },
    { h: 'Earned', cls: 'num', v: (c) => money(c.earned) },
    { h: 'Missed', cls: 'num', v: (c) => (c.missed ? `<span class="bad">${c.missed}</span>` : '0') },
    { h: '', v: (c) => `<button class="small danger" data-action="cancel-contract" data-id="${c.id}">Cancel</button>` },
  ], { empty: 'No active contracts.' });
}

export function render(c) {
  const s = c.state;
  const offers = s.contracts.offers.filter((o) => o.category === 'charter');
  const active = s.contracts.active.filter((x) => x.category === 'charter');
  return `<div class="page-head"><h1>Charter</h1></div>
  <div class="grid kpis">
    ${kpi('Open offers', offers.length)}
    ${kpi('Active charters', active.length)}
    ${kpi('Charter revenue (last wk)', money(s.lastReport?.revenue.contracts ?? 0))}
  </div>
  ${panel('Charter offers', offerTable(s, offers))}
  ${panel('Active charters', activeTable(s, active))}
  <p class="muted small">Charters use spare block hours on an aircraft alongside its scheduled flying. If the aircraft is in the shop or grounded when a charter week comes, you pay a penalty and lose reputation.</p>`;
}

export const actions = {
  'accept-contract'(el, ctx) {
    const v = formValues(el);
    if (!v.ac) return { ok: false, error: 'Pick an aircraft' };
    return G.acceptContract(ctx.game, el.dataset.id, v.ac);
  },
  'cancel-contract': (el, ctx) => (confirm('Cancel this contract? A 4-week penalty applies.') ? G.cancelContract(ctx.game, el.dataset.id) : null),
};
export { ap };
