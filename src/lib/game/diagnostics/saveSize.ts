/* Save-size instrumentation — Phase 0.
 *
 * Measures growth before the world gets bigger. Nothing here is authoritative
 * game state; it is a read-only diagnostic surface.
 */
import type { GameState } from "../types";
import { serializeSave, byteLength } from "../storage/serialize";

/** Design targets (bytes). localStorage practical ceiling is ~5MB. */
export const SIZE_WARN_BYTES = 1_000_000;
export const SIZE_ERROR_BYTES = 4_000_000;
/** Roadmap design target at season 20. Soft in Phase 0. */
export const SIZE_TARGET_S20_BYTES = 2_000_000;

export function saveBytes(state: GameState): number {
  return byteLength(serializeSave(state));
}

export interface SizeEntry {
  key: string;
  bytes: number;
  rows?: number;
}

/** Per-top-level-key byte breakdown, largest first. */
export function saveSizeBreakdown(state: GameState): {
  total: number;
  entries: SizeEntry[];
  drivers: SizeEntry[];
} {
  const s = state as unknown as Record<string, unknown>;
  const entries: SizeEntry[] = Object.keys(s).map((key) => {
    const v = s[key];
    return {
      key,
      bytes: byteLength(JSON.stringify(v ?? null)),
      rows: Array.isArray(v) ? v.length : undefined,
    };
  });
  entries.sort((a, b) => b.bytes - a.bytes);

  const arr = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const objectRows = (v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).length : 0;
  const bytesOf = (v: unknown) => byteLength(JSON.stringify(v ?? null));
  const f = state.football as unknown as Record<string, unknown> | undefined;
  const drivers: SizeEntry[] = [
    { key: "matchRecords", bytes: bytesOf(state.matchRecords), rows: arr(state.matchRecords) },
    { key: "financeLedger", bytes: bytesOf(state.financeLedger), rows: arr(state.financeLedger) },
    {
      key: "financeHistory",
      bytes: bytesOf(state.financeHistory),
      rows: arr(state.financeHistory),
    },
    { key: "inbox", bytes: bytesOf(state.inbox), rows: arr(state.inbox) },
    { key: "clubSnapshots", bytes: bytesOf(state.clubSnapshots), rows: arr(state.clubSnapshots) },
    { key: "seasonHistory", bytes: bytesOf(state.seasonHistory), rows: arr(state.seasonHistory) },
    {
      key: "fringePlayers",
      bytes: bytesOf(state.fringePlayers),
      rows: objectRows(state.fringePlayers),
    },
    { key: "players", bytes: bytesOf(f?.players), rows: arr(f?.players) },
    { key: "contracts", bytes: bytesOf(f?.contracts), rows: arr(f?.contracts) },
    { key: "transferHistory", bytes: bytesOf(f?.transferHistory), rows: arr(f?.transferHistory) },
    { key: "contractHistory", bytes: bytesOf(f?.contractHistory), rows: arr(f?.contractHistory) },
  ].sort((a, b) => b.bytes - a.bytes);

  return { total: entries.reduce((a, e) => a + e.bytes, 0), entries, drivers };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** Dev-only console signal. Silent in production builds. */
export function warnOnSaveSize(bytes: number, log: (m: string) => void = console.warn): void {
  if (bytes >= SIZE_ERROR_BYTES) {
    log(
      `[save-size] ${formatBytes(bytes)} — above the ${formatBytes(SIZE_ERROR_BYTES)} danger line.`,
    );
  } else if (bytes >= SIZE_WARN_BYTES) {
    log(
      `[save-size] ${formatBytes(bytes)} — above the ${formatBytes(SIZE_WARN_BYTES)} warning line.`,
    );
  }
}
