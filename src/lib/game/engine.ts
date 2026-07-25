import type {
  GameState,
  Player,
  Position,
  Priority,
  Stand,
  Staff,
  StaffRole,
  StaffStats,
  WeekLedger,
  FixtureResult,
  LeagueRow,
  TransferTarget,
  IncomingBid,
  LiveMatch,
  MatchEvent,
  HalfTimeOption,
} from "./types";


const STORAGE_KEY = "chairman.save.v1";

/* ---------- RNG (seedable via Math.random for v1) ---------- */
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
const pick = <T,>(arr: T[]) => arr[randInt(0, arr.length - 1)];

/* ---------- Name pools ---------- */
const FIRST = ["J","A","M","R","T","S","D","C","L","N","P","K","B","H","O","E","G","F","W","V"];
const LAST = [
  "Cahill","Potter","Hughes","Morris","Ellis","Brooks","Reid","Walsh","Ward","Kane",
  "Bailey","Fraser","Ainsley","Palmer","Foden","Rice","Saka","Gordon","Watkins","Bowen",
  "Clarke","Owen","Sterling","Grealish","Maddison","Toney","Isak","Nunes","Fabian","Onana",
];
const CLUBS = [
  "Dalton Town","Ashford City","Millbrook","Northfield","Redwood FC","Kingsbridge","Halewood United",
  "Stanmoor","Fairwind","Portlee","Blackrock Athletic","Silverdale","Whitby Rangers","Broadmarsh",
  "Ravencliff","Elmshire","Highgate","Marston Vale","Kingsley","Sandborough","Oakhaven","Ridgeport",
];

/* ---------- Generation ---------- */
function makePlayer(pos: Position, quality: number): Player {
  const rating = Math.max(45, Math.min(90, Math.round(quality + rand(-6, 6))));
  const age = randInt(17, 34);
  const wage = Math.round((rating ** 2.1) / 8) * 5; // £/week
  const value = Math.round(wage * 52 * (rating / 60) * rand(1.2, 2.5));
  return {
    id: crypto.randomUUID(),
    name: `${pick(FIRST)} ${pick(LAST)}`,
    position: pos,
    rating,
    age,
    wage,
    contractWeeks: randInt(38, 38 * 3),
    value,
  };
}

function makeSquad(quality: number): Player[] {
  const s: Player[] = [];
  for (let i = 0; i < 3; i++) s.push(makePlayer("GK", quality - 2));
  for (let i = 0; i < 8; i++) s.push(makePlayer("DEF", quality));
  for (let i = 0; i < 8; i++) s.push(makePlayer("MID", quality));
  for (let i = 0; i < 6; i++) s.push(makePlayer("FWD", quality + 2));
  return s;
}

function makeFixtures(clubName: string): { week: number; opponent: string; home: boolean }[] {
  const opponents = CLUBS.filter((c) => c !== clubName).slice(0, 19);
  const fx: { week: number; opponent: string; home: boolean }[] = [];
  let w = 1;
  for (const o of opponents) {
    fx.push({ week: w++, opponent: o, home: true });
  }
  for (const o of opponents) {
    fx.push({ week: w++, opponent: o, home: false });
  }
  return fx;
}

function makeLeague(clubName: string): LeagueRow[] {
  return [clubName, ...CLUBS.filter((c) => c !== clubName).slice(0, 19)].map((team) => ({
    team, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0,
  }));
}

/* ---------- Staff ---------- */
export const STAFF_ROLES: StaffRole[] = [
  "Manager",
  "Assistant Manager",
  "Head Coach",
  "Goalkeeping Coach",
  "Fitness Coach",
  "Head of Youth",
  "Head of Transfers",
  "Chief Scout",
  "Scout",
  "Head Physio",
  "Sports Scientist",
];

// Which stats matter most for each role — used to weight overall rating & wage
const ROLE_WEIGHTS: Record<StaffRole, Partial<Record<keyof StaffStats, number>>> = {
  "Manager":            { tactics: 3, motivation: 2, attack: 1, defense: 1 },
  "Assistant Manager":  { tactics: 2, motivation: 2, development: 1 },
  "Head Coach":         { attack: 2, defense: 2, development: 2 },
  "Goalkeeping Coach":  { defense: 3, development: 2 },
  "Fitness Coach":      { medical: 2, development: 2 },
  "Head of Youth":      { development: 3, scouting: 2 },
  "Head of Transfers":  { negotiation: 3, scouting: 2 },
  "Chief Scout":        { scouting: 3, negotiation: 1 },
  "Scout":              { scouting: 2 },
  "Head Physio":        { medical: 3 },
  "Sports Scientist":   { medical: 2, development: 2 },
};

// Base wage £/wk multiplier per role at rating 60
const ROLE_BASE_WAGE: Record<StaffRole, number> = {
  "Manager": 8_500,
  "Assistant Manager": 4_200,
  "Head Coach": 3_600,
  "Goalkeeping Coach": 2_400,
  "Fitness Coach": 2_000,
  "Head of Youth": 2_800,
  "Head of Transfers": 4_500,
  "Chief Scout": 2_600,
  "Scout": 1_100,
  "Head Physio": 2_100,
  "Sports Scientist": 2_300,
};

function makeStaffStats(role: StaffRole, base: number): StaffStats {
  const keys: (keyof StaffStats)[] = [
    "tactics","attack","defense","development","scouting","negotiation","medical","motivation",
  ];
  const weights = ROLE_WEIGHTS[role];
  const stats = {} as StaffStats;
  for (const k of keys) {
    const boosted = weights[k] ? base + rand(2, 10) * weights[k]! : base + rand(-14, 6);
    stats[k] = Math.max(30, Math.min(95, Math.round(boosted)));
  }
  return stats;
}

function overallFor(role: StaffRole, stats: StaffStats): number {
  const weights = ROLE_WEIGHTS[role];
  let sum = 0, wsum = 0;
  for (const [k, w] of Object.entries(weights) as [keyof StaffStats, number][]) {
    sum += stats[k] * w; wsum += w;
  }
  return Math.round(sum / Math.max(1, wsum));
}

export function makeStaff(role: StaffRole, quality = 60): Staff {
  const base = Math.max(35, Math.min(92, quality + rand(-8, 10)));
  const stats = makeStaffStats(role, base);
  const rating = overallFor(role, stats);
  const wage = Math.round((ROLE_BASE_WAGE[role] * Math.pow(rating / 60, 2.4)) / 50) * 50;
  return {
    id: crypto.randomUUID(),
    name: `${pick(FIRST)}. ${pick(LAST)}`,
    role,
    age: randInt(28, 62),
    rating,
    stats,
    wage,
    contractWeeks: randInt(38, 38 * 3),
    reputation: Math.max(20, Math.min(95, Math.round(rating + rand(-8, 6)))),
  };
}

function makeCandidatePool(): Staff[] {
  const pool: Staff[] = [];
  // Deep talent pool with wide variance — journeymen through elite.
  // Each role gets many candidates across the whole ability spectrum.
  const spec: [StaffRole, number][] = [
    ["Manager", 10],
    ["Assistant Manager", 8],
    ["Head Coach", 8],
    ["Goalkeeping Coach", 6],
    ["Fitness Coach", 6],
    ["Head of Youth", 6],
    ["Head of Transfers", 6],
    ["Chief Scout", 6],
    ["Scout", 16],
    ["Head Physio", 6],
    ["Sports Scientist", 6],
  ];
  for (const [role, n] of spec) {
    for (let i = 0; i < n; i++) {
      // Quality skewed across the full 35-92 band for real variance
      const q = 35 + Math.round(Math.pow(Math.random(), 0.9) * 57);
      pool.push(makeStaff(role, q));
    }
  }
  return pool;
}

export const hiredStaffWagesWeekly = (s: GameState) =>
  (s.hiredStaff ?? []).reduce((a, st) => a + st.wage, 0);

/* ---------- Staff join terms ----------
 * Reputation gap between staff and club drives willingness.
 * - gap <= 5:  happy to join at listed wage
 * - gap 6-15: will join but demands a wage premium
 * - gap 16-25: will only entertain a big overpay
 * - gap > 25: refuses outright — club is too small
 */
export interface JoinTerms {
  willing: boolean;
  wageDemand: number;   // £/wk they'll actually sign for
  signingBonus: number; // upfront cash
  premiumPct: number;   // % over listed wage (0 = none)
  note: string;
}

export function staffJoinTerms(clubReputation: number, staff: Staff): JoinTerms {
  const gap = staff.reputation - clubReputation;
  let premiumPct = 0;
  let willing = true;
  let note = "Happy to join";

  if (gap > 25) {
    willing = false;
    premiumPct = 1.5;
    note = "Won't consider a club this size";
  } else if (gap > 15) {
    premiumPct = 0.6 + (gap - 15) * 0.05;
    note = "Demands a huge overpay";
  } else if (gap > 5) {
    premiumPct = 0.15 + (gap - 5) * 0.03;
    note = "Wants a wage premium";
  } else if (gap < -10) {
    premiumPct = -0.05;
    note = "Keen — club is a step up";
  }

  const wageDemand = Math.max(200, Math.round((staff.wage * (1 + premiumPct)) / 50) * 50);
  const signingBonus = wageDemand * 2;
  return { willing, wageDemand, signingBonus, premiumPct, note };
}

/* ---------- Initial state ---------- */
export function newGame(clubName: string, managerName: string): GameState {
  const stands: Stand[] = [
    { key: "N", name: "North Stand", capacity: 6000, condition: 92, ticketPrice: 22 },
    { key: "E", name: "East Stand",  capacity: 5000, condition: 88, ticketPrice: 26 },
    { key: "S", name: "South Stand", capacity: 6000, condition: 90, ticketPrice: 22 },
    { key: "W", name: "West Stand",  capacity: 7000, condition: 94, ticketPrice: 30 },
  ];
  return {
    version: 1,
    clubName,
    managerName,
    season: 1,
    week: 1,
    cash: 2_500_000,
    reputation: 55,
    fanHappiness: 70,
    stands,
    pitchCondition: 90,
    trainingRating: 65,
    trainingWeeklyCost: 4_200,
    staffWagesWeekly: 18_500,
    utilitiesWeekly: 6_800,
    maintenanceWeekly: 3_400,
    squad: makeSquad(66),
    sponsors: [
      { name: "Main Kit Sponsor", weekly: 14_000, weeksLeft: 38 * 2 },
      { name: "Stadium Naming",   weekly: 5_000,  weeksLeft: 38 * 3 },
      { name: "Training Wear",    weekly: 2_200,  weeksLeft: 20 },
    ],
    fixtures: makeFixtures(clubName),
    results: [],
    ledger: [],
    league: makeLeague(clubName),
    hiredStaff: [],
    staffCandidates: makeCandidatePool(),
    staffMarketRefreshedWeek: 1,
  };
}

/* ---------- Derived ---------- */
export const totalCapacity = (s: GameState) =>
  s.stands.reduce((a, b) => a + b.capacity, 0);

export const avgTicketPrice = (s: GameState) => {
  const totalCap = totalCapacity(s);
  return s.stands.reduce((a, b) => a + b.ticketPrice * b.capacity, 0) / totalCap;
};

export const playerWagesWeekly = (s: GameState) =>
  s.squad.reduce((a, p) => a + p.wage, 0);

export const squadRating = (s: GameState) => {
  const top16 = [...s.squad].sort((a, b) => b.rating - a.rating).slice(0, 16);
  return top16.reduce((a, p) => a + p.rating, 0) / top16.length;
};

export const totalWeeklyExpenses = (s: GameState) =>
  playerWagesWeekly(s) +
  s.staffWagesWeekly +
  s.utilitiesWeekly +
  s.maintenanceWeekly +
  s.trainingWeeklyCost;

export const weeklySponsorIncome = (s: GameState) =>
  s.sponsors.reduce((a, sp) => a + (sp.weeksLeft > 0 ? sp.weekly : 0), 0);

/* ---------- Match simulation ---------- */
function simAttendance(s: GameState, isHome: boolean, opponentStrength: number): number {
  if (!isHome) return 0;
  const cap = totalCapacity(s);
  const avgPrice = avgTicketPrice(s);
  // reference price scales with reputation
  const refPrice = 15 + s.reputation * 0.4;
  const priceFactor = Math.max(0.15, 1 - Math.pow(Math.max(0, avgPrice - refPrice) / refPrice, 1.4));
  const happinessFactor = 0.55 + s.fanHappiness / 200;   // 0.55 - 1.05
  const opponentFactor = 0.85 + opponentStrength / 400;  // 0.85 - 1.10
  const noise = rand(0.9, 1.05);
  const raw = cap * priceFactor * happinessFactor * opponentFactor * noise;
  return Math.max(500, Math.min(cap, Math.round(raw)));
}

function simGoals(strength: number, oppStrength: number): number {
  const diff = strength - oppStrength;
  const lambda = Math.max(0.2, 1.3 + diff / 20);
  // Poisson-ish
  let g = 0;
  let p = Math.exp(-lambda);
  let cum = p, r = Math.random(), k = 0;
  while (r > cum && k < 8) { k++; p = (p * lambda) / k; cum += p; g = k; }
  return g;
}

/* ---------- Weekly advance ---------- */
export function advanceWeek(prev: GameState): GameState {
  const s: GameState = structuredClone(prev);
  const fixture = s.fixtures.find((f) => f.week === s.week);
  const ledger: WeekLedger = {
    week: s.week,
    season: s.season,
    income: { gate: 0, tv: 0, sponsor: 0, merchandise: 0, prize: 0, transfers: 0, other: 0 },
    expenses: {
      playerWages: 0, staffWages: 0, stadiumOps: 0, trainingOps: 0,
      maintenance: 0, matchday: 0, transfers: 0, other: 0,
    },
    net: 0,
    balance: 0,
  };

  // ---- Expenses (fixed weekly) ----
  ledger.expenses.playerWages = playerWagesWeekly(s);
  ledger.expenses.staffWages  = s.staffWagesWeekly + hiredStaffWagesWeekly(s);
  ledger.expenses.stadiumOps  = s.utilitiesWeekly;
  ledger.expenses.trainingOps = s.trainingWeeklyCost;
  ledger.expenses.maintenance = s.maintenanceWeekly;

  // ---- Recurring income ----
  ledger.income.sponsor = weeklySponsorIncome(s);
  ledger.income.merchandise = Math.round(400 + s.reputation * 90 + s.fanHappiness * 30);

  // ---- Matchday ----
  let fxResult: FixtureResult | null = null;
  if (fixture) {
    const myStrength = squadRating(s);
    const oppStrength = 55 + Math.random() * 20;
    const gf = simGoals(myStrength + (fixture.home ? 3 : 0), oppStrength);
    const ga = simGoals(oppStrength, myStrength + (fixture.home ? 3 : 0));
    const attendance = simAttendance(s, fixture.home, oppStrength);
    // weighted avg ticket price
    const avgPrice = avgTicketPrice(s);
    const gate = Math.round(attendance * avgPrice);
    const tv = 22_000 + Math.round(Math.random() * 8000);
    const matchdayOps = fixture.home ? Math.round(6_500 + attendance * 0.4) : 3_200;

    ledger.income.gate = gate;
    ledger.income.tv = tv;
    ledger.expenses.matchday = matchdayOps;

    const result: "W" | "D" | "L" = gf > ga ? "W" : gf === ga ? "D" : "L";
    fxResult = {
      week: s.week, opponent: fixture.opponent, home: fixture.home,
      goalsFor: gf, goalsAgainst: ga, attendance,
      gateReceipts: gate, tvIncome: tv, result,
    };

    // fan happiness update
    const swing = result === "W" ? 4 : result === "D" ? 0 : -5;
    s.fanHappiness = Math.max(5, Math.min(100, s.fanHappiness + swing));
    // reputation drifts
    s.reputation = Math.max(20, Math.min(95, s.reputation + (result === "W" ? 0.4 : result === "L" ? -0.3 : 0)));

    // league update
    const my = s.league.find((r) => r.team === s.clubName)!;
    const opp = s.league.find((r) => r.team === fixture.opponent)!;
    if (my && opp) {
      my.p++; opp.p++;
      my.gf += gf; my.ga += ga;
      opp.gf += ga; opp.ga += gf;
      if (result === "W") { my.w++; my.pts += 3; opp.l++; }
      else if (result === "L") { my.l++; opp.w++; opp.pts += 3; }
      else { my.d++; my.pts += 1; opp.d++; opp.pts += 1; }
    }
    ledger.matchdayNote = `${fixture.home ? "H" : "A"} vs ${fixture.opponent} — ${gf}-${ga} ${result}`;
  }

  // ---- Simulate other league games (light) ----
  const others = s.league.filter((r) => r.team !== s.clubName);
  for (let i = 0; i < 4; i++) {
    const a = pick(others), b = pick(others);
    if (a === b) continue;
    const ag = randInt(0, 3), bg = randInt(0, 3);
    a.p++; b.p++; a.gf += ag; a.ga += bg; b.gf += bg; b.ga += ag;
    if (ag > bg) { a.w++; a.pts += 3; b.l++; }
    else if (ag < bg) { b.w++; b.pts += 3; a.l++; }
    else { a.d++; b.d++; a.pts++; b.pts++; }
  }

  // ---- Sponsors tick ----
  for (const sp of s.sponsors) sp.weeksLeft = Math.max(0, sp.weeksLeft - 1);

  // ---- Player contracts tick ----
  for (const p of s.squad) p.contractWeeks = Math.max(0, p.contractWeeks - 1);

  // ---- Staff contracts tick + auto-refresh candidate market every 4 weeks ----
  for (const st of s.hiredStaff) st.contractWeeks = Math.max(0, st.contractWeeks - 1);
  if (s.week - (s.staffMarketRefreshedWeek ?? 0) >= 4) {
    s.staffCandidates = makeCandidatePool();
    s.staffMarketRefreshedWeek = s.week;
  }

  // ---- Ticket price backlash ----
  // Fans compare average ticket price against a market reference driven by
  // club reputation. Push more than 25% above and happiness ticks down; more
  // than 50% above and reputation itself starts to slide.
  const refPriceNow = 15 + s.reputation * 0.4;
  const avgPriceNow = avgTicketPrice(s);
  const overRatio = avgPriceNow / refPriceNow;
  if (overRatio > 1.25) {
    const excess = overRatio - 1.25;
    s.fanHappiness = Math.max(5, Math.round(s.fanHappiness - Math.min(6, excess * 12)));
    if (overRatio > 1.5) {
      s.reputation = Math.max(20, s.reputation - Math.min(0.6, (overRatio - 1.5) * 0.8));
    }
  } else if (overRatio < 0.75 && s.fanHappiness < 100) {
    // Bargain pricing — small happiness boost
    s.fanHappiness = Math.min(100, s.fanHappiness + 1);
  }

  // ---- Pitch decay ----
  s.pitchCondition = Math.max(35, s.pitchCondition - (fixture?.home ? 3 : 1));

  // ---- Roll up ledger ----
  const inc = Object.values(ledger.income).reduce((a, b) => a + b, 0);
  const exp = Object.values(ledger.expenses).reduce((a, b) => a + b, 0);
  ledger.net = inc - exp;
  s.cash = Math.round(s.cash + ledger.net);
  ledger.balance = s.cash;
  s.ledger.push(ledger);
  if (fxResult) s.results.push(fxResult);

  // ---- Advance clock ----
  s.week += 1;
  if (s.week > 38) {
    // end of season: prize money based on league position
    const sorted = [...s.league].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
    const pos = sorted.findIndex((r) => r.team === s.clubName) + 1;
    const prize = Math.round(4_000_000 * Math.max(0.15, (21 - pos) / 20));
    s.cash += prize;
    // record as own ledger entry
    s.ledger.push({
      week: 38, season: s.season,
      income: { gate: 0, tv: 0, sponsor: 0, merchandise: 0, prize, transfers: 0, other: 0 },
      expenses: { playerWages: 0, staffWages: 0, stadiumOps: 0, trainingOps: 0, maintenance: 0, matchday: 0, transfers: 0, other: 0 },
      net: prize, balance: s.cash,
      matchdayNote: `SEASON END — Finished ${pos}${ordinal(pos)}. Prize £${prize.toLocaleString()}`,
    });
    // reset
    s.season += 1;
    s.week = 1;
    s.fixtures = makeFixtures(s.clubName);
    s.results = [];
    s.league = makeLeague(s.clubName);
    // age players + minor rating drift
    for (const p of s.squad) {
      p.age += 1;
      if (p.age > 30) p.rating = Math.max(45, p.rating - randInt(0, 2));
      else if (p.age < 25) p.rating = Math.min(93, p.rating + randInt(0, 1));
    }
  }
  return s;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/* ---------- Storage ---------- */
export function loadGame(): GameState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.version !== 1) return null;
    // Backwards-compat migration for saves created before staff feature
    if (!parsed.hiredStaff) parsed.hiredStaff = [];
    if (!parsed.staffCandidates) parsed.staffCandidates = makeCandidatePool();
    if (parsed.staffMarketRefreshedWeek == null) parsed.staffMarketRefreshedWeek = parsed.week;
    return parsed;
  } catch { return null; }
}

export function saveGame(state: GameState) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function clearGame() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/* ---------- Formatting ---------- */
export const fmtMoney = (n: number) => {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}£${(abs / 1_000).toFixed(1)}k`;
  return `${sign}£${abs.toFixed(0)}`;
};

export const fmtMoneyExact = (n: number) => {
  const sign = n < 0 ? "-" : "";
  return `${sign}£${Math.abs(Math.round(n)).toLocaleString()}`;
};
