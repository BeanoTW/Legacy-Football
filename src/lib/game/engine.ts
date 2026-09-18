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
import { processDueTransferResponsesInPlace, runRecruitmentWeek } from "./recruitment";
import { processDuePlayerLoansInPlace } from "./loans";
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
import {
  SEASON_END_WEEK,
  calendarDay,
  clearTransferDeadlineHour,
  isTransferDeadlineDay,
  isTransferWindowOpen,
  setCalendarDay,
  setTransferDeadlineHour,
  transferDeadlineHour,
} from "./calendar";
import { tickMatchday, tickSelectedMatchday, type MatchOverride } from "./tick/matchday";
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
  staffJoinTermsForState,
  managerJoinTerms,
  evaluateManagerOffer,
  hireManagerWithOffer,
  hireStaffMember,
  sackStaffMember,
  severanceFor,
  type JoinTerms,
  type ManagerOffer,
  type ManagerOfferEvaluation,
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
  isTransferDeadlineWeek,
  isTransferDeadlineDay,
  transferDeadlineHour,
  transferDeadlineHoursRemaining,
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

  // A response due on Sunday must land before weekly football settlement.
  processDueTransferResponsesInPlace(s);

  // Loan contributions affect the payroll booked for this exact week. Close
  // any agreement due at the current absolute week before recurring wages are
  // posted; recruitment later repeats the same operation idempotently before
  // contract expiries.
  processDuePlayerLoansInPlace(s);
  runInfrastructureWeek(s);
  postRecurringWeek(s);
  // Commercial and recruitment are identity-native and can run directly.
  runCommercialWeek(s);
  // Capture any Focus→Fringe boundary change before legacy recruitment removes
  // detailed rows. Conversely, repair a direct tracking hydration from an
  // earlier UI action before weekly football systems use the temporary players.
  compactDepartingFocusPlayersInPlace(s);
  repairFreshFocusHydrationInPlace(s);
  runRecruitmentWeek(s, isTransferWindowOpen(s));
  // Recruitment may itself reconcile the world boundary; replace any freshly
  // generated Focus placeholders with the same persistent compact people.
  repairFreshFocusHydrationInPlace(s);
  // Cohesion reads the settled squad after this week's recruitment activity.
  // It is processed before the fixture so genuine squad churn can influence
  // the performance that is realised on the pitch that same week.
  advancePlayerClubPerformanceWeekInPlace(s);
  progressScoutingWeekInPlace(s);

  // Dated daily play may already have committed this week's user fixture.
  // Keep the weekly selector only for legacy/fast-forward callers that reached
  // Sunday without traversing the visible fixture day.
  const weeklyFixture = s.fixtures.find((f) => f.week === s.week);
  const weeklyFixtureAlreadyPlayed = weeklyFixture
    ? s.results.some(
        (r) =>
          r.week === s.week &&
          r.opponent === weeklyFixture.opponent &&
          r.home === weeklyFixture.home &&
          (r.dayOfWeek ?? 5) === (weeklyFixture.dayOfWeek ?? 5) &&
          (r.competition ?? "league") === (weeklyFixture.competition ?? "league"),
      )
    : false;
  const matchdayOutcome = weeklyFixtureAlreadyPlayed
    ? { fxResult: null as FixtureResult | null }
    : tickMatchday(s, override) ?? { fxResult: null };
  const { fxResult, matchdayNote }: { fxResult: FixtureResult | null; matchdayNote?: string } =
    matchdayOutcome;

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

  ensureBoard(s);
  maybeRunMidSeasonReview(s);
  setCalendarDay(s, 0);
  clearTransferDeadlineHour(s);
  // Monday replies scheduled across the week boundary should already be in the
  // chairman's Inbox when the new week opens.
  processDueTransferResponsesInPlace(s);

  return runWeeklyGenerators(s);
}


/** True when the user's schedule has a fixture on the visible calendar day. */
export function hasFixtureToday(state: GameState): boolean {
  const day = calendarDay(state);
  return state.fixtures.some((fixture) => fixture.week === state.week && (fixture.dayOfWeek ?? 5) === day);
}

/** Return the user's fixture due on the visible day without changing simulation state. */
export function fixtureToday(state: GameState): GameState["fixtures"][number] | undefined {
  const day = calendarDay(state);
  return state.fixtures.find((fixture) => fixture.week === state.week && (fixture.dayOfWeek ?? 5) === day);
}
/** Resolve today's dated fixture once, leaving weekly settlement for Sunday. */
function resolveDatedFixtureInPlace(state: GameState): void {
  const fixture = fixtureToday(state);
  if (!fixture) return;
  const alreadyPlayed = state.results.some(
    (r) =>
      r.week === state.week &&
      r.opponent === fixture.opponent &&
      r.home === fixture.home &&
      (r.dayOfWeek ?? 5) === (fixture.dayOfWeek ?? 5) &&
      (r.competition ?? "league") === (fixture.competition ?? "league"),
  );
  if (alreadyPlayed) return;
  const { fxResult } = tickSelectedMatchday(state, fixture);
  if (fxResult) {
    state.results.push(fxResult);
    applyPlayerClubMatchOutcomeInPlace(state, fxResult);
  }
}

/**
 * Advance one visible calendar unit.
 *
 * Normal weeks advance one day at a time. On the final Sunday of either
 * transfer window, the same control switches to a one-hour tick. Weekly
 * settlement still happens exactly once, after hour 23, so finance, fixtures
 * and contracts remain on their established deterministic boundaries.
 */
export function advanceDay(prev: GameState): GameState {
  if (isTransferDeadlineDay(prev)) {
    const hour = transferDeadlineHour(prev);
    if (hour < 23) {
      const next = structuredClone(prev);
      setTransferDeadlineHour(next, hour + 1);
      // Deadline-day club replies can surface between hourly chairman actions;
      // the canonical due-response processor remains idempotent.
      processDueTransferResponsesInPlace(next);
      return next;
    }
    return advanceWeek(prev);
  }

  const day = calendarDay(prev);
  if (day < 6) {
    const next = structuredClone(prev);
    setCalendarDay(next, day + 1);
    progressScoutingDayInPlace(next);
    processDueTransferResponsesInPlace(next);
    resolveDatedFixtureInPlace(next);
    return next;
  }
  return advanceWeek(prev);
}

/**
 * Optional fast-forward for the FIFA-style deadline-day flow. This skips the
 * remaining presentation hours but still settles the week through the same
 * canonical boundary as twenty-four individual hourly ticks.
 */
export function skipTransferDeadlineDay(prev: GameState): GameState {
  if (!isTransferDeadlineDay(prev)) return prev;
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
