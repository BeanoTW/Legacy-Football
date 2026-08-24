/* Migration registry.
 *
 * Ordered, explicit `from -> to` steps. `runMigrations` normalises the save
 * shape, then applies every step whose `from` is >= the save's version, in
 * strict ascending order. Adding a schema version means adding one step file
 * and one entry to MIGRATIONS — never editing an existing step.
 */
import type { AnySave, Migration, MigrationCtx, MigrationDeps, MigrationDiagnostic } from "./types";
import { MigrationError } from "./types";
import { EARLY_MIGRATIONS } from "./v1-v6";
import { LATE_MIGRATIONS } from "./v7-v12";
import { WORLD_MIGRATIONS } from "./v12-v13";
import type { GameState } from "../types";

export * from "./types";

export const MIGRATIONS: Migration[] = [
  ...EARLY_MIGRATIONS,
  ...LATE_MIGRATIONS,
  ...WORLD_MIGRATIONS,
];

/** Highest version any registered step can produce. */
export const LATEST_MIGRATED_VERSION = MIGRATIONS.reduce((m, s) => Math.max(m, s.to), 1);

/**
 * Shape normalisation applied before any step runs. These are the defensive
 * defaults the old inline chain applied at the top, plus the removal of retired
 * legacy fields. Idempotent and version-independent by design.
 */
function normalise(p: AnySave, deps: MigrationDeps) {
  // Versioning arrived late, so an absent version means "the very first schema".
  if (typeof p.version !== "number" || !Number.isFinite(p.version)) p.version = 1;

  const arr = <T>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);
  const raw = p as unknown as Record<string, unknown>;

  p.hiredStaff = arr(p.hiredStaff, []);
  if (!Array.isArray(p.staffCandidates))
    p.staffCandidates = deps.staffPoolFor(p as unknown as GameState);
  if (p.staffMarketRefreshedWeek == null) p.staffMarketRefreshedWeek = p.week;
  if (p.transferBudget == null) p.transferBudget = 500_000;
  if (p.wageBudgetWeekly == null) p.wageBudgetWeekly = 5_000;
  // Retired with the Recruitment milestone: read only by the removed legacy
  // shortlist generator.
  delete raw.positionPriorities;
  // Retired legacy transfer state (pre-recruitment schema). Dropped so no
  // gameplay path can read two competing transfer models.
  delete raw.transferTargets;
  delete raw.incomingBids;
  delete raw.completedTransfers;
  p.ledger = arr(p.ledger, []);
  p.results = arr(p.results, []);
  if (p.liveMatch === undefined) p.liveMatch = null;
  p.inbox = arr(p.inbox, []);
  if (!p.inboxFlags || typeof p.inboxFlags !== "object") p.inboxFlags = {};
  p.scheduledGenerators = arr(p.scheduledGenerators, []);
}

export interface RunMigrationsResult {
  state: GameState;
  fromVersion: number;
  applied: string[];
  diagnostics: MigrationDiagnostic[];
}

/**
 * Migrate a parsed save to `targetVersion`.
 *
 * Throws MigrationError when the save comes from a newer build than this one
 * (`future-version`) — silently downgrading would destroy data.
 */
export function runMigrations(
  parsed: Record<string, unknown>,
  targetVersion: number,
  deps: MigrationDeps,
): RunMigrationsResult {
  const p = parsed as unknown as AnySave;
  normalise(p, deps);

  const fromVersion = p.version;
  if (fromVersion > targetVersion) {
    throw new MigrationError(
      `save is version ${fromVersion} but this build understands ${targetVersion}`,
      "future-version",
      fromVersion,
    );
  }

  const diagnostics: MigrationDiagnostic[] = [];
  const applied: string[] = [];

  for (const step of MIGRATIONS) {
    if (p.version >= step.to || step.to > targetVersion) continue;
    if (p.version !== step.from) {
      throw new MigrationError(
        `no migration path from v${p.version} to v${step.to}`,
        "no-path",
        p.version,
      );
    }
    const ctx: MigrationCtx = {
      deps,
      warn: (code, detail) => diagnostics.push({ code, detail, atVersion: step.to }),
    };
    try {
      step.up(p, ctx);
    } catch (err) {
      throw new MigrationError(
        `migration v${step.from}->v${step.to} failed: ${(err as Error).message}`,
        "step-failed",
        step.from,
      );
    }
    p.version = step.to;
    applied.push(`v${step.from}->v${step.to}`);
  }

  // Every registered step has run: the save is at the current schema.
  p.version = targetVersion;
  return { state: p as GameState, fromVersion, applied, diagnostics };
}
