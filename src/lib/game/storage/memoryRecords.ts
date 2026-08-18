/* In-memory RecordStore — used by the check suites and as a last-resort
 * backend when no persistent storage exists (nothing survives a reload). */
import type { RecordStore, StoredRecord } from "./records";

export interface MemoryRecordsOptions {
  /** Simulate a failing IndexedDB transaction. */
  failWrites?: boolean;
}

export function createMemoryRecordStore(opts: MemoryRecordsOptions = {}) {
  const map = new Map<string, string>();
  const store: RecordStore & { map: Map<string, string>; options: MemoryRecordsOptions } = {
    kind: "memory",
    map,
    options: opts,
    async get(keys) {
      const out: Record<string, string | undefined> = {};
      for (const k of keys) out[k] = map.get(k);
      return out;
    },
    async putAll(records: StoredRecord[]) {
      // Atomic: validate the whole batch before mutating anything.
      if (store.options.failWrites) throw new Error("simulated transaction failure");
      for (const r of records) map.set(r.key, r.value);
    },
    async deleteKeys(keys) {
      for (const k of keys) map.delete(k);
    },
    async deletePrefix(prefix) {
      for (const k of [...map.keys()]) if (k.startsWith(prefix)) map.delete(k);
    },
    async keys(prefix) {
      return [...map.keys()].filter((k) => (prefix ? k.startsWith(prefix) : true));
    },
  };
  return store;
}
