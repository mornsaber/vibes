// A loosely historical timeline. Each entry fires with probability `p`, with
// its timing jittered by up to `jitter` months and its severity varied, so no
// two games play out the same — history rhymes rather than repeats.

export const HISTORY = [
  { year: 1973, month: 10, id: 'oil_embargo', p: 0.8, jitter: 8 },
  { year: 1978, month: 10, id: 'deregulation', p: 0.9, jitter: 6 },
  { year: 1979, month: 6, id: 'oil_revolution', p: 0.7, jitter: 10 },
  { year: 1981, month: 8, id: 'atc_walkout', p: 0.6, jitter: 12 },
  { year: 1988, month: 12, id: 'security_mandate', p: 0.6, jitter: 18 },
  { year: 1990, month: 8, id: 'gulf_war', p: 0.7, jitter: 12 },
  { year: 1997, month: 7, id: 'asian_crisis', p: 0.6, jitter: 12 },
  { year: 2001, month: 9, id: 'terror_attacks', p: 0.75, jitter: 12 },
  { year: 2003, month: 3, id: 'sars', p: 0.65, jitter: 12 },
  { year: 2008, month: 7, id: 'oil_spike', p: 0.7, jitter: 8 },
  { year: 2008, month: 10, id: 'financial_crisis', p: 0.75, jitter: 8 },
  { year: 2010, month: 4, id: 'volcano', p: 0.6, jitter: 24 },
  { year: 2011, month: 3, id: 'tsunami', p: 0.5, jitter: 24 },
  { year: 2014, month: 7, id: 'airspace_east', p: 0.5, jitter: 24 },
  { year: 2020, month: 3, id: 'pandemic', p: 0.7, jitter: 18 },
  { year: 2022, month: 2, id: 'airspace_russia', p: 0.7, jitter: 18 },
];

// Airspace regions that can be closed (bounding boxes, degrees).
export const AIRSPACE = {
  'Middle East': { lat: [12, 38], lon: [34, 62], codes: ['DXB', 'AUH', 'DOH', 'RUH', 'JED', 'TLV', 'AMM'] },
  'Eastern Europe': { lat: [44, 56], lon: [22, 40], codes: [] },
  Russia: { lat: [45, 78], lon: [30, 180], codes: [] },
  'South Asia': { lat: [23, 37], lon: [60, 78], codes: [] },
  'East Asia': { lat: [20, 42], lon: [118, 132], codes: ['TPE', 'ICN', 'CJU'] },
};

// Weather hazards by airport characteristics. p = weekly chance in season.
export const WEATHER = [
  { id: 'snow', name: 'Snowstorm', months: [12, 1, 2], p: 0.035, days: [1, 3], damage: 0.05, match: (a) => Math.abs(a.lat) > 38 && a.region !== 'OC' },
  { id: 'hurricane', name: 'Hurricane', months: [8, 9, 10], p: 0.03, days: [2, 5], damage: 0.35, match: (a) => ['MIA', 'MCO', 'TPA', 'SJU', 'CUN', 'IAH', 'EYW'].includes(a.code) },
  { id: 'typhoon', name: 'Typhoon', months: [7, 8, 9, 10], p: 0.035, days: [1, 3], damage: 0.25, match: (a) => ['HKG', 'MNL', 'TPE', 'OKA', 'CAN', 'SZX', 'HND', 'NRT', 'KIX', 'FUK', 'CJU', 'SGN', 'HAN'].includes(a.code) },
  { id: 'cyclone', name: 'Tropical cyclone', months: [1, 2, 3], p: 0.03, days: [1, 3], damage: 0.25, match: (a) => ['CNS', 'BNE', 'NAN', 'MRU', 'PER'].includes(a.code) },
  { id: 'monsoon', name: 'Monsoon flooding', months: [6, 7, 8, 9], p: 0.04, days: [1, 2], damage: 0.05, match: (a) => ['IN', 'LK', 'NP'].includes(a.country) },
  { id: 'fog', name: 'Freezing fog', months: [11, 12, 1, 2], p: 0.04, days: [1, 1], damage: 0, match: (a) => ['LHR', 'LGW', 'AMS', 'FRA', 'DEL', 'MAN', 'MUC', 'BRU', 'CDG'].includes(a.code) },
  { id: 'sand', name: 'Sandstorm', months: [3, 4, 5, 6], p: 0.03, days: [1, 1], damage: 0.03, match: (a) => a.region === 'ME' },
  { id: 'hail', name: 'Severe hailstorm', months: [5, 6, 7], p: 0.02, days: [1, 1], damage: 0.4, match: (a) => ['DEN', 'DFW', 'MEM', 'ORD', 'MSP', 'JNB'].includes(a.code) },
  { id: 'ash', name: 'Volcanic ash', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], p: 0.002, days: [2, 6], damage: 0.1, match: (a) => ['KEF', 'CGK', 'DPS', 'MNL', 'NRT', 'HND', 'ANC', 'MEX', 'NAP', 'CTS', 'AKL', 'FAI'].includes(a.code) },
];
