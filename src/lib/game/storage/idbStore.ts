/* IndexedDB SaveStore — Phase 1a.
 *
 * Implements the canonical `SaveStore` boundary on top of the transactional
 * `RecordStore` contract. Domain code sees load/save/clear and nothing else.
 *
 * Layout (one record per key, all keys prefixed by saveId):
 *   <saveId>:manifest    persistence metadata + integrity (JSON)
 *   <saveId>:core        canonical serialized GameState (JSON)
 *   <saveId>:unreadable  verbatim copy of a save this build cannot read
 *   <saveId>:<kind>:<id> RESERVED for Phase 1b/1c chunks — unused here
 */
import type { GameState } from "../types";
import { controlledClubId } from "../ids";
import type { Diagnostic, LoadResult, SaveStore } from "./types";
import type { LegacySource, RecordStore, StoredRecord } from "./records";
import { compactState } from "./compaction";
import { createHistoryRepository, historyChunkKey, type HistoryRepository } from "./history";
import { parseSave, serializeSave, byteLength } from "./serialize";
import {
  DEFAULT_SAVE_ID,
  STORAGE_FORMAT_VERSION,
  checksum,
  coreKey,
  manifestKey,
  unreadableKey,
  isManifest,
  type SaveManifest,
  type ChunkManifestEntry,
} from "./manifest";

export interface IdbStoreDeps {
  records: RecordStore;
  /** Applies the GAME-schema migration chain (registry owned). */
  migrate: (parsed: Record<string, unknown>) => GameState;
  afterMigrate?: (state: GameState, rawVersion: number) => GameState;
  /** Highest game schema version this build understands. */
  currentVersion: number;
  /** Optional legacy localStorage slot to migrate from, once. */
  legacy?: LegacySource | null;
  saveId?: string;
  /** Injectable clock — persistence metadata only, never a simulation input. */
  now?: () => number;
}

export interface StorageMetrics {
  lastLoadMs: number | null;
  lastSaveMs: number | null;
  lastLegacyMigrationMs: number | null;
  lastCoreBytes: number | null;
  recordCount: number | null;
}

export interface IdbSaveStore extends SaveStore {
  readonly metrics: StorageMetrics;
  readonly history: HistoryRepository;
  readManifest(): Promise<SaveManifest | null>;
}

export function createIdbSaveStore(deps: IdbStoreDeps): IdbSaveStore {
  const saveId = deps.saveId ?? DEFAULT_SAVE_ID;
  const now = deps.now ?? (() => Date.now());
  const K = {
    manifest: manifestKey(saveId),
    core: coreKey(saveId),
    unreadable: unreadableKey(saveId),
  };

  /* Set when a stored save could not be read (corrupt, checksum mismatch,
   * future game schema, future storage format, failed migration). While set,
   * writes are refused so a new game can never destroy the original. */
  let unreadable = false;
  let createdAt: number | null = null;
  /** Chunk records already committed, keyed by storage key. */
  const chunkEntries = new Map<string, ChunkManifestEntry>();
  const history = createHistoryRepository(deps.records, saveId);

  const metrics: StorageMetrics = {
    lastLoadMs: null,
    lastSaveMs: null,
    lastLegacyMigrationMs: null,
    lastCoreBytes: null,
    recordCount: null,
  };

  /** Keep an unreadable payload verbatim, in the same store. */
  async function preserve(raw: string, reason: string): Promise<Diagnostic> {
    unreadable = true;
    try {
      await deps.records.putAll([{ key: K.unreadable, value: raw }]);
      return {
        level: "warn",
        code: "save/preserved",
        detail: `${reason}; original kept at ${K.unreadable}`,
      };
    } catch (e) {
      return { level: "warn", code: "save/preserve-failed", detail: (e as Error).message };
    }
  }

  /** Shared decode path: raw JSON -> migrated GameState, or diagnostics. */
  async function decode(raw: string, origin: string): Promise<LoadResult> {
    const { parsed, diagnostics } = parseSave(raw);
    if (!parsed) {
      return {
        state: null,
        diagnostics: [...diagnostics, await preserve(raw, `${origin} could not be parsed`)],
      };
    }
    const v =
      typeof parsed.version === "number" && Number.isFinite(parsed.version) ? parsed.version : 1;
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
          await preserve(raw, `future schema v${v}`),
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
          await preserve(raw, `${origin} migration failed`),
        ],
      };
    }
  }

  function buildManifest(state: GameState, core: string): SaveManifest {
    const t = now();
    createdAt ??= t;
    const bytes = byteLength(core);
    const chunkManifest = [...chunkEntries.values()].sort((a, b) => a.key.localeCompare(b.key));
    return {
      saveId,
      storageFormatVersion: STORAGE_FORMAT_VERSION,
      gameSchemaVersion: state.version,
      saveSeed: state.saveSeed,
      controlledClubId: controlledClubId(state) as string,
      createdAt,
      updatedAt: t,
      coreBytes: bytes,
      coreChecksum: checksum(core),
      chunkManifest,
      totalBytes: bytes + chunkManifest.reduce((t, c) => t + c.bytes, 0),
    };
  }

  /** Atomic commit of history chunks + core + manifest in ONE transaction. */
  async function commit(state: GameState): Promise<{ diagnostics: Diagnostic[]; core: string }> {
    /* Compaction is PURE: `state` is never mutated, only read. */
    const { core: compactCore, chunks } = compactState(state);
    const core = serializeSave(compactCore);

    const chunkRecords: StoredRecord[] = [];
    const pendingEntries: ChunkManifestEntry[] = [];
    if (chunks.length) {
      const keys = chunks.map((c) => historyChunkKey(saveId, c.kind, c.season));
      let existing: Record<string, string | undefined> = {};
      try {
        existing = await deps.records.get(keys);
      } catch (e) {
        return {
          diagnostics: [
            { level: "error", code: "save/chunk-read-failed", detail: (e as Error).message },
          ],
          core,
        };
      }
      chunks.forEach((c, i) => {
        const key = keys[i]!;
        let rows: unknown[] = [];
        const raw = existing[key];
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed)) rows = parsed;
          } catch {
            /* unreadable chunk: rebuilt from the rows we hold */
          }
        }
        const value = JSON.stringify([...rows, ...c.rows]);
        chunkRecords.push({ key, value });
        pendingEntries.push({ key, bytes: byteLength(value), checksum: checksum(value) });
      });
    }

    // Manifest must describe the post-write world, including new chunks.
    // Snapshot any entries being replaced so a failed transaction can restore
    // the exact previously committed manifest state rather than deleting them.
    const previousEntries = new Map<string, ChunkManifestEntry | undefined>();
    for (const e of pendingEntries) {
      previousEntries.set(e.key, chunkEntries.get(e.key));
      chunkEntries.set(e.key, e);
    }
    const manifest = buildManifest(compactCore, core);
    try {
      await deps.records.putAll([
        ...chunkRecords,
        { key: K.core, value: core },
        { key: K.manifest, value: JSON.stringify(manifest) },
      ]);
      metrics.lastCoreBytes = manifest.coreBytes;
      metrics.recordCount = 2 + manifest.chunkManifest.length;
      return { diagnostics: [], core };
    } catch (e) {
      // Nothing landed (putAll is atomic): restore the in-memory manifest to
      // exactly the state of the previous valid save.
      for (const en of pendingEntries) {
        const previous = previousEntries.get(en.key);
        if (previous) chunkEntries.set(en.key, previous);
        else chunkEntries.delete(en.key);
      }
      return {
        diagnostics: [{ level: "error", code: "save/write-failed", detail: (e as Error).message }],
        core,
      };
    }
  }

  async function migrateLegacy(): Promise<LoadResult> {
    const legacy = deps.legacy;
    const raw = legacy?.readRaw() ?? null;
    if (!legacy || !raw) return { state: null, diagnostics: [] };

    const t0 = performance.now();
    const decoded = await decode(raw, "legacy save");
    if (!decoded.state) {
      // Legacy source is left EXACTLY as it was; nothing was written to IDB.
      return {
        state: null,
        diagnostics: [
          ...decoded.diagnostics,
          {
            level: "error",
            code: "save/legacy-migration-failed",
            detail: "legacy save left untouched",
          },
        ],
      };
    }

    const { diagnostics } = await commit(decoded.state);
    if (diagnostics.length) {
      // Partial/failed write: drop anything we may have written, keep legacy.
      try {
        await deps.records.deleteKeys([K.core, K.manifest]);
      } catch {
        /* best effort */
      }
      return {
        state: decoded.state,
        diagnostics: [
          ...decoded.diagnostics,
          ...diagnostics,
          {
            level: "error",
            code: "save/legacy-migration-failed",
            detail: "legacy save left untouched",
          },
        ],
      };
    }

    // Verify the committed copy before touching the only other copy.
    const verify = await deps.records.get([K.core, K.manifest]);
    const m = verify[K.manifest] ? (JSON.parse(verify[K.manifest]!) as unknown) : null;
    const ok = !!verify[K.core] && isManifest(m) && m.coreChecksum === checksum(verify[K.core]!);
    if (!ok) {
      try {
        await deps.records.deleteKeys([K.core, K.manifest]);
      } catch {
        /* best effort */
      }
      return {
        state: decoded.state,
        diagnostics: [
          ...decoded.diagnostics,
          {
            level: "error",
            code: "save/legacy-migration-unverified",
            detail: "legacy save left untouched",
          },
        ],
      };
    }

    legacy.archive(raw);
    legacy.remove();
    metrics.lastLegacyMigrationMs = performance.now() - t0;
    return {
      state: decoded.state,
      diagnostics: [
        ...decoded.diagnostics,
        {
          level: "info",
          code: "save/migrated-to-idb",
          detail: `legacy save moved to ${deps.records.kind}`,
        },
      ],
    };
  }

  return {
    kind: `indexedDB:${deps.records.kind}`,
    metrics,
    history,

    async readManifest() {
      const rec = await deps.records.get([K.manifest]);
      if (!rec[K.manifest]) return null;
      try {
        const m = JSON.parse(rec[K.manifest]!) as unknown;
        return isManifest(m) ? m : null;
      } catch {
        return null;
      }
    },

    async load(): Promise<LoadResult> {
      const t0 = performance.now();
      let rec: Record<string, string | undefined>;
      try {
        rec = await deps.records.get([K.manifest, K.core, K.unreadable]);
      } catch (e) {
        return {
          state: null,
          diagnostics: [{ level: "error", code: "save/read-failed", detail: (e as Error).message }],
        };
      }

      if (rec[K.unreadable] && !rec[K.manifest] && !rec[K.core]) {
        unreadable = true;
        return {
          state: null,
          diagnostics: [
            { level: "warn", code: "save/preserved", detail: "an unreadable save is present" },
          ],
        };
      }

      if (!rec[K.manifest] && !rec[K.core]) {
        const res = await migrateLegacy();
        metrics.lastLoadMs = performance.now() - t0;
        return res;
      }

      const diagnostics: Diagnostic[] = [];
      let manifest: SaveManifest | null = null;
      if (rec[K.manifest]) {
        try {
          const m = JSON.parse(rec[K.manifest]!) as unknown;
          if (isManifest(m)) manifest = m;
        } catch {
          /* handled below */
        }
      }

      if (!manifest) {
        diagnostics.push({ level: "error", code: "save/manifest-invalid" });
        return {
          state: null,
          diagnostics: [
            ...diagnostics,
            await preserve(rec[K.core] ?? "", "manifest missing or invalid"),
          ],
        };
      }
      if (manifest.storageFormatVersion > STORAGE_FORMAT_VERSION) {
        return {
          state: null,
          diagnostics: [
            {
              level: "error",
              code: "save/future-storage-format",
              detail:
                `this save uses a newer storage format (v${manifest.storageFormatVersion}; ` +
                `this build understands v${STORAGE_FORMAT_VERSION}). Update the game to load it.`,
            },
            await preserve(
              rec[K.core] ?? "",
              `future storage format v${manifest.storageFormatVersion}`,
            ),
          ],
        };
      }
      if (!rec[K.core]) {
        unreadable = true;
        return { state: null, diagnostics: [{ level: "error", code: "save/core-missing" }] };
      }
      if (checksum(rec[K.core]!) !== manifest.coreChecksum) {
        return {
          state: null,
          diagnostics: [
            {
              level: "error",
              code: "save/checksum-mismatch",
              detail: "stored state does not match its manifest",
            },
            await preserve(rec[K.core]!, "checksum mismatch"),
          ],
        };
      }

      createdAt = manifest.createdAt;
      chunkEntries.clear();
      for (const c of manifest.chunkManifest ?? []) chunkEntries.set(c.key, c);
      const decoded = await decode(rec[K.core]!, "save");
      metrics.lastLoadMs = performance.now() - t0;
      metrics.lastCoreBytes = manifest.coreBytes;
      metrics.recordCount = 2 + manifest.chunkManifest.length;
      return { state: decoded.state, diagnostics: [...diagnostics, ...decoded.diagnostics] };
    },

    async save(state: GameState): Promise<Diagnostic[]> {
      if (unreadable) {
        return [
          {
            level: "error",
            code: "save/write-blocked",
            detail:
              "an unreadable save is present; refusing to overwrite it until the slot is cleared",
          },
        ];
      }
      const t0 = performance.now();
      const { diagnostics } = await commit(state);
      metrics.lastSaveMs = performance.now() - t0;
      return diagnostics;
    },

    async clear(): Promise<void> {
      unreadable = false;
      createdAt = null;
      chunkEntries.clear();
      // Only this save's records — never unrelated browser storage.
      await deps.records.deletePrefix(`${saveId}:`);
      deps.legacy?.purge();
    },
  };
}
