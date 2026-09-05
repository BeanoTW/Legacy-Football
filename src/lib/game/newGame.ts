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
import { makePyramidSchedule, makeClubRecords } from "./pyramid";
import { makeExpandedLeagues } from "./worldPyramid";
import { ensureFringeWorldState } from "./fringe";
import { makeBoard, ensureBoard } from "./board";
import { initFinance } from "./finance";
import { openingStaffPool } from "./staff";
import { fixturesForClub, makeLeagueRows } from "./schedule";
import { ensureClubIdentityStateInPlace } from "./clubIdentity";
import { migrateClubReferencesToIdsInPlace } from "./clubReferenceMigration";
import { ensureEmploymentStateInPlace } from "./employment";
import { ensurePlayerRegistrationStateInPlace } from "./playerRegistration";
import { ensureLoanStateInPlace } from "./loans";

/**
 * Canonical save schema version. Single source of truth: `newGame` stamps it,
 * `migrateSave` upgrades to it, and the verification suites import it rather
 * than keeping their own copies (which silently rot on every migration).
 * Bump this whenever a new step is added to the migration registry
 * (src/lib/game/migrations) — no module holds per-version field knowledge
 * outside that registry.
 */
export const SAVE_VERSION = 20;

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
  // A fresh Level 7 chairman inherits an explicit opening wage authorisation.
  // Finance policy remains the canonical control surface; this simply carries
  // the calibrated new-career allowance into that surface after the opening
  // squad exists, so the club has genuine room to recruit rather than starting
  // effectively pinned to a pre-squad derived ceiling.
  base.finance.budgets.wages = Math.max(base.finance.budgets.wages, base.wageBudgetWeekly ?? 0);
  // Canonical physical club: stands, pitch, facilities and capital projects.
  ensureInfrastructure(base);
  // Strategic pressure layer. Owns only commitments + the idle-cash clock;
  // every number it reports is derived from the systems above.
  ensureSustainability(base);

  // Schema v17 persists club identity separately from presentation. Build the
  // opening world with readable source names, then canonicalise every stored
  // club reference once all seed-time systems have finished constructing it.
  ensureClubIdentityStateInPlace(base);
  migrateClubReferencesToIdsInPlace(base);
  // Schema v18: persist the club operating model only after club references
  // are opaque IDs, then retain the employment basis on every signed contract.
  ensureEmploymentStateInPlace(base);
  // Schema v19: ownership and playing registration become explicit. Existing
  // opening behaviour is preserved because both initially match currentClubId.
  ensurePlayerRegistrationStateInPlace(base);
  // Schema v20: loans are explicit agreements layered over the sparse
  // ownership/registration model. Fresh careers begin with none.
  ensureLoanStateInPlace(base);

  return runWeeklyGenerators(base);
}

function _newGameSeed(clubName: string, managerName: string, seed?: string): GameState {
  const saveSeed = seed ?? `${clubName}|${managerName}|${Date.now().toString(36)}`;

  // Fresh careers now begin at canonical football Level 7. Existing saves are
  // never rewritten to these values; this is deliberately a new-career-only
  // calibration so the opening club feels semi-professional rather than like a
  // professional EFL side dropped into a regional table.
  const stands: Stand[] = [
    { key: "N", name: "Main Stand", capacity: 950, condition: 78, ticketPrice: 12 },
    { key: "E", name: "East Terrace", capacity: 700, condition: 70, ticketPrice: 10 },
    { key: "S", name: "Town End", capacity: 800, condition: 74, ticketPrice: 10 },
    { key: "W", name: "West Terrace", capacity: 650, condition: 68, ticketPrice: 9 },
  ];
  const leagues = makeExpandedLeagues(clubName);
  const playerLeague = leagues.find((league) => league.clubIds.includes(clubName));
  if (!playerLeague) throw new Error(`No starting division found for ${clubName}`);
  const leagueSchedule = makePyramidSchedule(leagues, `${saveSeed}|season1`);
  return {
    version: SAVE_VERSION,
    saveSeed,
    clubName,
    managerName,
    season: 1,
    week: 1,

    cash: 220_000,
    reputation: 24,
    fanHappiness: 70,
    stands,
    pitchCondition: 76,
    trainingRating: 34,
    trainingWeeklyCost: 650,
    staffWagesWeekly: 1_850,
    utilitiesWeekly: 520,
    maintenanceWeekly: 460,
    // Canonical squad lives in GameState.football; this is a rebuilt projection.
    squad: [],
    sponsors: [
      { name: "Main Shirt Sponsor", weekly: 1_550, weeksLeft: 38 * 2 },
      { name: "Local Stadium Partner", weekly: 650, weeksLeft: 38 * 2 },
      { name: "Training Wear", weekly: 325, weeksLeft: 20 },
    ],
    fixtures: fixturesForClub(leagueSchedule, clubName),
    leagues,
    playerLeagueId: playerLeague.id,
    leagueSchedule,
    matchRecords: [],
    seasonHistory: [],
    clubRecords: makeClubRecords(leagues),
    clubReputations: initClubReputations(leagues, saveSeed),
    seasonPredictions: [],
    clubSnapshots: [],
    results: [],
    ledger: [],
    league: makeLeagueRows(playerLeague.clubIds),
    hiredStaff: [],
    staffCandidates: openingStaffPool(saveSeed),
    staffMarketRefreshedWeek: 1,
    // Transfer spending comes directly from the club bank balance. The legacy
    // ring-fenced pot remains present only as a save-compatibility field.
    transferBudget: 0,
    wageBudgetWeekly: 8_500,
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
