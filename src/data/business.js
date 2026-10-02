// Business data: staff roles, service standards, contracts and their templates.

// Annual market salary in USD before regional adjustment; weeks to hire/train.
export const ROLES = {
  pilots: { name: 'Pilots', salary: 185e3, train: 6, union: 'Pilots union', severanceWeeks: 26 },
  cabin: { name: 'Cabin crew', salary: 52e3, train: 3, union: 'Flight attendants union', severanceWeeks: 8 },
  engineers: { name: 'Engineers', salary: 95e3, train: 4, union: 'Engineers union', severanceWeeks: 12 },
  ground: { name: 'Ground staff', salary: 42e3, train: 1, union: null, severanceWeeks: 4 },
  admin: { name: 'Head office', salary: 78e3, train: 1, union: null, severanceWeeks: 8 },
};
export const ROLE_IDS = Object.keys(ROLES);

// Service standards, each 1-5. cost is USD per passenger per hour of flight at
// each level (index 0 = level 1); appeal is the multiplier on attractiveness.
export const SERVICE = {
  catering: { name: 'Catering', cost: [0, 1.5, 3, 5, 8], appeal: [0.93, 0.97, 1.0, 1.03, 1.06], desc: 'Meals and drinks. Matters more on long flights.' },
  comfort: { name: 'Cabin comfort & amenities', cost: [0, 0.5, 1.2, 2.2, 3.5], appeal: [0.94, 0.98, 1.0, 1.03, 1.05], desc: 'Pillows, blankets, amenity kits, cleanliness.' },
  ground: { name: 'Airport experience', cost: [1, 2, 3, 5, 8], appeal: [0.95, 0.98, 1.0, 1.02, 1.04], desc: 'Check-in staffing, priority lanes, transfer desks. Cost per passenger.', perPax: true },
  baggage: { name: 'Baggage policy', cost: [0, 0, 0, 0, 0], appeal: [0.92, 0.96, 1.0, 1.02, 1.04], ancillary: [0.12, 0.08, 0.05, 0.03, 0.015], desc: 'Level 1 charges for everything (big ancillaries, unhappy flyers); level 5 is generous.' },
  loyalty: { name: 'Frequent flyer program', cost: [0, 0.6, 1.2, 2, 3], appeal: [0.96, 0.99, 1.0, 1.03, 1.06], desc: 'Points, status tiers and partner earning. Builds repeat business.', perPax: true },
};
export const SERVICE_IDS = Object.keys(SERVICE);

// Charter contract templates. pax: minimum seats; weeks: duration; rt: round trips per week.
export const CHARTER_TEMPLATES = [
  { kind: 'Sports team', client: ['National Football League team', 'European football club', 'NBA franchise', 'Rugby national side', 'F1 team logistics'], seats: [60, 200], weeks: [2, 8], rt: [1, 2], rate: 1.35 },
  { kind: 'Tour operator', client: ['TUI', 'Sunwing Vacations', 'Jet2holidays', 'Thomas Cook Group', 'Club Med'], seats: [150, 300], weeks: [8, 26], rt: [1, 3], rate: 1.05, leisure: true },
  { kind: 'Cruise line', client: ['Royal Caribbean', 'Carnival', 'MSC Cruises', 'Norwegian Cruise Line'], seats: [180, 350], weeks: [4, 16], rt: [1, 2], rate: 1.1, leisure: true },
  { kind: 'Pilgrimage', client: ['Hajj & Umrah operator', 'Religious travel group'], seats: [250, 450], weeks: [4, 8], rt: [2, 4], rate: 1.15, dest: ['JED'] },
  { kind: 'Concert tour', client: ['Stadium world tour', 'Music festival promoter'], seats: [80, 180], weeks: [2, 6], rt: [1, 2], rate: 1.4 },
  { kind: 'Corporate shuttle', client: ['Energy company crew change', 'Mining company FIFO', 'Tech company campus shuttle'], seats: [70, 180], weeks: [13, 52], rt: [3, 7], rate: 1.2 },
];

// Special operations contracts.
export const SPECIAL_TEMPLATES = [
  { kind: 'Military airlift', desc: 'Troop and equipment rotations under a government reserve airlift program. Needs a widebody.', minCat: ['wide', 'jumbo'], weeks: [8, 26], rate: 1.6, rep: 2, gov: true },
  { kind: 'Government VIP transport', desc: 'Head-of-state and delegation flights on demand. Narrowbody with premium cabin.', minCat: ['narrow', 'wide'], needsJ: true, weeks: [4, 13], rate: 1.8, rep: 3, gov: true },
  { kind: 'Humanitarian relief', desc: 'UN/NGO relief flights into disaster zones. Low margins, good publicity.', minCat: ['narrow', 'wide', 'jumbo', 'freighter'], weeks: [2, 8], rate: 0.95, rep: 5 },
  { kind: 'ACMI wet lease', desc: 'Provide aircraft, crew, maintenance and insurance to another airline at an hourly rate.', minCat: ['regional', 'narrow', 'wide'], weeks: [13, 39], rate: 1.25, rep: 0 },
  { kind: 'Medical evacuation', desc: 'Repatriation and aeromedical flights for an insurer. Regional or narrowbody.', minCat: ['turboprop', 'regional', 'narrow'], weeks: [13, 26], rate: 1.3, rep: 2 },
  { kind: 'Cargo surge charter', desc: 'E-commerce peak-season capacity for an integrator. Needs a freighter.', minCat: ['freighter'], weeks: [4, 13], rate: 1.5, rep: 0 },
];

// Long-running businesses you can invest in.
export const VENTURES = {
  academy: { name: 'Pilot training academy', desc: 'Train cadets for paying customers and supply your own pilot pipeline at lower cost.', cost: 18e6, weeks: 26, revenue: 220e3, opex: 140e3, levels: 3 },
  mro3p: { name: 'Third-party MRO sales', desc: 'Sell spare hangar capacity to other airlines. Requires a heavy hangar and engineers.', cost: 2e6, weeks: 4, revenue: 300e3, opex: 170e3, levels: 3, needs: 'hangar' },
  handling: { name: 'Ground handling for other airlines', desc: 'Handle rival carriers at your hubs. Uses ground staff.', cost: 5e6, weeks: 8, revenue: 160e3, opex: 105e3, levels: 3 },
  simulator: { name: 'Simulator & type-rating centre', desc: 'Full-flight simulators rented to other operators; cuts your own training time.', cost: 30e6, weeks: 39, revenue: 260e3, opex: 120e3, levels: 2 },
};

export const RATINGS = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'];
export const RATING_SPREAD = { AAA: 0.006, AA: 0.009, A: 0.013, BBB: 0.019, BB: 0.03, B: 0.045, CCC: 0.08, D: 0.15 };
