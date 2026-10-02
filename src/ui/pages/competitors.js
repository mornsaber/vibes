import { G, esc, money, pct, int, num, kpi, panel, table, statement, options, bar, pill, ap } from '../util.js';

export function render(c) {
  const id = c.params[0];
  const def = id && G.rivalDef(c.state, id);
  if (def) return detail(c, def);
  return list(c);
}

function rows(s) {
  const idx = G.overlapIndex(s);
  return [...G.RIVALS, ...s.newRivals].filter((r) => ['active', 'bankrupt', 'merged', 'acquired'].includes(s.rivals[r.id]?.status)).map((r) => ({ r, rs: s.rivals[r.id], overlap: s.rivals[r.id].status === 'active' ? idx.get(r.id) ?? [] : [] }));
}

function list(c) {
  const s = c.state;
  const filter = c.ui.rivalFilter ?? 'overlap';
  const home = ap(s.hubs[0].code).region;
  let list = rows(s);
  if (filter === 'overlap') list = list.filter((x) => x.overlap.length);
  if (filter === 'region') list = list.filter((x) => x.r.hubs.some((h) => ap(h)?.region === home) && x.rs.status === 'active');
  if (filter === 'startups') list = list.filter((x) => x.r.startup);
  if (filter === 'all') list = list.filter((x) => x.rs.status === 'active');
  if (filter === 'gone') list = list.filter((x) => x.rs.status !== 'active');
  list.sort((a, b) => b.overlap.length - a.overlap.length || b.r.fleet - a.r.fleet);
  const hostile = rows(s).filter((x) => x.rs.hostility > 0.4).length;
  return `<div class="page-head"><h1>Competitors</h1><div class="row">Show <select data-change="rival-filter">${options([['overlap', 'Competing with you'], ['region', 'In your region'], ['startups', 'Startups'], ['all', 'All operating'], ['gone', 'Defunct, merged & acquired']], filter)}</select></div></div>
  <div class="grid kpis">
    ${kpi('Airlines operating', rows(s).filter((x) => x.rs.status === 'active').length, { sub: `${s.newRivals.length} startups since you began` })}
    ${kpi('Competing on your routes', rows(s).filter((x) => x.overlap.length).length)}
    ${kpi('Hostile', hostile, { cls: hostile ? 'bad' : '' })}
    ${kpi('Gone since you began', rows(s).filter((x) => x.rs.status !== 'active').length)}
  </div>
  ${panel('', table(list, [
    { h: 'Airline', v: (x) => `<a href="#competitors/${x.r.id}"><b>${esc(x.r.name)}</b></a> <small class="muted">${x.r.code}</small>${x.r.startup ? ` ${pill('Startup', 'warn')}` : ''}${x.rs.status !== 'active' ? ` ${pill(x.rs.status === 'merged' ? `Merged into ${G.rivalDef(s, x.rs.mergedInto)?.code ?? ''}` : x.rs.status === 'acquired' ? 'Acquired by you' : 'Bankrupt', x.rs.status === 'acquired' ? 'good' : 'bad')}` : ''}${s.stakes[x.r.id] ? ` ${pill(`${Math.round(s.stakes[x.r.id] * 100)}% stake`, 'good')}` : ''}` },
    { h: 'Model', v: (x) => G.RIVAL_TYPES[x.r.type].label },
    { h: 'Alliance', v: (x) => esc(x.r.alliance ?? '—') },
    { h: 'Hubs', v: (x) => `<small>${x.r.hubs.join(' ')}</small>` },
    { h: 'Fleet', cls: 'num', v: (x) => int(x.rs.fleet ?? 0) },
    { h: 'Crew pay', cls: 'num', v: (x) => (x.rs.payIdx ? pct(x.rs.payIdx) : '–') },
    { h: 'Reputation', v: (x) => bar(x.rs.rep ?? 0, 100) },
    { h: 'Margin', cls: 'num', v: (x) => (x.rs.margin != null ? `<span class="${x.rs.margin < 0 ? 'bad' : ''}">${pct(x.rs.margin, 1)}</span>` : '–') },
    { h: 'Overlap', cls: 'num', v: (x) => x.overlap.length },
    { h: 'Hostility', v: (x) => bar((x.rs.hostility ?? 0) * 100, 100, { invert: true }) },
    { h: 'Relation', v: (x) => (s.partners.codeshares.includes(x.r.id) ? pill('Codeshare', 'good') : s.partners.alliance && x.r.alliance === s.partners.alliance ? pill('Alliance', 'good') : '') },
  ], { empty: 'No rival flies against you yet.' }))}`;
}

function detail(c, r) {
  const s = c.state;
  const rs = s.rivals[r.id];
  const overlap = G.overlapRoutes(s, r.id);
  const t = G.RIVAL_TYPES[r.type];
  const terms = G.codeshareTerms(s, r.id);
  return `<div class="page-head"><h1><a href="#competitors" class="muted">Competitors ›</a> ${esc(r.name)}</h1><span class="muted">${r.code} · ${esc(G.COUNTRIES[r.country])}</span></div>
  <div class="grid kpis">
    ${kpi('Fleet', int(rs.fleet))}
    ${kpi('Reputation', int(rs.rep))}
    ${kpi('Operating margin', pct(rs.margin, 1), { cls: rs.margin < 0 ? 'bad' : '' })}
    ${kpi('Cash (est.)', money(rs.cash))}
    ${kpi('Hostility to you', pct(rs.hostility), { cls: rs.hostility > 0.4 ? 'bad' : '' })}
  </div>
  <div class="grid cols-2">
    ${panel('Profile', statement([
      ['Business model', t.label],
      ['Alliance', esc(r.alliance ?? 'Independent')],
      ['Hubs & bases', r.hubs.map((h) => `${h} ${esc(ap(h).city)}`).join('<br>')],
      ['Product quality', `${num(r.quality * t.quality, 2)}× average`],
      ['Typical fares', `${pct(t.fare)} of market`],
      ['Premium cabins', t.premium ? 'Yes' : 'No'],
      ['Aggression', bar(r.aggression * 100, 100, { invert: true })],
      ['Relationship', `${int(rs.relation)}/100`],
      ['Founded', r.founded ?? '—'],
      ['Crew pay offer', rs.payIdx ? `${pct(rs.payIdx)} of market` : '—'],
      ['Status', rs.status === 'active' ? 'Operating' : rs.status === 'merged' ? `Merged into ${esc(G.rivalDef(s, rs.mergedInto)?.name ?? '')}` : rs.status === 'acquired' ? 'Acquired by you' : 'Ceased operations'],
    ]))}
    ${panel('Partnership', s.partners.codeshares.includes(r.id) ? `<p>${pill('Codeshare partner', 'good')}</p><button class="danger small" data-action="end-codeshare" data-id="${r.id}">End codeshare</button>` : terms.reasons.length ? `<p class="muted">${terms.reasons.map(esc).join('<br>')}</p>` : `<p>They might consider a codeshare (fit score ${num(terms.score, 2)}; 0.6 needed).</p><button class="primary" data-action="propose-codeshare" data-id="${r.id}">Propose codeshare (${money(terms.fee)})</button>`)}
  </div>
  ${rs.status === 'active' ? panel('Mergers & acquisitions', (() => {
    const at = G.acquisitionTerms(s, r.id);
    return `${statement([
      ['Estimated value', money(at.value)],
      ['Takeover price', at.domestic ? money(at.price) : '<span class="muted">Not allowed (foreign ownership rules)</span>'],
      [`${Math.round(at.stake * 100)}% stake`, s.stakes[r.id] ? `You own ${Math.round(s.stakes[r.id] * 100)}%` : money(at.stakePrice)],
      ['Their cash', money(rs.cash)],
    ])}<div class="row wrap">
      ${at.reasons.length ? `<span class="muted small">${esc(at.reasons[0])}</span>` : `<button class="primary small" data-action="acquire" data-id="${r.id}" data-pay="cash">Acquire for cash</button><button class="small" data-action="acquire" data-id="${r.id}" data-pay="shares">Acquire with shares</button><label class="check small"><input type="checkbox" data-change="acq-brand" ${c.ui.acqBrand ? 'checked' : ''}> Keep as a subsidiary brand</label>`}
      ${s.stakes[r.id] ? `<button class="small" data-action="sell-stake" data-id="${r.id}">Sell stake</button>` : r.type !== 'cargo' ? `<button class="small" data-action="buy-stake" data-id="${r.id}">Buy ${Math.round(at.stake * 100)}% stake</button>` : ''}
    </div><p class="muted small">Buying a domestic rival brings its home-market hubs, up to 80 aircraft, its strongest routes and its workforce (morale dips during integration). Tick “keep as a subsidiary brand” to run it under its own name, reputation and fares. A stake earns dividends, forces a codeshare and ends hostilities; foreign stakes are capped by ownership rules.</p>`;
  })()) : ''}
  ${panel('Head-to-head routes', table(overlap, [
    { h: 'Route', v: (x) => `<a href="#routes/${x.id}">${x.a}–${x.b}</a>` },
    { h: 'Your share', cls: 'num', v: (x) => (x.last ? pct(x.last.share) : '–') },
    { h: 'Their fares', cls: 'num', v: (x) => { const e = G.rivalsOn(s, x.a, x.b).find((q) => q.id === r.id); return e ? pct(t.fare * e.fare) : '–'; } },
    { h: 'Their capacity', cls: 'num', v: (x) => { const e = G.rivalsOn(s, x.a, x.b).find((q) => q.id === r.id); return e ? pct(e.cap) : '–'; } },
    { h: 'Your profit', cls: 'num', v: (x) => money(x.last?.profit ?? 0) },
  ], { empty: 'You do not compete nonstop with this airline.' }))}
  ${panel('Recent moves', `<ul class="news">${s.log.filter((l) => l.text.includes(r.name)).slice(0, 12).map((l) => `<li class="${l.tone}"><span class="when">${G.dateLabel(l.week)}</span><span>${esc(l.text)}</span></li>`).join('') || '<li class="muted">Nothing notable.</li>'}</ul>`)}`;
}

export const actions = {
  acquire(el, ctx) {
    const r = G.rivalDef(ctx.game, el.dataset.id);
    if (!confirm(`Acquire ${r.name}? This is a huge, irreversible deal.`)) return;
    const res = G.acquireRival(ctx.game, el.dataset.id, el.dataset.pay, { asBrand: !!ctx.ui.acqBrand });
    if (res.ok) location.hash = '#network/overview';
    return res;
  },
  'buy-stake': (el, ctx) => G.buyStake(ctx.game, el.dataset.id),
  'sell-stake': (el, ctx) => G.sellStake(ctx.game, el.dataset.id),
};

export const changes = {
  'rival-filter': (el, ctx) => (ctx.ui.rivalFilter = el.value),
  'acq-brand': (el, ctx) => (ctx.ui.acqBrand = el.checked),
};
