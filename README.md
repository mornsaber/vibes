# ✈ Airline Executive Simulator

A deep, turn-based airline management sim. Found an airline in any year from
1960 at one of 150 real airports, build a fleet from 80 aircraft types (DC-3 to
A350, Concorde included) with realistic production years and lead times, plan a
hub-and-spoke network, run engineering, crew, safety and finance, and fight
100+ real and generated airlines — all while the board judges you every quarter.

Runs entirely in the browser: no dependencies, no build step.

```sh
npm start        # http://localhost:8080
npm test         # engine test suite (node:test)
npm run simulate # headless balance harness (scripted strategies)
```

Saves autosave to localStorage; export/import a save file from the game menu.
Keyboard: <kbd>Space</kbd>/<kbd>W</kbd> week · <kbd>M</kbd> month · <kbd>Q</kbd> quarter · <kbd>Y</kbd> year.

## Pages

Each page is a hash route (`#routes/rt12`, `#fleet/ac/ac3`, `#engineering/schedule`, …).

| Operations | Finance & Strategy |
| --- | --- |
| **#dashboard** — Cash · Profit/wk · Load · Fleet, monthly profit, needs attention, operations, fleet by type, network, staffing, upcoming deliveries, board objectives | **#finances** — cash, net/wk, income statement, monthly results, credit rating & metrics, term loans, revolving credit, aircraft-secured loans, leases, fuel hedging, equity |
| **#routes** — route list, planner, per-route detail: cabin fares, aircraft frequencies, rivals, economics, cargo | **#management** — airline customisation, government subsidies, statistics (CASK/RASK/yield…), hubs, service standards, codeshares & alliances, staffing breakdown, cargo |
| **#planning** — hubs, fleet capacity & idle aircraft, crew plan, slots | **#competitors** — 70+ real airlines with finances, hostility and head-to-head routes |
| **#fleet** — aircraft, groups, on order, acquire (leases, used, factory orders), aircraft detail | **#cargo** — overview, network, freighter fleet & P2F conversions |
| **#map** — world map with regional zoom, airport explorer | **#charter** — sports teams, tour operators, cruise lines, pilgrimages… |
| **#engineering** — A/B/C/D check schedule, MRO facilities, outsourcing, upgrades, cabin layouts, safety & incident log | **#special** — military airlift, VIP, humanitarian, ACMI, medevac; ventures (pilot academy, third-party MRO, ground handling, simulator centre) |
| **#network** — overview, hubs, pax flow (local vs connecting O&D), route health | |
| **#markets** — market analyst, opportunity scanner, Learn guide | |

## Simulation layers

- **Eras** — start any year from 1960. Regional demand growth, real fare levels, fuel, interest rates, booking costs and accident rates follow history (in constant 2027 dollars). Aircraft are only orderable while in production; older types live on in lease and used markets. First-generation jets need flight engineers, Chapter 2 jets are banned in NA/EU from 2002, airframes retire at 45 years.
- **History, loosely** — oil embargoes, deregulation, wars, terror attacks, epidemics, financial crises, volcanic ash and airspace closures follow a randomised timeline: each may or may not happen, with shifted timing and severity. Historic airlines (Pan Am, TWA, Eastern, BOAC, Swissair…) rise and fall around their real dates — or survive in your timeline.
- **Workforce** — five workforces with five-step career ladders (e.g. Second Officer → First Officer → Captain → Training Captain → Chief Pilot), grade pay, tenure, retirement, promotions/demotions, supervisor and manager spans of control, captain requirements, contractor sourcing, rival poaching, unions with agreements, claims, work-to-rule/sick-outs/strikes and organising drives, and delegation to department heads under an HR policy.
- **Safety** — per-flight incident risk from reliability, overdue checks, crew experience and staffing, engineering coverage, airframe age/design and era; minor incidents, serious accidents and rare hull losses with investigations, brand damage and regulator action; hijackings tied to era and security spending; seasonal weather closures and hail/hurricane damage; airspace closures with reroutes.
- **Demand** — gravity model per airport pair (population, business/tourism mix, distance, region, domestic), split into First/Business/Premium Economy/Economy, with hemisphere-aware seasonality and holidays.
- **Competition** — real airlines fly from their real hubs (nonstop and connecting). Share is decided cabin by cabin by price elasticity, willingness-to-pay ceilings, frequency, reputation, product, punctuality, lounges, marketing and partnerships.
- **Network flow** — passengers connect over your hubs; seats are allocated leg by leg (nonstops first, connections share the rest); connecting fares are prorated by distance.
- **Fleet** — 32 types incl. freighters; cabin layouts constrained by floor units; factory orders (1.5–5 year lead times, deposits, volume discounts, delays), operating leases, used market, sale-and-leaseback, P2F conversions, upgrades (Wi-Fi, IFE, seats, engine kits).
- **Engineering** — A/B/C/D checks by flight hours and calendar; in-house line stations and heavy hangars with bay limits vs. 12 MRO shops with price/quality/wait; regulator grounding; reliability → dispatch and on-time performance.
- **People** — five workforces sized from scheduled block hours (augmented long-haul crews, premium-cabin attendants), training pipelines, regional pay, morale, attrition, unions and strikes.
- **Traffic rights & slots** — cabotage, EU single market, fifth-freedom permits; slot-controlled and congested airports with monthly slot pools.
- **Finance** — fuel price random walk and hedging, credit rating from leverage/liquidity/coverage, rating-dependent borrowing costs, quarterly tax with loss carry-forward, share price, equity raises and dividends.
- **Rivals** — monthly AI: finances, hostility, fare wars, capacity dumps, entry onto your profitable routes, staff poaching with better pay packages, mergers among rivals, bankruptcies, and generated startups. Buy 25% stakes (dividends + codeshare) or acquire domestic rivals outright (hubs, fleet, routes, staff); weak share prices invite hostile bids for you.
- **Events** — 23 decisions: union claims, oil shocks, recessions, pandemics, volcanic ash, hurricanes, ATC strikes, airworthiness directives, delivery delays, pilot poaching, rival collapses, alliance invitations…
- **The board** — quarterly reviews and yearly objectives. Zero confidence: fired. Eight weeks of negative cash: administration.

## Code layout

```
src/data/     airports, aircraft & check program, rivals, business data, eras, history, land outlines
src/engine/   core (rng, calendar), market, fleet, network, maintenance, staff,
              ops (weekly flow simulation), finance, rivals, contracts, safety, events, turn
src/ui/       app shell & router, map, shared components, pages/*
scripts/      serve.js, simulate.js (balance), build-land.js (map data)
test/         engine tests
```

The engine is pure and deterministic per seed; state is plain JSON.
Map outlines: Natural Earth 1:110m land (public domain) via world-atlas.
