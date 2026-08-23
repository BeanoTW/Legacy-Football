/* New-game construction — extracted verbatim from engine.ts (Phase 0c).
 *
 * Owns the opening GameState and the canonical schema version. No tick logic
 * lives here; every subsystem seeds itself through its own `ensure*` entry.
 */
import type { GameState, Stand } from "./types";
import { runWeeklyGenerators } from "./inbox";
import { ensureRecruitment } from "./recruitment";
import { ensureInfrastructure } from "./infrastructure";
import { ensureSustainability } from "./sustainability";
import { ensureCommercial } from "./commercial";
import { initClubReputations, storePredictions } from "./reputation";
import { makePyramidSchedule, makeClubRecords, DIVISION_ONE } from "./pyramid";
import { makeExpandedLeagues } from "./worldPyramid";
import { ensureFringeWorldState } from "./fringe";
import { makeBoard, ensureBoard } from "./board";
import { initFinance } from "./finance";
import { openingStaffPool } from "./staff";
import { fixturesForClub, makeLeagueRows } from "./schedule";

/**
 * Canonical save schema version. Single source of truth: `newGame` stamps it,
 * `migrateSave` upgrades to it, and the verification suites import it rather
 * than keeping their own copies (which silently rot on every migration).
 * Bump this whenever a new step is added to the migration registry
 * (src/lib/game/migrations) — no module holds per-version field knowledge
 * outside that registry.
 */
export const SAVE_VERSION = 12;

export function newGame(clubName: string, managerName: string, seed?: string): GameState {
  // `seed` is optional: verification suites pass a fixed seed so the whole
  // generated world (squads, schedule, sim) is reproducible across runs.
  const base = _newGameSeed(clubName, managerName, seed);
  // Pre-season projection for season 1 (derived from starting reputations).
  storePredictions(base, base.season);
  ensureBoard(base);
  ensureCommercial(base);
  // Opening cash is booked as a real ledger entry, so the books reconcile
  // from the very first week.
  initFinance(base);
  // Persist the lightweight outer world before detailed Focus squads are built.
  ensureFringeWorldState(base);
  // Canonical football world: detailed squads and contracts only for Focus clubs.
  ensureRecruitment(base);
  // Canonical physical club: stands, pitch, facilities and capital projects.
  ensureInfrastructure(base);
  // Strategic pressure layer. Owns only commitments + the idle-cash clock;
  // every number it reports is derived from the systems above.
  ensureSustainability(base);

  return runWeeklyGenerators(base);
}

function _newGameSeed(clubName: string, managerName: string, seed?: string): GameState {
  const saveSeed = seed ?? `${clubName}|${managerName}|${Date.now().toString(36)}`;

  // Sized for a Division One (League One analogue) club: a 12,000 ground and
  // ticket prices around the £20 reference for the level.
  const stands: Stand[] = [
    { key: "N", name: "North Stand", capacity: 3200, condition: 92, ticketPrice: 18 },
    { key: "E", name: "East Stand", capacity: 2600, condition: 88, ticketPrice: 21 },
    { key: "S", name: "South Stand", capacity: 3200, condition: 90, ticketPrice: 18 },
    { key: "W", name: "West Stand", capacity: 3000, condition: 94, ticketPrice: 26 },
  ];
  const leagues = makeExpandedLeagues(clubName);
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
    staffWagesWeekly: 26_000,
    utilitiesWeekly: 6_800,
    maintenanceWeekly: 3_400,
    // Canonical squad lives in GameState.football; this is a rebuilt projection.
    squad: [],
    sponsors: [
      { name: "Main Kit Sponsor", weekly: 15_000, weeksLeft: 38 * 2 },
      { name: "Stadium Naming", weekly: 6_000, weeksLeft: 38 * 3 },
      { name: "Training Wear", weekly: 2_500, weeksLeft: 20 },
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
    league: makeLeagueRows(leagues[0].clubIds),
    hiredStaff: [],
    staffCandidates: openingStaffPool(saveSeed),
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
