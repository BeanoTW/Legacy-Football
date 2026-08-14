/* localStorage implementation of the SaveStore boundary.
 *
 * This is the ONLY module in the project allowed to touch `localStorage`.
 * Phase 1 adds an IndexedDB implementation of the same interface.
 */
import type { GameState } from "../types";
import type { Diagnostic, LoadResult, SaveStore } from "./types";
import { parseSave, serializeSave, byteLength } from "./serialize";
import { SIZE_ERROR_BYTES, SIZE_WARN_BYTES, formatBytes } from "../diagnostics/saveSize";

export const STORAGE_KEY = "fcm.save.v1";

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

  return {
    kind: "localStorage",

    async load(): Promise<LoadResult> {
      if (!backend) return { state: null, diagnostics: [] };
      const raw = backend.getItem(STORAGE_KEY);
      if (!raw) return { state: null, diagnostics: [] };

      const { parsed, diagnostics } = parseSave(raw);
      if (!parsed) return { state: null, diagnostics };

      const v = typeof parsed.version === "number" && Number.isFinite(parsed.version)
        ? (parsed.version as number)
        : 1;
      // Refuse ONLY saves written by a future schema we cannot understand.
      if (v > deps.currentVersion) {
        return {
          state: null,
          diagnostics: [
            ...diagnostics,
            { level: "error", code: "save/future-version", detail: `save v${v} > schema v${deps.currentVersion}` },
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
          ],
        };
      }
    },

    async save(state: GameState): Promise<Diagnostic[]> {
      if (!backend) return [];
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
      backend?.removeItem(STORAGE_KEY);
    },
  };
}
