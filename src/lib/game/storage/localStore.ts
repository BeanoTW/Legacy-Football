/* localStorage implementation of the SaveStore boundary.
 *
 * This is the ONLY module in the project allowed to touch `localStorage`.
 * Phase 1 adds an IndexedDB implementation of the same interface.
 */
import type { GameState } from "../types";
import type { Diagnostic, LoadResult, SaveStore } from "./types";
import type { LegacySource } from "./records";
import { parseSave, serializeSave, byteLength } from "./serialize";
import { SIZE_ERROR_BYTES, SIZE_WARN_BYTES, formatBytes } from "../diagnostics/saveSize";

export const STORAGE_KEY = "chairman.save.v1";
/** Untouched copy of a save this build could not load. Never overwritten by
 *  gameplay, so a future build can still recover it. */
export const BACKUP_KEY = "chairman.save.v1.unreadable";
/** Verbatim copy of a legacy save that has been migrated into IndexedDB.
 *  Written only AFTER the IndexedDB commit is verified. */
export const MIGRATED_KEY = "chairman.save.v1.migrated";

type Backend = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * The legacy localStorage slot, seen by the IndexedDB store through the
 * narrow `LegacySource` contract. This is the only path by which the new
 * store may touch localStorage.
 */
export function createLegacyLocalSource(backend?: Backend | null): LegacySource {
  const b = backend ?? defaultBackend();
  return {
    readRaw: () => b?.getItem(STORAGE_KEY) ?? null,
    archive: (raw) => { try { b?.setItem(MIGRATED_KEY, raw); } catch { /* archive is best-effort */ } },
    remove: () => b?.removeItem(STORAGE_KEY),
    purge: () => {
      b?.removeItem(STORAGE_KEY);
      b?.removeItem(MIGRATED_KEY);
      b?.removeItem(BACKUP_KEY);
    },
  };
}

export interface LocalStoreDeps {
  /** Applies the migration chain to a raw parsed save. */
  migrate: (parsed: Record<string, unknown>) => GameState;
  /** Post-load hook (e.g. seeding an inbox for pre-v2 saves). */
  afterMigrate?: (state: GameState, rawVersion: number) => GameState;
  /** Highest schema version this build understands. */
  currentVersion: number;
  /** Injectable for tests. */
  backend?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

function defaultBackend(): LocalStoreDeps["backend"] | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  return localStorage;
}

export function createLocalSaveStore(deps: LocalStoreDeps): SaveStore {
  const backend = deps.backend ?? defaultBackend();
  /* Set when a stored save could not be read (parse, migration or future
   * version). While set, writes are refused so a new game can never silently
   * destroy the original save. Cleared only by an explicit clear(). */
  let unreadable = false;

  /** Preserve the raw save verbatim under the backup key. */
  function preserve(raw: string, reason: string): Diagnostic {
    unreadable = true;
    try {
      backend?.setItem(BACKUP_KEY, raw);
      return { level: "warn", code: "save/preserved", detail: `${reason}; original kept at ${BACKUP_KEY}` };
    } catch (e) {
      return { level: "warn", code: "save/preserve-failed", detail: (e as Error).message };
    }
  }

  return {
    kind: "localStorage",

    async load(): Promise<LoadResult> {
      if (!backend) return { state: null, diagnostics: [] };
      const raw = backend.getItem(STORAGE_KEY);
      if (!raw) return { state: null, diagnostics: [] };

      const { parsed, diagnostics } = parseSave(raw);
      if (!parsed) return { state: null, diagnostics: [...diagnostics, preserve(raw, "save could not be parsed")] };

      const v = typeof parsed.version === "number" && Number.isFinite(parsed.version)
        ? (parsed.version as number)
        : 1;
      // Refuse ONLY saves written by a future schema we cannot understand.
      if (v > deps.currentVersion) {
        return {
          state: null,
          diagnostics: [
            ...diagnostics,
            {
              level: "error",
              code: "save/future-version",
              detail:
                `this save was created by a newer version of the game ` +
                `(schema v${v}; this build understands v${deps.currentVersion}). It is not corrupt — ` +
                `update the game to load it.`,
            },
            preserve(raw, `future schema v${v}`),
          ],
        };
      }

      try {
        const migrated = deps.migrate(parsed);
        const state = deps.afterMigrate ? deps.afterMigrate(migrated, v) : migrated;
        return { state, diagnostics };
      } catch (e) {
        return {
          state: null,
          diagnostics: [
            ...diagnostics,
            { level: "error", code: "save/migration-failed", detail: (e as Error).message },
            preserve(raw, "migration failed"),
          ],
        };
      }
    },

    async save(state: GameState): Promise<Diagnostic[]> {
      if (!backend) return [];
      if (unreadable) {
        return [
          {
            level: "error",
            code: "save/write-blocked",
            detail: "an unreadable save is present; refusing to overwrite it until the slot is cleared",
          },
        ];
      }
      const out: Diagnostic[] = [];
      const raw = serializeSave(state);
      const bytes = byteLength(raw);
      if (bytes >= SIZE_ERROR_BYTES) {
        out.push({ level: "error", code: "save/size", detail: formatBytes(bytes) });
      } else if (bytes >= SIZE_WARN_BYTES) {
        out.push({ level: "warn", code: "save/size", detail: formatBytes(bytes) });
      }
      try {
        backend.setItem(STORAGE_KEY, raw);
      } catch (e) {
        // Quota exceeded used to be swallowed silently; surface it instead.
        out.push({ level: "error", code: "save/write-failed", detail: (e as Error).message });
      }
      return out;
    },

    async clear(): Promise<void> {
      unreadable = false;
      backend?.removeItem(STORAGE_KEY);
    },
  };
}
