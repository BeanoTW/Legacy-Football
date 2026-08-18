/* Native IndexedDB implementation of the RecordStore contract — Phase 1a.
 *
 * No dependency: the surface we need (one object store, one transaction per
 * operation) is smaller than any wrapper library would be.
 *
 * Database identity is stable and versioned separately from the game schema.
 */
import type { RecordStore, StoredRecord } from "./records";

export const DB_NAME = "football-club-owner";
/** IndexedDB *database* version — bump only when object stores change. */
export const DB_VERSION = 1;
export const STORE_NAME = "records";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });
}

export function indexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
    open.onblocked = () => reject(new Error("IndexedDB open blocked by another tab"));
  });
}

export function createIdbRecordStore(): RecordStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= openDb());

  async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => Promise<T>): Promise<T> {
    const d = await db();
    const t = d.transaction(STORE_NAME, mode);
    const store = t.objectStore(STORE_NAME);
    const done = new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error ?? new Error("IndexedDB transaction failed"));
      t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted"));
    });
    let result: T;
    try {
      result = await fn(store);
    } catch (e) {
      try { t.abort(); } catch { /* already finished */ }
      throw e;
    }
    await done;
    return result;
  }

  return {
    kind: "indexedDB",

    async get(keys) {
      return tx("readonly", async (store) => {
        const out: Record<string, string | undefined> = {};
        for (const k of keys) {
          const v = await req(store.get(k));
          out[k] = typeof v === "string" ? v : undefined;
        }
        return out;
      });
    },

    /** Single transaction: all records commit together or none do. */
    async putAll(records: StoredRecord[]) {
      await tx("readwrite", async (store) => {
        for (const r of records) await req(store.put(r.value, r.key));
      });
    },

    async deleteKeys(keys) {
      await tx("readwrite", async (store) => {
        for (const k of keys) await req(store.delete(k));
      });
    },

    async deletePrefix(prefix) {
      await tx("readwrite", async (store) => {
        const all = (await req(store.getAllKeys())) as IDBValidKey[];
        for (const k of all) {
          if (typeof k === "string" && k.startsWith(prefix)) await req(store.delete(k));
        }
      });
    },

    async keys(prefix) {
      return tx("readonly", async (store) => {
        const all = (await req(store.getAllKeys())) as IDBValidKey[];
        return all
          .filter((k): k is string => typeof k === "string")
          .filter((k) => (prefix ? k.startsWith(prefix) : true));
      });
    },
  };
}
