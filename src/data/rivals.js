// Rival airlines. Types shape their behaviour:
//   legacy     full-service network carrier with premium cabins
//   connector  premium long-haul hub carrier (Gulf / Asian super-connectors)
//   lcc        low-cost carrier, short/medium haul, mostly economy
//   ulcc       ultra-low-cost, rock-bottom fares, minimal product
//   cargo      all-cargo integrator (competes for freight only)

export const RIVAL_TYPES = {
  legacy: { fare: 1.0, quality: 1.0, range: 16000, minMarket: 900, premium: true, label: 'Full-service' },
  connector: { fare: 0.95, quality: 1.2, range: 16000, minMarket: 600, premium: true, label: 'Super-connector' },
  lcc: { fare: 0.82, quality: 0.85, range: 4500, minMarket: 700, premium: false, label: 'Low-cost' },
  ulcc: { fare: 0.68, quality: 0.7, range: 3800, minMarket: 600, premium: false, label: 'Ultra-low-cost' },
  cargo: { fare: 0.95, quality: 1.0, range: 12000, minMarket: 0, premium: false, label: 'Cargo integrator' },
};

const R = (id, name, code, country, type, alliance, hubs, fleet, quality = 1, aggression = 0.5) => ({
  id, name, code, country, type, alliance, hubs, fleet, quality, aggression,
});

export const RIVALS = [
  R('DL', 'Delta Air Lines', 'DL', 'US', 'legacy', 'SkyTeam', ['ATL', 'MSP', 'DTW', 'SLC', 'JFK', 'SEA', 'LAX', 'BOS'], 980, 1.1, 0.6),
  R('UA', 'United Airlines', 'UA', 'US', 'legacy', 'Star Alliance', ['ORD', 'EWR', 'SFO', 'DEN', 'IAH'], 1000, 1.0, 0.6),
  R('AA', 'American Airlines', 'AA', 'US', 'legacy', 'oneworld', ['DFW', 'CLT', 'MIA', 'ORD', 'PHL', 'PHX'], 970, 0.95, 0.55),
  R('WN', 'Southwest Airlines', 'WN', 'US', 'lcc', null, ['DEN', 'LAS', 'MCO', 'PHX', 'ATL', 'BNA', 'AUS', 'SAN', 'TPA'], 800, 0.95, 0.5),
  R('AS', 'Alaska Airlines', 'AS', 'US', 'legacy', 'oneworld', ['SEA', 'PDX', 'ANC', 'SFO', 'HNL'], 330, 1.0, 0.4),
  R('B6', 'JetBlue', 'B6', 'US', 'lcc', null, ['JFK', 'BOS', 'SJU'], 290, 1.0, 0.45),
  R('F9', 'Frontier Airlines', 'F9', 'US', 'ulcc', null, ['DEN', 'MCO', 'LAS', 'PHL'], 160, 0.7, 0.7),
  R('AC', 'Air Canada', 'AC', 'CA', 'legacy', 'Star Alliance', ['YYZ', 'YVR', 'YUL', 'YYC'], 350, 1.0, 0.5),
  R('WS', 'WestJet', 'WS', 'CA', 'lcc', 'SkyTeam', ['YYC', 'YVR', 'YYZ'], 190, 0.9, 0.45),
  R('AM', 'Aeroméxico', 'AM', 'MX', 'legacy', 'SkyTeam', ['MEX', 'GDL'], 150, 0.95, 0.45),
  R('Y4', 'Volaris', 'Y4', 'MX', 'ulcc', null, ['GDL', 'MEX', 'CUN'], 140, 0.75, 0.6),
  R('CM', 'Copa Airlines', 'CM', 'PA', 'legacy', 'Star Alliance', ['PTY'], 110, 1.0, 0.4),
  R('AV', 'Avianca', 'AV', 'CO', 'legacy', 'Star Alliance', ['BOG'], 150, 0.9, 0.45),
  R('LA', 'LATAM Airlines', 'LA', 'CL', 'legacy', null, ['SCL', 'GRU', 'LIM'], 340, 0.95, 0.5),
  R('AR', 'Aerolíneas Argentinas', 'AR', 'AR', 'legacy', 'SkyTeam', ['EZE'], 80, 0.85, 0.3),
  R('BA', 'British Airways', 'BA', 'GB', 'legacy', 'oneworld', ['LHR', 'LGW'], 290, 1.05, 0.55),
  R('VS', 'Virgin Atlantic', 'VS', 'GB', 'legacy', 'SkyTeam', ['LHR', 'MAN'], 45, 1.15, 0.4),
  R('U2', 'easyJet', 'U2', 'GB', 'lcc', null, ['LGW', 'MAN', 'EDI', 'GVA', 'BER', 'MXP', 'ORY', 'NCE'], 340, 0.85, 0.55),
  R('FR', 'Ryanair', 'FR', 'IE', 'ulcc', null, ['DUB', 'BCN', 'MAD', 'PMI', 'AGP', 'FCO', 'NAP', 'BER', 'MAN', 'WAW', 'BUD'], 600, 0.7, 0.8),
  R('EI', 'Aer Lingus', 'EI', 'IE', 'legacy', null, ['DUB'], 60, 1.0, 0.35),
  R('LH', 'Lufthansa', 'LH', 'DE', 'legacy', 'Star Alliance', ['FRA', 'MUC'], 300, 1.05, 0.55),
  R('AF', 'Air France', 'AF', 'FR', 'legacy', 'SkyTeam', ['CDG', 'ORY'], 230, 1.05, 0.5),
  R('KL', 'KLM', 'KL', 'NL', 'legacy', 'SkyTeam', ['AMS'], 170, 1.05, 0.5),
  R('IB', 'Iberia', 'IB', 'ES', 'legacy', 'oneworld', ['MAD'], 110, 1.0, 0.45),
  R('VY', 'Vueling', 'VY', 'ES', 'lcc', null, ['BCN'], 130, 0.8, 0.5),
  R('TP', 'TAP Air Portugal', 'TP', 'PT', 'legacy', 'Star Alliance', ['LIS'], 100, 0.95, 0.4),
  R('AZ', 'ITA Airways', 'AZ', 'IT', 'legacy', 'Star Alliance', ['FCO', 'MXP'], 100, 0.95, 0.4),
  R('LX', 'SWISS', 'LX', 'CH', 'legacy', 'Star Alliance', ['ZRH', 'GVA'], 90, 1.15, 0.4),
  R('OS', 'Austrian Airlines', 'OS', 'AT', 'legacy', 'Star Alliance', ['VIE'], 65, 1.0, 0.35),
  R('SK', 'SAS', 'SK', 'SE', 'legacy', 'SkyTeam', ['CPH', 'ARN', 'OSL'], 130, 0.95, 0.4),
  R('AY', 'Finnair', 'AY', 'FI', 'legacy', 'oneworld', ['HEL'], 80, 1.0, 0.35),
  R('FI', 'Icelandair', 'FI', 'IS', 'legacy', null, ['KEF'], 45, 0.95, 0.3),
  R('LO', 'LOT Polish', 'LO', 'PL', 'legacy', 'Star Alliance', ['WAW'], 75, 0.9, 0.35),
  R('W6', 'Wizz Air', 'W6', 'HU', 'ulcc', null, ['BUD', 'WAW', 'PRG'], 220, 0.7, 0.75),
  R('TK', 'Turkish Airlines', 'TK', 'TR', 'connector', 'Star Alliance', ['IST'], 450, 1.1, 0.65),
  R('PC', 'Pegasus', 'PC', 'TR', 'lcc', null, ['IST', 'AYT'], 120, 0.8, 0.55),
  R('EK', 'Emirates', 'EK', 'AE', 'connector', null, ['DXB'], 260, 1.3, 0.6),
  R('QR', 'Qatar Airways', 'QR', 'QA', 'connector', 'oneworld', ['DOH'], 240, 1.3, 0.65),
  R('EY', 'Etihad', 'EY', 'AE', 'connector', null, ['AUH'], 100, 1.2, 0.45),
  R('SV', 'Saudia', 'SV', 'SA', 'legacy', 'SkyTeam', ['JED', 'RUH'], 170, 1.0, 0.45),
  R('LY', 'El Al', 'LY', 'IL', 'legacy', null, ['TLV'], 45, 0.95, 0.3),
  R('MS', 'EgyptAir', 'MS', 'EG', 'legacy', 'Star Alliance', ['CAI'], 80, 0.85, 0.35),
  R('ET', 'Ethiopian Airlines', 'ET', 'ET', 'connector', 'Star Alliance', ['ADD'], 150, 1.0, 0.55),
  R('KQ', 'Kenya Airways', 'KQ', 'KE', 'legacy', 'SkyTeam', ['NBO'], 40, 0.9, 0.3),
  R('SA', 'South African Airways', 'SA', 'ZA', 'legacy', null, ['JNB', 'CPT'], 30, 0.9, 0.3),
  R('AT', 'Royal Air Maroc', 'AT', 'MA', 'legacy', 'oneworld', ['CMN'], 55, 0.9, 0.35),
  R('AI', 'Air India', 'AI', 'IN', 'legacy', 'Star Alliance', ['DEL', 'BOM', 'BLR'], 300, 0.9, 0.55),
  R('6E', 'IndiGo', '6E', 'IN', 'lcc', null, ['DEL', 'BOM', 'BLR', 'HYD', 'MAA', 'CCU'], 400, 0.85, 0.7),
  R('UL', 'SriLankan Airlines', 'UL', 'LK', 'legacy', 'oneworld', ['CMB'], 25, 0.9, 0.3),
  R('SQ', 'Singapore Airlines', 'SQ', 'SG', 'connector', 'Star Alliance', ['SIN'], 150, 1.35, 0.55),
  R('TR', 'Scoot', 'TR', 'SG', 'lcc', null, ['SIN'], 55, 0.8, 0.5),
  R('CX', 'Cathay Pacific', 'CX', 'HK', 'connector', 'oneworld', ['HKG'], 180, 1.25, 0.5),
  R('TG', 'Thai Airways', 'TG', 'TH', 'legacy', 'Star Alliance', ['BKK'], 80, 1.0, 0.4),
  R('AK', 'AirAsia', 'AK', 'MY', 'ulcc', null, ['KUL', 'BKK', 'DPS'], 200, 0.75, 0.7),
  R('MH', 'Malaysia Airlines', 'MH', 'MY', 'legacy', 'oneworld', ['KUL'], 80, 1.0, 0.4),
  R('GA', 'Garuda Indonesia', 'GA', 'ID', 'legacy', 'SkyTeam', ['CGK', 'DPS'], 70, 0.95, 0.35),
  R('PR', 'Philippine Airlines', 'PR', 'PH', 'legacy', null, ['MNL'], 70, 0.95, 0.4),
  R('VN', 'Vietnam Airlines', 'VN', 'VN', 'legacy', 'SkyTeam', ['SGN', 'HAN'], 100, 0.95, 0.45),
  R('VJ', 'VietJet Air', 'VJ', 'VN', 'ulcc', null, ['SGN', 'HAN'], 110, 0.75, 0.65),
  R('CA', 'Air China', 'CA', 'CN', 'legacy', 'Star Alliance', ['PEK', 'CTU'], 500, 1.0, 0.5),
  R('MU', 'China Eastern', 'MU', 'CN', 'legacy', 'SkyTeam', ['PVG'], 600, 0.95, 0.5),
  R('CZ', 'China Southern', 'CZ', 'CN', 'legacy', null, ['CAN', 'SZX'], 650, 0.95, 0.5),
  R('BR', 'EVA Air', 'BR', 'TW', 'legacy', 'Star Alliance', ['TPE'], 90, 1.2, 0.4),
  R('KE', 'Korean Air', 'KE', 'KR', 'legacy', 'SkyTeam', ['ICN'], 180, 1.15, 0.5),
  R('NH', 'All Nippon Airways', 'NH', 'JP', 'legacy', 'Star Alliance', ['HND', 'NRT'], 220, 1.25, 0.45),
  R('JL', 'Japan Airlines', 'JL', 'JP', 'legacy', 'oneworld', ['HND', 'NRT'], 160, 1.25, 0.45),
  R('QF', 'Qantas', 'QF', 'AU', 'legacy', 'oneworld', ['SYD', 'MEL', 'BNE', 'PER'], 320, 1.1, 0.55),
  R('VA', 'Virgin Australia', 'VA', 'AU', 'lcc', null, ['BNE', 'SYD', 'MEL'], 100, 0.95, 0.45),
  R('NZ', 'Air New Zealand', 'NZ', 'NZ', 'legacy', 'Star Alliance', ['AKL', 'CHC'], 110, 1.15, 0.4),
  R('FX', 'FedEx Express', 'FX', 'US', 'cargo', null, ['MEM', 'ANC', 'CDG', 'CAN'], 700, 1.1, 0.5),
  R('5X', 'UPS Airlines', '5X', 'US', 'cargo', null, ['ANC', 'HKG', 'MIA'], 290, 1.05, 0.45),
  R('D0', 'DHL Aviation', 'D0', 'DE', 'cargo', null, ['HKG', 'DXB', 'MIA'], 280, 1.05, 0.45),
];

// Founding / ceasing years. Missing founded = long-established; missing ceased = still flying.
const YEARS = {
  DL: [1925], UA: [1926], AA: [1930], WN: [1971], AS: [1932], B6: [2000], F9: [1994], AC: [1937], WS: [1996], AM: [1934],
  Y4: [2006], CM: [1947], AV: [1919], LA: [2012], AR: [1950], BA: [1974], VS: [1984], U2: [1995], FR: [1985], EI: [1936],
  LH: [1955], AF: [1933], KL: [1919], IB: [1927], VY: [2004], TP: [1945], AZ: [2021], LX: [2002], OS: [1957], SK: [1946],
  AY: [1923], FI: [1937], LO: [1929], W6: [2004], TK: [1933], PC: [1990], EK: [1985], QR: [1993], EY: [2003], SV: [1945],
  LY: [1948], MS: [1932], ET: [1945], KQ: [1977], SA: [1934], AT: [1957], AI: [1932], '6E': [2006], UL: [1979], SQ: [1972],
  TR: [2012], CX: [1946], TG: [1960], AK: [2001], MH: [1972], GA: [1949], PR: [1941], VN: [1956], VJ: [2011], CA: [1988],
  MU: [1988], CZ: [1988], BR: [1989], KE: [1969], NH: [1952], JL: [1951], QF: [1920], VA: [2000], NZ: [1940], FX: [1973],
  '5X': [1988], D0: [1983],
};
for (const r of RIVALS) [r.founded, r.ceased] = YEARS[r.id] ?? [1920];

// Airlines that are history by 2027 — and may yet survive in yours.
// successor: who inherits the network when they go.
const H = (id, name, code, country, type, alliance, hubs, fleet, quality, aggression, founded, ceased, successor) => ({
  ...R(id, name, code, country, type, alliance, hubs, fleet, quality, aggression), founded, ceased, successor, historic: true,
});
RIVALS.push(
  H('PA', 'Pan Am', 'PA', 'US', 'legacy', null, ['JFK', 'MIA', 'SFO'], 150, 1.15, 0.5, 1927, 1991, 'DL'),
  H('TW', 'Trans World Airlines', 'TW', 'US', 'legacy', null, ['JFK', 'LAX'], 180, 1.05, 0.5, 1930, 2001, 'AA'),
  H('EA', 'Eastern Air Lines', 'EA', 'US', 'legacy', null, ['ATL', 'MIA', 'BOS'], 250, 0.95, 0.55, 1926, 1991),
  H('BN', 'Braniff International', 'BN', 'US', 'legacy', null, ['DFW'], 110, 1.0, 0.6, 1928, 1982),
  H('CO', 'Continental Airlines', 'CO', 'US', 'legacy', 'SkyTeam', ['IAH', 'EWR', 'DEN'], 300, 1.0, 0.55, 1934, 2012, 'UA'),
  H('NW', 'Northwest Airlines', 'NW', 'US', 'legacy', 'SkyTeam', ['MSP', 'DTW', 'NRT'], 330, 0.95, 0.5, 1926, 2010, 'DL'),
  H('US', 'US Airways', 'US', 'US', 'legacy', 'Star Alliance', ['PHL', 'CLT', 'PHX'], 340, 0.9, 0.5, 1937, 2015, 'AA'),
  H('WA', 'Western Airlines', 'WA', 'US', 'legacy', null, ['LAX', 'SLC'], 80, 1.0, 0.45, 1926, 1987, 'DL'),
  H('PE', 'People Express', 'PE', 'US', 'ulcc', null, ['EWR'], 70, 0.7, 0.9, 1981, 1987, 'CO'),
  H('VX', 'Virgin America', 'VX', 'US', 'lcc', null, ['SFO', 'LAX'], 60, 1.15, 0.5, 2007, 2018, 'AS'),
  H('HA', 'Hawaiian Airlines', 'HA', 'US', 'legacy', null, ['HNL'], 60, 1.0, 0.4, 1929, 2024, 'AS'),
  H('MX', 'Mexicana', 'MX', 'MX', 'legacy', null, ['MEX', 'CUN'], 60, 0.9, 0.45, 1921, 2010),
  H('RG', 'Varig', 'RG', 'BR', 'legacy', 'Star Alliance', ['GIG', 'GRU'], 80, 1.0, 0.45, 1927, 2006),
  H('LN', 'LAN Airlines', 'LN', 'CL', 'legacy', 'oneworld', ['SCL', 'LIM'], 90, 1.0, 0.5, 1929, 2012, 'LA'),
  H('CP', 'Canadian Airlines', 'CP', 'CA', 'legacy', 'oneworld', ['YVR', 'YYC', 'YYZ'], 80, 0.95, 0.45, 1942, 2001, 'AC'),
  H('BO', 'BOAC', 'BO', 'GB', 'legacy', null, ['LHR'], 70, 1.05, 0.4, 1939, 1974, 'BA'),
  H('BE', 'British European Airways', 'BE', 'GB', 'legacy', null, ['LHR', 'MAN'], 90, 0.95, 0.4, 1946, 1974, 'BA'),
  H('BR2', 'British Caledonian', 'BR', 'GB', 'legacy', null, ['LGW'], 35, 1.05, 0.5, 1970, 1988, 'BA'),
  H('GK', 'Laker Airways', 'GK', 'GB', 'ulcc', null, ['LGW'], 20, 0.8, 0.9, 1966, 1982),
  H('ZB', 'Monarch Airlines', 'ZB', 'GB', 'lcc', null, ['LGW', 'MAN'], 40, 0.85, 0.45, 1968, 2017),
  H('SR', 'Swissair', 'SR', 'CH', 'legacy', null, ['ZRH', 'GVA'], 80, 1.2, 0.45, 1931, 2002, 'LX'),
  H('SN', 'Sabena', 'SN', 'BE', 'legacy', null, ['BRU'], 50, 0.95, 0.4, 1923, 2001),
  H('AZ1', 'Alitalia', 'AZ', 'IT', 'legacy', 'SkyTeam', ['FCO', 'MXP'], 150, 0.95, 0.45, 1946, 2021, 'AZ'),
  H('IT', 'Air Inter', 'IT', 'FR', 'legacy', null, ['ORY', 'LYS', 'NCE'], 60, 0.9, 0.4, 1954, 1997, 'AF'),
  H('AB', 'Air Berlin', 'AB', 'DE', 'lcc', 'oneworld', ['BER', 'HAM'], 140, 0.9, 0.5, 1978, 2017),
  H('OA', 'Olympic Airways', 'OA', 'GR', 'legacy', null, ['ATH'], 50, 0.85, 0.4, 1957, 2009),
  H('MA', 'Malév', 'MA', 'HU', 'legacy', null, ['BUD'], 30, 0.85, 0.35, 1946, 2012),
  H('9W', 'Jet Airways', '9W', 'IN', 'legacy', null, ['BOM', 'DEL'], 120, 1.0, 0.55, 1993, 2019),
  H('IK', 'Kingfisher Airlines', 'IT', 'IN', 'legacy', null, ['BOM', 'BLR'], 65, 1.05, 0.6, 2005, 2012),
  H('AN', 'Ansett Australia', 'AN', 'AU', 'legacy', 'Star Alliance', ['MEL', 'SYD'], 100, 0.95, 0.5, 1936, 2001),
  H('CAAC', 'CAAC Airlines', 'CA', 'CN', 'legacy', null, ['PEK', 'PVG', 'CAN'], 150, 0.7, 0.3, 1949, 1988, 'CA'),
  H('MSA', 'Malaysia-Singapore Airlines', 'ML', 'SG', 'legacy', null, ['SIN', 'KUL'], 30, 0.95, 0.4, 1947, 1972, 'SQ'),
);

export const rivalById = Object.fromEntries(RIVALS.map((r) => [r.id, r]));

export const ALLIANCES = {
  'Star Alliance': { minRep: 70, minFleet: 40, fee: 25e6 },
  oneworld: { minRep: 72, minFleet: 40, fee: 25e6 },
  SkyTeam: { minRep: 68, minFleet: 35, fee: 20e6 },
};

// Revenue-sharing joint ventures between rivals (antitrust-immune), by first year.
// Members coordinate on long-haul routes between the two regions.
export const RIVAL_JVS = [
  { name: 'Northwest–KLM', members: ['KL', 'DL'], regions: ['NA', 'EU'], year: 1993 },
  { name: 'Air France–KLM–Delta', members: ['DL', 'AF', 'KL', 'VS'], regions: ['NA', 'EU'], year: 2009 },
  { name: 'Atlantic++ (United–Lufthansa–Air Canada)', members: ['UA', 'LH', 'AC', 'LX', 'OS'], regions: ['NA', 'EU'], year: 2009 },
  { name: 'Atlantic JV (American–BA–Iberia)', members: ['AA', 'BA', 'IB', 'AY', 'EI'], regions: ['NA', 'EU'], year: 2010 },
  { name: 'American–JAL', members: ['AA', 'JL'], regions: ['NA', 'AS'], year: 2011 },
  { name: 'United–ANA', members: ['UA', 'NH'], regions: ['NA', 'AS'], year: 2011 },
  { name: 'Delta–Korean Air', members: ['DL', 'KE'], regions: ['NA', 'AS'], year: 2018 },
  { name: 'United–Air New Zealand', members: ['UA', 'NZ'], regions: ['NA', 'OC'], year: 2018 },
  { name: 'Qantas–American', members: ['QF', 'AA'], regions: ['NA', 'OC'], year: 2022 },
  { name: 'Qantas–Emirates', members: ['QF', 'EK'], regions: ['OC', 'ME'], year: 2013 },
];

// Share of each rival's fleet made up of a type, for type groundings (approximate, around 2019).
export const RIVAL_TYPE_SHARES = {
  b38m: { WN: 0.05, AA: 0.03, UA: 0.02, AS: 0.02, AC: 0.06, WS: 0.07, AM: 0.1, FR: 0.04, TK: 0.06, PC: 0.05, CA: 0.04, MU: 0.04, CZ: 0.05, LO: 0.05, SV: 0.05, GA: 0.01, VJ: 0.02, NZ: 0, ET: 0.04, KQ: 0, AI: 0, '6E': 0, FZ: 0.4 },
  b3xm: { UA: 0.01, AS: 0.02, FR: 0.01 },
  b788: { UA: 0.03, AA: 0.03, BA: 0.03, NH: 0.08, JL: 0.08, QF: 0.04, ET: 0.05, LA: 0.03 },
  b789: { UA: 0.03, AA: 0.03, BA: 0.03, NH: 0.05, VS: 0.2, QF: 0.04, EY: 0.15, KL: 0.05, AF: 0.03 },
  a388: { EK: 0.4, SQ: 0.1, QF: 0.08, BA: 0.04, LH: 0.04, QR: 0.04, KE: 0.06, NH: 0.01 },
};
