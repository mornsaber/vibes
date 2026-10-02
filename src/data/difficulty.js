// Difficulty presets and individually tunable game settings.

export const PRESETS = {
  easy: { label: 'Easy', cash: 200e6, demand: 1.12, rivals: 0.6, startups: 0.5, events: 0.6, safety: 0.5, weather: 0.7, board: 1.5, credit: 0.75, labour: 0.6, fuel: 0.7 },
  normal: { label: 'Normal', cash: 120e6, demand: 1, rivals: 1, startups: 1, events: 1, safety: 1, weather: 1, board: 1, credit: 1, labour: 1, fuel: 1 },
  hard: { label: 'Hard', cash: 70e6, demand: 0.93, rivals: 1.3, startups: 1.5, events: 1.25, safety: 1.3, weather: 1.2, board: 0.8, credit: 1.3, labour: 1.3, fuel: 1.3 },
  brutal: { label: 'Brutal', cash: 40e6, demand: 0.85, rivals: 1.7, startups: 2.2, events: 1.5, safety: 1.8, weather: 1.5, board: 0.6, credit: 1.7, labour: 1.7, fuel: 1.6 },
};

// Tunable multipliers (1 = normal). `higherIsHarder` drives the colouring in the UI.
export const SETTING_DEFS = [
  { key: 'cash', label: 'Starting capital', min: 20e6, max: 400e6, step: 10e6, money: true, desc: 'Founding capital (shown in the dollars of your start year).' },
  { key: 'demand', label: 'Passenger demand', min: 0.7, max: 1.4, step: 0.05, desc: 'How many people want to fly.' },
  { key: 'rivals', label: 'Rival aggression', min: 0.3, max: 2, step: 0.1, higherIsHarder: true, desc: 'Fare wars, capacity dumps and route entries.' },
  { key: 'startups', label: 'New airlines', min: 0, max: 3, step: 0.25, higherIsHarder: true, desc: 'How often startups appear.' },
  { key: 'events', label: 'Event frequency', min: 0.3, max: 2, step: 0.1, higherIsHarder: true, desc: 'Random decisions, shocks and the historical timeline.' },
  { key: 'safety', label: 'Accident risk', min: 0, max: 3, step: 0.1, higherIsHarder: true, desc: 'Incident and accident rates (0 = off).' },
  { key: 'weather', label: 'Weather severity', min: 0, max: 2, step: 0.1, higherIsHarder: true, desc: 'Storm frequency and damage.' },
  { key: 'board', label: 'Board patience', min: 0.4, max: 2, step: 0.1, desc: 'How forgiving the board is of bad quarters.' },
  { key: 'credit', label: 'Cost of credit', min: 0.5, max: 2, step: 0.1, higherIsHarder: true, desc: 'Multiplier on lenders’ credit spreads.' },
  { key: 'labour', label: 'Union militancy', min: 0.3, max: 2, step: 0.1, higherIsHarder: true, desc: 'Size of pay claims and appetite for strikes.' },
  { key: 'fuel', label: 'Fuel volatility', min: 0.3, max: 2, step: 0.1, higherIsHarder: true, desc: 'How wildly fuel prices swing.' },
];

export const OPTION_DEFS = [
  { key: 'inflation', label: 'Inflation', options: [['historical', 'Loosely historical'], ['off', 'Off (constant 2027 dollars)']], desc: 'Prices, wages and money follow a noisy version of real-world inflation.' },
  { key: 'cola', label: 'Index wages to inflation', options: [[true, 'Yes — automatic cost-of-living rises'], [false, 'No — wages erode until unions win raises']], desc: 'Without indexing, real pay falls every year and unions demand catch-up raises.' },
  { key: 'regulation', label: 'Regulation', options: [['historical', 'Historical (treaties, ownership caps, carbon)'], ['off', 'Off (open skies everywhere, no carbon costs)']], desc: 'Bilateral air service agreements cap international flights until open-skies deals; modern-era carbon pricing and SAF mandates.' },
  { key: 'history', label: 'Historical events', options: [['loose', 'Loosely historical'], ['off', 'Off (random events only)']], desc: 'Oil crises, wars, crashes of the economy and pandemics around their real dates.' },
];

export function makeSettings(preset = 'normal', overrides = {}) {
  const base = PRESETS[preset] ?? PRESETS.normal;
  return { preset: PRESETS[preset] ? preset : 'normal', inflation: 'historical', cola: true, history: 'loose', regulation: 'historical', ...base, ...overrides };
}
