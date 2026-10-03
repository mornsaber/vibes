// Long-run economic backdrop, in constant 2027 dollars. Curves are smoothed;
// sharp historical spikes come from the (randomised) history timeline instead.

const interp = (points, year) => {
  if (year <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [y1, v1] = points[i];
    const [y0, v0] = points[i - 1];
    if (year <= y1) return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
  }
  return points[points.length - 1][1];
};

// A curve with its interpolations remembered by year (they are asked for constantly).
const curve = (points) => {
  const memo = new Map();
  return (year) => {
    let v = memo.get(year);
    if (v === undefined) memo.set(year, (v = interp(points, year)));
    return v;
  };
};

const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020, 2030];
// Air travel demand by region relative to 2027 — growth shifts east over time.
const REGION_DEMAND = {
  NA: [0.22, 0.4, 0.55, 0.7, 0.85, 0.88, 0.97, 1.05],
  EU: [0.12, 0.28, 0.42, 0.58, 0.75, 0.85, 0.97, 1.05],
  AS: [0.03, 0.07, 0.15, 0.28, 0.42, 0.65, 0.95, 1.1],
  ME: [0.03, 0.07, 0.15, 0.22, 0.35, 0.6, 0.95, 1.08],
  LA: [0.08, 0.15, 0.28, 0.38, 0.5, 0.7, 0.95, 1.05],
  AF: [0.06, 0.1, 0.18, 0.25, 0.35, 0.55, 0.95, 1.08],
  OC: [0.15, 0.28, 0.42, 0.55, 0.7, 0.85, 0.97, 1.04],
};
const REGION_POINTS = Object.fromEntries(Object.entries(REGION_DEMAND).map(([r, v]) => [r, DECADES.map((d, i) => [d, v[i]])]));
const demandMemo = new Map();
export const regionDemand = (region, year) => {
  const k = `${region}${year}`;
  let v = demandMemo.get(k);
  if (v === undefined) demandMemo.set(k, (v = interp(REGION_POINTS[region], year)));
  return v;
};

// Jet fuel, USD per kg.
export const eraFuel = curve([[1960, 0.32], [1970, 0.3], [1975, 0.55], [1980, 0.85], [1986, 0.5], [1990, 0.5], [1999, 0.38], [2005, 0.65], [2010, 0.9], [2014, 0.95], [2016, 0.55], [2020, 0.5], [2023, 0.9], [2030, 0.85]]);
// Real fares were far higher before deregulation and low-cost carriers.
export const eraFare = curve([[1960, 1.9], [1970, 1.7], [1978, 1.5], [1985, 1.25], [1995, 1.12], [2005, 1.03], [2015, 1.0]]);
// Travel-agent commissions before online booking.
export const eraDistribution = curve([[1960, 0.14], [1995, 0.13], [2005, 0.1], [2012, 0.08]]);
// Central bank policy rate.
export const eraRate = curve([[1960, 0.04], [1975, 0.07], [1981, 0.14], [1990, 0.08], [2000, 0.06], [2009, 0.01], [2016, 0.01], [2023, 0.05], [2030, 0.04]]);
// Base accident rate multiplier (aviation got dramatically safer).
export const eraSafety = curve([[1960, 25], [1970, 15], [1980, 8], [1990, 5], [2000, 3], [2010, 1.5], [2020, 1]]);
// Unions were strongest in the post-war decades.
export const eraUnion = curve([[1960, 0.85], [1980, 0.7], [2000, 0.55], [2020, 0.5]]);

export const ERAS = [
  { from: 1945, name: 'Propeller age', blurb: 'Piston airliners, regulated fares, flag carriers everywhere.' },
  { from: 1958, name: 'Jet age', blurb: 'The 707 and DC-8 shrink the world. Unions are powerful, fares are high, accidents are far more common.' },
  { from: 1970, name: 'Wide-body era', blurb: 'Jumbo jets, the oil crises and Concorde. Fuel suddenly matters.' },
  { from: 1978, name: 'Deregulation', blurb: 'Fares fall, upstarts like People Express rise and fall, legacy giants stumble.' },
  { from: 1990, name: 'Globalisation & alliances', blurb: 'Twin-engine long-haul, hub empires and the first global alliances.' },
  { from: 2001, name: 'Security & the low-cost boom', blurb: 'Post-9/11 shocks, Ryanair and easyJet, the rise of the Gulf carriers.' },
  { from: 2010, name: 'Super-connectors', blurb: 'Ultra-long-haul, 787s and A350s, consolidation into mega-carriers.' },
  { from: 2020, name: 'Recovery & new tech', blurb: 'Post-pandemic rebuild, neo-generation jets, volatile fuel.' },
];
export const eraOf = (year) => [...ERAS].reverse().find((e) => year >= e.from) ?? ERAS[0];

export const START_YEARS = [1960, 1970, 1978, 1985, 1995, 2005, 2015, 2027];

// US consumer price index (annual average), used as a loose guide for the
// in-game price level. 2027 = 1.
const CPI = [[1960, 29.6], [1965, 31.5], [1970, 38.8], [1975, 53.8], [1980, 82.4], [1985, 107.6], [1990, 130.7], [1995, 152.4], [2000, 172.2], [2005, 195.3], [2010, 218.1], [2015, 237.0], [2020, 258.8], [2022, 292.7], [2024, 313.7], [2027, 336], [2040, 450]];
export const cpiIndex = (year) => interp(CPI, year) / 336;
export const histInflation = (year) => interp(CPI, year + 0.5) / interp(CPI, year - 0.5) - 1;
