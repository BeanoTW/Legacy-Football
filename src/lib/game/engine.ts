/* Engine — top-level orchestration only.
 *
 * After Phase 0c this file owns exactly three things:
 *   1. `advanceWeek` — the weekly tick, i.e. the ORDER stages run in.
 *   2. Persistence entry points (migrate / load / save / clear).
 *   3. A re-export barrel, so every existing `from "@/lib/game/engine"` import
 *      in the app and the check suites keeps resolving unchanged.
 *
 * Domain logic lives in the modules it belongs to: ./newGame, ./staff,
 * ./schedule, ./sim, ./liveMatch, ./calendar, ./format and ./tick/*.
 */
import type { GameState, FixtureResult } from "./types";
import { runWeeklyGenerators } from "./inbox";
import { runRecruitmentWeek } from "./recruitment";
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
import { SEASON_END_WEEK, isTransferWindowOpen } from "./calendar";
import { tickMatchday, type MatchOverride } from "./tick/matchday";
import {
  tickLegacyAiResults, tickContractsAndMarkets, tickTicketBacklash,
} from "./tick/world";
import { tickSeasonRollover } from "./tick/rollover";
import { commitLiveMatch } from "./liveMatch";

/* ---------- Public surface (unchanged import paths) ---------- */
export { weekForLeagueRound } from "./pyramid";
export { newGame, SAVE_VERSION } from "./newGame";
export {
  leagueTeams, userLeagueTeams, makeLeagueSchedule, makeFixtures, fixturesForClub,
} from "./schedule";
export {
  totalCapacity, usableCapacity, avgTicketPrice, playerWagesWeekly, squadRating,
  totalWeeklyExpenses, weeklySponsorIncome,
} from "./sim";
export {
  STAFF_ROLES, makeStaff, staffPoolFor, hiredStaffWagesWeekly, staffJoinTerms,
  hireStaffMember, sackStaffMember, severanceFor,
  type JoinTerms, type SpendResult,
} from "./staff";
export {
  CALENDAR, SEASON_END_WEEK, WINDOW_PRESEASON_END, WINDOW_MIDSEASON,
  phaseOf, isTransferWindowOpen, windowStatus, type SeasonPhase,
} from "./calendar";
export { fmtMoney, fmtMoneyExact } from "./format";
export {
  startMatchDay, kickoff, applyHalfTimeChoice, cancelLiveMatch,
} from "./liveMatch";
export type { MatchOverride } from "./tick/matchday";

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
 *                        the atomic season rollover.
 *   9. Board + inbox   — mid-season review checkpoint, weekly generators.
 *
 * Every financial stage posts through the finance ledger with a per-week
 * dedupe key, so a replayed week cannot double-charge.
 */
export function advanceWeek(prev: GameState, override?: MatchOverride): GameState {
  const s: GameState = structuredClone(prev);
  ensureFinance(s);

  // ---- 1-2. Physical plant, then recurring income + expenditure ----
  runInfrastructureWeek(s);
  postRecurringWeek(s);

  // ---- 3. Commercial department: sponsorship payments, expiries, approaches ----
  runCommercialWeek(s);

  // ---- 4. Football operation: contracts, negotiations, AI recruitment ----
  runRecruitmentWeek(s, isTransferWindowOpen(s));

  // ---- 5. Matchday: the user's fixture, or a scheduled friendly ----
  const { fxResult, matchdayNote }: { fxResult: FixtureResult | null; matchdayNote?: string } =
    tickMatchday(s, override);

  // ---- 6. World tick ----
  tickLegacyAiResults(s);
  tickContractsAndMarkets(s);
  tickTicketBacklash(s);
  // Pitch decay is owned entirely by infrastructure.ts (deteriorationFor
  // factors home usage into the pitch asset). The legacy field is a
  // projection, never mutated here.

  // ---- 7. Weekly roll-up ----
  // Cash was already moved by the finance ledger; the legacy WeekLedger row
  // is a projection of this week's entries, rebuilt on every post.
  syncWeekLedger(s, s.season, s.week);

  // Strategic pressure runs after the books are settled so it reads the
  // finished week. Ages the idle-cash clock and settles due commitments.
  runSustainabilityWeek(s);
  if (matchdayNote) {
    const row = s.ledger.find((l) => l.season === s.season && l.week === s.week);
    if (row) row.matchdayNote = matchdayNote;
  }
  if (fxResult) s.results.push(fxResult);

  // Resolve any remaining AI fixtures for this round, then project the table.
  resolveWeek(s, s.week);
  syncTable(s);

  // ---- 8. Clock ----
  s.week += 1;
  if (s.week > SEASON_END_WEEK) tickSeasonRollover(s);

  // ---- 9. Mid-season board checkpoint (exactly once per season) + inbox ----
  ensureBoard(s);
  maybeRunMidSeasonReview(s);

  return runWeeklyGenerators(s);
}

/** Exactly-once full-time commit for an interactive match. */
export function commitLiveMatchAndAdvance(prev: GameState): GameState {
  return commitLiveMatch(prev, (s, o) => advanceWeek(s, o));
}

/* ---------- Storage ----------
 * Migration knowledge lives ONLY in ./migrations. engine.ts knows the current
 * schema version and the entry point — nothing about historical field shapes.
 */
const MIGRATION_DEPS: MigrationDeps = { staffPoolFor, squadRating };

/** Diagnostics from the last migrateSave() call. Dev/test surface only — this
 *  is deliberately NOT stored in GameState. */
export let lastMigrationReport: RunMigrationsResult | null = null;

/**
 * Upgrade a parsed save to the current schema.
 * Throws MigrationError for a future-version save or a broken chain.
 */
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

/* ---------- Persistence ----------
 * Storage choice does NOT leak past this point. Everything below delegates to
 * the `SaveStore` boundary in `./storage`, so Phase 1 can swap in IndexedDB or
 * a compressed/chunked store without touching a single domain module.
 */
export const saveStore: SaveStore = createSaveStore({
  migrate: migrateSave,
  currentVersion: SAVE_VERSION,
  afterMigrate: (state, rawVersion) => {
    // If this save had no inbox at all (older than v2 introduction), seed it.
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

/* ---------- Budget controls ---------- */
export { setTransferBudget, setWageBudget } from "./budgets";
