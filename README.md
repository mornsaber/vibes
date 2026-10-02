# ✈️ Airline Executive Simulator

You've just been named CEO of a startup airline. Pick a hub, build a route
network, lease or buy aircraft, set fares, and steer the company through fuel
shocks, union disputes, recessions and rival carriers — all while keeping the
board of directors on side.

Runs entirely in the browser with no dependencies or build step.

## Play

```sh
npm start        # serves the game at http://localhost:8080
```

(Any static file server works — the game is just `index.html`, `styles.css`
and the ES modules in `src/`. It needs to be served over HTTP rather than opened
as a `file://` URL because browsers block module imports from disk.)

Your game autosaves to the browser's local storage after every action.
Keyboard: <kbd>Space</kbd> advances one week, <kbd>Shift</kbd>+<kbd>Space</kbd> advances four.

## How the game works

Each turn is one week.

- **Network** – open routes from any airport you already serve. Demand follows a
  gravity model (population, business and tourism appeal, distance), with
  summer seasonality. Each route has rival airlines; your share depends on fare,
  frequency, reputation, service level and marketing.
- **Fleet** – eight real-world aircraft types from the ATR 72 to the 777-300ER,
  each with its own seats, range, fuel burn and operating costs. Lease (cheap
  to start, weekly rent) or buy (big upfront cost, no rent, resale value).
  Aircraft wear out; heavy checks restore them but ground them for two weeks.
  Worn fleets cause incidents and hurt reputation.
- **Finance** – a weekly income statement (fuel, crew, maintenance, airport
  fees, service, distribution, leases, marketing, overhead, interest,
  depreciation), balance sheet and bank loans whose rates rise with leverage.
- **Strategy** – marketing budget, onboard service level, and crew pay. Pay
  drives morale; low morale damages reputation and can trigger strikes.
- **Events** – random decisions: union demands, oil shocks, celebrity
  endorsements, distressed aircraft sales, data breaches, recessions and more.
- **The board** reviews you every quarter on profit and share price. If its
  confidence hits zero you're fired. Six consecutive weeks of negative cash
  means bankruptcy.

## Development

```sh
npm test          # engine unit tests (node:test, no dependencies)
npm run simulate  # headless balance check: plays scripted strategies for 2 years
```

| Path | Purpose |
| --- | --- |
| `src/data.js` | Airports and aircraft types |
| `src/engine.js` | Pure simulation: demand, costs, weekly turn, player actions |
| `src/events.js` | Random events and their choices |
| `src/ui.js` | Browser UI (renders from state, no framework) |
| `scripts/serve.js` | Tiny static server for `npm start` |
| `scripts/simulate.js` | Balance-testing harness |

The engine is deterministic for a given seed and its state is plain JSON, so
saves, tests and balance runs all replay exactly.
