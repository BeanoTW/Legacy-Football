/* Native IndexedDB backend verification — Phase 1a.
   Exercises the real `createIdbRecordStore()` against a spec-compliant
   IndexedDB implementation, so the browser code path is not untested.

   Run with:  bun src/lib/game/__checks__/idb-backend.check.ts
*/
import "fake-indexeddb/auto";
import { newGame, advanceWeek, migrateSave, SAVE_VERSION } from "../engine";
import {
  createIdbRecordStore,
  indexedDbAvailable,
  DB_NAME,
  STORE_NAME,
} from "../storage/idbBackend";
import { createIdbSaveStore } from "../storage/idbStore";
import { createLegacyLocalSource, STORAGE_KEY, MIGRATED_KEY } from "../storage/localStore";
import { serializeSave } from "../storage/serialize";
import { coreKey, manifestKey } from "../storage/manifest";
import { stateHash } from "../diagnostics/stateHash";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`);
  }
}

const SEED = "PHASE1A|IDBREAL|FIXED";
const fresh = () => newGame("Real IDB FC", "Ida Bee", SEED);

console.log("\n[R1] Backend contract on real IndexedDB");
check("indexedDB is detected as available", indexedDbAvailable());
{
  const records = createIdbRecordStore();
  await records.putAll([
    { key: "primary:core", value: "a" },
    { key: "primary:manifest", value: "b" },
  ]);
  const got = await records.get(["primary:core", "primary:manifest", "primary:missing"]);
  check(
    "putAll + get round-trip",
    got["primary:core"] === "a" &&
      got["primary:manifest"] === "b" &&
      got["primary:missing"] === undefined,
  );
  await records.putAll([{ key: "other:core", value: "c" }]);
  check(
    "prefix listing is scoped",
    (await records.keys("primary:")).sort().join(",") === "primary:core,primary:manifest",
  );
  await records.deletePrefix("primary:");
  check(
    "deletePrefix removes only the matching slot",
    (await records.keys()).join(",") === "other:core",
  );
  await records.deleteKeys(["other:core"]);
  check("deleteKeys removes the remainder", (await records.keys()).length === 0);
  check(
    "database identity is stable",
    DB_NAME === "football-club-owner" && STORE_NAME === "records",
  );
}

console.log("\n[R2] SaveStore on real IndexedDB, with a legacy localStorage save");
{
  const legacyMap = new Map<string, string>();
  const backend = {
    getItem: (k: string) => legacyMap.get(k) ?? null,
    setItem: (k: string, v: string) => {
      legacyMap.set(k, v);
    },
    removeItem: (k: string) => {
      legacyMap.delete(k);
    },
  };
  const s = fresh();
  legacyMap.set(STORAGE_KEY, serializeSave(s));

  const store = createIdbSaveStore({
    records: createIdbRecordStore(),
    migrate: migrateSave,
    currentVersion: SAVE_VERSION,
    legacy: createLegacyLocalSource(backend),
  });

  const t0 = performance.now();
  const migrated = await store.load();
  const migrateMs = performance.now() - t0;
  check(
    "legacy save migrates into real IndexedDB",
    migrated.state !== null &&
      stateHash(migrated.state!) === stateHash(s) &&
      migrated.diagnostics.some((d) => d.code === "save/migrated-to-idb"),
  );
  check(
    "legacy live key archived and removed",
    !legacyMap.has(STORAGE_KEY) && legacyMap.has(MIGRATED_KEY),
  );
  console.log(`  · legacy -> IndexedDB migration: ${migrateMs.toFixed(1)} ms`);

  const s2 = advanceWeek(migrated.state!);
  const ts = performance.now();
  const diags = await store.save(s2);
  const saveMs = performance.now() - ts;
  const tl = performance.now();
  const back = await store.load();
  const loadMs = performance.now() - tl;
  check(
    "save/load on real IndexedDB is state-identical",
    diags.length === 0 && stateHash(back.state!) === stateHash(s2),
  );
  console.log(`  · new-game save ${saveMs.toFixed(1)} ms | load ${loadMs.toFixed(1)} ms`);

  const raw = await createIdbRecordStore().get([coreKey("primary"), manifestKey("primary")]);
  check(
    "both records are present after commit",
    !!raw[coreKey("primary")] && !!raw[manifestKey("primary")],
  );

  await store.clear();
  check(
    "clear wipes IndexedDB records and the legacy slot",
    (await store.load()).state === null && legacyMap.size === 0,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
