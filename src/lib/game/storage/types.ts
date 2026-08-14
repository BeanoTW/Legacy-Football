/* Storage boundary — Phase 0.
 *
 * Domain code must not know whether persistence is localStorage, IndexedDB,
 * compressed blobs or a cloud save. It talks to `SaveStore` only.
 *
 * The interface is async on purpose: Phase 1 swaps in a chunked IndexedDB
 * store with zero changes to callers.
 */
import type { GameState } from "../types";

export type DiagnosticLevel = "info" | "warn" | "error";

export interface Diagnostic {
  level: DiagnosticLevel;
  code: string;
  detail?: string;
}

export interface LoadResult {
  state: GameState | null;
  diagnostics: Diagnostic[];
}

export interface SaveStore {
  /** Storage backend name, for diagnostics only. */
  readonly kind: string;
  load(): Promise<LoadResult>;
  save(state: GameState): Promise<Diagnostic[]>;
  clear(): Promise<void>;
}
