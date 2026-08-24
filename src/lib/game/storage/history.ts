/* History repository — Phase 1b.
 *
 * Historical detail compacted out of the hot core lives in per-(kind, season)
 * chunk records inside the SAME record store as the core. This repository is
 * the only read path for that detail: UI code asks for "matches in season 7",
 * never for a storage key.
 *
 * Chunk key layout:  <saveId>:history:<domain>:s<season>
 */
import type { RecordStore } from "./records";
import { DEFAULT_SAVE_ID, chunkKey } from "./manifest";
import type { ChunkKind } from "./compaction";
import { CHUNK_KINDS } from "./compaction";

export const historyChunkKey = (saveId: string, kind: ChunkKind, season: number) =>
  chunkKey(saveId, kind, `s${season}`);

/** Parse a stored chunk key back into (kind, season), or null. */
export function parseHistoryKey(
  saveId: string,
  key: string,
): { kind: ChunkKind; season: number } | null {
  const prefix = `${saveId}:`;
  if (!key.startsWith(prefix)) return null;
  const rest = key.slice(prefix.length);
  const m = rest.match(/^(history:[a-z-]+):s(\d+)$/);
  if (!m) return null;
  const kind = m[1] as ChunkKind;
  if (!CHUNK_KINDS.includes(kind)) return null;
  return { kind, season: Number(m[2]) };
}

export interface HistoryRepository {
  /** Seasons that have at least one archived chunk, ascending. */
  seasons(kind?: ChunkKind): Promise<number[]>;
  /** Archived rows for one domain in one season. */
  read<T = unknown>(kind: ChunkKind, season: number): Promise<T[]>;
  /** Archived rows for one domain across every archived season. */
  readAll<T = unknown>(kind: ChunkKind): Promise<T[]>;
}

export function createHistoryRepository(
  records: RecordStore,
  saveId: string = DEFAULT_SAVE_ID,
): HistoryRepository {
  async function index(): Promise<{ kind: ChunkKind; season: number; key: string }[]> {
    const keys = await records.keys(`${saveId}:history:`);
    const out: { kind: ChunkKind; season: number; key: string }[] = [];
    for (const key of keys) {
      const parsed = parseHistoryKey(saveId, key);
      if (parsed) out.push({ ...parsed, key });
    }
    return out;
  }

  function decode<T>(raw: string | undefined): T[] {
    if (!raw) return [];
    try {
      const v = JSON.parse(raw) as unknown;
      return Array.isArray(v) ? (v as T[]) : [];
    } catch {
      return [];
    }
  }

  return {
    async seasons(kind?: ChunkKind) {
      const rows = await index();
      const seen = new Set<number>();
      for (const r of rows) if (!kind || r.kind === kind) seen.add(r.season);
      return [...seen].sort((a, b) => a - b);
    },

    async read<T>(kind: ChunkKind, season: number) {
      const key = historyChunkKey(saveId, kind, season);
      const rec = await records.get([key]);
      return decode<T>(rec[key]);
    },

    async readAll<T>(kind: ChunkKind) {
      const rows = (await index())
        .filter((r) => r.kind === kind)
        .sort((a, b) => a.season - b.season);
      if (!rows.length) return [];
      const rec = await records.get(rows.map((r) => r.key));
      const out: T[] = [];
      for (const r of rows) out.push(...decode<T>(rec[r.key]));
      return out;
    },
  };
}
