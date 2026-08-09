import type {
  GameState,
  Player,
  Position,
  Stand,
  Staff,
  StaffRole,
  StaffStats,
  WeekLedger,
  FixtureResult,
  LeagueRow,
  LiveMatch,
  MatchEvent,
  HalfTimeOption,
  ScheduledFixture,
  MatchRecord,
  League,
} from "./types";
import { runWeeklyGenerators } from "./inbox";
import {
  ensureRecruitment, runRecruitmentWeek, closeRecruitmentSeason,
  rollRecruitmentToNewSeason,
} from "./recruitment";
import {
  ensureInfrastructure, runInfrastructureWeek, rollInfrastructureToNewSeason,
  stadiumCapacity, stadiumUsableCapacity, facilityModifiers,
} from "./infrastructure";
import { ensureSustainability, runSustainabilityWeek } from "./sustainability";
import { ensureCommercial, runCommercialWeek, closeCommercialSeason } from "./commercial";

import { CLUBS } from "./clubs";
import {
  makeRecord, resolveWeek, resolveRemainingSeason, syncTable, hasFullSchedule, simulateFixture,
  isSeasonComplete, buildTable, fixtureId, leagueOf, playerLeagueId, leagueClubs,
} from "./league";
import { mulberry32, hashString } from "./rng";
import {
  matchIdentity, matchSeedBase, preMatchKey, matchStream, seedOf,
  weatherFor, halfGoals, halfPresentation, liveTvIncome, liveOpponentStrength,
} from "./matchday";

import {
  initClubReputations, storePredictions, clubStrengthFor,
} from "./reputation";
import {
  makeLeagues, makePyramidSchedule, makeClubRecords, applySeasonRollover,
  weekForLeagueRound, DIVISION_ONE, findLeague, scheduleForLeague, CLUBS_PER_DIVISION,
} from "./pyramid";
import {
  makeBoard, ensureBoard, maybeRunMidSeasonReview, runEndOfSeasonReview,
  rollBoardToNewSeason,
} from "./board";
import {
  ensureFinance, initFinance, postEntry, migrateLegacyLedger, postRecurringWeek,
  postMatchdayFinance, syncWeekLedger, awardPrizeMoney,
  closeSeasonFinance, openSeasonFinance,
} from "./finance";



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

export { weekForLeagueRound };

/** Default tier-1 membership for a club (new games / legacy helpers). */
export function leagueTeams(clubName: string): string[] {
  return makeLeagues(clubName)[0].clubIds;
}

/** Clubs in the user's division this season. */
export function userLeagueTeams(s: GameState): string[] {
  return leagueClubs(s, playerLeagueId(s));
}

/** Whole-pyramid schedule for a season. */
export function makeLeagueSchedule(leagues: League[], seed: string): ScheduledFixture[] {
  return makePyramidSchedule(leagues, seed);
}

/** User-club fixtures for a fresh tier-1 season (kept for legacy callers/tests). */
export function makeFixtures(clubName: string, seed: string) {
  const leagues = makeLeagues(clubName);
  return fixturesForClub(scheduleForLeague(leagues[0], seed), clubName);
}

/** The user's own fixture list, derived from the pyramid schedule so it can
 *  never drift from the division's real fixtures. */
export function fixturesForClub(
  schedule: ScheduledFixture[],
  club: string,
): { week: number; opponent: string; home: boolean }[] {
  return schedule
    .filter((f) => f.home === club || f.away === club)
    .map((f) => ({
      week: f.week,
      opponent: f.home === club ? f.away : f.home,
      home: f.home === club,
    }))
    .sort((a, b) => a.week - b.week);
}

function makeLeague(teams: string[]): LeagueRow[] {
  return teams.map((team) => ({ team, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
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

function makeStaffStats(role: StaffRole, base: number, rand01: () => number = Math.random): StaffStats {
  const rnd = (min: number, max: number) => min + rand01() * (max - min);
  const keys: (keyof StaffStats)[] = [
    "tactics","attack","defense","development","scouting","negotiation","medical","motivation",
  ];
  const weights = ROLE_WEIGHTS[role];
  const stats = {} as StaffStats;
  for (const k of keys) {
    const boosted = weights[k] ? base + rnd(2, 10) * weights[k]! : base + rnd(-14, 6);
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

/**
 * Build one staff member. `rand01` supplies all randomness so the caller
 * controls reproducibility; it defaults to Math.random for ad-hoc use, but
 * every in-game path passes a seeded generator.
 */
export function makeStaff(role: StaffRole, quality = 60, rand01: () => number = Math.random): Staff {
  const rnd = (min: number, max: number) => min + rand01() * (max - min);
  const rndInt = (min: number, max: number) => Math.floor(rnd(min, max + 1));
  const one = <T,>(arr: T[]) => arr[rndInt(0, arr.length - 1)];

  const base = Math.max(35, Math.min(92, quality + rnd(-8, 10)));
  const stats = makeStaffStats(role, base, rand01);
  const rating = overallFor(role, stats);
  const wage = Math.round((ROLE_BASE_WAGE[role] * Math.pow(rating / 60, 2.4)) / 50) * 50;
  return {
    // Deterministic id: derived from the draw, never crypto.randomUUID, so a
    // replayed week produces an identical candidate list.
    id: `ST-${Math.floor(rand01() * 0xffffffff).toString(16).padStart(8, "0")}`,
    name: `${one(FIRST)}. ${one(LAST)}`,
    role,
    age: rndInt(28, 62),
    rating,
    stats,
    wage,
    contractWeeks: rndInt(38, 38 * 3),
    reputation: Math.max(20, Math.min(95, Math.round(rating + rnd(-8, 6)))),
  };
}

/**
 * The rolling staff market. Seeded from the save so refreshing the pool is a
 * pure function of (saveSeed, season, week) rather than wall-clock randomness.
 */
function makeCandidatePool(rand01: () => number = Math.random): Staff[] {
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
      const q = 35 + Math.round(Math.pow(rand01(), 0.9) * 57);
      pool.push(makeStaff(role, q, rand01));
    }
  }
  return pool;
}

/** Seeded refresh of the staff market for a given save + calendar slot. */
function staffPoolFor(s: GameState): Staff[] {
  return makeCandidatePool(mulberry32(hashString(`staffmarket|${s.saveSeed}|${s.season}|${s.week}`)));
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

export function staffJoinTerms(
  clubReputation: number,
  staff: Staff,
  /** Canonical infrastructure staffAttraction points (see facilityModifiers). */
  staffAttraction = 0,
): JoinTerms {
  // Facilities read as club standing to a prospective employee: capped so a
  // small club with a great training ground is still a small club.
  const effectiveRep = clubReputation + Math.max(-8, Math.min(8, staffAttraction));
  const gap = staff.reputation - effectiveRep;
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
  const base = _newGameSeed(clubName, managerName);
  // Pre-season projection for season 1 (derived from starting reputations).
  storePredictions(base, base.season);
  ensureBoard(base);
  ensureCommercial(base);
  // Opening cash is booked as a real ledger entry, so the books reconcile
  // from the very first week.
  initFinance(base);
  // Canonical football world: players, contracts and squads for every club.
  ensureRecruitment(base);
  // Canonical physical club: stands, pitch, facilities and capital projects.
  ensureInfrastructure(base);
  // Strategic pressure layer. Owns only commitments + the idle-cash clock;
  // every number it reports is derived from the systems above.
  ensureSustainability(base);

  return runWeeklyGenerators(base);
}

/**
 * Canonical save schema version. Single source of truth: `newGame` stamps it,
 * `migrateSave` upgrades to it, and the verification suites import it rather
 * than keeping their own copies (which silently rot on every migration).
 * Bump this whenever a new `if (p.version < N)` migration step is added.
 */
export const SAVE_VERSION = 12;

function _newGameSeed(clubName: string, managerName: string): GameState {
  const saveSeed = `${clubName}|${managerName}|${Date.now().toString(36)}`;

  const stands: Stand[] = [
    { key: "N", name: "North Stand", capacity: 6000, condition: 92, ticketPrice: 22 },
    { key: "E", name: "East Stand",  capacity: 5000, condition: 88, ticketPrice: 26 },
    { key: "S", name: "South Stand", capacity: 6000, condition: 90, ticketPrice: 22 },
    { key: "W", name: "West Stand",  capacity: 7000, condition: 94, ticketPrice: 30 },
  ];
  const leagues = makeLeagues(clubName);
  const leagueSchedule = makePyramidSchedule(leagues, `${saveSeed}|season1`);
  return {
    version: SAVE_VERSION,
    saveSeed,
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
    // Canonical squad lives in GameState.football; this is a rebuilt projection.
    squad: [],
    sponsors: [
      { name: "Main Kit Sponsor", weekly: 14_000, weeksLeft: 38 * 2 },
      { name: "Stadium Naming",   weekly: 5_000,  weeksLeft: 38 * 3 },
      { name: "Training Wear",    weekly: 2_200,  weeksLeft: 20 },
    ],
    fixtures: fixturesForClub(leagueSchedule, clubName),
    leagues,
    playerLeagueId: DIVISION_ONE,
    leagueSchedule,
    matchRecords: [],
    seasonHistory: [],
    clubRecords: makeClubRecords(leagues),
    clubReputations: initClubReputations(leagues, saveSeed),
    seasonPredictions: [],
    clubSnapshots: [],
    results: [],
    ledger: [],
    league: makeLeague(leagues[0].clubIds),
    hiredStaff: [],
    staffCandidates: makeCandidatePool(),
    staffMarketRefreshedWeek: 1,
    transferBudget: 500_000,
    wageBudgetWeekly: 5_000,
    liveMatch: null,
    inbox: [],
    inboxFlags: {},
    scheduledGenerators: [],
    board: makeBoard(saveSeed, clubName),
    finance: {
      openingSeasonBalance: 0,
      openingSeasonNumber: 1,
      minimumCashReserve: 0,
      boardSpendingPolicy: "Balanced",
      policySeason: 1,
      budgets: { wages: 0, transfers: 0, facilities: 0, commercial: 0, contingency: 0 },
      nextEntryId: 1,
    },
    financeLedger: [],
    financeHistory: [],
    commercial: undefined as unknown as GameState["commercial"],
    football: undefined as unknown as GameState["football"],
    infrastructure: undefined as unknown as GameState["infrastructure"],
    sustainability: undefined as unknown as GameState["sustainability"],
  };

}


/* ---------- Derived ---------- */
/**
 * Nominal stadium capacity. Read from the canonical infrastructure assets;
 * the legacy `stands` array is only a fallback for saves mid-migration.
 */
export const totalCapacity = (s: GameState) =>
  stadiumCapacity(s) || s.stands.reduce((a, b) => a + b.capacity, 0);

/**
 * Capacity actually saleable this week (condition + construction aware).
 *
 * The legacy-save fallback keys off whether the infrastructure model has any
 * stands at all — NOT off a zero result. A stadium closed by ruinous condition
 * legitimately returns 0, and must not silently fall back to full capacity.
 */
export const usableCapacity = (s: GameState) =>
  stadiumCapacity(s) > 0 ? stadiumUsableCapacity(s) : totalCapacity(s);

export const avgTicketPrice = (s: GameState) => {
  const totalCap = s.stands.reduce((a, b) => a + b.capacity, 0);
  if (totalCap <= 0) return 0;
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
function simAttendance(
  s: GameState, isHome: boolean, opponentStrength: number, rng: () => number = Math.random,
): number {
  if (!isHome) return 0;
  // Attendance can never exceed the capacity the club can actually open.
  const cap = usableCapacity(s);
  const avgPrice = avgTicketPrice(s);
  // reference price scales with reputation
  const refPrice = 15 + s.reputation * 0.4;
  const priceFactor = Math.max(0.15, 1 - Math.pow(Math.max(0, avgPrice - refPrice) / refPrice, 1.4));
  const happinessFactor = 0.55 + s.fanHappiness / 200;   // 0.55 - 1.05
  const opponentFactor = 0.85 + opponentStrength / 400;  // 0.85 - 1.10
  const noise = 0.9 + rng() * 0.15;
  // Parking and fan-zone quality make coming to the ground easier.
  const convenience = facilityModifiers(s).attendanceConvenience;
  const raw = cap * priceFactor * happinessFactor * opponentFactor * noise * convenience;
  return Math.max(0, Math.min(cap, Math.round(raw)));
}

/**
 * Poisson-ish goal draw. Callers pass their own seeded generator so results
 * are replay-safe; `Math.random` is only the fallback for legacy call sites.
 */
function simGoals(strength: number, oppStrength: number, rand: () => number = Math.random): number {
  const diff = strength - oppStrength;
  const lambda = Math.max(0.2, 1.3 + diff / 20);
  let g = 0;
  let p = Math.exp(-lambda);
  let cum = p, r = rand(), k = 0;
  while (r > cum && k < 8) { k++; p = (p * lambda) / k; cum += p; g = k; }
  return g;
}

/* ---------- Weekly advance ---------- */
export interface MatchOverride {
  gf: number; ga: number; attendance: number;
  gate: number; tv: number; matchdayOps: number;
  winBonus: number;
}

/**
 * Advance the game by exactly one week.
 *
 * CONTRACT: this is a pure function. Given the same input state it MUST
 * produce a byte-identical output state — that property is enforced by
 * `__checks__/integration.check.ts` [I1] across a whole season. Consequences:
 *
 *   - No `Math.random()`, `Date.now()` or `crypto.randomUUID()` anywhere in
 *     the tick. Seed from `saveSeed` + season + week instead.
 *   - No module-level mutable state. Counters live on GameState
 *     (e.g. `finance.nextEntryId`).
 *   - `prev` is never mutated; all work happens on a structuredClone.
 *
 * ORDER OF OPERATIONS (each stage may read everything written before it):
 *
 *   1. Infrastructure  — deterioration, project instalments, works completion.
 *                        Runs first so matchday sees this week's true condition.
 *   2. Recurring       — wages, operations, maintenance, admin, distributions.
 *   3. Commercial      — sponsor payments, expiries, new approaches.
 *   4. Recruitment     — contracts, negotiations, AI transfer activity.
 *   5. Matchday        — the user's fixture (or a friendly), then the rest of
 *                        the round. Books gate/TV/hospitality via the ledger.
 *   6. World tick      — sponsors, staff contracts, ticket-price backlash.
 *   7. Roll-up         — project the WeekLedger row, resolve the round, rebuild
 *                        the table from records.
 *   8. Clock           — increment the week; past SEASON_END_WEEK this triggers
 *                        the atomic season rollover (see below).
 *   9. Board + inbox   — mid-season review checkpoint, weekly generators.
 *
 * Every financial stage posts through the finance ledger with a per-week
 * dedupe key, so a replayed week cannot double-charge.
 */
export function advanceWeek(prev: GameState, override?: MatchOverride): GameState {
  const s: GameState = structuredClone(prev);
  const fixture = s.fixtures.find((f) => f.week === s.week);
  ensureFinance(s);

  // ---- Recurring income + expenditure ----
  // Wages, operations, maintenance, admin, commercial and the league
  // distribution. Every stream is posted through the finance ledger with a
  // per-week dedupe key, so replaying a week cannot double-charge.
  runInfrastructureWeek(s);
  postRecurringWeek(s);

  // ---- Commercial department: sponsorship payments, expiries, approaches ----
  runCommercialWeek(s);

  // ---- Football operation: contracts, negotiations, AI recruitment ----
  runRecruitmentWeek(s, isTransferWindowOpen(s));

  let matchdayNote: string | undefined;

  // ---- Matchday ----
  let fxResult: FixtureResult | null = null;
  if (fixture) {
    let gf: number, ga: number, attendance: number, gate: number, tv: number, matchdayOps: number;
    // The scheduled fixture this result belongs to (schedule-backed saves).
    const sched = hasFullSchedule(s)
      ? s.leagueSchedule.find(
          (f) => f.week === s.week &&
            ((f.home === s.clubName && f.away === fixture.opponent) ||
             (f.away === s.clubName && f.home === fixture.opponent)),
        )
      : undefined;
    const homeClub = fixture.home ? s.clubName : fixture.opponent;
    const awayClub = fixture.home ? fixture.opponent : s.clubName;
    if (override) {
      ({ gf, ga, attendance, gate, tv, matchdayOps } = override);
    } else {
      // Auto-resolved user match: exactly the same deterministic engine the
      // AI fixtures use, so reloading before the week reproduces the result.
      const myStrength = squadRating(s);
      const oppStrength = clubStrengthFor(s, fixture.opponent, s.season);
      const round = sched?.round ?? s.week;
      const lid = sched ? leagueOf(sched) : playerLeagueId(s);
      const sim = simulateFixture(s, s.season, round, homeClub, awayClub, lid, {
        homeStrength: fixture.home ? myStrength : oppStrength,
        awayStrength: fixture.home ? oppStrength : myStrength,
      });
      gf = fixture.home ? sim.homeGoals : sim.awayGoals;
      ga = fixture.home ? sim.awayGoals : sim.homeGoals;
      const rng = mulberry32(hashString(`matchday|${sim.seed}`));
      attendance = simAttendance(s, fixture.home, oppStrength, rng);
      const avgPrice = avgTicketPrice(s);
      gate = Math.round(attendance * avgPrice);
      tv = 22_000 + Math.round(rng() * 8000);
      matchdayOps = fixture.home ? Math.round(6_500 + attendance * 0.4) : 3_200;
    }

    // Single matchday-finance path shared by auto-resolved and live matches.
    // Away fixtures book no gate, hospitality or concessions.
    postMatchdayFinance(s, {
      season: s.season, week: s.week,
      opponent: fixture.opponent, home: fixture.home,
      attendance, gate, tv, matchdayOps,
      winBonus: override?.winBonus ?? 0,
      fixtureId: makeFixtureId(
        s.season, sched?.round ?? s.week, homeClub, awayClub,
        sched ? leagueOf(sched) : playerLeagueId(s),
      ),
      modifiers: facilityModifiers(s),
    });


    const result: "W" | "D" | "L" = gf > ga ? "W" : gf === ga ? "D" : "L";
    fxResult = {
      week: s.week, opponent: fixture.opponent, home: fixture.home,
      goalsFor: gf, goalsAgainst: ga, attendance: fixture.home ? attendance : 0,
      gateReceipts: fixture.home ? gate : 0, tvIncome: tv, result,
    };

    const swing = result === "W" ? 4 : result === "D" ? 0 : -5;
    s.fanHappiness = Math.max(5, Math.min(100, s.fanHappiness + swing));
    s.reputation = Math.max(20, Math.min(95, s.reputation + (result === "W" ? 0.4 : result === "L" ? -0.3 : 0)));

    if (hasFullSchedule(s)) {
      // Record-driven league: store the user's fixture, resolve every AI
      // fixture in the same round, then project the table from records.
      if (sched) {
        const home = homeClub;
        const away = awayClub;
        const lid = leagueOf(sched);
        const id = fixtureId(s.season, sched.round, home, away, lid);
        const already = s.matchRecords.some((r) => r.id === id);
        const userRecord: MatchRecord | undefined = already ? undefined : makeRecord({
          leagueId: lid,
          season: s.season, week: s.week, round: sched.round,
          home, away,
          homeGoals: fixture.home ? gf : ga,
          awayGoals: fixture.home ? ga : gf,
          userInvolved: true,
        });
        resolveWeek(s, s.week, userRecord);
      }
    } else {
      // Legacy (pre-v3) in-progress season: no full schedule, keep the old
      // incremental two-club update so existing saves stay consistent.
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
    }
    matchdayNote = `${fixture.home ? "H" : "A"} vs ${fixture.opponent} — ${gf}-${ga} ${result}`;
  } else if (!override && FRIENDLY_WEEKS.has(s.week)) {
    // ---- Friendly (pre-season / mid-season windows) ----
    // Seeded from the save + calendar slot so replaying the same pre-week
    // state reproduces the same friendly, exactly like a league fixture.
    const rng = mulberry32(hashString(`friendly|${s.saveSeed}|${s.season}|${s.week}`));
    const others = CLUBS.filter((c) => c !== s.clubName);
    const opp = others[Math.floor(rng() * others.length)];
    const oppStrength = 50 + rng() * 25;
    const myStrength = squadRating(s);
    const gf = simGoals(myStrength + 2, oppStrength, rng);
    const ga = simGoals(oppStrength, myStrength + 2, rng);
    // Friendly attendance is a fraction of a league day
    const cap = usableCapacity(s);
    const attendance = Math.round(cap * (0.28 + rng() * 0.18) * (0.6 + s.fanHappiness / 200));
    const gate = Math.round(attendance * avgTicketPrice(s) * 0.7);
    const matchdayOps = Math.round(4_200 + attendance * 0.3);
    postMatchdayFinance(s, {
      season: s.season, week: s.week,
      opponent: `${opp} (friendly)`, home: true,
      attendance, gate, tv: 0, matchdayOps,
      modifiers: facilityModifiers(s),
    });
    const result: "W" | "D" | "L" = gf > ga ? "W" : gf === ga ? "D" : "L";
    // Friendlies don't touch the league table; tiny happiness swing only
    s.fanHappiness = Math.max(5, Math.min(100, s.fanHappiness + (result === "W" ? 1 : result === "L" ? -1 : 0)));
    fxResult = {
      week: s.week, opponent: `${opp} (friendly)`, home: true,
      goalsFor: gf, goalsAgainst: ga, attendance,
      gateReceipts: gate, tvIncome: 0, result,
    };
    matchdayNote = `Friendly vs ${opp} — ${gf}-${ga} ${result}`;
  }


  // ---- Legacy fallback only ----
  // Pre-v3 saves have no full division schedule, so the old "sprinkle four
  // random AI results" hack keeps their table moving. Schedule-backed saves
  // resolve every real fixture in resolveWeek() instead.
  const inLeague = phaseOf(s.week) === "firstHalf" || phaseOf(s.week) === "secondHalf";
  if (inLeague && !hasFullSchedule(s)) {
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
  }

  // ---- Sponsors tick ----
  for (const sp of s.sponsors) sp.weeksLeft = Math.max(0, sp.weeksLeft - 1);

  // ---- Staff contracts tick + auto-refresh candidate market every 4 weeks ----
  for (const st of s.hiredStaff) st.contractWeeks = Math.max(0, st.contractWeeks - 1);
  if (s.week - (s.staffMarketRefreshedWeek ?? 0) >= 4) {
    s.staffCandidates = staffPoolFor(s);
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
  // Owned entirely by infrastructure.ts (deteriorationFor factors home usage
  // into the pitch asset). The legacy field is a projection, never mutated here.

  // ---- Weekly roll-up ----
  // Cash was already moved by the finance ledger; the legacy WeekLedger row
  // is a projection of this week's entries, rebuilt on every post.
  syncWeekLedger(s, s.season, s.week);

  // ---- Strategic pressure ----
  // Runs after the books are settled so it reads the finished week. Ages the
  // idle-cash clock and settles due commitments. Posts nothing to the ledger.
  runSustainabilityWeek(s);
  if (matchdayNote) {
    const row = s.ledger.find((l) => l.season === s.season && l.week === s.week);
    if (row) row.matchdayNote = matchdayNote;
  }
  if (fxResult) s.results.push(fxResult);

  // ---- Resolve any remaining AI fixtures for this round, then project table ----
  resolveWeek(s, s.week);
  syncTable(s);

  // ---- Advance clock ----
  s.week += 1;
  if (s.week > SEASON_END_WEEK) {
    // Season completion is defined by fixtures resolved, not by the calendar.
    // Any fixture still outstanding (e.g. a skipped week) is resolved first.
    resolveRemainingSeason(s);
    syncTable(s);
    // Atomic pyramid rollover: finalise every division, write immutable
    // history, then move promoted/relegated clubs. Guarded against replays.
    const closingSeason = s.season;
    const closingLeagueId = playerLeagueId(s);
    const closingLeague = findLeague(s, closingLeagueId);
    const rollover = applySeasonRollover(s);
    // End of season: configuration-driven league prize money, awarded exactly
    // once (guarded by a ledger dedupe key, not by the calendar).
    const sorted = [...s.league].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
    const pos = sorted.findIndex((r) => r.team === s.clubName) + 1;
    if (closingLeague && pos > 0) {
      const award = awardPrizeMoney(s, closingSeason, closingLeague, pos);
      if (award) {
        const row = s.ledger.find((l) => l.season === closingSeason && l.week === SEASON_END_WEEK);
        if (row) {
          row.matchdayNote =
            `SEASON END — Finished ${pos}${ordinal(pos)}. Prize £${award.total.toLocaleString()}`;
        }
      }
    }
    // Board's final judgement on the season just completed. Must run before
    // the season counter moves so it is filed against the correct season.
    runEndOfSeasonReview(s);
    // Immutable financial record of the season just closed.
    closeSeasonFinance(s, closingSeason, closingLeagueId);
    // Immutable commercial record of the season just closed.
    closeCommercialSeason(s, closingSeason);
    // Immutable recruitment record of the season just closed.
    closeRecruitmentSeason(s, closingSeason);



    // reset
    s.season += 1;
    s.week = 1;
    if (s.leagues?.length) {
      s.leagueSchedule = makePyramidSchedule(s.leagues, `${s.saveSeed}|season${s.season}`);
      s.fixtures = fixturesForClub(s.leagueSchedule, s.clubName);
      s.league = makeLeague(userLeagueTeams(s));
    } else {
      s.fixtures = makeFixtures(s.clubName, `${s.saveSeed}|season${s.season}`);
      s.leagueSchedule = [];
      s.league = makeLeague(leagueTeams(s.clubName));
    }
    // matchRecords and seasonHistory are permanent — never cleared.
    s.results = [];
    // Season-outcome mail (announcement only — no financial effects yet).
    for (const it of rollover.items) {
      if (!s.inbox.some((x) => x.eventKey === it.eventKey)) s.inbox.push({ ...it, week: 1, season: s.season });
    }
    // Player ageing and revaluation happen in the canonical football world;
    // GameState.squad is re-projected from it.
    // Refresh player valuations for the new season (no development yet).
    rollRecruitmentToNewSeason(s);
    // Physical plant ages one year and re-derives its projections.
    rollInfrastructureToNewSeason(s);
    // New season objectives, derived from the freshly stored projection.
    rollBoardToNewSeason(s);
    // Open the new season's books: opening balance, policy and budgets.
    openSeasonFinance(s, s.season);
  }


  // Mid-season board checkpoint (exactly once per season).
  ensureBoard(s);
  maybeRunMidSeasonReview(s);

  return runWeeklyGenerators(s);
}


function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/* ---------- Storage ---------- */
/**
 * Save schema migrations.
 *
 * v1 → v2 (Inbox Stabilisation Pass 1)
 *   Added:
 *     - GameState.saveSeed             — stable per-save seed for deterministic RNG
 *     - InboxItem.eventKey             — stable dedup key
 *     - InboxItem.expiresAtAbsoluteWeek — canonical deadline on absolute axis
 *     - ScheduledGenerator.dueAtAbsoluteWeek — canonical due time on absolute axis
 *   Converted:
 *     - ScheduledGenerator.{dueWeek, dueSeason} → dueAtAbsoluteWeek
 *     - InboxItem.expiresWeek → expiresAtAbsoluteWeek (assumed within saved season)
 *     - inboxFlags.fansWarnedAtWeek → fansWarnedAtAbsoluteWeek (using saved season)
 *   Fallback: any unrecognised legacy scheduled entry is dropped; any legacy
 *   inbox item missing an eventKey is assigned one derived from its id.
 */
export function migrateSave(parsed: Record<string, unknown>): GameState {
  const p = parsed as unknown as Omit<GameState, "version"> & { version: number };

  // Treat a save with no version field as v1 (versioning was introduced late,
  // so pre-versioning saves must still migrate rather than be discarded).
  if (typeof p.version !== "number" || !Number.isFinite(p.version)) p.version = 1;

  const arr = <T,>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);

  p.hiredStaff = arr(p.hiredStaff, []);
  if (!Array.isArray(p.staffCandidates)) p.staffCandidates = staffPoolFor(p as unknown as GameState);
  if (p.staffMarketRefreshedWeek == null) p.staffMarketRefreshedWeek = p.week;
  if (p.transferBudget == null) p.transferBudget = 500_000;
  if (p.wageBudgetWeekly == null) p.wageBudgetWeekly = 5_000;
  // Retired with the Recruitment milestone: scouting priorities were only read
  // by the removed legacy shortlist generator.
  delete (p as unknown as Record<string, unknown>).positionPriorities;
  // Retired legacy transfer state (pre-recruitment schema). Dropped on
  // migration so no gameplay path can read two competing transfer models.
  delete (p as unknown as Record<string, unknown>).transferTargets;
  delete (p as unknown as Record<string, unknown>).incomingBids;
  delete (p as unknown as Record<string, unknown>).completedTransfers;
  p.ledger = arr(p.ledger, []);
  p.results = arr(p.results, []);
  if (p.liveMatch === undefined) p.liveMatch = null;
  p.inbox = arr(p.inbox, []);
  if (!p.inboxFlags || typeof p.inboxFlags !== "object") p.inboxFlags = {};
  p.scheduledGenerators = arr(p.scheduledGenerators, []);

  // v1 → v2

  if (p.version < 2) {
    if (!p.saveSeed) p.saveSeed = `${p.clubName}|${p.managerName}|legacy-v1`;

    // Inbox items: fill eventKey + convert expiresWeek → expiresAtAbsoluteWeek
    for (const it of p.inbox) {
      if (!it.eventKey) it.eventKey = `legacy:${it.generatorId}:${it.id}`;
      if (it.expiresAtAbsoluteWeek == null && it.expiresWeek != null) {
        // Legacy expiresWeek was week-of-season within the item's own season.
        it.expiresAtAbsoluteWeek = absoluteWeekLocal(it.season, it.expiresWeek);
      }
    }

    // Scheduled generators: convert (dueSeason, dueWeek) → dueAtAbsoluteWeek.
    // A malformed entry must not silently disappear — if we can't recover a
    // due time we make it due immediately so the follow-up still fires.
    const nowAbs = absoluteWeekLocal(p.season, p.week);
    p.scheduledGenerators = p.scheduledGenerators
      .filter((g) => g && typeof g === "object" && typeof g.generatorId === "string")
      .map((g) => {
        if (typeof g.dueAtAbsoluteWeek === "number" && Number.isFinite(g.dueAtAbsoluteWeek))
          return g;
        if (g.dueSeason != null && g.dueWeek != null) {
          return { ...g, dueAtAbsoluteWeek: absoluteWeekLocal(g.dueSeason, g.dueWeek) };
        }
        return { ...g, dueAtAbsoluteWeek: nowAbs };
      });


    // Cooldown flag: convert week-of-season → absolute (using saved season)
    const legacyWarn = p.inboxFlags["fansWarnedAtWeek"];
    if (legacyWarn != null && p.inboxFlags["fansWarnedAtAbsoluteWeek"] == null) {
      p.inboxFlags["fansWarnedAtAbsoluteWeek"] = absoluteWeekLocal(p.season, Number(legacyWarn));
      delete p.inboxFlags["fansWarnedAtWeek"];
    }

    p.version = 2;
  }

  // v2 → v3: league simulation foundation.
  //
  // Completed history is never rewritten. A v2 save has no full division
  // schedule and no match records, so its CURRENT season stays on the legacy
  // user-only path (existing table and results are left exactly as they are).
  // The full schedule + AI simulation switch on at the next season rollover.
  if (p.version < 3) {
    if (!Array.isArray(p.matchRecords)) p.matchRecords = [];
    if (!Array.isArray(p.leagueSchedule)) p.leagueSchedule = [];
    p.version = 3;
  }

  // v3 → v4: multi-division pyramid.
  //
  // The ACTIVE season is never restructured. A v3 save keeps its existing
  // single-division schedule, table, records and results exactly as they are;
  // the second division is created empty-of-fixtures alongside it and only
  // starts playing at the next season rollover, when the whole pyramid is
  // rescheduled. Existing tier-1 fixtures have no `league` field, which
  // leagueOf() reads as the tier-1 id, so old records stay valid.
  if (p.version < 4) {
    if (!Array.isArray(p.seasonHistory)) p.seasonHistory = [];
    if (!p.clubRecords || typeof p.clubRecords !== "object") p.clubRecords = {};
    if (!Array.isArray(p.leagues) || p.leagues.length === 0) {
      const fresh = makeLeagues(p.clubName);
      // Preserve the save's actual tier-1 membership if it has one.
      const existing = Array.isArray(p.league) ? p.league.map((r) => r.team) : [];
      if (existing.length === CLUBS_PER_DIVISION) fresh[0].clubIds = existing;
      // Tier 2 must never contain a tier-1 club.
      const t1 = new Set(fresh[0].clubIds);
      const pool = CLUBS.filter((c) => !t1.has(c));
      fresh[1].clubIds = pool.slice(0, CLUBS_PER_DIVISION);
      p.leagues = fresh;
    }
    if (!p.playerLeagueId) {
      p.playerLeagueId =
        p.leagues.find((l) => l.clubIds.includes(p.clubName))?.id ?? DIVISION_ONE;
    }
    if (!p.leagues.some((l) => l.clubIds.includes(p.clubName))) {
      const home = p.leagues.find((l) => l.id === p.playerLeagueId) ?? p.leagues[0];
      home.clubIds = [p.clubName, ...home.clubIds.slice(0, CLUBS_PER_DIVISION - 1)];
    }
    if (Object.keys(p.clubRecords).length === 0) p.clubRecords = makeClubRecords(p.leagues);
    p.version = 4;
  }

  // v4 → v5: club identity (reputation, derived strength, predictions).
  //
  // Only additive persistent fields. Historical seasons are never rewritten:
  // snapshots start empty and accumulate from the next completed season.
  // Reputation is seeded deterministically from each club's current tier, so
  // an existing save keeps a sensible pyramid shape immediately.
  if (p.version < 5) {
    if (!p.clubReputations || typeof p.clubReputations !== "object") p.clubReputations = {};
    const seeded = initClubReputations(p.leagues ?? [], p.saveSeed);
    for (const [club, rep0] of Object.entries(seeded)) {
      if (typeof p.clubReputations[club] !== "number") p.clubReputations[club] = rep0;
    }
    if (!Array.isArray(p.clubSnapshots)) p.clubSnapshots = [];
    if (!Array.isArray(p.seasonPredictions)) p.seasonPredictions = [];
    p.version = 5;
    // Project the current season if it has not been projected yet.
    if (!p.seasonPredictions.some((x) => x.season === p.season)) {
      storePredictions(p as unknown as GameState, p.season);
    }
  }

  // v5 → v6: Board of Directors.
  //
  // Purely additive. Directors are generated deterministically from the
  // save's own seed, so an existing save gets a stable boardroom that never
  // changes on reload. Objectives are built from the CURRENT season's stored
  // projection; no historical season is rewritten and no review is
  // back-filled — the board starts judging from the next review window.
  if (p.version < 6) {
    const st = p as unknown as GameState;
    if (!st.board || !Array.isArray(st.board.directors) || st.board.directors.length === 0) {
      st.board = makeBoard(p.saveSeed, p.clubName);
    }
    ensureBoard(st);
    p.version = 6;
  }

  // v6 → v7: club finance system.
  //
  // The legacy weekly ledger is converted into itemised finance entries with
  // a balancing opening position, so the rebuilt books reconcile exactly to
  // the save's real cash figure. No historical season summary is invented.
  if (p.version < 7) {
    const st = p as unknown as GameState;
    ensureFinance(st);
    migrateLegacyLedger(st);
    p.version = 7;
  }

  // v7 → v8: commercial department & sponsorship.
  //
  // Purely additive and deterministic: an empty department is created with a
  // sponsor pool seeded from the save's own seed. No historic sponsorship
  // contract is fabricated, and finance/board history is left untouched.
  if (p.version < 8) {
    ensureCommercial(p as unknown as GameState);
    p.version = 8;
  }

  // v8 → v9: football operation (players, contracts, squads, transfers).
  //
  // Additive, deterministic and idempotent. The world player database and
  // valid opening contracts are generated from the save's own seed; finance,
  // commercial, board, inbox and every history are left untouched, and no
  // transfer or contract history is invented for seasons already played.
  if (p.version < 9) {
    ensureRecruitment(p as unknown as GameState);
    p.version = 9;
  }

  // v9 → v10: infrastructure (physical assets, capital projects, maintenance).
  //
  // ensureInfrastructure() converts the legacy `stands`, `pitchCondition` and
  // `trainingRating` fields into canonical assets, preserving capacity and
  // condition exactly, then re-projects the legacy fields back from them so
  // older screens keep reading the same numbers. No cash moves, no ledger
  // entry is written and no history is invented — it is purely structural.
  if (p.version < 10) {
    const st = p as unknown as GameState;
    ensureInfrastructure(st);
    p.version = 10;
  }

  // v10 → v11: canonical live-match identity.
  //
  // LiveMatch gained a persisted seed root plus fixture/league/round identity
  // and a `committed` flag so an interactive match is deterministic,
  // resumable and exactly-once. Purely additive:
  //   - Saves with no match in flight are untouched.
  //   - An in-flight legacy match keeps its already-shown score, events,
  //     weather and attendance; only the missing identity fields are
  //     backfilled, derived from the save itself (no clock, no randomness),
  //     so the migration is deterministic and idempotent.
  //   - No historical MatchRecord, ledger entry or result is created, altered
  //     or fabricated.
  if (p.version < 11) {
    const st = p as unknown as GameState;
    const lm = st.liveMatch;
    if (lm) {
      const ident = matchIdentity(st);
      lm.matchSeed ??= ident
        ? matchSeedBase(st.saveSeed, ident, preMatchKey({ squadRating: squadRating(st) }))
        : `${st.saveSeed}|live-match|s${st.season}|w${st.week}|${lm.fixture.opponent}`;
      lm.fixtureId ??= ident?.fixtureId;
      lm.leagueId ??= ident?.leagueId;
      lm.season ??= st.season;
      lm.round ??= ident?.round;
      lm.homeClub ??= ident?.homeClub;
      lm.awayClub ??= ident?.awayClub;
      lm.committed ??= false;
    }
    p.version = 11;
  }

  // v11 -> v12: strategic pressure layer.
  //   - Adds SustainabilityState only. No cash, ledger entry, board review or
  //     historical record is created or altered, so the step is a pure
  //     structural upgrade and is idempotent by construction.
  if (p.version < 12) {
    ensureSustainability(p as unknown as GameState);
    p.version = 12;
  }

  // Every step above has run: the save is now at the current schema.
  p.version = SAVE_VERSION;


  return p as GameState;
}

// Local copy to avoid a circular import (time.ts is imported by inbox.ts,
// which is imported by engine.ts).
function absoluteWeekLocal(season: number, week: number): number {
  return (season - 1) * 46 + week;
}

export function loadGame(): GameState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const v = (parsed as { version?: number }).version;
    // Missing version = pre-versioning save, treat as v1. Only refuse saves
    // written by a FUTURE schema we don't understand.
    if (typeof v === "number" && v > 10) return null;
    const legacyV = typeof v === "number" && v >= 1 ? v : 1;
    const migrated = migrateSave(parsed);
    // If this save had no inbox at all (older than v2 introduction), seed it.
    const needsSeed = migrated.inbox.length === 0 && legacyV < 2;

    return needsSeed ? runWeeklyGenerators(migrated) : migrated;
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

/* =========================================================================
   TRANSFER WINDOWS + SCOUTING
   ========================================================================= */
export const CALENDAR = {
  preSeasonStart: 1,
  preSeasonEnd: 4,        // weeks 1-4: pre-season window open, friendlies
  firstHalfStart: 5,
  firstHalfEnd: 23,       // weeks 5-23: league round 1 (19 home)
  midSeasonStart: 24,
  midSeasonEnd: 27,       // weeks 24-27: mid-season window open, friendlies
  secondHalfStart: 28,
  secondHalfEnd: 46,      // weeks 28-46: league round 2 (19 away)
  seasonEnd: 46,
} as const;

export const SEASON_END_WEEK = CALENDAR.seasonEnd;
// Legacy exports kept for compatibility
export const WINDOW_PRESEASON_END = CALENDAR.preSeasonEnd;
export const WINDOW_MIDSEASON = CALENDAR.midSeasonStart;

// Weeks within pre/mid windows that stage a friendly (small gate, no league impact)
const FRIENDLY_WEEKS = new Set<number>([2, 4, 25, 27]);

export type SeasonPhase = "preseason" | "firstHalf" | "midseason" | "secondHalf";
export function phaseOf(week: number): SeasonPhase {
  if (week <= CALENDAR.preSeasonEnd) return "preseason";
  if (week <= CALENDAR.firstHalfEnd) return "firstHalf";
  if (week <= CALENDAR.midSeasonEnd) return "midseason";
  return "secondHalf";
}

export function isTransferWindowOpen(s: GameState): boolean {
  const p = phaseOf(s.week);
  return p === "preseason" || p === "midseason";
}

export function windowStatus(s: GameState): {
  open: boolean;
  label: string;
  detail: string;
} {
  const p = phaseOf(s.week);
  if (p === "preseason") {
    return {
      open: true,
      label: "Pre-season window OPEN",
      detail: `Closes end of week ${CALENDAR.preSeasonEnd} · ${CALENDAR.preSeasonEnd - s.week + 1}w left · friendlies in progress`,
    };
  }
  if (p === "midseason") {
    return {
      open: true,
      label: "Mid-season window OPEN",
      detail: `Closes end of week ${CALENDAR.midSeasonEnd} · ${CALENDAR.midSeasonEnd - s.week + 1}w left`,
    };
  }
  if (p === "firstHalf") {
    return {
      open: false,
      label: "Window closed — league in play",
      detail: `Mid-season window opens week ${CALENDAR.midSeasonStart} (${CALENDAR.midSeasonStart - s.week}w)`,
    };
  }
  return {
    open: false,
    label: "Window closed — league in play",
    detail: `Pre-season window opens next season (${CALENDAR.seasonEnd - s.week + 1}w)`,
  };
}

function positionNeed(s: GameState): Record<Position, number> {
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of s.squad) counts[p.position]++;
  const min: Record<Position, number> = { GK: 3, DEF: 8, MID: 8, FWD: 6 };
  const need: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  (Object.keys(counts) as Position[]).forEach((p) => {
    need[p] = Math.max(0.5, min[p] - counts[p] + 1);
  });
  return need;
}

/* =========================================================================
   MATCH DAY

   DETERMINISM STATUS — READ BEFORE EXTENDING
   -------------------------------------------------------------------------
   Both matchday paths are now fully seeded and replay-safe:

     - AUTO-RESOLVED (advanceWeek → resolveWeek, league fixtures, friendlies)
       seeds from (saveSeed, season, round, home, away).
     - INTERACTIVE (startMatchDay → kickoff → applyHalfTimeChoice → commit)
       seeds from `matchSeedBase(saveSeed, identity, preMatchKey)` in
       ./matchday, and the seed root is PERSISTED on LiveMatch.matchSeed.

   RNG substreams (./matchday) are independent generators, never one shared
   cursor: brief, weather, attendance, h1.score, h1.events, h1.cards,
   h2.score, h2.events, h2.cards, halftime, finance. Adding or removing a
   cosmetic draw therefore cannot move a scoreline, attendance or any money.

   Lifecycle:
     fixture -> brief -> first half -> halfTime -> second half -> fullTime
             -> commit (exactly once) -> weekly advance

   Resume safety: every stage's outputs are persisted, and every future draw
   is a pure function of the persisted seed root, so a reload at brief,
   halfTime or fullTime resumes byte-identically and nothing re-rolls.

   Exactly-once: commitLiveMatchAndAdvance is guarded by LiveMatch.committed
   AND by canonical fixture completion (a MatchRecord with the same
   fixtureId). All money flows through postMatchdayFinance, whose dedupe keys
   are derived from (season, week, opponent), so a duplicate invocation
   cannot duplicate a single pound.
   ========================================================================= */

function formGuide(s: GameState): string {
  const last5 = s.results.slice(-5).map((r) => r.result).join("");
  return last5 || "—";
}

export function startMatchDay(s: GameState): GameState {
  const fx = s.fixtures.find((f) => f.week === s.week);
  if (!fx) return s;
  const ident = matchIdentity(s);
  const ns: GameState = structuredClone(s);
  const ourStrength = squadRating(ns) + (fx.home ? 3 : 0);
  const seedBase = ident
    ? matchSeedBase(ns.saveSeed, ident, preMatchKey({ squadRating: squadRating(ns) }))
    : `${ns.saveSeed}|live-match|s${ns.season}|w${ns.week}|${fx.opponent}`;
  const oppStrength = liveOpponentStrength(seedBase);
  const projectedAttendance = simAttendance(
    ns, fx.home, oppStrength, matchStream(seedBase, "attendance"),
  );
  const weather = weatherFor(seedBase);
  const boardExpectation: LiveMatch["boardExpectation"] =
    ourStrength > oppStrength + 5
      ? "Win"
      : ourStrength > oppStrength - 3
        ? "Avoid defeat"
        : "Any result";
  ns.liveMatch = {
    fixture: fx,
    weather,
    projectedAttendance,
    boardExpectation,
    ourStrength,
    oppStrength,
    formGuide: formGuide(ns),
    events: [],
    ourGoals: 0,
    theirGoals: 0,
    status: "brief",
    attendance: 0,
    gateReceipts: 0,
    tvIncome: 0,
    matchdayOps: 0,
    winBonus: 0,
    matchSeed: seedBase,
    fixtureId: ident?.fixtureId,
    leagueId: ident?.leagueId,
    season: ns.season,
    round: ident?.round,
    homeClub: ident?.homeClub,
    awayClub: ident?.awayClub,
    committed: false,
  };
  return ns;
}

export function kickoff(s: GameState): GameState {
  if (!s.liveMatch || s.liveMatch.status !== "brief") return s;
  const ns: GameState = structuredClone(s);
  const lm = ns.liveMatch!;
  const seedBase = seedOf(lm);
  const { usGoals, themGoals } = halfGoals(seedBase, 1, lm.ourStrength, lm.oppStrength, 1, 1);
  lm.events = halfPresentation(seedBase, 1, 0, 45, usGoals, themGoals, lm.fixture.opponent);
  lm.ourGoals += usGoals;
  lm.theirGoals += themGoals;
  lm.status = "halfTime";
  const trailing = lm.ourGoals < lm.theirGoals;
  const level = lm.ourGoals === lm.theirGoals;
  lm.halfTimeOptions = [
    {
      id: "steady",
      label: "Stick with the plan",
      desc: "Trust the group, no changes.",
      attackMod: 1,
      defenseMod: 1,
      fanMod: 0,
      winBonusCost: 0,
    },
    {
      id: "attack",
      label: trailing ? "Throw men forward" : "Push for a win bonus",
      desc: trailing
        ? "All-out attack. Big risk at the back."
        : "Offer players a win bonus. Higher attack, cash out if we win.",
      attackMod: 1.3,
      defenseMod: 0.85,
      fanMod: 2,
      winBonusCost: level || trailing ? 40_000 : 75_000,
    },
    {
      id: "shutup",
      label: "Shut up shop",
      desc: "Sit deeper, protect the result. Fans may grumble.",
      attackMod: 0.7,
      defenseMod: 1.3,
      fanMod: -3,
      winBonusCost: 0,
    },
  ];
  return ns;
}

export function applyHalfTimeChoice(s: GameState, choiceId: string): GameState {
  if (!s.liveMatch || s.liveMatch.status !== "halfTime") return s;
  if (!s.liveMatch.halfTimeOptions) return s;
  const opt0 = s.liveMatch.halfTimeOptions.find((o) => o.id === choiceId);
  if (!opt0) return s;
  const ns: GameState = structuredClone(s);
  const lm = ns.liveMatch!;
  const opt = lm.halfTimeOptions!.find((o) => o.id === choiceId)!;
  lm.chosenNudgeId = choiceId;
  const seedBase = seedOf(lm);
  const { usGoals, themGoals } = halfGoals(
    seedBase, 2, lm.ourStrength, lm.oppStrength, opt.attackMod, opt.defenseMod,
  );
  lm.events = [
    ...lm.events,
    ...halfPresentation(seedBase, 2, 45, 90, usGoals, themGoals, lm.fixture.opponent),
  ];
  lm.ourGoals += usGoals;
  lm.theirGoals += themGoals;

  // finalise money — every figure deterministic, none of it booked yet
  lm.attendance = lm.fixture.home ? lm.projectedAttendance : 0;
  lm.gateReceipts = Math.round(lm.attendance * avgTicketPrice(ns));
  lm.tvIncome = liveTvIncome(seedBase);
  lm.matchdayOps = lm.fixture.home ? Math.round(6_500 + lm.attendance * 0.4) : 3_200;
  const result: "W" | "D" | "L" =
    lm.ourGoals > lm.theirGoals ? "W" : lm.ourGoals === lm.theirGoals ? "D" : "L";
  lm.winBonus = result === "W" ? opt.winBonusCost : 0;
  ns.fanHappiness = Math.max(5, Math.min(100, ns.fanHappiness + opt.fanMod));
  lm.status = "fullTime";
  return ns;
}

/**
 * Exactly-once full-time commit.
 * Guarded twice: by the LiveMatch.committed flag and by canonical fixture
 * completion. Neither a double click nor a resumed-then-recommitted save can
 * post money, create a second MatchRecord or advance the week again.
 */
export function commitLiveMatchAndAdvance(prev: GameState): GameState {
  if (!prev.liveMatch || prev.liveMatch.status !== "fullTime") return prev;
  const lm = prev.liveMatch;
  if (lm.committed) return { ...prev, liveMatch: null };
  if (lm.fixtureId && (prev.matchRecords ?? []).some((r) => r.id === lm.fixtureId)) {
    return { ...prev, liveMatch: null };
  }
  const cleared: GameState = { ...prev, liveMatch: null };
  return advanceWeek(cleared, {
    gf: lm.ourGoals,
    ga: lm.theirGoals,

    attendance: lm.attendance,
    gate: lm.gateReceipts,
    tv: lm.tvIncome,
    matchdayOps: lm.matchdayOps,
    winBonus: lm.winBonus,
  });
}

export function cancelLiveMatch(s: GameState): GameState {
  return { ...s, liveMatch: null };
}

export function setTransferBudget(
  s: GameState,
  amount: number,
): { state: GameState; ok: boolean; reason?: string } {
  const target = Math.max(0, Math.round(amount));
  const delta = target - s.transferBudget;
  if (delta > 0 && delta > s.cash) {
    return { state: s, ok: false, reason: "Not enough spendable cash to allocate" };
  }
  // The pot is real money: allocating moves cash out of the club's spendable
  // balance, releasing puts it back. Both legs are booked so the books
  // reconcile against cash at all times.
  const ns: GameState = structuredClone(s);
  ns.transferBudget = target;
  if (delta !== 0) {
    postEntry(ns, {
      category: "Transfers",
      subcategory: delta > 0 ? "Budget ring-fence" : "Budget release",
      description: delta > 0
        ? "Cash ring-fenced into the transfer budget"
        : "Unused transfer budget returned to spendable cash",
      amount: Math.abs(delta),
      direction: delta > 0 ? "expense" : "income",
      sourceSystem: "transfers",
    });
  }
  return { state: ns, ok: true };
}
export function setWageBudget(s: GameState, amount: number): GameState {
  return { ...s, wageBudgetWeekly: Math.max(0, Math.round(amount)) };
}

/* =========================================================================
   Facility & staff spending — every movement goes through postEntry()
   so cash, the finance ledger and the weekly projection stay reconciled.

   NOTE: expandStand(), upgradeTraining() and relayPitch() were retired with
   the infrastructure milestone. Physical work is now raised exclusively as a
   capital project through infrastructure.ts (approveProject / cancelProject),
   which owns cost, duration, disruption, risk and the finance postings.
========================================================================= */

export interface SpendResult { state: GameState; ok: boolean; reason?: string }



export function hireStaffMember(s: GameState, id: string): SpendResult {
  const cand = s.staffCandidates.find((c) => c.id === id);
  if (!cand) return { state: s, ok: false, reason: "Candidate no longer available" };
  if (s.hiredStaff.some((h) => h.role === cand.role)) {
    return { state: s, ok: false, reason: `You already employ a ${cand.role}. Sack them first.` };
  }
  const terms = staffJoinTerms(s.reputation, cand, facilityModifiers(s).staffAttraction);
  if (!terms.willing) {
    return { state: s, ok: false, reason: `${cand.name} won't join a club of this reputation.` };
  }
  if (s.cash < terms.signingBonus) {
    return { state: s, ok: false, reason: "Not enough cash for the signing bonus." };
  }
  const ns: GameState = structuredClone(s);
  ns.hiredStaff = [...ns.hiredStaff, { ...cand, wage: terms.wageDemand }];
  ns.staffCandidates = ns.staffCandidates.filter((c) => c.id !== id);
  postEntry(ns, {
    category: "Staff",
    subcategory: "Signing bonus",
    description: `Signing bonus — ${cand.name} (${cand.role})`,
    amount: terms.signingBonus,
    direction: "expense",
    sourceSystem: "staff",
    linkedEntityId: cand.id,
    dedupeKey: `staff-hire:${cand.id}`,
  });
  return { state: ns, ok: true };
}

export function sackStaffMember(s: GameState, id: string): SpendResult {
  const st = s.hiredStaff.find((h) => h.id === id);
  if (!st) return { state: s, ok: false, reason: "Not on the payroll" };
  const severance = st.wage * Math.min(12, Math.max(1, st.contractWeeks));
  const ns: GameState = structuredClone(s);
  ns.hiredStaff = ns.hiredStaff.filter((h) => h.id !== id);
  postEntry(ns, {
    category: "Staff",
    subcategory: "Severance",
    description: `Severance — ${st.name} (${st.role})`,
    amount: severance,
    direction: "expense",
    sourceSystem: "staff",
    linkedEntityId: st.id,
    dedupeKey: `staff-sack:${st.id}`,
  });
  return { state: ns, ok: true };
}

export function severanceFor(st: Staff): number {
  return st.wage * Math.min(12, Math.max(1, st.contractWeeks));
}
