import { G, esc, money, pct, int, num, panel, table, tabs, statement, airportOptions, pill, ap, lineChart, kpi, usd, nominal, fromNominal } from '../util.js';
import { routePreview } from './routes.js';

export function render(c) {
  const tab = c.params[0] ?? 'analyst';
  return `<div class="page-head"><h1>Markets</h1></div>
  ${tabs('markets', [['analyst', 'Market analyst'], ['opportunities', 'Opportunities'], ['learn', 'Learn']], tab)}
  ${({ analyst, opportunities, learn }[tab] ?? analyst)(c)}`;
}

// Capture estimates live in the engine (fit.js) so the route finder shares them.
const estimateCapture = (s, a, b, freq) => G.estimateCapture(s, a, b, freq);

function analyst(c) {
  const s = c.state;
  const m = (c.ui.analyst ??= { a: s.hubs[0].code, b: '' });
  const all = G.AIRPORTS.map((x) => x.code);
  let body = '<p class="muted">Pick two airports to analyse the market between them.</p>';
  if (m.a && m.b && m.a !== m.b) {
    const season = Array.from({ length: 52 }, (_, i) => G.seasonality(m.a, m.b, s.week - G.dayOfYear(s.week) / 7 + i));
    const est = estimateCapture(s, m.a, m.b);
    const d = G.distanceKm(m.a, m.b);
    const fleetFit = G.AIRCRAFT.filter((t) => t.range >= d && t.cat !== 'freighter' && [m.a, m.b].every((x) => ap(x).runway >= t.runway));
    body = `<div class="grid kpis">
      ${kpi('Total market', `${int(G.marketNow(s, m.a, m.b) * 2)} pax/wk`)}
      ${kpi('Your likely capture', `${int(est.pax)} pax/wk`, { sub: 'daily service, reference fares' })}
      ${kpi('Revenue potential', `${money(est.revenue)}/wk`)}
      ${kpi('Nonstop rivals', est.rivals)}
    </div>
    <div class="grid cols-2">
      ${panel('Seasonality (index by week of year)', lineChart([{ values: season.map((x) => x * 100), cls: 'profit' }], { format: (v) => v.toFixed(0) }))}
      ${panel('Reference fares by cabin', statement(G.CLASSES.map((k) => [G.CABIN[k].name, usd(G.fareNow(s, d, k))]).concat([['Cargo', `${usd(G.refCargoRate(d), 2)}/kg`]])))}
    </div>
    ${panel('Route assessment', routePreview(s, m.a, m.b))}
    ${panel('Aircraft types that can fly it', table(fleetFit, [
      { h: 'Type', v: (t) => esc(t.name) },
      { h: 'Seats', cls: 'num', v: (t) => G.seatCount(t.config) },
      { h: 'Round trips/wk', cls: 'num', v: (t) => Math.floor(G.weeklyHours(t) / G.roundTripHours(t, d)) },
      { h: 'Seats/wk each way', cls: 'num', v: (t) => int(Math.floor(G.weeklyHours(t) / G.roundTripHours(t, d)) * G.seatCount(t.config)) },
      { h: 'Fuel per trip', cls: 'num', v: (t) => money(t.burn * d * s.macro.fuel) },
    ], { empty: 'No aircraft can operate this route (range or runway).' }))}`;
  }
  return `${panel('Choose a market', `<div class="row wrap"><select data-change="an-a">${airportOptions(all, m.a)}</select><span>⇄</span><select data-change="an-b">${airportOptions(all.filter((x) => x !== m.a), m.b, 'Pick an airport…')}</select></div>`)}${body}`;
}

function opportunities(c) {
  const s = c.state;
  const served = new Set(s.routes.map((r) => G.pairKey(r.a, r.b)));
  const rows = [];
  for (const h of s.hubs) {
    for (const x of G.AIRPORTS) {
      if (x.code === h.code || served.has(G.pairKey(h.code, x.code))) continue;
      const rights = G.trafficRights(s, h.code, x.code);
      if (!rights.ok) continue;
      const d = G.distanceKm(h.code, x.code);
      if (d < 300 || d > 15000) continue;
      const est = estimateCapture(s, h.code, x.code);
      rows.push({ a: h.code, b: x.code, ...est, fifth: rights.fifth });
    }
  }
  rows.sort((p, q) => q.revenue - p.revenue);
  return panel('Best unserved markets from your hubs', `${table(rows.slice(0, 40), [
    { h: 'Market', v: (r) => `<b>${r.a}–${r.b}</b> <small class="muted">${esc(ap(r.b).city)}, ${esc(G.COUNTRIES[ap(r.b).country])}</small>` },
    { h: 'Km', cls: 'num', v: (r) => int(r.d) },
    { h: 'Est. pax/wk', cls: 'num', v: (r) => int(r.pax) },
    { h: 'Est. revenue/wk', cls: 'num', v: (r) => money(r.revenue) },
    { h: 'Nonstop rivals', cls: 'num', v: (r) => r.rivals },
    { h: '', v: (r) => `<a class="small" href="#markets/analyst" data-action="analyse" data-a="${r.a}" data-b="${r.b}">Analyse ›</a>` },
  ])}<p class="muted small">Estimates assume daily service at reference fares with your current reputation and service. Capacity, costs and connecting traffic are not included.</p>`);
}

function learn() {
  const sections = [
    ['Time', 'Each turn is a week. Advance by week, month, quarter or year from the top bar (keys: space/W, M, Q, Y). Time stops whenever a decision needs you, then carries on.'],
    ['Demand', 'Every pair of airports has a market sized by population, business and tourism appeal, distance (short hops lose to cars and trains), region and seasonality (northern summer, southern summer, Christmas). Travellers split across First, Business, Premium Economy and Economy.'],
    ['Competition', 'Real airlines fly from their real hubs. Your share of each cabin depends on price, frequency, reputation, product (service standards, aircraft upgrades, lounges, punctuality) and marketing versus every rival on that market. Incumbents run many daily frequencies and react when you take their traffic — fare wars, capacity dumps — and some will enter your best routes.'],
    ['Connections', 'Passengers can connect at your hubs between any two routes, if the detour is under 50%. Connecting itineraries are less attractive than nonstops and improve with hub connection banks. Seats are allocated to nonstop passengers first; connections fill what is left. See Network › Pax flow.'],
    ['Fleet', 'Factory orders take 1.5–5 years with a 20% deposit. Operating leases arrive in weeks to months; used aircraft in 3–10 weeks. Each type has range, runway needs, fuel burn and a floor area you lay out into cabins. Aircraft age: older frames burn more fuel and need costlier checks.'],
    ['Scheduling', 'Assign aircraft to routes with a weekly frequency. Each aircraft has 112 block hours a week (126 for widebodies); round trips use flying time plus turnaround. Congested airports need slots.'],
    ['Engineering', 'A-checks every 750 flight hours, B every 6 months, C every 2 years or 7,500 hours, D every 6 years. Overdue by 10% and the regulator grounds the aircraft. Build line stations and heavy hangars at hubs for cheaper in-house work, or outsource to MRO shops of varying quality, price and waiting time. Reliability drives cancellations and on-time performance.'],
    ['Eras', 'Start any year from 1960. Demand grows (and shifts towards Asia and the Middle East) over the decades, fares start high and fall with deregulation and low-cost carriers, fuel and interest rates follow history, and accidents were far more common early on. Aircraft can only be ordered while in production; older types live on in the lease and used markets. First-generation jets need a flight engineer, are banned by Chapter 2 noise rules in North America and Europe from 2002, and every airframe retires at 45 years.'],
    ['Difficulty', 'Pick Easy, Normal, Hard or Brutal — or customise eleven dials: capital, demand, rival aggression, startups, event frequency, accident risk, weather, board patience, cost of credit, union militancy and fuel volatility. Most can be changed later under Management › Airline.'],
    ['Rivals fight back', 'Move onto a route at a rival’s hub and expect a response within weeks: matched fares and extra flights for about six months. Undercut them anywhere and they may follow you down. Win a market convincingly for months and they withdraw. Rivals also order aircraft, open routes into markets you serve and join alliances — check Competitors and the news.'],
    ['Chapter 11', 'If cash stays negative for eight weeks you can file for court protection instead of collapsing. Debt payments freeze and a DIP loan pays the bills while you cut lease rents, reject leases, reopen labour contracts and drop losing routes. Get back to profit and emerge with much less debt — but the old shareholders are wiped out and a new board takes over.'],
    ['Revenue management', 'Each cabin sells a flexible fare and a cheaper advance-purchase fare. Business travellers mostly buy flex and barely notice price; leisure travellers want the advance fare and are very price-sensitive. The advance bucket caps how many seats sell cheap: open it wide to fill an empty route, close it on full routes so late, high-paying travellers find a seat. Peak and off-peak multipliers move all fares with the season. The autopilot does all this toward a target load factor unless you take a route off auto.'],
    ['Seasons', 'Summer (April–October) and winter schedules can differ: fly a resort route 14 times a week in summer and 3 in winter, and use the freed winter hours elsewhere. Slots and bilateral rights are counted on the busier season.'],
    ['Hub timetables', 'A rolling hub spreads flights through the day: easy on aircraft, but connections are only as good as sheer frequency makes them. Banks gather arrivals and departures into waves so passengers connect quickly. Match the number of banks to how often a typical spoke flies each day; tighter discipline improves connections but costs aircraft time and punctuality. Auto mode picks banks for you.'],
    ['Terminals', 'At your hubs you can build a pier, your own terminal, and eventually a signature terminal. Each level trims airport charges, adds slots at constrained airports and makes passengers prefer you. They are expensive and slow: think of them as 20-year bets.'],
    ['Brands', 'A low-cost subsidiary wins price-sensitive travellers with cheaper crew contracts, direct sales and paid extras; a regional brand feeds hubs on lower-cost scope agreements; a premium boutique charges more for better service. Brands share your fleet, staff and cash but each has its own reputation, fares and livery.'],
    ['Cabins', 'Each class can be fitted with different seats. A lie-flat bed takes more floor than a recliner but long-haul business travellers will pay for it; dense economy squeezes more seats in at the cost of appeal. Airliners of 100+ seats can also be fitted as combis with freight on the main deck.'],
    ['Regulation', 'Before open skies, governments cap how often each airline may fly between two countries. Single markets and open-skies deals lift the caps. Modern flying in Europe pays for carbon and sustainable fuel. See Network › Regulation.'],
    ['Inflation', 'Money is shown in the dollars of the day and follows a noisy version of real inflation — a 707 costs a few million in 1965, a 787 well over a hundred million in 2027. Inflation quietly shrinks your loans, lease rents and order balances, but also the value of cash (which earns interest). If wages aren’t indexed, real pay erodes and unions come back with catch-up claims — especially in the 1970s.'],
    ['Small aircraft', 'Commuter types like the Islander, Twin Otter, Caravan and Beech 1900 need no cabin crew under 20 seats and use tiny runways — Lukla, Barra beach, St Barts, London City. Niche types from Convairs and VC10s to Tu-154s, BAe 146s, 717s and COMAC jets come and go with their production years.'],
    ['History, loosely', 'Oil embargoes, deregulation, wars, terror attacks, epidemics, financial crises, volcanic ash and airspace closures roughly follow real history — but each may or may not happen, with shifted timing and severity. Real airlines are founded and fail around their historical dates, though some survive in your timeline.'],
    ['People', 'Five workforces, each with a five-step career ladder (e.g. Second Officer → First Officer → Captain → Training Captain → Chief Pilot) with its own pay. Requirements come from your flying; every cockpit needs a captain and every 10–25 frontline staff need a supervisor. Staff gain tenure, are promoted (automatically if you like), retire at the end of their careers and can be poached by rivals paying more. Contract out any share of frontline work for a premium to avoid hiring and unions. Once a department is big enough, hand it to its manager.'],
    ['Unions', 'Unions negotiate new agreements every three years and back their claims with work-to-rule, sick-outs or strikes. Unhappy non-union staff may organise. Contracting out weakens unions — but angers them.'],
    ['Safety', 'Every flight carries a small risk of incidents, from bird strikes to serious accidents and, rarely, hull losses. Risk rises with poor reliability, overdue checks, inexperienced or overstretched crews, short-staffed engineering, old or early-design airframes, and the era. Weather closes airports and can damage aircraft; hijackings depend on the era and your security standard.'],
    ['Rivals & deals', 'Rivals grow, shrink, merge, go bankrupt and poach your staff. New startups appear — often right where you are making money. Buy a 25% stake in any airline for dividends and a codeshare, or acquire a domestic rival outright for its hubs, fleet, routes and people. If your share price slumps, someone may try to buy you.'],
    ['Cargo', 'Every passenger aircraft carries belly cargo. Freighters carry far more and fly anywhere you have a route. Set cargo rates per route.'],
    ['Money', 'Revenue: tickets, ancillaries, cargo, charters, special contracts, subsidies, ventures. Costs: fuel (hedgeable), salaries, maintenance, airport and navigation charges, service, distribution, leases, marketing, facilities, overhead, interest, depreciation and quarterly tax. Your credit rating (from leverage, liquidity and coverage) sets borrowing costs and credit-line size.'],
    ['The board', 'Quarterly reviews judge profit, share price and credit rating; yearly objectives add or remove confidence. Reach zero confidence and you are fired. Eight weeks of negative cash and the airline enters administration.'],
  ];
  return `<div class="grid cols-2">${sections.map(([h, t]) => panel(h, `<p>${esc(t)}</p>`)).join('')}</div>`;
}

export const actions = {
  analyse(el, ctx) {
    ctx.ui.analyst = { a: el.dataset.a, b: el.dataset.b };
    location.hash = '#markets/analyst';
  },
};

export const changes = {
  'an-a': (el, ctx) => (ctx.ui.analyst = { ...(ctx.ui.analyst ?? {}), a: el.value, b: ctx.ui.analyst?.b === el.value ? '' : ctx.ui.analyst?.b }),
  'an-b': (el, ctx) => (ctx.ui.analyst = { ...(ctx.ui.analyst ?? {}), b: el.value }),
};
