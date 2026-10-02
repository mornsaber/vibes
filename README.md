# ✈ Airline Executive Simulator

A deep, turn-based airline management sim. Found an airline in any year from
1960 at one of 165 real airports, build a fleet from 120 aircraft types (Islander
and Twin Otter to A350, Concorde included) with realistic production years and lead times, plan a
hub-and-spoke network, run engineering, crew, safety and finance, and fight
100+ real and generated airlines — all while the board judges you every quarter.

Play free-form from any year, or take on a **scenario** — survive the 1973 oil
shock, rescue a bankrupt flag carrier, build a 2005 low-cost carrier, become Pan
Am, turn a Gulf airline into a global super-connector, grow with deregulation in
1978, run Concorde, ride out 2020, chase the Asian boom, connect the Outback or
launch low-cost long-haul — eleven scenarios with goals, a deadline and a score. Automation (pricing, aircraft assignment, hub timetables,
staffing, maintenance) is on by default; take the controls whenever you like.

Runs entirely in the browser: no dependencies, no build step.

```sh
npm start        # http://localhost:8080
npm test         # engine test suite (node:test)
npm run simulate # headless balance harness (scripted strategies; SEED=n)
npm run profile  # performance harness: ~300 aircraft, 150 routes, 10 years
```

New players get a dismissable **first-year tutorial** (a step tracker that
ticks off as you lease, launch, fly and grow) and every key metric has a
plain-language tooltip. Games live in named **save slots** (gzip-compressed in
the browser) with export/import to files, and **↶ revert** undoes your last
time advance. Keyboard: <kbd>Space</kbd>/<kbd>W</kbd> week · <kbd>M</kbd> month ·
<kbd>Q</kbd> quarter · <kbd>Y</kbd> year.

## Pages

Each page is a hash route (`#routes/rt12`, `#fleet/ac/ac3`, `#engineering/schedule`, …).

| Operations | Finance & Strategy |
| --- | --- |
| **#dashboard** — Cash · Profit/wk · Load · Fleet, scenario goals, monthly profit, needs attention, advisor (one-click route fixes), operations, fleet by type, network, staffing, upcoming deliveries, board objectives | **#finances** — cash, net/wk, income statement, monthly results, credit rating & metrics, term loans, revolving credit, aircraft-secured loans, leases, fuel hedging, equity |
| **#routes** — route list, planner, per-route detail: base fares, flex/advance revenue management, summer/winter frequencies, brand, treaty, rivals, economics, cargo, and an aircraft finder (your aircraft that can fly it, and types worth leasing, buying or ordering) | **#management** — airline & board, autopilot, staffing, service & marketing, brands & campaigns, partners (codeshares & alliances), subsidies, statistics (CASK/RASK/yield…) |
| **#planning** — hubs (timetable banks, terminals), fleet capacity & idle aircraft, crew plan, slots | **#competitors** — 70+ real airlines with finances, hostility and head-to-head routes; buy stakes or acquire (optionally keeping the brand) |
| **#fleet** — aircraft (with range), groups, fleet commonality, on order, acquire (leases, used, factory orders), aircraft detail with a route finder, one-click auto-assign and a cabin editor | **#cargo** — overview, network, freighter fleet & P2F conversions |
| **#map** — world map with regional zoom, airport explorer | **#charter** — sports teams, tour operators, cruise lines, pilgrimages… |
| **#engineering** — A/B/C/D check schedule, MRO facilities, outsourcing, upgrades, cabin layouts, safety & incident log | **#special** — military airlift, VIP, humanitarian, ACMI, medevac; ventures (pilot academy, third-party MRO, ground handling, simulator centre) |
| **#network** — overview, hubs, pax flow (local vs connecting O&D), route health, regulation (treaties, ownership, carbon) | **#history** — market share vs home-market rivals, annual reports, milestone timeline |
| **#markets** — market analyst, opportunity scanner, Learn guide | |

## Simulation layers

- **Advisor & autopilot** — optional weekly auto-pricing toward a target load factor (within 80–160% of the brand's price level, never dumping fares to fill seats that shouldn't fly), automatic advance-bucket management, idle-aircraft assignment to the routes spilling most passengers and rebalancing onto unserved routes, plus route suggestions (add flights, cut frequency, raise/lower fares, close) you can apply with one click. Hand-priced routes stay manual.
- **Scenarios** — eleven preset starts with inherited fleets, routes, staff, debt and forced history, goals locked in as they're met (or judged at the deadline), win/lose screens, a score, and the option to keep playing in free play. Free play has a running score too.
- **Revenue management** — every cabin sells a flex fare and an advance-purchase fare around the base fare. Travellers split into flexible (low elasticity) and price-sensitive (high elasticity) segments by cabin and business mix; an advance-seat bucket caps cheap sales, turned-away leisure travellers partly buy up, and peak/off-peak multipliers follow seasonal demand.
- **Hub timetables** — rolling hubs or 1–6 daily connection banks with a discipline setting. Connection quality depends on how spoke frequency fills the banks; banks cost aircraft waiting time, peak-hour punctuality and coordination. Auto mode re-times hubs monthly.
- **Seasons** — per-aircraft summer (Apr–Oct) and winter schedules; slots and treaty rights are counted on the busier season, crew on the season ahead.
- **Subsidiaries** — low-cost, regional-feeder and premium brands with their own reputation, service, fares, cost structure (crew scope, distribution, handling, ancillaries) and livery, on a shared fleet and balance sheet; acquired airlines can be kept as brands. Found the mainline itself as full-service or low-cost.
- **Terminals** — pier → own terminal → signature terminal at hubs: lower charges, extra slots, appeal and punctuality, for big up-front bets and upkeep.
- **Regulation** — bilateral caps on weekly frequencies between countries (tighter before 1978 and 1992), historical and random open-skies deals, the European single market from 1997, foreign-ownership caps (25% → 49%) on stakes, EU ETS, CORSIA and SAF mandates with per-route carbon cost and CO₂ tracking. Can be switched off.
- **History & branding** — milestones, annual reports, monthly passenger share against the biggest home-market rivals; tail-fin liveries (pattern, colours, logo) on the sidebar, fleet, map and reports; marketing campaigns (fare sale, corporate sales, double miles, sponsorship, relaunch with free repaint, new-route ads).
- **Cabins** — seat products per class (dense/standard/extra-legroom economy, cradle premium economy, recliner/angled/flat/suite business, open/suite first) with era availability, floor space, short/long-haul appeal and refit cost; combi main-deck cargo on 100+ seat types.
- **Difficulty** — Easy / Normal / Hard / Brutal presets plus eleven custom dials (capital, demand, rival aggression, startups, events, accident risk, weather, board patience, credit costs, union militancy, fuel volatility) and switches for inflation, wage indexing and historical events.
- **Inflation** — the engine works in constant 2027 dollars while a noisy, loosely historical price level converts everything you see into the dollars of the day. Fixed nominal contracts (loans, lease rents, order balances, hedges, contract and subsidy payments) and cash erode in real terms; cash earns interest; unindexed wages erode and unions claim catch-up raises.
- **Eras** — start any year from 1960. Regional demand growth, real fare levels, fuel, interest rates, booking costs and accident rates follow history (in constant 2027 dollars). Aircraft are only orderable while in production; older types live on in lease and used markets. First-generation jets need flight engineers, Chapter 2 jets are banned in NA/EU from 2002, airframes retire at 45 years.
- **History, loosely** — oil embargoes, deregulation, wars, terror attacks, epidemics, financial crises, volcanic ash and airspace closures follow a randomised timeline: each may or may not happen, with shifted timing and severity. Historic airlines (Pan Am, TWA, Eastern, BOAC, Swissair…) rise and fall around their real dates — or survive in your timeline.
- **Workforce** — five workforces with five-step career ladders (e.g. Second Officer → First Officer → Captain → Training Captain → Chief Pilot), grade pay, tenure, retirement, promotions/demotions, supervisor and manager spans of control, captain requirements, contractor sourcing, rival poaching, unions with agreements, claims, work-to-rule/sick-outs/strikes and organising drives, and delegation to department heads under an HR policy.
- **Safety** — per-flight incident risk from reliability, overdue checks, crew experience and staffing, engineering coverage, airframe age/design and era (minor incidents about one per 20,000 flights in the 1970s, far rarer today); minor incidents, serious accidents and rare hull losses with investigations, brand damage and regulator action; hijackings tied to era and security spending; seasonal weather closures and hail/hurricane damage; airspace closures with reroutes.
- **Demand** — gravity model per airport pair (population, business/tourism mix, distance, region, domestic), split into First/Business/Premium Economy/Economy, with hemisphere-aware seasonality and holidays.
- **Competition** — real airlines fly from their real hubs (nonstop and connecting). Share is decided cabin by cabin by price elasticity, willingness-to-pay ceilings, frequency, reputation, product, punctuality, lounges, marketing and partnerships.
- **Network flow** — passengers connect over your hubs; seats are allocated leg by leg (nonstops first, connections share the rest); connecting fares are prorated by distance.
- **Fleet** — 120 types incl. freighters with range and runway limits; cabin layouts constrained by floor units and a certified passenger (exit) limit, with presets (max seats, low-cost, two/three-class, premium), fill-with-economy, fleet-wide refits and a standard layout for new orders; factory orders (1.5–5 year lead times, deposits, volume discounts, delays), operating leases, used market, sale-and-leaseback, P2F conversions, upgrades (Wi-Fi, IFE, seats, engine kits).
- **Fleet matching** — every aircraft page ranks the routes it can fly (existing and new) by estimated weekly profit from current demand, rival fares and your cost lines; every route page lists the aircraft that suit it. Auto-assign places an aircraft (or all idle ones) on the best route, buying affordable slots or flying fewer frequencies at slot-controlled airports.
- **Fleet commonality** — aircraft families (A320 family, 737, E-Jets, ATR…) share pilots, engineers and spares. Each extra family raises pilot (+5%), cabin and engineer requirements and costs $20K/week of overhead; families of 6+ aircraft get cheaper maintenance (−5%, −10% from 12), orphan types of 1–2 aircraft cost 12% more to maintain.
- **Engineering** — A/B/C/D checks by flight hours and calendar; in-house line stations and heavy hangars with bay limits vs. 12 MRO shops with price/quality/wait; regulator grounding; reliability → dispatch and on-time performance.
- **People** — five workforces sized from scheduled block hours (augmented long-haul crews, premium-cabin attendants) and a lean head office (10 + 6% of operational staff, plus hubs, brands and routes), training pipelines, regional pay, morale, attrition, unions and strikes.
- **Traffic rights & slots** — cabotage, EU single market, fifth-freedom permits, bilateral agreements; slot-controlled and congested airports with monthly slot pools.
- **Finance** — fuel price random walk and hedging, credit rating from leverage/liquidity/coverage, rating-dependent borrowing costs, quarterly tax with loss carry-forward, share price, equity raises and dividends.
- **Reactive rivals** — incumbents defend their hubs when you move in (matching your fares and adding capacity for months), match undercutting elsewhere, and retreat from routes where you beat them for a sustained period. They order era-appropriate aircraft that arrive after real lead times and open new routes (often into your markets), close routes and shrink when losing money, and join or leave alliances (Star 1997, oneworld 1999, SkyTeam 2000; one member per country).
- **Rivals** — monthly AI: finances, hostility, fare wars, capacity dumps, entry onto your profitable routes, staff poaching with better pay packages, mergers among rivals, bankruptcies, and generated startups. Buy 25% stakes (dividends + codeshare) or acquire domestic rivals outright (hubs, fleet, routes, staff); weak share prices invite hostile bids for you.
- **Events** — 23 decisions: union claims, oil shocks, recessions, pandemics, volcanic ash, hurricanes, ATC strikes, airworthiness directives, delivery delays, pilot poaching, rival collapses, alliance invitations…
- **The board** — quarterly reviews and yearly objectives. Zero confidence: fired.
- **Insolvency & Chapter 11** — eight weeks of negative cash brings creditors to the door: liquidate, or file for court protection (also available voluntarily when distressed). Debt service freezes and a DIP loan funds operations; renegotiate leases (−25% rent), reject leases without penalty, force concessionary labour contracts (with strike risk), shed routes and aircraft. Emerge after a profitable stretch with unsecured debt cut 60% and secured 30%, old shareholders wiped out and a new board — or be liquidated at the 26-week deadline. Twice per game at most; can be switched off.

## Code layout

```
src/data/     airports, aircraft & check program, rivals, business data, eras, history, land outlines
src/engine/   core (rng, calendar), market, fleet, network, maintenance, staff,
              ops (weekly flow simulation), finance, rivals, contracts, safety, events,
              advisor (autopilot), brands (subsidiaries, liveries, campaigns), regulation,
              chronicle (history), scenarios, rivalai (reactive rivals), restructuring
              (Chapter 11), tutorial, turn (weekly turn, save migration)
src/ui/       storage.js (save slots), app shell & router, map, shared components, pages/*
scripts/      serve.js, simulate.js (balance), profile.js (performance), build-land.js (map data)
test/         engine tests
```

The engine is pure and deterministic per seed; state is plain JSON (save version 7;
version-4, -5 and -6 saves migrate automatically, and a pre-slots save is adopted into a slot).

### Performance

Derived data is cached rather than saved: a per-season frequency index and route
lookup (invalidated whenever a schedule changes), one-stop itinerary geometry
(until the route or hub list changes), rival line-ups per market (until rival
state changes) and the per-rival part of competitive appeal (per turn). History
is stored compactly (6 years of weekly rows, then annual reports). On the
`npm run profile` airline (≈300 aircraft, 150 routes, 6 hubs, ~5,000 connecting
markets) a week takes ~55–90 ms in Node (down from ~3.8 s) and ~200 ms end-to-end
in the browser including render and save; the largest page renders in ≈230 ms.
Map outlines: Natural Earth 1:110m land (public domain) via world-atlas.
