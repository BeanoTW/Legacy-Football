/* Engine — top-level orchestration only.
 *
 * After Phase 0c this file owns exactly three things:
 *   1. `advanceWeek` — the weekly tick, i.e. the ORDER stages run in.
 *   2. Persistence entry points (migrate / load / save / clear).
 *   3. A re-export barrel, so every existing `from "@/lib/game/engine"` import
 *      in the app and the check suites keeps resolving unchanged.
 */
import type { GameState, FixtureResult } from "./types";
import { runWeeklyGenerators } from "./inbox";
import { runRecruitmentWeek } from "./recruitment";
import { withCanonicalUserClubReference } from "./legacyUserClubBoundary";
import {
  compactDepartingFocusPlayersInPlace,
  repairFreshFocusHydrationInPlace,
} from "./playerFidelityReconcile";
import {
  advancePlayerClubPerformanceWeekInPlace,
  applyPlayerClubMatchOutcomeInPlace,
} from "./playerClubPerformance";
import { progressScoutingDayInPlace, progressScoutingWeekInPlace } from "./scouting";
import { runInfrastructureWeek } from "./infrastructure";
import { runSustainabilityWeek } from "./sustainability";
import { runCommercialWeek } from "./commercial";
import { resolveWeek, syncTable } from "./league";
import { runMigrations, type MigrationDeps, type RunMigrationsResult } from "./migrations";
import { ensureBoard, maybeRunMidSeasonReview } from "./board";
import { ensureFinance, postRecurringWeek, syncWeekLedger } from "./finance";
import { createSaveStore } from "./storage/createSaveStore";
import type { SaveStore, Diagnostic } from "./storage/types";

import { SAVE_VERSION } from "./newGame";
import { squadRating } from "./sim";
import { staffPoolFor } from "./staff";
import { SEASON_END_WEEK, calendarDay, isTransferWindowOpen, setCalendarDay } from "./calendar";
import { tickMatchday, type MatchOverride } from "./tick/matchday";
import { tickLegacyAiResults, tickContractsAndMarkets, tickTicketBacklash } from "./tick/world";
import { tickSeasonRollover } from "./tick/rollover";
import { commitLiveMatch } from "./liveMatch";

export { weekForLeagueRound } from "./pyramid";
export { newGame, SAVE_VERSION } from "./newGame";
export {
  leagueTeams,
  userLeagueTeams,
  makeLeagueSchedule,
  makeFixtures,
  fixturesForClub,
} from "./schedule";
export {
  totalCapacity,
  usableCapacity,
  avgTicketPrice,
  playerWagesWeekly,
  squadRating,
  totalWeeklyExpenses,
  weeklySponsorIncome,
} from "./sim";
export {
  STAFF_ROLES,
  makeStaff,
  staffPoolFor,
  hiredStaffWagesWeekly,
  staffJoinTerms,
  hireStaffMember,
  sackStaffMember,
  severanceFor,
  type JoinTerms,
  type SpendResult,
} from "./staff";
export {
  CALENDAR,
  DAY_NAMES,
  MATCHDAY_INDEX,
  SEASON_END_WEEK,
  WINDOW_PRESEASON_END,
  WINDOW_MIDSEASON,
  calendarDay,
  calendarDayName,
  isMatchday,
  phaseOf,
  isTransferWindowOpen,
  windowStatus,
  type SeasonPhase,
} from "./calendar";
export { fmtMoney, fmtMoneyExact } from "./format";
export { startMatchDay, kickoff, applyHalfTimeChoice, cancelLiveMatch } from "./liveMatch";
export type { MatchOverride } from "./tick/matchday";

/**
 * Advance the game by exactly one week. This remains the canonical settlement
 * boundary for finance, contracts, scouting, infrastructure and league results.
 */
export function advanceWeek(prev: GameState, override?: MatchOverride): GameState {
  const s: GameState = structuredClone(prev);
  ensureFinance(s);

  runInfrastructureWeek(s);
  postRecurringWeek(s);
  // Commercial and recruitment still contain a few legacy `clubName` identity
  // reads. During an opaque-ID save, run them through the synchronous boundary
  // so they write the canonical user ID while `clubName` remains presentation
  // metadata everywhere outside the call.
  withCanonicalUserClubReference(s, () => runCommercialWeek(s));
  // Capture any Focus→Fringe boundary change before legacy recruitment removes
  // detailed rows. Conversely, repair a direct tracking hydration from an
  // earlier UI action before weekly football systems use the temporary players.
  compactDepartingFocusPlayersInPlace(s);
  repairFreshFocusHydrationInPlace(s);
  withCanonicalUserClubReference(s, () => runRecruitmentWeek(s, isTransferWindowOpen(s)));
  // Recruitment may itself reconcile the world boundary; replace any freshly
  // generated Focus placeholders with the same persistent compact people.
  repairFreshFocusHydrationInPlace(s);
  // Cohesion reads the settled squad after this week's recruitment activity.
  // It is processed before the fixture so genuine squad churn can influence
  // the performance that is realised on the pitch that same week.
  advancePlayerClubPerformanceWeekInPlace(s);
  progressScoutingWeekInPlace(s);

  const { fxResult, matchdayNote }: { fxResult: FixtureResult | null; matchdayNote?: string } =
    tickMatchday(s, override);

  tickLegacyAiResults(s);
  tickContractsAndMarkets(s);
  tickTicketBacklash(s);

  syncWeekLedger(s, s.season, s.week);
  runSustainabilityWeek(s);
  if (matchdayNote) {
    const row = s.ledger.find((l) => l.season === s.season && l.week === s.week);
    if (row) row.matchdayNote = matchdayNote;
  }
  if (fxResult) {
    s.results.push(fxResult);
    // The completed result changes morale for subsequent fixtures; it never
    // feeds back into the score that has already been decided.
    applyPlayerClubMatchOutcomeInPlace(s, fxResult);
  }
  resolveWeek(s, s.week);
  syncTable(s);

  s.week += 1;
  if (s.week > SEASON_END_WEEK) tickSeasonRollover(s);

  withCanonicalUserClubReference(s, () => {
    ensureBoard(s);
    maybeRunMidSeasonReview(s);
  });
  setCalendarDay(s, 0);

  return runWeeklyGenerators(s);
}

/**
 * Advance one visible calendar day.
 *
 * Monday through Saturday move the presentation clock and progress genuine
 * day-scale systems such as scouting. Crossing Sunday settles the completed
 * week through `advanceWeek`, preserving deterministic weekly finance/match
 * invariants while allowing four-day and six-day scout reports to really land.
 */
export function advanceDay(prev: GameState): GameState {
  const day = calendarDay(prev);
  if (day < 6) {
    const next = structuredClone(prev);
    setCalendarDay(next, day + 1);
    progressScoutingDayInPlace(next);
    return next;
  }
  return advanceWeek(prev);
}

/** Exactly-once full-time commit for an interactive match. */
export function commitLiveMatchAndAdvance(prev: GameState): GameState {
  return commitLiveMatch(prev, (s, o) => advanceWeek(s, o));
}

const MIGRATION_DEPS: MigrationDeps = { staffPoolFor, squadRating };
export let lastMigrationReport: RunMigrationsResult | null = null;

export function migrateSave(parsed: Record<string, unknown>): GameState {
  const result = runMigrations(parsed, SAVE_VERSION, MIGRATION_DEPS);
  lastMigrationReport = result;
  if (import.meta.env?.DEV && result.fromVersion < SAVE_VERSION) {
    console.info(
      `[save] migrated v${result.fromVersion} -> v${SAVE_VERSION}` +
        (result.applied.length ? ` via ${result.applied.join(", ")}` : "") +
        (result.diagnostics.length
          ? ` | ${result.diagnostics.map((d) => `${d.code}${d.detail ? `(${d.detail})` : ""}`).join(", ")}`
          : ""),
    );
  }
  return result.state;
}

const saveStoreDeps = {
  migrate: migrateSave,
  currentVersion: SAVE_VERSION,
  afterMigrate: (state: GameState, rawVersion: number) => {
    const needsSeed = state.inbox.length === 0 && rawVersion < 2;
    return needsSeed ? runWeeklyGenerators(state) : state;
  },
};

export const SAVE_SLOT_IDS = ["slot-1", "slot-2", "slot-3"] as const;
export type SaveSlotId = (typeof SAVE_SLOT_IDS)[number];
export interface SaveSlotSummary {
  id: SaveSlotId;
  state: GameState | null;
}

const slotStores = new Map<SaveSlotId, SaveStore>();
function storeFor(slot: SaveSlotId): SaveStore {
  let store = slotStores.get(slot);
  if (!store) {
    store = createSaveStore({
      ...saveStoreDeps,
      saveId: slot === "slot-1" ? undefined : slot,
      migrateLegacy: slot === "slot-1",
    });
    slotStores.set(slot, store);
  }
  return store;
}

/** Backwards-compatible primary store export used by storage diagnostics. */
export const saveStore: SaveStore = storeFor("slot-1");

function reportDiagnostics(diags: Diagnostic[]) {
  for (const d of diags) {
    const msg = `[save] ${d.code}${d.detail ? ` — ${d.detail}` : ""}`;
    if (d.level === "error") console.error(msg);
    else if (d.level === "warn") console.warn(msg);
  }
}

export async function loadGame(slot: SaveSlotId = "slot-1"): Promise<GameState | null> {
  const { state, diagnostics } = await storeFor(slot).load();
  reportDiagnostics(diagnostics);
  return state;
}

export async function saveGame(state: GameState, slot: SaveSlotId = "slot-1"): Promise<void> {
  reportDiagnostics(await storeFor(slot).save(state));
}

export async function clearGame(slot: SaveSlotId = "slot-1"): Promise<void> {
  await storeFor(slot).clear();
}

export async function listSaveSlots(): Promise<SaveSlotSummary[]> {
  return Promise.all(
    SAVE_SLOT_IDS.map(async (id) => {
      const { state, diagnostics } = await storeFor(id).load();
      reportDiagnostics(diagnostics);
      return { id, state };
    }),
  );
}

export { setTransferBudget, setWageBudget } from "./budgets";
