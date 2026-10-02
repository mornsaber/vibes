import { G, esc, money, pct, int, num, kpi, panel, table, statement, options, pill, typeName, signed, barChart, lineChart, usd, nominal, fromNominal } from '../util.js';
import { formValues } from '../app.js';

const COST_LABELS = {
  fuel: 'Fuel', pilots: 'Pilots', cabin: 'Cabin crew', engineers: 'Engineers', ground: 'Ground staff', admin: 'Head office',
  maintenance: 'Maintenance & checks', airport: 'Airport charges & handling', navigation: 'Navigation charges', service: 'Onboard service',
  distribution: 'Distribution & codeshare', disruption: 'Delays & crew travel', leases: 'Aircraft leases', marketing: 'Marketing & campaigns',
  carbon: 'Carbon allowances & SAF', facilities: 'Hubs, terminals & facilities', overhead: 'Overhead (IT, insurance, recruiting)', sga: 'Sales, general & admin', contracts: 'Contract & venture costs',
  interest: 'Interest', depreciation: 'Depreciation', tax: 'Corporate tax',
};
const REV_LABELS = { interest: 'Interest on cash', passenger: 'Passenger tickets', ancillary: 'Ancillaries', cargo: 'Cargo', contracts: 'Charter & special contracts', subsidies: 'Government subsidies', ventures: 'Ventures' };

export function render(c) {
  const s = c.state;
  const r = s.lastReport;
  const m = G.creditMetrics(s);
  const months = Object.entries(s.months).sort((a, b) => a[0] - b[0]).slice(-12).reverse();
  const leased = s.fleet.filter((a) => !a.owned);
  const hedged = s.hedges.reduce((t, h) => t + h.ratio, 0);
  const quote = G.hedgeQuote(s, 0.25, 26);
  const rcfHeadroom = Math.max(0, G.RCF_LIMIT[s.finance.rating] - G.rcfDrawn(s));
  return `<div class="page-head"><h1>Finances</h1></div>
  <div class="grid kpis">
    ${kpi('Cash on hand', money(s.cash), { cls: s.cash < 0 ? 'bad' : '' })}
    ${kpi('Net / week', money(r?.profit ?? 0), { cls: (r?.profit ?? 0) < 0 ? 'bad' : 'good', sub: `EBITDA ${money(r?.ebitda ?? 0)}` })}
    ${kpi('Credit rating', s.finance.rating, { sub: `score ${int(s.finance.score)}` })}
    ${kpi('Total debt', money(G.totalDebt(s)), { sub: `${s.loans.length} facilities` })}
    ${kpi('Share price', usd(G.sharePrice(s), 2), { sub: `Market cap ${money(G.marketCap(s))}` })}
    ${kpi('Inflation', pct(s.macro.inflation ?? 0, 1), { sub: `Prices ${num(s.macro.priceLevel ?? 1, 2)}× 2027 levels` })}
  </div>
  <div class="grid cols-2">
    ${panel("Last week's income statement", r ? statement([
      ...Object.entries(r.revenue).filter(([, v]) => v).map(([k, v]) => [REV_LABELS[k], money(v)]),
      ['Total revenue', money(r.totalRevenue), 'total'],
      ...Object.entries(r.cost).filter(([, v]) => v).map(([k, v]) => [`<span class="muted">${COST_LABELS[k] ?? k}</span>`, money(-v)]),
      ['Net profit', signed(r.profit), 'total'],
    ]) : '<p class="muted">Advance a week to see results.</p>')}
    <div class="stack">
      ${panel('Monthly results', `${barChart(Object.entries(s.months).sort((a, b) => a[0] - b[0]).slice(-24).map(([k, v]) => ({ label: G.MONTHS[k % 12][0], value: v.profit })))}
      ${table(months, [
        { h: 'Month', v: ([k]) => G.monthLabel(Number(k)) },
        { h: 'Revenue', cls: 'num', v: ([, v]) => money(v.revenue) },
        { h: 'Costs', cls: 'num', v: ([, v]) => money(v.cost) },
        { h: 'Profit', cls: 'num', v: ([, v]) => signed(v.profit) },
        { h: 'Margin', cls: 'num', v: ([, v]) => (v.revenue ? pct(v.profit / v.revenue, 1) : '–') },
        { h: 'Pax', cls: 'num', v: ([, v]) => int(v.pax) },
      ])}`)}
      ${panel('Cash', lineChart([{ values: s.history.slice(-104).map((h) => h.cash), cls: 'cash' }]))}
    </div>
  </div>
  <div class="grid cols-2">
    ${panel('Credit rating', `${statement([
      ['Rating', `<b>${s.finance.rating}</b> <small class="muted">(reviewed monthly)</small>`],
      ['EBITDA (annualised)', money(m.ebitda)],
      ['Lease-adjusted net leverage', Number.isFinite(m.leverage) ? `${num(m.leverage, 1)}× EBITDAR` : 'n/a (no earnings)'],
      ['Liquidity', `${num(m.liquidity, 1)} weeks of costs`],
      ['Interest coverage', Number.isFinite(m.coverage) ? `${num(m.coverage, 1)}×` : 'No debt'],
      ['Central bank rate', pct(s.macro.baseRate, 2)],
      ['Your borrowing rate', `${pct(G.loanRateFor(s, 'term'), 2)} term · ${pct(G.loanRateFor(s, 'secured'), 2)} secured`],
    ])}<div class="ratings">${G.RATINGS.map((x) => `<span class="${x === s.finance.rating ? 'active' : ''}">${x}</span>`).join('')}</div>`)}
    ${panel('Raise debt', `<div class="stack">
      <div class="row" data-form><input type="number" name="amount" value="${Math.round(nominal(Math.min(20e6, G.termLoanLimit(s))) / 1e5) * 1e5}" step="1000000" class="w-140"><button data-action="term-loan">5-year term loan</button><span class="muted small">limit ${money(G.termLoanLimit(s))}</span></div>
      <div class="row" data-form><input type="number" name="amount" value="${Math.round(nominal(Math.min(10e6, rcfHeadroom)) / 1e5) * 1e5}" step="1000000" class="w-140"><button data-action="rcf-draw">Draw revolving credit</button><span class="muted small">headroom ${money(rcfHeadroom)}</span></div>
      <p class="muted small">Aircraft-secured loans (80% of value, 12 years, cheaper) are raised from each owned aircraft's page.</p>
    </div>`)}
  </div>
  ${panel('Loans', table(s.loans, [
    { h: 'Facility', v: (l) => ({ term: 'Term loan', secured: `Secured · ${s.fleet.find((a) => a.id === l.aircraftId)?.reg ?? ''}`, rcf: 'Revolving credit' })[l.kind] },
    { h: 'Original', cls: 'num', v: (l) => money(l.original) },
    { h: 'Outstanding', cls: 'num', v: (l) => money(l.principal) },
    { h: 'Rate', cls: 'num', v: (l) => pct(l.rate, 2) },
    { h: 'Weekly payment', cls: 'num', v: (l) => (l.kind === 'rcf' ? 'Interest only' : money(l.payment)) },
    { h: 'Weeks left', cls: 'num', v: (l) => (Number.isFinite(l.weeksLeft) ? l.weeksLeft : '—') },
    { h: '', v: (l) => `<button class="small" data-action="repay" data-id="${l.id}" ${s.cash < l.principal ? 'disabled' : ''}>Repay</button>` },
  ], { empty: 'No debt.' }))}
  ${panel('Operating leases', table(leased, [
    { h: 'Aircraft', v: (a) => `<a href="#fleet/ac/${a.id}">${a.reg}</a> <small class="muted">${esc(typeName(a.type))}</small>` },
    { h: 'Lessor', v: (a) => esc(a.lease.lessor) },
    { h: 'Monthly rent', cls: 'num', v: (a) => money(a.lease.monthly) },
    { h: 'Ends', v: (a) => `${G.dateLabel(a.lease.endWeek)} <small class="${a.lease.endWeek - s.week < 13 ? 'warn' : 'muted'}">(${a.lease.endWeek - s.week} wk)</small>` },
    { h: '', v: (a) => `<button class="small" data-action="extend-lease" data-id="${a.id}">Extend</button>` },
  ], { empty: 'No leased aircraft.' }))}
  <div class="grid cols-2">
    ${panel('Fuel hedging', `${statement([
      ['Spot jet fuel', `${usd(s.macro.fuel, 3)}/kg`],
      ['Hedged share', pct(hedged)],
      ['Effective price paid', `${usd(G.effectiveFuelPrice(s), 3)}/kg`],
    ])}${table(s.hedges, [
      { h: 'Volume', v: (h) => pct(h.ratio) },
      { h: 'Locked price', v: (h) => `${usd(h.price, 3)}/kg` },
      { h: 'Weeks left', v: (h) => h.weeksLeft },
    ], { empty: 'No hedges in place.' })}
    <div class="row wrap" data-form><select name="ratio">${options([[0.1, '10%'], [0.25, '25%'], [0.4, '40%'], [0.5, '50%']], 0.25)}</select><select name="weeks">${options([[13, '13 weeks'], [26, '26 weeks'], [52, '52 weeks']], 26)}</select><button data-action="hedge">Buy hedge</button></div>
    <p class="muted small">Locks part of your fuel at today's forward price (spot + 2–5%). A 25%/26-week hedge would cost about ${money(quote.premium)} in premium.</p>`)}
    ${panel('Equity', `${statement([
      ['Shares outstanding', `${num(s.finance.shares / 1e6, 2)}M`],
      ['Share price', usd(G.sharePrice(s), 2)],
      ['Book equity', money(G.bookEquity(s))],
      ['Dividends paid (lifetime)', money(s.finance.dividends)],
      ['Tax losses carried forward', money(s.finance.lossCarry)],
    ])}${lineChart([{ values: s.history.slice(-104).map((h) => h.sharePrice), cls: 'cash' }], { format: (v) => usd(v, 2) })}
    <div class="row" data-form><input type="number" name="amount" value="${Math.round(nominal(25e6) / 1e5) * 1e5}" step="100000" class="w-140"><button data-action="issue-shares">Issue shares</button><button data-action="dividend">Pay dividend</button></div>
    <p class="muted small">Issuing shares raises cash at a 8% discount but annoys the board; dividends please it.</p>`)}
  </div>`;
}

export const actions = {
  'term-loan': (el, ctx) => G.takeTermLoan(ctx.game, fromNominal(formValues(el).amount)),
  'rcf-draw': (el, ctx) => G.drawRcf(ctx.game, fromNominal(formValues(el).amount)),
  repay: (el, ctx) => G.repayLoan(ctx.game, el.dataset.id),
  hedge: (el, ctx) => {
    const v = formValues(el);
    return G.buyHedge(ctx.game, Number(v.ratio), Number(v.weeks));
  },
  'issue-shares': (el, ctx) => (confirm('Issue new shares?') ? G.issueShares(ctx.game, fromNominal(formValues(el).amount)) : null),
  dividend: (el, ctx) => G.payDividend(ctx.game, fromNominal(formValues(el).amount)),
};
