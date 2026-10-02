import { G, esc, money, pct, int, num, kpi, panel, table, statement, options, bar, pill, ap } from '../util.js';

export function render(c) {
  const id = c.params[0];
  if (id && G.rivalById[id]) return detail(c, G.rivalById[id]);
  return list(c);
}

function rows(s) {
  return G.RIVALS.map((r) => ({ r, rs: s.rivals[r.id], overlap: G.overlapRoutes(s, r.id) }));
}

function list(c) {
  const s = c.state;
  const filter = c.ui.rivalFilter ?? 'overlap';
  const home = ap(s.hubs[0].code).region;
  let list = rows(s);
  if (filter === 'overlap') list = list.filter((x) => x.overlap.length);
  if (filter === 'region') list = list.filter((x) => x.r.hubs.some((h) => ap(h)?.region === home));
  list.sort((a, b) => b.overlap.length - a.overlap.length || b.r.fleet - a.r.fleet);
  const hostile = rows(s).filter((x) => x.rs.hostility > 0.4).length;
  return `<div class="page-head"><h1>Competitors</h1><div class="row">Show <select data-change="rival-filter">${options([['overlap', 'Competing with you'], ['region', 'In your region'], ['all', 'All airlines']], filter)}</select></div></div>
  <div class="grid kpis">
    ${kpi('Airlines tracked', G.RIVALS.length)}
    ${kpi('Competing on your routes', rows(s).filter((x) => x.overlap.length).length)}
    ${kpi('Hostile', hostile, { cls: hostile ? 'bad' : '' })}
    ${kpi('Collapsed', Object.values(s.rivals).filter((x) => x.status !== 'active').length)}
  </div>
  ${panel('', table(list, [
    { h: 'Airline', v: (x) => `<a href="#competitors/${x.r.id}"><b>${esc(x.r.name)}</b></a> <small class="muted">${x.r.code}</small>${x.rs.status !== 'active' ? ` ${pill('Bankrupt', 'bad')}` : ''}` },
    { h: 'Model', v: (x) => G.RIVAL_TYPES[x.r.type].label },
    { h: 'Alliance', v: (x) => esc(x.r.alliance ?? '—') },
    { h: 'Hubs', v: (x) => `<small>${x.r.hubs.join(' ')}</small>` },
    { h: 'Fleet', cls: 'num', v: (x) => int(x.rs.fleet) },
    { h: 'Reputation', v: (x) => bar(x.rs.rep, 100) },
    { h: 'Margin', cls: 'num', v: (x) => `<span class="${x.rs.margin < 0 ? 'bad' : ''}">${pct(x.rs.margin, 1)}</span>` },
    { h: 'Overlap', cls: 'num', v: (x) => x.overlap.length },
    { h: 'Hostility', v: (x) => bar(x.rs.hostility * 100, 100, { invert: true }) },
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
      ['Status', rs.status === 'active' ? 'Operating' : 'Ceased operations'],
    ]))}
    ${panel('Partnership', s.partners.codeshares.includes(r.id) ? `<p>${pill('Codeshare partner', 'good')}</p><button class="danger small" data-action="end-codeshare" data-id="${r.id}">End codeshare</button>` : terms.reasons.length ? `<p class="muted">${terms.reasons.map(esc).join('<br>')}</p>` : `<p>They might consider a codeshare (fit score ${num(terms.score, 2)}; 0.6 needed).</p><button class="primary" data-action="propose-codeshare" data-id="${r.id}">Propose codeshare (${money(terms.fee)})</button>`)}
  </div>
  ${panel('Head-to-head routes', table(overlap, [
    { h: 'Route', v: (x) => `<a href="#routes/${x.id}">${x.a}–${x.b}</a>` },
    { h: 'Your share', cls: 'num', v: (x) => (x.last ? pct(x.last.share) : '–') },
    { h: 'Their fares', cls: 'num', v: (x) => { const e = G.rivalsOn(s, x.a, x.b).find((q) => q.id === r.id); return e ? pct(t.fare * e.fare) : '–'; } },
    { h: 'Their capacity', cls: 'num', v: (x) => { const e = G.rivalsOn(s, x.a, x.b).find((q) => q.id === r.id); return e ? pct(e.cap) : '–'; } },
    { h: 'Your profit', cls: 'num', v: (x) => money(x.last?.profit ?? 0) },
  ], { empty: 'You do not compete nonstop with this airline.' }))}
  ${panel('Recent moves', `<ul class="news">${s.log.filter((l) => l.text.includes(r.name)).slice(0, 12).map((l) => `<li class="${l.tone}"><span class="when">${G.dateLabel(l.week)}</span><span>${esc(l.text)}</span></li>`).join('') || '<li class="muted">Nothing notable.</li>'}</ul>`)}`;
}

export const changes = {
  'rival-filter': (el, ctx) => (ctx.ui.rivalFilter = el.value),
};
