// Aircraft types, cabin rules, maintenance programs and retrofit options.
//
// maxSeats   exit limit in all-economy seats ("Y units"); a cabin layout must fit
//            within it, with premium seats consuming several units (see CABIN).
// burn       kg of fuel per km at typical load
// cargoT     tonnes of cargo (belly hold for passenger types, main deck for freighters)
// runway     minimum runway length in metres at typical takeoff weight
// lead       weeks from order to delivery for a new build (null = out of production)
// mx         maintenance class driving check costs/durations (see CHECKS)

export const AIRCRAFT = [
  // Turboprops
  { id: 'atr72', name: 'ATR 72-600', maker: 'ATR', cat: 'turboprop', maxSeats: 78, config: { F: 0, J: 0, W: 0, Y: 72 }, range: 1500, speed: 510, burn: 0.85, price: 27e6, cargoT: 1, runway: 1400, lead: 78, mx: 'small' },
  { id: 'q400', name: 'Dash 8-400', maker: 'De Havilland', cat: 'turboprop', maxSeats: 90, config: { F: 0, J: 0, W: 0, Y: 78 }, range: 2000, speed: 667, burn: 1.2, price: 33e6, cargoT: 1, runway: 1400, lead: 104, mx: 'small' },
  // Regional jets
  { id: 'crj9', name: 'CRJ900', maker: 'Bombardier', cat: 'regional', maxSeats: 90, config: { F: 0, J: 12, W: 0, Y: 64 }, range: 2900, speed: 830, burn: 1.9, price: 25e6, cargoT: 1.2, runway: 1900, lead: null, mx: 'small' },
  { id: 'e175', name: 'Embraer E175', maker: 'Embraer', cat: 'regional', maxSeats: 88, config: { F: 0, J: 12, W: 0, Y: 64 }, range: 3700, speed: 780, burn: 1.9, price: 32e6, cargoT: 1.5, runway: 1800, lead: 91, mx: 'small' },
  { id: 'e195e2', name: 'Embraer E195-E2', maker: 'Embraer', cat: 'regional', maxSeats: 146, config: { F: 0, J: 12, W: 0, Y: 118 }, range: 4800, speed: 830, burn: 2.1, price: 60e6, cargoT: 2, runway: 2000, lead: 117, mx: 'small' },
  // Narrowbodies
  { id: 'a221', name: 'Airbus A220-100', maker: 'Airbus', cat: 'narrow', maxSeats: 135, config: { F: 0, J: 12, W: 0, Y: 96 }, range: 6300, speed: 830, burn: 2.0, price: 38e6, cargoT: 2, runway: 1500, lead: 104, mx: 'narrow' },
  { id: 'a223', name: 'Airbus A220-300', maker: 'Airbus', cat: 'narrow', maxSeats: 160, config: { F: 0, J: 12, W: 0, Y: 120 }, range: 6300, speed: 830, burn: 2.3, price: 45e6, cargoT: 2.5, runway: 1900, lead: 117, mx: 'narrow' },
  { id: 'a319n', name: 'Airbus A319neo', maker: 'Airbus', cat: 'narrow', maxSeats: 160, config: { F: 0, J: 12, W: 0, Y: 120 }, range: 6900, speed: 830, burn: 2.4, price: 50e6, cargoT: 3, runway: 2000, lead: 104, mx: 'narrow' },
  { id: 'a320n', name: 'Airbus A320neo', maker: 'Airbus', cat: 'narrow', maxSeats: 194, config: { F: 0, J: 12, W: 0, Y: 150 }, range: 6300, speed: 830, burn: 2.6, price: 55e6, cargoT: 3.5, runway: 2100, lead: 156, mx: 'narrow' },
  { id: 'a321n', name: 'Airbus A321neo', maker: 'Airbus', cat: 'narrow', maxSeats: 244, config: { F: 0, J: 16, W: 0, Y: 180 }, range: 7400, speed: 830, burn: 2.9, price: 64e6, cargoT: 4.5, runway: 2300, lead: 208, mx: 'narrow' },
  { id: 'a321xlr', name: 'Airbus A321XLR', maker: 'Airbus', cat: 'narrow', maxSeats: 244, config: { F: 0, J: 14, W: 0, Y: 168 }, range: 8700, speed: 830, burn: 3.0, price: 72e6, cargoT: 3, runway: 2400, lead: 208, mx: 'narrow' },
  { id: 'b38m', name: 'Boeing 737-8', maker: 'Boeing', cat: 'narrow', maxSeats: 189, config: { F: 0, J: 12, W: 0, Y: 150 }, range: 6500, speed: 840, burn: 2.65, price: 52e6, cargoT: 3.5, runway: 2300, lead: 130, mx: 'narrow' },
  { id: 'b3xm', name: 'Boeing 737-10', maker: 'Boeing', cat: 'narrow', maxSeats: 230, config: { F: 0, J: 16, W: 0, Y: 170 }, range: 5700, speed: 840, burn: 2.85, price: 60e6, cargoT: 4, runway: 2500, lead: 156, mx: 'narrow' },
  // Widebodies
  { id: 'a339', name: 'Airbus A330-900', maker: 'Airbus', cat: 'wide', maxSeats: 440, config: { F: 0, J: 30, W: 21, Y: 224 }, range: 13300, speed: 870, burn: 6.2, price: 125e6, cargoT: 18, runway: 2800, lead: 104, mx: 'wide' },
  { id: 'b788', name: 'Boeing 787-8', maker: 'Boeing', cat: 'wide', maxSeats: 359, config: { F: 0, J: 28, W: 21, Y: 180 }, range: 13600, speed: 900, burn: 5.9, price: 120e6, cargoT: 15, runway: 2700, lead: 156, mx: 'wide' },
  { id: 'b789', name: 'Boeing 787-9', maker: 'Boeing', cat: 'wide', maxSeats: 420, config: { F: 0, J: 30, W: 28, Y: 216 }, range: 14000, speed: 900, burn: 6.6, price: 145e6, cargoT: 18, runway: 2800, lead: 156, mx: 'wide' },
  { id: 'b78x', name: 'Boeing 787-10', maker: 'Boeing', cat: 'wide', maxSeats: 440, config: { F: 0, J: 32, W: 24, Y: 260 }, range: 11900, speed: 900, burn: 7.0, price: 160e6, cargoT: 22, runway: 2900, lead: 156, mx: 'wide' },
  { id: 'a359', name: 'Airbus A350-900', maker: 'Airbus', cat: 'wide', maxSeats: 440, config: { F: 0, J: 36, W: 24, Y: 240 }, range: 15000, speed: 900, burn: 7.2, price: 160e6, cargoT: 20, runway: 2700, lead: 130, mx: 'wide' },
  { id: 'a35k', name: 'Airbus A350-1000', maker: 'Airbus', cat: 'wide', maxSeats: 480, config: { F: 0, J: 40, W: 28, Y: 280 }, range: 16100, speed: 900, burn: 8.1, price: 185e6, cargoT: 24, runway: 2900, lead: 156, mx: 'wide' },
  { id: 'b77w', name: 'Boeing 777-300ER', maker: 'Boeing', cat: 'wide', maxSeats: 550, config: { F: 8, J: 42, W: 28, Y: 300 }, range: 13600, speed: 900, burn: 9.2, price: 160e6, cargoT: 25, runway: 3000, lead: null, mx: 'wide' },
  { id: 'b779', name: 'Boeing 777-9', maker: 'Boeing', cat: 'wide', maxSeats: 520, config: { F: 0, J: 48, W: 28, Y: 300 }, range: 13500, speed: 905, burn: 9.4, price: 210e6, cargoT: 25, runway: 3000, lead: 260, mx: 'wide' },
  { id: 'b748', name: 'Boeing 747-8', maker: 'Boeing', cat: 'jumbo', maxSeats: 605, config: { F: 8, J: 70, W: 32, Y: 250 }, range: 14300, speed: 910, burn: 11.5, price: 200e6, cargoT: 20, runway: 3100, lead: null, mx: 'jumbo' },
  { id: 'a388', name: 'Airbus A380-800', maker: 'Airbus', cat: 'jumbo', maxSeats: 853, config: { F: 14, J: 76, W: 44, Y: 420 }, range: 14800, speed: 900, burn: 13.5, price: 180e6, cargoT: 15, runway: 3000, lead: null, mx: 'jumbo' },
  // Freighters
  { id: 'atr72f', name: 'ATR 72-600F', maker: 'ATR', cat: 'freighter', maxSeats: 0, config: { F: 0, J: 0, W: 0, Y: 0 }, range: 1500, speed: 510, burn: 0.9, price: 30e6, cargoT: 8.6, runway: 1400, lead: 104, mx: 'small' },
  { id: 'b738f', name: 'Boeing 737-800BCF', maker: 'Boeing', cat: 'freighter', maxSeats: 0, config: { F: 0, J: 0, W: 0, Y: 0 }, range: 3700, speed: 840, burn: 2.7, price: 22e6, cargoT: 23, runway: 2300, lead: 26, mx: 'narrow' },
  { id: 'a321f', name: 'Airbus A321P2F', maker: 'Airbus', cat: 'freighter', maxSeats: 0, config: { F: 0, J: 0, W: 0, Y: 0 }, range: 3700, speed: 830, burn: 2.9, price: 30e6, cargoT: 28, runway: 2300, lead: null, mx: 'narrow' },
  { id: 'b763f', name: 'Boeing 767-300F', maker: 'Boeing', cat: 'freighter', maxSeats: 0, config: { F: 0, J: 0, W: 0, Y: 0 }, range: 6000, speed: 850, burn: 5.5, price: 110e6, cargoT: 52, runway: 2800, lead: 78, mx: 'wide' },
  { id: 'a332f', name: 'Airbus A330-200F', maker: 'Airbus', cat: 'freighter', maxSeats: 0, config: { F: 0, J: 0, W: 0, Y: 0 }, range: 7400, speed: 870, burn: 6.0, price: 120e6, cargoT: 65, runway: 2800, lead: null, mx: 'wide' },
  { id: 'b77f', name: 'Boeing 777F', maker: 'Boeing', cat: 'freighter', maxSeats: 0, config: { F: 0, J: 0, W: 0, Y: 0 }, range: 9000, speed: 900, burn: 9.5, price: 190e6, cargoT: 102, runway: 3000, lead: 104, mx: 'wide' },
  { id: 'b77wsf', name: 'Boeing 777-300ERSF', maker: 'Boeing', cat: 'freighter', maxSeats: 0, config: { F: 0, J: 0, W: 0, Y: 0 }, range: 7400, speed: 900, burn: 9.3, price: 110e6, cargoT: 101, runway: 3000, lead: null, mx: 'wide' },
  { id: 'a350f', name: 'Airbus A350F', maker: 'Airbus', cat: 'freighter', maxSeats: 0, config: { F: 0, J: 0, W: 0, Y: 0 }, range: 8700, speed: 900, burn: 8.6, price: 220e6, cargoT: 109, runway: 3000, lead: 182, mx: 'wide' },
  { id: 'b748f', name: 'Boeing 747-8F', maker: 'Boeing', cat: 'freighter', maxSeats: 0, config: { F: 0, J: 0, W: 0, Y: 0 }, range: 8100, speed: 910, burn: 11.8, price: 220e6, cargoT: 134, runway: 3100, lead: null, mx: 'jumbo' },
];

export const aircraftById = Object.fromEntries(AIRCRAFT.map((a) => [a.id, a]));

export const CATEGORY_LABELS = {
  turboprop: 'Turboprop', regional: 'Regional jet', narrow: 'Narrowbody', wide: 'Widebody', jumbo: 'Very large', freighter: 'Freighter',
};

// Cabin classes. `units` is how many economy-seat equivalents one seat takes,
// which depends on the aircraft category (a narrowbody "business" seat is a
// recliner, a widebody one is a lie-flat bed).
export const CABIN = {
  F: { name: 'First', short: 'F', fare: 7.0, units: { turboprop: 6, regional: 6, narrow: 6, wide: 6, jumbo: 6 } },
  J: { name: 'Business', short: 'J', fare: 3.2, units: { turboprop: 1.5, regional: 1.5, narrow: 2, wide: 3.5, jumbo: 3.5 } },
  W: { name: 'Premium Economy', short: 'W', fare: 1.7, units: { turboprop: 1.3, regional: 1.3, narrow: 1.3, wide: 1.5, jumbo: 1.5 } },
  Y: { name: 'Economy', short: 'Y', fare: 1.0, units: { turboprop: 1, regional: 1, narrow: 1, wide: 1, jumbo: 1 } },
};
export const CLASSES = ['F', 'J', 'W', 'Y'];

// Long-haul business class sells at a bigger premium than short-haul recliners.
export function classFareMultiplier(cls, distance) {
  if (cls === 'J') return distance > 3000 ? 4.2 : 2.4;
  if (cls === 'F') return distance > 3000 ? 7.5 : 4;
  return CABIN[cls].fare;
}

export function cabinUnits(type, config) {
  if (type.cat === 'freighter') return 0;
  return CLASSES.reduce((s, c) => s + (config[c] || 0) * CABIN[c].units[type.cat], 0);
}

export function seatCount(config) {
  return CLASSES.reduce((s, c) => s + (config[c] || 0), 0);
}

// Maintenance check program. Intervals are in flight hours (fh) and/or weeks;
// whichever comes first. Durations in days; cost in USD by maintenance class.
export const CHECKS = {
  A: { name: 'A-check', fh: 750, weeks: 12, days: { small: 0.5, narrow: 0.5, wide: 1, jumbo: 1 }, cost: { small: 12e3, narrow: 25e3, wide: 60e3, jumbo: 90e3 } },
  B: { name: 'B-check', fh: null, weeks: 26, days: { small: 1, narrow: 1, wide: 2, jumbo: 3 }, cost: { small: 35e3, narrow: 70e3, wide: 160e3, jumbo: 240e3 } },
  C: { name: 'C-check', fh: 7500, weeks: 104, days: { small: 10, narrow: 14, wide: 21, jumbo: 28 }, cost: { small: 250e3, narrow: 500e3, wide: 1.4e6, jumbo: 2.2e6 } },
  D: { name: 'D-check', fh: null, weeks: 312, days: { small: 28, narrow: 35, wide: 49, jumbo: 63 }, cost: { small: 1.5e6, narrow: 3e6, wide: 7e6, jumbo: 11e6 } },
};
export const CHECK_ORDER = ['A', 'B', 'C', 'D'];

// Retrofits and modifications. `days` is aircraft downtime.
export const UPGRADES = {
  wifi: { name: 'Satellite Wi-Fi', desc: 'Connectivity lifts product quality and earns ancillary revenue.', cost: { small: 0.4e6, narrow: 0.6e6, wide: 1.2e6, jumbo: 1.5e6 }, days: 5, quality: 0.04, ancillary: 0.015 },
  ife: { name: 'Seatback IFE', desc: 'Personal screens at every seat. Valued on long flights.', cost: { small: 0.6e6, narrow: 1.5e6, wide: 3.5e6, jumbo: 5e6 }, days: 10, quality: 0.05, longHaulOnly: true },
  seats: { name: 'New-generation seats', desc: 'Modern slimline economy and refreshed premium seats.', cost: { small: 0.8e6, narrow: 2e6, wide: 6e6, jumbo: 9e6 }, days: 14, quality: 0.06 },
  pip: { name: 'Engine performance kit', desc: 'Upgraded engine parts cut fuel burn by 2.5%.', cost: { small: 0.5e6, narrow: 1.5e6, wide: 3.5e6, jumbo: 5e6 }, days: 7, fuel: -0.025 },
  aero: { name: 'Aerodynamic package', desc: 'Drag-reducing tweaks cut fuel burn by 1.5%.', cost: { small: 0.2e6, narrow: 0.6e6, wide: 1.5e6, jumbo: 2e6 }, days: 4, fuel: -0.015 },
};

// Passenger-to-freighter conversions available for older airframes.
export const CONVERSIONS = {
  a321n: { to: 'a321f', minAgeYears: 10, cost: 6e6, days: 90 },
  b77w: { to: 'b77wsf', minAgeYears: 12, cost: 38e6, days: 150 },
  b763f: null,
};

export const MRO_PROVIDERS = [
  { id: 'lht', name: 'Lufthansa Technik', region: 'EU', quality: 1.2, price: 1.25, wait: 2 },
  { id: 'afi', name: 'AFI KLM E&M', region: 'EU', quality: 1.15, price: 1.2, wait: 3 },
  { id: 'tt', name: 'Turkish Technic', region: 'EU', quality: 1.0, price: 0.85, wait: 3 },
  { id: 'dto', name: 'Delta TechOps', region: 'NA', quality: 1.15, price: 1.15, wait: 3 },
  { id: 'aar', name: 'AAR Corp', region: 'NA', quality: 1.0, price: 1.0, wait: 2 },
  { id: 'ste', name: 'ST Engineering', region: 'AS', quality: 1.05, price: 0.95, wait: 3 },
  { id: 'haeco', name: 'HAECO', region: 'AS', quality: 1.1, price: 1.05, wait: 4 },
  { id: 'gameco', name: 'GAMECO', region: 'AS', quality: 0.95, price: 0.75, wait: 5 },
  { id: 'joramco', name: 'Joramco', region: 'ME', quality: 0.95, price: 0.8, wait: 3 },
  { id: 'etmro', name: 'Ethiopian MRO', region: 'AF', quality: 0.9, price: 0.7, wait: 4 },
  { id: 'lhtp', name: 'Lufthansa Technik Philippines', region: 'AS', quality: 1.05, price: 0.85, wait: 4 },
  { id: 'aeroman', name: 'Aeroman', region: 'LA', quality: 0.95, price: 0.75, wait: 3 },
];
export const mroById = Object.fromEntries(MRO_PROVIDERS.map((m) => [m.id, m]));

// Hangar facilities you can build at a hub.
export const FACILITIES = {
  line: { name: 'Line maintenance station', desc: 'Do A and B checks in-house at this hub.', cost: 4e6, weeks: 8, checks: ['A', 'B'], bays: 4, engineers: 30 },
  narrowHangar: { name: 'Narrowbody heavy hangar', desc: 'In-house C and D checks for regional and narrowbody aircraft.', cost: 28e6, weeks: 39, checks: ['C', 'D'], classes: ['small', 'narrow'], bays: 3, engineers: 120 },
  wideHangar: { name: 'Widebody heavy hangar', desc: 'In-house C and D checks for every aircraft size.', cost: 65e6, weeks: 52, checks: ['C', 'D'], classes: ['small', 'narrow', 'wide', 'jumbo'], bays: 2, engineers: 200 },
};
