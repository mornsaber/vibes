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

export const rivalById = Object.fromEntries(RIVALS.map((r) => [r.id, r]));

export const ALLIANCES = {
  'Star Alliance': { minRep: 70, minFleet: 40, fee: 25e6 },
  oneworld: { minRep: 72, minFleet: 40, fee: 25e6 },
  SkyTeam: { minRep: 68, minFleet: 35, fee: 20e6 },
};
