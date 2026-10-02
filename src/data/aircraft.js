// Aircraft types, cabin rules, maintenance programs and retrofit options.
//
// maxSeats   exit limit in all-economy seats ("Y units"); a cabin layout must fit
//            within it, with premium seats consuming several units (see CABIN).
// burn       kg of fuel per km at typical load
// cargoT     tonnes of cargo (belly hold for passenger types, main deck for freighters)
// runway     minimum runway length in metres at typical takeoff weight
// lead       weeks from order to delivery for a new build
// mx         maintenance class driving check costs/durations (see CHECKS)

// Compact constructor: config is written like 'J12 Y150'.
function A(id, name, maker, cat, maxSeats, cfg, range, speed, burn, price, cargoT, runway, lead, mx, intro, out = null, extra = {}) {
  const config = { F: 0, J: 0, W: 0, Y: 0 };
  for (const part of cfg.split(' ').filter(Boolean)) config[part[0]] = Number(part.slice(1));
  return { id, name, maker, cat, maxSeats, config, range, speed, burn, price, cargoT, runway, lead, mx, intro, out, ...extra };
}
const FE = { fe: true }; // three-person cockpit with a flight engineer
const LOUD = { noise: 2 }; // Chapter 2 noise category: banned in NA/EU from 2002
const FE_LOUD = { fe: true, noise: 2 };

// intro = first delivery year; out = last production year (null = still built).
// Prices are in constant 2027 dollars.
export const AIRCRAFT = [
  // Piston & early turboprop era
  A('dc3', 'Douglas DC-3', 'Douglas', 'prop', 32, 'Y28', 2400, 290, 0.55, 3e6, 1, 1100, 52, 'small', 1936, 1946),
  A('dc6', 'Douglas DC-6B', 'Douglas', 'prop', 102, 'J24 Y60', 4800, 500, 2.3, 18e6, 3, 1800, 52, 'narrow', 1951, 1958, FE),
  A('l1049', 'Lockheed Super Constellation', 'Lockheed', 'prop', 99, 'J20 Y64', 7500, 530, 2.8, 22e6, 4, 2000, 52, 'narrow', 1951, 1958, FE),
  A('dc7c', 'Douglas DC-7C', 'Douglas', 'prop', 105, 'J24 Y62', 7400, 550, 3.0, 24e6, 4, 2000, 52, 'narrow', 1956, 1958, FE),
  A('vc8', 'Vickers Viscount 800', 'Vickers', 'turboprop', 71, 'Y65', 2200, 520, 1.3, 14e6, 1.5, 1500, 52, 'small', 1957, 1964),
  A('l188', 'Lockheed L-188 Electra', 'Lockheed', 'turboprop', 98, 'J16 Y68', 3500, 600, 2.2, 20e6, 3, 1700, 52, 'narrow', 1959, 1961, FE),
  A('f27', 'Fokker F27 Friendship', 'Fokker', 'turboprop', 52, 'Y44', 1900, 460, 0.9, 12e6, 1, 1200, 52, 'small', 1958, 1987),
  A('saab340', 'Saab 340B', 'Saab', 'turboprop', 36, 'Y34', 1700, 500, 0.55, 10e6, 0.5, 1200, 52, 'small', 1984, 1999),
  A('atr725', 'ATR 72-500', 'ATR', 'turboprop', 74, 'Y68', 1500, 510, 0.9, 22e6, 1, 1400, 65, 'small', 1997, 2011),
  // First-generation jets
  A('comet4', 'de Havilland Comet 4', 'de Havilland', 'narrow', 81, 'J16 Y48', 5200, 800, 4.2, 30e6, 2, 2200, 78, 'narrow', 1958, 1964, FE_LOUD),
  A('caravelle', 'Sud Aviation Caravelle', 'Sud Aviation', 'narrow', 99, 'J16 Y64', 2300, 780, 3.2, 25e6, 2, 2000, 78, 'narrow', 1959, 1972, FE_LOUD),
  A('b707', 'Boeing 707-320B', 'Boeing', 'narrow', 189, 'J28 Y120', 9900, 970, 6.8, 60e6, 8, 3000, 104, 'narrow', 1962, 1979, FE_LOUD),
  A('dc8', 'Douglas DC-8-63', 'Douglas', 'narrow', 259, 'J24 Y190', 7600, 950, 7.4, 65e6, 10, 3100, 104, 'narrow', 1967, 1972, FE_LOUD),
  A('b727', 'Boeing 727-200', 'Boeing', 'narrow', 189, 'J12 Y140', 4000, 920, 5.2, 45e6, 4, 2300, 91, 'narrow', 1964, 1984, FE_LOUD),
  A('dc9', 'Douglas DC-9-30', 'Douglas', 'narrow', 127, 'J12 Y95', 2800, 850, 3.4, 35e6, 2.5, 1900, 78, 'narrow', 1967, 1982, LOUD),
  A('bac111', 'BAC One-Eleven 500', 'BAC', 'narrow', 119, 'J12 Y85', 2400, 780, 3.0, 30e6, 2, 1900, 78, 'narrow', 1968, 1982, LOUD),
  A('b732', 'Boeing 737-200', 'Boeing', 'narrow', 136, 'J12 Y100', 3500, 780, 3.1, 34e6, 2.5, 1800, 78, 'narrow', 1968, 1988, LOUD),
  // Wide-body & supersonic era
  A('b741', 'Boeing 747-100', 'Boeing', 'jumbo', 550, 'F12 J32 Y340', 9100, 900, 14.0, 160e6, 20, 3300, 130, 'jumbo', 1970, 1976, FE),
  A('b742', 'Boeing 747-200B', 'Boeing', 'jumbo', 550, 'F12 J32 Y340', 12700, 900, 13.5, 170e6, 22, 3300, 130, 'jumbo', 1971, 1991, FE),
  A('dc10', 'McDonnell Douglas DC-10-30', 'McDonnell Douglas', 'wide', 380, 'J36 Y240', 10000, 900, 9.6, 110e6, 18, 3000, 104, 'wide', 1972, 1989, FE),
  A('l1011', 'Lockheed L-1011 TriStar', 'Lockheed', 'wide', 400, 'J32 Y250', 9900, 900, 9.2, 110e6, 16, 2800, 104, 'wide', 1972, 1984, FE),
  A('concorde', 'Concorde', 'Aérospatiale/BAC', 'sst', 128, 'J100', 7200, 2140, 11.7, 250e6, 1, 3300, 156, 'wide', 1976, 1979, FE_LOUD),
  A('a300', 'Airbus A300B4', 'Airbus', 'wide', 345, 'J26 Y220', 5400, 850, 7.0, 90e6, 18, 2600, 104, 'wide', 1974, 1984, FE),
  A('a306', 'Airbus A300-600R', 'Airbus', 'wide', 345, 'J26 Y220', 7500, 860, 6.6, 95e6, 20, 2500, 104, 'wide', 1988, 2007),
  // Two-crew generation
  A('b752', 'Boeing 757-200', 'Boeing', 'narrow', 239, 'J16 Y180', 7200, 850, 3.6, 70e6, 6, 2100, 104, 'narrow', 1983, 2004),
  A('b763', 'Boeing 767-300ER', 'Boeing', 'wide', 351, 'J30 Y200', 11000, 850, 5.8, 100e6, 15, 2600, 104, 'wide', 1988, 2014),
  A('md80', 'McDonnell Douglas MD-82', 'McDonnell Douglas', 'narrow', 172, 'J14 Y135', 3800, 810, 3.4, 40e6, 3, 2200, 91, 'narrow', 1981, 1999),
  A('b733', 'Boeing 737-300', 'Boeing', 'narrow', 149, 'J12 Y120', 4200, 800, 2.85, 40e6, 3, 2000, 91, 'narrow', 1984, 1999),
  A('b738', 'Boeing 737-800', 'Boeing', 'narrow', 189, 'J12 Y150', 5400, 840, 2.75, 50e6, 3.5, 2300, 104, 'narrow', 1998, 2020),
  A('a320c', 'Airbus A320ceo', 'Airbus', 'narrow', 180, 'J12 Y150', 6100, 830, 2.85, 48e6, 3.5, 2100, 104, 'narrow', 1988, 2019),
  A('a321c', 'Airbus A321ceo', 'Airbus', 'narrow', 220, 'J16 Y180', 5900, 830, 3.25, 55e6, 4.5, 2400, 104, 'narrow', 1994, 2021),
  A('f100', 'Fokker 100', 'Fokker', 'regional', 109, 'J8 Y90', 3100, 750, 2.4, 30e6, 1.5, 1800, 78, 'small', 1988, 1997),
  A('erj145', 'Embraer ERJ-145', 'Embraer', 'regional', 50, 'Y50', 2800, 780, 1.6, 20e6, 0.8, 1700, 65, 'small', 1996, 2020),
  A('crj2', 'Bombardier CRJ200', 'Bombardier', 'regional', 50, 'Y50', 3000, 785, 1.5, 22e6, 0.8, 1700, 65, 'small', 1992, 2006),
  A('md11', 'McDonnell Douglas MD-11', 'McDonnell Douglas', 'wide', 410, 'F6 J36 Y240', 12600, 900, 9.0, 140e6, 22, 3000, 104, 'wide', 1990, 2000),
  A('b744', 'Boeing 747-400', 'Boeing', 'jumbo', 660, 'F12 J52 Y340', 13400, 910, 12.0, 180e6, 25, 3100, 130, 'jumbo', 1989, 2009),
  A('a343', 'Airbus A340-300', 'Airbus', 'wide', 440, 'J36 Y250', 13500, 870, 8.0, 130e6, 18, 3000, 104, 'wide', 1993, 2008),
  A('a346', 'Airbus A340-600', 'Airbus', 'wide', 475, 'F8 J42 Y280', 14400, 880, 9.8, 150e6, 22, 3100, 104, 'wide', 2002, 2011),
  A('b772', 'Boeing 777-200ER', 'Boeing', 'wide', 440, 'J40 W24 Y240', 13000, 900, 8.0, 140e6, 22, 2900, 117, 'wide', 1997, 2013),
  A('a333', 'Airbus A330-300', 'Airbus', 'wide', 440, 'J36 W21 Y240', 11750, 870, 6.6, 115e6, 20, 2800, 104, 'wide', 1994, 2020),
  // Commuters & bush planes (one or two pilots, no cabin crew under 20 seats)
  A('bn2', 'Britten-Norman Islander', 'Britten-Norman', 'commuter', 9, 'Y9', 1400, 270, 0.15, 1.5e6, 0.5, 400, 40, 'tiny', 1967, null, { cockpit: 1 }),
  A('dhc6', 'DHC-6 Twin Otter', 'de Havilland Canada', 'commuter', 19, 'Y19', 1500, 330, 0.3, 4e6, 1, 400, 40, 'tiny', 1966, 1988),
  A('dhc6s4', 'Viking Twin Otter Series 400', 'Viking Air', 'commuter', 19, 'Y19', 1500, 340, 0.3, 7e6, 1, 400, 52, 'tiny', 2010),
  A('l410', 'Let L-410 Turbolet', 'Let', 'commuter', 19, 'Y19', 1300, 380, 0.4, 5e6, 1, 500, 52, 'tiny', 1971),
  A('emb110', 'Embraer EMB-110 Bandeirante', 'Embraer', 'commuter', 18, 'Y18', 1900, 410, 0.35, 3e6, 1, 900, 40, 'tiny', 1973, 1990),
  A('do228', 'Dornier 228', 'Dornier', 'commuter', 19, 'Y19', 1100, 400, 0.38, 6e6, 1, 800, 52, 'tiny', 1982),
  A('j31', 'BAe Jetstream 31', 'British Aerospace', 'commuter', 19, 'Y19', 1200, 480, 0.4, 5e6, 0.8, 1100, 52, 'tiny', 1982, 1993),
  A('c208', 'Cessna 208B Grand Caravan', 'Cessna', 'commuter', 14, 'Y12', 1700, 340, 0.25, 3e6, 1.3, 700, 40, 'tiny', 1986, null, { cockpit: 1 }),
  A('b1900', 'Beechcraft 1900D', 'Beechcraft', 'commuter', 19, 'Y19', 1100, 520, 0.45, 6e6, 0.8, 1100, 52, 'tiny', 1991, 2002),
  // Regional turboprops
  A('an24', 'Antonov An-24', 'Antonov', 'turboprop', 52, 'Y50', 2000, 450, 1.1, 6e6, 1.5, 1200, 52, 'small', 1962, 1979, FE),
  A('emb120', 'Embraer EMB-120 Brasilia', 'Embraer', 'turboprop', 30, 'Y30', 1500, 550, 0.6, 9e6, 0.8, 1400, 52, 'small', 1985, 2001),
  A('sh360', 'Short 360', 'Shorts', 'turboprop', 36, 'Y36', 1100, 390, 0.6, 7e6, 1, 1300, 52, 'small', 1982, 1991),
  A('dhc7', 'Dash 7 (STOL)', 'de Havilland Canada', 'turboprop', 54, 'Y50', 1300, 430, 0.9, 12e6, 1.5, 700, 65, 'small', 1978, 1988),
  A('dh8a', 'Dash 8-100', 'de Havilland Canada', 'turboprop', 39, 'Y37', 1500, 490, 0.65, 13e6, 1, 1000, 65, 'small', 1984, 2005),
  A('dh8c', 'Dash 8-300', 'de Havilland Canada', 'turboprop', 56, 'Y50', 1700, 520, 0.8, 17e6, 1.2, 1200, 65, 'small', 1989, 2009),
  A('atr42', 'ATR 42', 'ATR', 'turboprop', 50, 'Y48', 1300, 500, 0.7, 18e6, 1, 1100, 65, 'small', 1985),
  A('f50', 'Fokker 50', 'Fokker', 'turboprop', 58, 'Y56', 2000, 520, 0.9, 16e6, 1.2, 1300, 65, 'small', 1987, 1997),
  A('do328', 'Dornier 328', 'Dornier', 'turboprop', 33, 'Y32', 1300, 620, 0.7, 12e6, 0.8, 1100, 65, 'small', 1993, 2000),
  A('saab2000', 'Saab 2000', 'Saab', 'turboprop', 53, 'Y50', 2200, 665, 1.1, 18e6, 1.2, 1300, 65, 'small', 1994, 1999),
  // Niche jets
  A('cv880', 'Convair 880', 'Convair', 'narrow', 110, 'J20 Y70', 4600, 880, 6.5, 35e6, 3, 2700, 78, 'narrow', 1960, 1962, FE_LOUD),
  A('vc10', 'Vickers VC10', 'Vickers', 'narrow', 151, 'J16 Y110', 9400, 900, 7.0, 55e6, 6, 2500, 104, 'narrow', 1964, 1970, FE_LOUD),
  A('trident', 'Hawker Siddeley Trident', 'Hawker Siddeley', 'narrow', 115, 'J12 Y85', 3900, 900, 4.6, 35e6, 3, 2100, 78, 'narrow', 1964, 1978, FE_LOUD),
  A('yak40', 'Yakovlev Yak-40', 'Yakovlev', 'regional', 32, 'Y32', 1600, 550, 1.4, 6e6, 0.5, 1200, 52, 'small', 1968, 1981, FE_LOUD),
  A('tu154', 'Tupolev Tu-154M', 'Tupolev', 'narrow', 180, 'J12 Y140', 5200, 900, 5.8, 30e6, 5, 2300, 78, 'narrow', 1972, 2013, FE_LOUD),
  A('il62', 'Ilyushin Il-62M', 'Ilyushin', 'narrow', 186, 'J12 Y150', 10000, 850, 7.2, 40e6, 6, 3300, 104, 'narrow', 1967, 1995, FE_LOUD),
  A('il86', 'Ilyushin Il-86', 'Ilyushin', 'wide', 350, 'J24 Y260', 3600, 850, 9.5, 60e6, 15, 2600, 104, 'wide', 1980, 1994, FE_LOUD),
  A('bae146', 'BAe 146 / Avro RJ85', 'British Aerospace', 'regional', 112, 'J8 Y88', 2900, 750, 2.4, 30e6, 2, 1300, 78, 'small', 1983, 2003),
  A('f70', 'Fokker 70', 'Fokker', 'regional', 85, 'J8 Y72', 3400, 750, 2.1, 25e6, 1.5, 1300, 78, 'small', 1994, 1997),
  A('erj135', 'Embraer ERJ-135', 'Embraer', 'regional', 37, 'Y37', 3000, 780, 1.3, 16e6, 0.6, 1600, 65, 'small', 1999, 2017),
  A('crj7', 'Bombardier CRJ700', 'Bombardier', 'regional', 78, 'J9 Y60', 2600, 820, 1.8, 26e6, 1, 1700, 78, 'small', 2001, 2020),
  A('e190', 'Embraer E190', 'Embraer', 'regional', 114, 'J8 Y92', 4500, 830, 2.1, 40e6, 2, 1700, 91, 'small', 2005, 2019),
  A('a318', 'Airbus A318', 'Airbus', 'narrow', 132, 'J12 Y96', 5700, 830, 2.4, 40e6, 2.5, 1900, 104, 'narrow', 2003, 2013),
  A('b717', 'Boeing 717', 'Boeing', 'narrow', 134, 'J12 Y98', 2600, 810, 2.6, 38e6, 2, 1700, 91, 'narrow', 1999, 2006),
  A('md90', 'McDonnell Douglas MD-90', 'McDonnell Douglas', 'narrow', 172, 'J12 Y140', 3900, 810, 3.1, 45e6, 3, 2200, 91, 'narrow', 1995, 2000),
  A('b74sp', 'Boeing 747SP', 'Boeing', 'jumbo', 400, 'F8 J32 Y230', 10800, 900, 11.5, 150e6, 15, 2800, 130, 'jumbo', 1976, 1982, FE),
  A('a310', 'Airbus A310-300', 'Airbus', 'wide', 280, 'J24 Y180', 9600, 850, 5.6, 85e6, 14, 2300, 104, 'wide', 1983, 1998),
  A('b762', 'Boeing 767-200ER', 'Boeing', 'wide', 290, 'J24 Y170', 12200, 850, 5.2, 85e6, 12, 2500, 104, 'wide', 1982, 1994),
  A('ssj100', 'Sukhoi Superjet 100', 'Sukhoi', 'regional', 98, 'J8 Y80', 3000, 830, 2.2, 32e6, 1.5, 1800, 78, 'small', 2011),
  A('arj21', 'COMAC C909 (ARJ21)', 'COMAC', 'regional', 90, 'J8 Y78', 2200, 820, 2.2, 30e6, 1.5, 1800, 78, 'small', 2016),
  A('c919', 'COMAC C919', 'COMAC', 'narrow', 174, 'J8 Y150', 4000, 830, 2.7, 70e6, 3, 2200, 156, 'narrow', 2023),
  // Current generation
  A('atr72', 'ATR 72-600', 'ATR', 'turboprop', 78, 'Y72', 1500, 510, 0.85, 27e6, 1, 1400, 78, 'small', 2011),
  A('q400', 'Dash 8-400', 'De Havilland', 'turboprop', 90, 'Y78', 2000, 667, 1.2, 33e6, 1, 1400, 104, 'small', 2000),
  A('crj9', 'Bombardier CRJ900', 'Bombardier', 'regional', 90, 'J12 Y64', 2900, 830, 1.9, 25e6, 1.2, 1900, 78, 'small', 2003, 2020),
  A('e175', 'Embraer E175', 'Embraer', 'regional', 88, 'J12 Y64', 3700, 780, 1.9, 32e6, 1.5, 1800, 91, 'small', 2005),
  A('e195e2', 'Embraer E195-E2', 'Embraer', 'regional', 146, 'J12 Y118', 4800, 830, 2.1, 60e6, 2, 2000, 117, 'small', 2019),
  A('a221', 'Airbus A220-100', 'Airbus', 'narrow', 135, 'J12 Y96', 6300, 830, 2.0, 38e6, 2, 1500, 104, 'narrow', 2016),
  A('a223', 'Airbus A220-300', 'Airbus', 'narrow', 160, 'J12 Y120', 6300, 830, 2.3, 45e6, 2.5, 1900, 117, 'narrow', 2016),
  A('a319n', 'Airbus A319neo', 'Airbus', 'narrow', 160, 'J12 Y120', 6900, 830, 2.4, 50e6, 3, 2000, 104, 'narrow', 2019),
  A('a320n', 'Airbus A320neo', 'Airbus', 'narrow', 194, 'J12 Y150', 6300, 830, 2.6, 55e6, 3.5, 2100, 156, 'narrow', 2016),
  A('a321n', 'Airbus A321neo', 'Airbus', 'narrow', 244, 'J16 Y180', 7400, 830, 2.9, 64e6, 4.5, 2300, 208, 'narrow', 2017),
  A('a321xlr', 'Airbus A321XLR', 'Airbus', 'narrow', 244, 'J14 Y168', 8700, 830, 3.0, 72e6, 3, 2400, 208, 'narrow', 2024),
  A('b38m', 'Boeing 737-8', 'Boeing', 'narrow', 189, 'J12 Y150', 6500, 840, 2.65, 52e6, 3.5, 2300, 130, 'narrow', 2017),
  A('b3xm', 'Boeing 737-10', 'Boeing', 'narrow', 230, 'J16 Y170', 5700, 840, 2.85, 60e6, 4, 2500, 156, 'narrow', 2027),
  A('a339', 'Airbus A330-900', 'Airbus', 'wide', 440, 'J30 W21 Y224', 13300, 870, 6.2, 125e6, 18, 2800, 104, 'wide', 2018),
  A('b788', 'Boeing 787-8', 'Boeing', 'wide', 359, 'J28 W21 Y180', 13600, 900, 5.9, 120e6, 15, 2700, 156, 'wide', 2011),
  A('b789', 'Boeing 787-9', 'Boeing', 'wide', 420, 'J30 W28 Y216', 14000, 900, 6.6, 145e6, 18, 2800, 156, 'wide', 2014),
  A('b78x', 'Boeing 787-10', 'Boeing', 'wide', 440, 'J32 W24 Y260', 11900, 900, 7.0, 160e6, 22, 2900, 156, 'wide', 2018),
  A('a359', 'Airbus A350-900', 'Airbus', 'wide', 440, 'J36 W24 Y240', 15000, 900, 7.2, 160e6, 20, 2700, 130, 'wide', 2015),
  A('a35k', 'Airbus A350-1000', 'Airbus', 'wide', 480, 'J40 W28 Y280', 16100, 900, 8.1, 185e6, 24, 2900, 156, 'wide', 2018),
  A('b77w', 'Boeing 777-300ER', 'Boeing', 'wide', 550, 'F8 J42 W28 Y300', 13600, 900, 9.2, 160e6, 25, 3000, 117, 'wide', 2004, 2023),
  A('b779', 'Boeing 777-9', 'Boeing', 'wide', 520, 'J48 W28 Y300', 13500, 905, 9.4, 210e6, 25, 3000, 260, 'wide', 2026),
  A('b748', 'Boeing 747-8', 'Boeing', 'jumbo', 605, 'F8 J70 W32 Y250', 14300, 910, 11.5, 200e6, 20, 3100, 130, 'jumbo', 2012, 2023),
  A('a388', 'Airbus A380-800', 'Airbus', 'jumbo', 853, 'F14 J76 W44 Y420', 14800, 900, 13.5, 180e6, 15, 3000, 156, 'jumbo', 2007, 2021),
  // Freighters
  A('b707f', 'Boeing 707-320C', 'Boeing', 'freighter', 0, '', 6800, 950, 6.8, 55e6, 40, 3000, 104, 'narrow', 1963, 1979, FE_LOUD),
  A('dc8f', 'Douglas DC-8-63F', 'Douglas', 'freighter', 0, '', 7000, 950, 7.4, 60e6, 48, 3100, 104, 'narrow', 1968, 1972, FE_LOUD),
  A('b727f', 'Boeing 727-200F', 'Boeing', 'freighter', 0, '', 3500, 900, 5.3, 20e6, 28, 2300, 26, 'narrow', 1983, 2000, FE_LOUD),
  A('b742f', 'Boeing 747-200F', 'Boeing', 'freighter', 0, '', 8200, 900, 13.5, 160e6, 110, 3300, 130, 'jumbo', 1972, 1991, FE),
  A('dc10f', 'McDonnell Douglas DC-10-30F', 'McDonnell Douglas', 'freighter', 0, '', 6000, 900, 9.6, 100e6, 70, 3000, 104, 'wide', 1984, 1988, FE),
  A('b752f', 'Boeing 757-200PF', 'Boeing', 'freighter', 0, '', 5800, 850, 3.7, 65e6, 39, 2100, 104, 'narrow', 1987, 2004),
  A('md11f', 'McDonnell Douglas MD-11F', 'McDonnell Douglas', 'freighter', 0, '', 7300, 900, 9.2, 130e6, 91, 3000, 104, 'wide', 1991, 2000),
  A('b744f', 'Boeing 747-400F', 'Boeing', 'freighter', 0, '', 8200, 910, 12.3, 170e6, 113, 3100, 130, 'jumbo', 1993, 2009),
  A('b763f', 'Boeing 767-300F', 'Boeing', 'freighter', 0, '', 6000, 850, 5.5, 110e6, 52, 2800, 78, 'wide', 1995, 2027),
  A('atr72f', 'ATR 72-600F', 'ATR', 'freighter', 0, '', 1500, 510, 0.9, 30e6, 8.6, 1400, 104, 'small', 2020),
  A('b738f', 'Boeing 737-800BCF', 'Boeing', 'freighter', 0, '', 3700, 840, 2.7, 22e6, 23, 2300, 26, 'narrow', 2018),
  A('a321f', 'Airbus A321P2F', 'Airbus', 'freighter', 0, '', 3700, 830, 2.9, 30e6, 28, 2300, 26, 'narrow', 2020),
  A('a332f', 'Airbus A330-200F', 'Airbus', 'freighter', 0, '', 7400, 870, 6.0, 120e6, 65, 2800, 104, 'wide', 2010, 2021),
  A('b77f', 'Boeing 777F', 'Boeing', 'freighter', 0, '', 9000, 900, 9.5, 190e6, 102, 3000, 104, 'wide', 2009),
  A('b77wsf', 'Boeing 777-300ERSF', 'Boeing', 'freighter', 0, '', 7400, 900, 9.3, 110e6, 101, 3000, 26, 'wide', 2023),
  A('a350f', 'Airbus A350F', 'Airbus', 'freighter', 0, '', 8700, 900, 8.6, 220e6, 109, 3000, 182, 'wide', 2027),
  A('b748f', 'Boeing 747-8F', 'Boeing', 'freighter', 0, '', 8100, 910, 11.8, 220e6, 134, 3100, 130, 'jumbo', 2011, 2023),
];

// Can a new one be ordered in this year? (Orders open ~3 years before entry into service.)
export const inProduction = (type, year) => year >= type.intro - 3 && (type.out == null || year <= type.out);
// Does the type exist at all in this year (for leases and the used market)?
export const inService = (type, year) => year >= type.intro && (type.out == null || year <= type.out + 35);
// Supersonic/regulatory: airframes are retired by this age.
export const LIFE_LIMIT_YEARS = 45;

export const aircraftById = Object.fromEntries(AIRCRAFT.map((a) => [a.id, a]));

// Families share type ratings, spares and tooling: flying one family is
// cheaper than flying several. Types not listed are a family of their own.
export const FAMILIES = {
  'Airbus A320 family': ['a318', 'a319n', 'a320n', 'a321n', 'a321xlr', 'a320c', 'a321c', 'a321f'],
  'Boeing 737 NG/MAX': ['b733', 'b738', 'b38m', 'b3xm', 'b738f'],
  'Boeing 737 Original': ['b732'],
  'Boeing 757/767': ['b752', 'b762', 'b763', 'b752f', 'b763f'],
  'Boeing 777': ['b772', 'b77w', 'b779', 'b77f', 'b77wsf'],
  'Boeing 787': ['b788', 'b789', 'b78x'],
  'Boeing 747': ['b741', 'b742', 'b74sp', 'b744', 'b748', 'b742f', 'b744f', 'b748f'],
  'Airbus A330/A340': ['a333', 'a339', 'a343', 'a346', 'a332f'],
  'Airbus A350': ['a359', 'a35k', 'a350f'],
  'Airbus A300/A310': ['a300', 'a306', 'a310'],
  'Airbus A220': ['a221', 'a223'],
  'Embraer E-Jet': ['e175', 'e190', 'e195e2'],
  'Embraer ERJ': ['erj135', 'erj145'],
  'Bombardier CRJ': ['crj2', 'crj7', 'crj9'],
  'ATR 42/72': ['atr42', 'atr725', 'atr72', 'atr72f'],
  'Dash 8': ['dh8a', 'dh8c', 'q400'],
  'DC-9/MD-80/717': ['dc9', 'md80', 'md90', 'b717'],
  'DC-10/MD-11': ['dc10', 'md11', 'dc10f', 'md11f'],
  'Fokker 70/100': ['f70', 'f100'],
  'Fokker F27/50': ['f27', 'f50'],
  'Twin Otter': ['dhc6', 'dhc6s4'],
  'Boeing 707': ['b707', 'b707f'],
  'Boeing 727': ['b727', 'b727f'],
  'Douglas DC-8': ['dc8', 'dc8f'],
};
const familyIndex = Object.fromEntries(Object.entries(FAMILIES).flatMap(([f, ids]) => ids.map((id) => [id, f])));
export const familyOf = (typeId) => familyIndex[typeId] ?? aircraftById[typeId]?.name ?? typeId;

export const CATEGORY_LABELS = {
  commuter: 'Commuter',
  prop: 'Piston airliner',
  sst: 'Supersonic',
  turboprop: 'Turboprop', regional: 'Regional jet', narrow: 'Narrowbody', wide: 'Widebody', jumbo: 'Very large', freighter: 'Freighter',
};

// Cabin classes. `units` is how many economy-seat equivalents one seat takes,
// which depends on the aircraft category (a narrowbody "business" seat is a
// recliner, a widebody one is a lie-flat bed).
export const CABIN = {
  F: { name: 'First', short: 'F', fare: 7.0, units: { commuter: 6, prop: 6, sst: 6, turboprop: 6, regional: 6, narrow: 6, wide: 6, jumbo: 6 } },
  J: { name: 'Business', short: 'J', fare: 3.2, units: { commuter: 1.5, prop: 1.5, sst: 1.28, turboprop: 1.5, regional: 1.5, narrow: 2, wide: 3.5, jumbo: 3.5 } },
  W: { name: 'Premium Economy', short: 'W', fare: 1.7, units: { commuter: 1.3, prop: 1.3, sst: 1.3, turboprop: 1.3, regional: 1.3, narrow: 1.3, wide: 1.5, jumbo: 1.5 } },
  Y: { name: 'Economy', short: 'Y', fare: 1.0, units: { commuter: 1, prop: 1, sst: 1, turboprop: 1, regional: 1, narrow: 1, wide: 1, jumbo: 1 } },
};
export const CLASSES = ['F', 'J', 'W', 'Y'];

// Long-haul business class sells at a bigger premium than short-haul recliners.
export function classFareMultiplier(cls, distance) {
  if (cls === 'J') return distance > 3000 ? 4.2 : 2.4;
  if (cls === 'F') return distance > 3000 ? 7.5 : 4;
  return CABIN[cls].fare;
}

// Seat products per cabin. Business and first are sized absolutely by airframe
// group (a lie-flat bed needs the same floor in any widebody); premium economy
// and economy scale the standard pitch. q = [short-haul, long-haul] appeal.
export const cabinGroup = (cat) => (cat === 'wide' || cat === 'jumbo' ? 'wide' : cat === 'narrow' ? 'narrow' : 'small');
export const SEAT_PRODUCTS = {
  F: {
    open: { name: 'Open first', units: { wide: 6 }, q: [1, 1], cost: 450e3 },
    suite: { name: 'First suite', units: { wide: 7.5 }, q: [1.05, 1.12], cost: 900e3, minYear: 2003 },
  },
  J: {
    recliner: { name: 'Recliner', units: { small: 1.5, narrow: 2, wide: 2.6 }, q: [1, 0.82], cost: { small: 15e3, narrow: 30e3, wide: 60e3 } },
    angled: { name: 'Angled lie-flat', units: { narrow: 2.6, wide: 3.1 }, q: [1.03, 0.95], cost: { narrow: 90e3, wide: 150e3 }, minYear: 1995 },
    flat: { name: 'Fully flat bed', units: { narrow: 3.2, wide: 3.5 }, q: [1.06, 1.05], cost: { narrow: 160e3, wide: 220e3 }, minYear: 1998 },
    suite: { name: 'Business suite (door)', units: { narrow: 3.6, wide: 4.1 }, q: [1.1, 1.12], cost: { narrow: 260e3, wide: 330e3 }, minYear: 2016 },
  },
  W: {
    recliner: { name: 'Wide recliner', scale: 1, q: [1, 1], cost: 25e3 },
    cradle: { name: 'Leg-rest cradle', scale: 1.15, q: [1.02, 1.07], cost: 40e3, minYear: 2008 },
  },
  Y: {
    dense: { name: 'High-density (28–29")', scale: 0.88, q: [0.95, 0.88], cost: 4e3 },
    standard: { name: 'Standard (30–31")', scale: 1, q: [1, 1], cost: 6e3 },
    extra: { name: 'Extra legroom (32–34")', scale: 1.12, q: [1.04, 1.07], cost: 8e3 },
  },
};
// Products that physically fit this airframe group in a given year.
export function seatProducts(type, cls, year = 9999) {
  const g = cabinGroup(type.cat);
  return Object.entries(SEAT_PRODUCTS[cls]).filter(([, p]) => (p.scale || p.units[g]) && (p.minYear ?? 0) <= year).map(([k]) => k);
}
export function defaultCabin(type) {
  const g = cabinGroup(type.cat);
  return { F: 'open', J: g === 'wide' && type.intro >= 1997 ? 'flat' : 'recliner', W: 'recliner', Y: 'standard' };
}
export function seatUnits(type, cls, product) {
  const p = SEAT_PRODUCTS[cls][product] ?? SEAT_PRODUCTS[cls][defaultCabin(type)[cls]];
  if (p.scale) return CABIN[cls].units[type.cat] * p.scale;
  if (type.cat === 'sst') return CABIN[cls].units.sst;
  return p.units[cabinGroup(type.cat)] ?? CABIN[cls].units[type.cat];
}
export const productQ = (cls, product, long) => (SEAT_PRODUCTS[cls][product]?.q ?? [1, 1])[long ? 1 : 0];
// Main-deck cargo in a combi takes 5 economy-seat units per tonne.
export const COMBI_UNITS_PER_T = 5;
export const canCombi = (type) => type.maxSeats >= 100 && !['commuter', 'sst', 'freighter'].includes(type.cat);

export function cabinUnits(type, config, cabin) {
  if (type.cat === 'freighter') return 0;
  const products = { ...defaultCabin(type), ...(cabin ?? {}) };
  return CLASSES.reduce((s, c) => s + (config[c] || 0) * seatUnits(type, c, products[c]), 0) + (config.C || 0) * COMBI_UNITS_PER_T;
}

export function seatCount(config) {
  return CLASSES.reduce((s, c) => s + (config[c] || 0), 0);
}

// Maintenance check program. Intervals are in flight hours (fh) and/or weeks;
// whichever comes first. Durations in days; cost in USD by maintenance class.
export const CHECKS = {
  A: { name: 'A-check', fh: 750, weeks: 12, days: { tiny: 0.3, small: 0.5, narrow: 0.5, wide: 1, jumbo: 1 }, cost: { tiny: 4e3, small: 12e3, narrow: 25e3, wide: 60e3, jumbo: 90e3 } },
  B: { name: 'B-check', fh: null, weeks: 26, days: { tiny: 0.5, small: 1, narrow: 1, wide: 2, jumbo: 3 }, cost: { tiny: 10e3, small: 35e3, narrow: 70e3, wide: 160e3, jumbo: 240e3 } },
  C: { name: 'C-check', fh: 7500, weeks: 104, days: { tiny: 5, small: 10, narrow: 14, wide: 21, jumbo: 28 }, cost: { tiny: 60e3, small: 250e3, narrow: 500e3, wide: 1.4e6, jumbo: 2.2e6 } },
  D: { name: 'D-check', fh: null, weeks: 312, days: { tiny: 14, small: 28, narrow: 35, wide: 49, jumbo: 63 }, cost: { tiny: 300e3, small: 1.5e6, narrow: 3e6, wide: 7e6, jumbo: 11e6 } },
};
export const CHECK_ORDER = ['A', 'B', 'C', 'D'];

// Retrofits and modifications. `days` is aircraft downtime.
export const UPGRADES = {
  wifi: { minYear: 2008, name: 'Satellite Wi-Fi', desc: 'Connectivity lifts product quality and earns ancillary revenue.', cost: { tiny: 100000, small: 0.4e6, narrow: 0.6e6, wide: 1.2e6, jumbo: 1.5e6 }, days: 5, quality: 0.04, ancillary: 0.015 },
  ife: { minYear: 1988, name: 'Seatback IFE', desc: 'Personal screens at every seat. Valued on long flights.', cost: { tiny: 150000, small: 0.6e6, narrow: 1.5e6, wide: 3.5e6, jumbo: 5e6 }, days: 10, quality: 0.05, longHaulOnly: true },
  seats: { name: 'New-generation seats', desc: 'Modern slimline economy and refreshed premium seats.', cost: { tiny: 200000, small: 0.8e6, narrow: 2e6, wide: 6e6, jumbo: 9e6 }, days: 14, quality: 0.06 },
  pip: { name: 'Engine performance kit', desc: 'Upgraded engine parts cut fuel burn by 2.5%.', cost: { tiny: 125000, small: 0.5e6, narrow: 1.5e6, wide: 3.5e6, jumbo: 5e6 }, days: 7, fuel: -0.025 },
  aero: { minYear: 1985, name: 'Winglets / aero package', desc: 'Winglets and drag-reducing tweaks cut fuel burn by 1.5%.', cost: { tiny: 50000, small: 0.2e6, narrow: 0.6e6, wide: 1.5e6, jumbo: 2e6 }, days: 4, fuel: -0.015 },
};

// Passenger-to-freighter conversions available for older airframes.
export const CONVERSIONS = {
  a321n: { to: 'a321f', minAgeYears: 10, cost: 6e6, days: 90 },
  a321c: { to: 'a321f', minAgeYears: 15, cost: 5e6, days: 90 },
  b738: { to: 'b738f', minAgeYears: 15, cost: 5e6, days: 90 },
  b77w: { to: 'b77wsf', minAgeYears: 12, cost: 38e6, days: 150 },
  b744: { to: 'b744f', minAgeYears: 12, cost: 25e6, days: 140 },
  b763: { to: 'b763f', minAgeYears: 15, cost: 15e6, days: 120 },
  b752: { to: 'b752f', minAgeYears: 15, cost: 5e6, days: 90 },
  b727: { to: 'b727f', minAgeYears: 12, cost: 4e6, days: 90 },
  dc10: { to: 'dc10f', minAgeYears: 12, cost: 10e6, days: 120 },
  md11: { to: 'md11f', minAgeYears: 8, cost: 15e6, days: 120 },
  a333: { to: 'a332f', minAgeYears: 15, cost: 18e6, days: 120 },
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
  narrowHangar: { name: 'Narrowbody heavy hangar', desc: 'In-house C and D checks for regional and narrowbody aircraft.', cost: 28e6, weeks: 39, checks: ['C', 'D'], classes: ['tiny', 'small', 'narrow'], bays: 3, engineers: 120 },
  wideHangar: { name: 'Widebody heavy hangar', desc: 'In-house C and D checks for every aircraft size.', cost: 65e6, weeks: 52, checks: ['C', 'D'], classes: ['tiny', 'small', 'narrow', 'wide', 'jumbo'], bays: 2, engineers: 200 },
};
