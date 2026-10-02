import { G, esc, money, kpi, panel, table, pill } from '../util.js';
import { offerTable, activeTable } from './charter.js';

export function render(c) {
  const s = c.state;
  const offers = s.contracts.offers.filter((o) => o.category === 'special');
  const active = s.contracts.active.filter((x) => x.category === 'special');
  const ventureRev = s.lastReport?.revenue.ventures ?? 0;
  return `<div class="page-head"><h1>Special operations</h1></div>
  <div class="grid kpis">
    ${kpi('Contract offers', offers.length)}
    ${kpi('Active contracts', active.length)}
    ${kpi('Venture revenue (last wk)', money(ventureRev))}
  </div>
  ${panel('Government & special contracts', `${offerTable(s, offers)}<p class="muted small">Special contracts take an aircraft full-time (it must be free of scheduled flying) for the duration.</p>`)}
  ${panel('Active special contracts', activeTable(s, active))}
  ${panel('Ventures', table(Object.entries(G.VENTURES), [
    { h: 'Business', v: ([, v]) => `<b>${esc(v.name)}</b><br><small class="muted">${esc(v.desc)}</small>` },
    { h: 'Level', v: ([k, v]) => { const cur = s.ventures[k]; if (cur?.pendingLevel) return pill(`Building L${cur.pendingLevel} · ${cur.readyWeek - s.week} wk`, 'warn'); return cur?.level ? pill(`Level ${cur.level}/${v.levels}`, 'good') : '—'; } },
    { h: 'Revenue / opex per level', cls: 'num', v: ([, v]) => `${money(v.revenue)} / ${money(v.opex)} wk` },
    { h: 'Build time', cls: 'num', v: ([, v]) => `${v.weeks} wk` },
    { h: '', v: ([k, v]) => ((s.ventures[k]?.level ?? 0) >= v.levels ? pill('Maxed', 'good') : `<button class="small" data-action="invest-venture" data-key="${k}" ${s.ventures[k]?.pendingLevel ? 'disabled' : ''}>Invest ${money(G.ventureCost(s, k))}</button>`) },
  ]))}
  <p class="muted small">The pilot academy cuts pilot hiring cost by 65% and training time; the simulator centre shortens all crew training. Third-party MRO needs a heavy hangar and engineers; ground handling needs ground staff.</p>`;
}

export const actions = {
  'invest-venture': (el, ctx) => G.investVenture(ctx.game, el.dataset.key),
};
