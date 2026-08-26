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
import { progressScoutingWeekInPlace } from "./scouting";
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
  runCommercialWeek(s);
  runRecruitmentWeek(s, isTransferWindowOpen(s));
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
  if (fxResult) s.results.push(fxResult);
  resolveWeek(s, s.week);
  syncTable(s);

  s.week += 1;
  if (s.week > SEASON_END_WEEK) tickSeasonRollover(s);

  ensureBoard(s);
  maybeRunMidSeasonReview(s);
  setCalendarDay(s, 0);

  return runWeeklyGenerators(s);
}

/**
 * Advance one visible calendar day.
 *
 * Monday through Saturday only move the presentation clock. Crossing Sunday
 * settles the completed week through `advanceWeek`, preserving every existing
 * deterministic weekly invariant while making Continue feel like a living
 * calendar rather than a sequence of week-sized jumps.
 */
export function advanceDay(prev: GameState): GameState {
  const day = calendarDay(prev);
  if (day < 6) {
    const next = structuredClone(prev);
    setCalendarDay(next, day + 1);
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

export const saveStore: SaveStore = createSaveStore({
  migrate: migrateSave,
  currentVersion: SAVE_VERSION,
  afterMigrate: (state, rawVersion) => {
    const needsSeed = state.inbox.length === 0 && rawVersion < 2;
    return needsSeed ? runWeeklyGenerators(state) : state;
  },
});

function reportDiagnostics(diags: Diagnostic[]) {
  for (const d of diags) {
    const msg = `[save] ${d.code}${d.detail ? ` — ${d.detail}` : ""}`;
    if (d.level === "error") console.error(msg);
    else if (d.level === "warn") console.warn(msg);
  }
}

export async function loadGame(): Promise<GameState | null> {
  const { state, diagnostics } = await saveStore.load();
  reportDiagnostics(diagnostics);
  return state;
}

export async function saveGame(state: GameState): Promise<void> {
  reportDiagnostics(await saveStore.save(state));
}

export async function clearGame(): Promise<void> {
  await saveStore.clear();
}

export { setTransferBudget, setWageBudget } from "./budgets";
