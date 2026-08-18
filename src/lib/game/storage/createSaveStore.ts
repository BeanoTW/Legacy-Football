/* Storage selection — Phase 1a.
 *
 * IndexedDB is the primary backend. localStorage remains ONLY as an explicit
 * fallback for environments without IndexedDB, and it announces its own size
 * ceiling rather than failing silently later.
 */
import type { GameState } from "../types";
import type { SaveStore } from "./types";
import { createIdbSaveStore } from "./idbStore";
import { createIdbRecordStore, indexedDbAvailable } from "./idbBackend";
import { createMemoryRecordStore } from "./memoryRecords";
import { createLegacyLocalSource, createLocalSaveStore } from "./localStore";

export interface CreateSaveStoreDeps {
  migrate: (parsed: Record<string, unknown>) => GameState;
  afterMigrate?: (state: GameState, rawVersion: number) => GameState;
  currentVersion: number;
}

export function createSaveStore(deps: CreateSaveStoreDeps): SaveStore {
  if (typeof window === "undefined") {
    // SSR / prerender: no persistence surface at all.
    return createIdbSaveStore({ ...deps, records: createMemoryRecordStore(), legacy: null });
  }
  if (indexedDbAvailable()) {
    return createIdbSaveStore({
      ...deps,
      records: createIdbRecordStore(),
      legacy: createLegacyLocalSource(),
    });
  }
  if (typeof localStorage !== "undefined") {
    console.warn(
      "[save] IndexedDB is unavailable; falling back to localStorage. " +
        "Saves are capped at roughly 5 MB and will report an error past that point.",
    );
    return createLocalSaveStore(deps);
  }
  console.warn("[save] no persistent storage available; progress will not survive a reload.");
  return createIdbSaveStore({ ...deps, records: createMemoryRecordStore(), legacy: null });
}
