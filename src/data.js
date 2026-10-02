// Static game data: airports and aircraft types.
//
// City fields:
//   pop      metro population in millions (drives demand)
//   biz      business travel factor (drives demand and fare tolerance)
//   tourism  leisure factor (amplifies summer seasonality)
//   hub      0-4, how contested the airport is (drives competition)
//   fee      airport fee multiplier

export const CITIES = [
  { code: 'JFK', name: 'New York', country: 'USA', lat: 40.64, lon: -73.78, pop: 19.5, biz: 1.4, tourism: 1.1, hub: 4, fee: 1.4 },
  { code: 'LAX', name: 'Los Angeles', country: 'USA', lat: 33.94, lon: -118.41, pop: 13.0, biz: 1.2, tourism: 1.3, hub: 4, fee: 1.3 },
  { code: 'ORD', name: 'Chicago', country: 'USA', lat: 41.97, lon: -87.91, pop: 9.4, biz: 1.2, tourism: 0.8, hub: 4, fee: 1.2 },
  { code: 'ATL', name: 'Atlanta', country: 'USA', lat: 33.64, lon: -84.43, pop: 6.1, biz: 1.0, tourism: 0.8, hub: 4, fee: 1.0 },
  { code: 'DFW', name: 'Dallas', country: 'USA', lat: 32.90, lon: -97.04, pop: 7.6, biz: 1.1, tourism: 0.8, hub: 3, fee: 1.0 },
  { code: 'DEN', name: 'Denver', country: 'USA', lat: 39.86, lon: -104.67, pop: 3.0, biz: 0.9, tourism: 1.1, hub: 3, fee: 0.9 },
  { code: 'SFO', name: 'San Francisco', country: 'USA', lat: 37.62, lon: -122.38, pop: 4.7, biz: 1.4, tourism: 1.2, hub: 3, fee: 1.3 },
  { code: 'SEA', name: 'Seattle', country: 'USA', lat: 47.45, lon: -122.31, pop: 4.0, biz: 1.1, tourism: 0.9, hub: 2, fee: 1.0 },
  { code: 'MIA', name: 'Miami', country: 'USA', lat: 25.79, lon: -80.29, pop: 6.1, biz: 1.0, tourism: 1.5, hub: 3, fee: 1.1 },
  { code: 'BOS', name: 'Boston', country: 'USA', lat: 42.36, lon: -71.01, pop: 4.9, biz: 1.3, tourism: 1.0, hub: 2, fee: 1.1 },
  { code: 'LAS', name: 'Las Vegas', country: 'USA', lat: 36.08, lon: -115.15, pop: 2.3, biz: 0.7, tourism: 1.6, hub: 2, fee: 0.8 },
  { code: 'MCO', name: 'Orlando', country: 'USA', lat: 28.43, lon: -81.31, pop: 2.7, biz: 0.6, tourism: 1.7, hub: 2, fee: 0.8 },
  { code: 'HNL', name: 'Honolulu', country: 'USA', lat: 21.32, lon: -157.92, pop: 1.0, biz: 0.6, tourism: 1.8, hub: 1, fee: 0.9 },
  { code: 'YYZ', name: 'Toronto', country: 'Canada', lat: 43.68, lon: -79.63, pop: 6.7, biz: 1.1, tourism: 0.9, hub: 2, fee: 1.1 },
  { code: 'MEX', name: 'Mexico City', country: 'Mexico', lat: 19.44, lon: -99.07, pop: 21.8, biz: 0.8, tourism: 1.1, hub: 2, fee: 0.8 },
  { code: 'GRU', name: 'São Paulo', country: 'Brazil', lat: -23.43, lon: -46.47, pop: 22.4, biz: 0.9, tourism: 0.8, hub: 2, fee: 0.9 },
  { code: 'LHR', name: 'London', country: 'UK', lat: 51.47, lon: -0.45, pop: 14.8, biz: 1.5, tourism: 1.2, hub: 4, fee: 1.6 },
  { code: 'CDG', name: 'Paris', country: 'France', lat: 49.01, lon: 2.55, pop: 12.4, biz: 1.3, tourism: 1.4, hub: 3, fee: 1.3 },
  { code: 'FRA', name: 'Frankfurt', country: 'Germany', lat: 50.04, lon: 8.56, pop: 5.8, biz: 1.3, tourism: 0.7, hub: 3, fee: 1.2 },
  { code: 'MAD', name: 'Madrid', country: 'Spain', lat: 40.49, lon: -3.57, pop: 6.8, biz: 1.0, tourism: 1.3, hub: 2, fee: 1.0 },
  { code: 'KEF', name: 'Reykjavík', country: 'Iceland', lat: 63.99, lon: -22.62, pop: 0.3, biz: 0.6, tourism: 1.5, hub: 1, fee: 0.9 },
  { code: 'IST', name: 'Istanbul', country: 'Türkiye', lat: 41.26, lon: 28.74, pop: 15.6, biz: 1.0, tourism: 1.2, hub: 3, fee: 0.9 },
  { code: 'DXB', name: 'Dubai', country: 'UAE', lat: 25.25, lon: 55.36, pop: 3.6, biz: 1.4, tourism: 1.3, hub: 3, fee: 1.0 },
  { code: 'JNB', name: 'Johannesburg', country: 'South Africa', lat: -26.14, lon: 28.24, pop: 9.6, biz: 0.9, tourism: 0.9, hub: 1, fee: 0.8 },
  { code: 'DEL', name: 'Delhi', country: 'India', lat: 28.56, lon: 77.10, pop: 32.0, biz: 0.8, tourism: 0.9, hub: 2, fee: 0.7 },
  { code: 'SIN', name: 'Singapore', country: 'Singapore', lat: 1.36, lon: 103.99, pop: 5.9, biz: 1.4, tourism: 1.1, hub: 3, fee: 1.1 },
  { code: 'HKG', name: 'Hong Kong', country: 'China', lat: 22.31, lon: 113.92, pop: 7.5, biz: 1.4, tourism: 1.1, hub: 3, fee: 1.2 },
  { code: 'ICN', name: 'Seoul', country: 'South Korea', lat: 37.46, lon: 126.44, pop: 25.0, biz: 1.1, tourism: 1.0, hub: 3, fee: 1.0 },
  { code: 'HND', name: 'Tokyo', country: 'Japan', lat: 35.55, lon: 139.78, pop: 37.0, biz: 1.3, tourism: 1.1, hub: 4, fee: 1.4 },
  { code: 'SYD', name: 'Sydney', country: 'Australia', lat: -33.94, lon: 151.18, pop: 5.3, biz: 1.1, tourism: 1.3, hub: 2, fee: 1.1 },
];

// Aircraft fields:
//   seats, range (km), speed (km/h cruise), burn (kg fuel per km),
//   price (USD new), crewHr / mxHr (USD per block hour)
export const AIRCRAFT = [
  { id: 'atr72', name: 'ATR 72-600', maker: 'ATR', category: 'Turboprop', seats: 70, range: 1500, speed: 510, burn: 0.85, price: 26e6, crewHr: 900, mxHr: 450 },
  { id: 'e175', name: 'Embraer E175', maker: 'Embraer', category: 'Regional jet', seats: 76, range: 3700, speed: 780, burn: 1.9, price: 30e6, crewHr: 1200, mxHr: 600 },
  { id: 'a220', name: 'Airbus A220-300', maker: 'Airbus', category: 'Narrowbody', seats: 140, range: 6200, speed: 830, burn: 2.3, price: 45e6, crewHr: 1600, mxHr: 750 },
  { id: 'a320', name: 'Airbus A320neo', maker: 'Airbus', category: 'Narrowbody', seats: 180, range: 6300, speed: 830, burn: 2.6, price: 55e6, crewHr: 1900, mxHr: 900 },
  { id: 'a321xlr', name: 'Airbus A321XLR', maker: 'Airbus', category: 'Narrowbody', seats: 200, range: 8700, speed: 830, burn: 2.9, price: 68e6, crewHr: 2100, mxHr: 1000 },
  { id: 'b789', name: 'Boeing 787-9', maker: 'Boeing', category: 'Widebody', seats: 290, range: 14000, speed: 900, burn: 7.0, price: 145e6, crewHr: 5200, mxHr: 2600 },
  { id: 'a359', name: 'Airbus A350-900', maker: 'Airbus', category: 'Widebody', seats: 320, range: 15000, speed: 900, burn: 7.4, price: 160e6, crewHr: 5600, mxHr: 2800 },
  { id: 'b77w', name: 'Boeing 777-300ER', maker: 'Boeing', category: 'Widebody', seats: 380, range: 13600, speed: 900, burn: 9.2, price: 175e6, crewHr: 6400, mxHr: 3300 },
];

export const SERVICE_LEVELS = [
  { level: 1, name: 'No frills', costPerPax: 2, appeal: 0.85, rep: 30 },
  { level: 2, name: 'Basic', costPerPax: 6, appeal: 0.94, rep: 45 },
  { level: 3, name: 'Standard', costPerPax: 12, appeal: 1.0, rep: 60 },
  { level: 4, name: 'Premium', costPerPax: 20, appeal: 1.08, rep: 72 },
  { level: 5, name: 'Luxury', costPerPax: 32, appeal: 1.15, rep: 85 },
];

export const cityByCode = Object.fromEntries(CITIES.map((c) => [c.code, c]));
export const aircraftById = Object.fromEntries(AIRCRAFT.map((a) => [a.id, a]));
