/* Deterministic state fingerprint — the Phase 0 refactor safety net.
 *
 * Any structural refactor must leave the simulation bit-identical. The hash is
 * taken over a key-sorted serialization so property ordering changes (which are
 * meaningless) never trip the lock.
 */
import { hashString } from "../rng";
import type { GameState } from "../types";

/** Stable, key-sorted JSON. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/** 32-bit fingerprint of the whole state, as hex. */
export function stateHash(state: GameState): string {
  return (hashString(stableStringify(state)) >>> 0).toString(16).padStart(8, "0");
}

/** Per-top-level-key fingerprints, so a mismatch points at the guilty system. */
export function stateHashParts(state: GameState): Record<string, string> {
  const s = state as unknown as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of Object.keys(s).sort()) {
    out[k] = (hashString(stableStringify(s[k])) >>> 0).toString(16).padStart(8, "0");
  }
  return out;
}
