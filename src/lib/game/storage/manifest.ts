/* Save manifest + integrity — Phase 1a.
 *
 * The manifest is PERSISTENCE metadata. It is never merged into GameState and
 * never read by simulation code: timestamps here are UX/debug only, so they
 * cannot leak into a deterministic tick.
 */
import { hashString } from "../rng";

/** Layout version of the persistence format. Deliberately SEPARATE from
 *  GameState.version (the game schema), which the migration registry owns. */
export const STORAGE_FORMAT_VERSION = 1;

/** The single slot used today. Records are keyed by saveId so multi-slot
 *  saves are a later feature, not a later redesign. */
export const DEFAULT_SAVE_ID = "primary";

export interface ChunkManifestEntry {
  key: string;
  bytes: number;
  checksum: string;
}

export interface SaveManifest {
  saveId: string;
  storageFormatVersion: number;
  gameSchemaVersion: number;
  saveSeed: string;
  controlledClubId: string | null;
  createdAt: number;
  updatedAt: number;
  coreBytes: number;
  coreChecksum: string;
  /** Empty in Phase 1a; the namespace exists so 1b/1c add rows, not a format. */
  chunkManifest: ChunkManifestEntry[];
  totalBytes: number;
}

/** Deterministic, non-cryptographic corruption detector. */
export function checksum(s: string): string {
  return (hashString(s) >>> 0).toString(16).padStart(8, "0");
}

export const manifestKey = (saveId: string) => `${saveId}:manifest`;
export const coreKey = (saveId: string) => `${saveId}:core`;
/** Reserved namespaces for Phase 1b/1c. Not written in 1a. */
export const chunkKey = (saveId: string, kind: string, id: string) => `${saveId}:${kind}:${id}`;
export const unreadableKey = (saveId: string) => `${saveId}:unreadable`;

export function isManifest(v: unknown): v is SaveManifest {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.saveId === "string" &&
    typeof m.storageFormatVersion === "number" &&
    typeof m.gameSchemaVersion === "number" &&
    typeof m.coreChecksum === "string"
  );
}
