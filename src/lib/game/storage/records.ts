/* Record-store boundary — Phase 1a.
 *
 * The IndexedDB SaveStore is written against this tiny transactional
 * key/value contract rather than against IndexedDB itself. Two consequences:
 *
 *   1. The store logic (manifest, checksum, legacy migration, atomicity) is
 *      testable in a non-browser runner with an in-memory backend.
 *   2. A future backend (OPFS, remote save) is a drop-in.
 *
 * Keys are namespaced strings so future chunk records
 * (`<saveId>:history:matches:s12`, `<saveId>:world:league-3`) slot in without
 * a schema change.
 */

export interface StoredRecord {
  key: string;
  value: string;
}

export interface RecordStore {
  /** Backend name, diagnostics only. */
  readonly kind: string;
  get(keys: string[]): Promise<Record<string, string | undefined>>;
  /** MUST be atomic: either every record lands, or none does. */
  putAll(records: StoredRecord[]): Promise<void>;
  deleteKeys(keys: string[]): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}

/** Legacy (localStorage) save slot, seen by the IDB store only through this. */
export interface LegacySource {
  readRaw(): string | null;
  /** Keep an untouched copy under an archive key. */
  archive(raw: string): void;
  /** Remove the live legacy save. Called ONLY after a verified IDB commit. */
  remove(): void;
  /** Wipe live + archive copies (reset). */
  purge(): void;
}
