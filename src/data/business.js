// Business data: staff roles, service standards, contracts and their templates.

// Workforces. salary = annual market pay of a fully-qualified mid-grade employee
// (before regional adjustment). Each role has a five-step ladder: three
// frontline grades, a supervisor grade and a manager grade.
//   span      frontline staff per supervisor
//   career    typical career length in years (drives retirement/turnover)
//   promote   typical years in grade before promotion to the next
//   contract  cost premium for agency/contract staff instead of employees
export const ROLES = {
  pilots: {
    name: 'Pilots', salary: 185e3, train: 6, union: 'Pilots union', severanceWeeks: 26, span: 20, career: 30, contract: 1.35,
    contractor: 'crew leasing agency', promote: [2, 6, 5, 6],
    grades: [
      { title: 'Second Officer', pay: 0.5 }, { title: 'First Officer', pay: 0.8 }, { title: 'Captain', pay: 1.3 },
      { title: 'Training Captain', pay: 1.5 }, { title: 'Chief Pilot', pay: 1.9 },
    ],
  },
  cabin: {
    name: 'Cabin crew', salary: 52e3, train: 3, union: 'Flight attendants union', severanceWeeks: 8, span: 25, career: 12, contract: 1.25,
    contractor: 'cabin crew agency', promote: [2, 4, 4, 5],
    grades: [
      { title: 'Flight Attendant', pay: 0.85 }, { title: 'Senior Flight Attendant', pay: 1.0 }, { title: 'Purser', pay: 1.2 },
      { title: 'Cabin Supervisor', pay: 1.4 }, { title: 'Cabin Services Manager', pay: 2.0 },
    ],
  },
  engineers: {
    name: 'Engineers', salary: 95e3, train: 4, union: 'Engineers union', severanceWeeks: 12, span: 15, career: 25, contract: 1.3,
    contractor: 'MRO labour contractor', promote: [3, 5, 5, 6],
    grades: [
      { title: 'Mechanic', pay: 0.75 }, { title: 'Licensed Engineer', pay: 1.0 }, { title: 'Senior Licensed Engineer', pay: 1.2 },
      { title: 'Shift Supervisor', pay: 1.4 }, { title: 'Maintenance Manager', pay: 1.9 },
    ],
  },
  ground: {
    name: 'Ground staff', salary: 42e3, train: 1, union: 'Ground workers union', severanceWeeks: 4, span: 20, career: 8, contract: 1.1,
    contractor: 'ground handling company', promote: [1, 3, 3, 4],
    grades: [
      { title: 'Customer Service Agent', pay: 0.9 }, { title: 'Senior Agent', pay: 1.05 }, { title: 'Duty Lead', pay: 1.2 },
      { title: 'Station Supervisor', pay: 1.4 }, { title: 'Station Manager', pay: 1.8 },
    ],
  },
  admin: {
    name: 'Head office', salary: 78e3, train: 1, union: 'Staff association', severanceWeeks: 8, span: 10, career: 15, contract: 1.2,
    contractor: 'business services outsourcer', promote: [2, 4, 5, 6],
    grades: [
      { title: 'Officer', pay: 0.8 }, { title: 'Senior Officer', pay: 1.0 }, { title: 'Specialist', pay: 1.25 },
      { title: 'Team Leader', pay: 1.45 }, { title: 'Head of Department', pay: 2.2 },
    ],
  },
};
export const SUPERVISOR = 3;
export const MANAGER = 4;
export const HR_POLICIES = {
  conciliatory: { name: 'Conciliatory', desc: 'Managers settle union claims in full. Industrial peace, higher wages.' },
  balanced: { name: 'Balanced', desc: 'Managers meet unions halfway. Occasional work-to-rule.' },
  hardline: { name: 'Hard-line', desc: 'Managers resist claims. Low wages, frequent industrial action.' },
};
export const ACTIONS = {
  'work-to-rule': { name: 'Work-to-rule', factor: 0.85 },
  sickout: { name: 'Sick-out', factor: 0.6 },
  strike: { name: 'Strike', factor: { pilots: 0.1, cabin: 0.35, engineers: 0.4, ground: 0.55, admin: 0.85 } },
};
export const ROLE_IDS = Object.keys(ROLES);

// Service standards, each 1-5. cost is USD per passenger per hour of flight at
// each level (index 0 = level 1); appeal is the multiplier on attractiveness.
export const SERVICE = {
  catering: { name: 'Catering', cost: [0, 1.5, 3, 5, 8], appeal: [0.93, 0.97, 1.0, 1.03, 1.06], desc: 'Meals and drinks. Matters more on long flights.' },
  comfort: { name: 'Cabin comfort & amenities', cost: [0, 0.5, 1.2, 2.2, 3.5], appeal: [0.94, 0.98, 1.0, 1.03, 1.05], desc: 'Pillows, blankets, amenity kits, cleanliness.' },
  ground: { name: 'Airport experience', cost: [1, 2, 3, 5, 8], appeal: [0.95, 0.98, 1.0, 1.02, 1.04], desc: 'Check-in staffing, priority lanes, transfer desks. Cost per passenger.', perPax: true },
  baggage: { name: 'Baggage policy', cost: [0, 0, 0, 0, 0], appeal: [0.92, 0.96, 1.0, 1.02, 1.04], ancillary: [0.12, 0.08, 0.05, 0.03, 0.015], desc: 'Level 1 charges for everything (big ancillaries, unhappy flyers); level 5 is generous.' },
  security: { name: 'Security & screening', cost: [0.5, 1.5, 3, 5, 8], appeal: [0.98, 0.99, 1.0, 1.0, 1.01], desc: 'Passenger and baggage screening, cockpit security, intelligence. Deters hijackings.', perPax: true },
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
