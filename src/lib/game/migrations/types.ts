/* Migration registry — types.
 *
 * Rules for every step:
 *   - explicit `from` -> `to`, applied in strict ascending order, never skipped
 *   - deterministic: no Math.random, no Date.now, no crypto.randomUUID
 *   - idempotent where practical: re-check the field before creating it
 *   - anything unrecoverable that has to be dropped MUST be reported via
 *     `ctx.warn`, never silently discarded
 */
import type { GameState, Staff } from "../types";

/** A save mid-migration: shaped like GameState but not yet guaranteed valid. */
export type AnySave = Omit<GameState, "version"> & { version: number };

export interface MigrationDiagnostic {
  code: string;
  detail?: string;
  atVersion: number;
}

/**
 * Engine-owned helpers a step may need. Injected rather than imported so the
 * registry never has to import `engine.ts` (which imports the registry).
 */
export interface MigrationDeps {
  staffPoolFor(s: GameState): Staff[];
  squadRating(s: GameState): number;
}

export interface MigrationCtx {
  deps: MigrationDeps;
  /** Report recoverable data loss or a repaired inconsistency. */
  warn(code: string, detail?: string): void;
}

export interface Migration {
  from: number;
  to: number;
  describe: string;
  up(save: AnySave, ctx: MigrationCtx): void;
}

export class MigrationError extends Error {
  constructor(
    message: string,
    readonly code: "future-version" | "no-path" | "step-failed",
    readonly atVersion: number,
  ) {
    super(message);
    this.name = "MigrationError";
  }
}
