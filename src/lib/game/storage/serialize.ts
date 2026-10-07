/* Pure serialization helpers. No storage backend knowledge lives here. */
import type { GameState } from "../types";
import { makePyramidSchedule } from "../pyramid";
import type { Diagnostic } from "./types";

export function serializeSave(state: GameState): string {
  return JSON.stringify(state);
}

/**
 * IndexedDB hot-core representation. A canonical current-season league
 * schedule is fully reconstructible from (leagues, saveSeed, season), so omit
 * it only when it exactly matches the deterministic generator. Any customised
 * or future-rescheduled schedule stays persisted verbatim.
 */
export function serializeStorageCore(state: GameState): string {
  if (!state.leagues?.length || !state.leagueSchedule?.length) return JSON.stringify(state);
  const regenerated = makePyramidSchedule(state.leagues, `${state.saveSeed}|season${state.season}`);
  if (JSON.stringify(regenerated) !== JSON.stringify(state.leagueSchedule)) return JSON.stringify(state);
  return JSON.stringify({ ...state, leagueSchedule: [] });
}

/**
 * Parse a raw save string. Migration is applied by the caller (the store) so
 * this stays a pure, dependency-light function usable from tests.
 */
export function parseSave(raw: string): {
  parsed: Record<string, unknown> | null;
  diagnostics: Diagnostic[];
} {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { parsed: null, diagnostics: [{ level: "error", code: "save/not-an-object" }] };
    }
    return { parsed: parsed as Record<string, unknown>, diagnostics: [] };
  } catch (e) {
    return {
      parsed: null,
      diagnostics: [{ level: "error", code: "save/parse-failed", detail: (e as Error).message }],
    };
  }
}

/** UTF-8 byte length of an already-serialized save. */
export function byteLength(s: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
  // Fallback: count UTF-8 bytes manually.
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i)!;
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c < 0x10000) bytes += 3;
    else {
      bytes += 4;
      i++;
    }
  }
  return bytes;
}
