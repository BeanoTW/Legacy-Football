/* IndexedDB SaveStore verification — Phase 1a.
   Run with:  bun src/lib/game/__checks__/idb-storage.check.ts
*/
import { newGame, advanceWeek, migrateSave, SAVE_VERSION } from "../engine";
import { createIdbSaveStore } from "../storage/idbStore";
import { createMemoryRecordStore } from "../storage/memoryRecords";
import { createLegacyLocalSource, STORAGE_KEY, MIGRATED_KEY } from "../storage/localStore";
import { serializeSave } from "../storage/serialize";
import {
  STORAGE_FORMAT_VERSION, checksum, coreKey, manifestKey, isManifest, type SaveManifest,
} from "../storage/manifest";
import { stateHash } from "../diagnostics/stateHash";
import type { GameState } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}

const SEED = "PHASE1A|IDB|FIXED";
const SAVE_ID = "primary";
const K = { core: coreKey(SAVE_ID), manifest: manifestKey(SAVE_ID) };

function localBackend() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

function makeStore(
  records = createMemoryRecordStore(),
  legacyBackend: ReturnType<typeof localBackend> | null = null,
) {
  const store = createIdbSaveStore({
    records,
    migrate: migrateSave,
    currentVersion: SAVE_VERSION,
    legacy: legacyBackend ? createLegacyLocalSource(legacyBackend) : null,
    now: () => 1_700_000_000_000,
  });
  return { store, records, legacyBackend };
}

const fresh = () => newGame("IDB City", "Ada Store", SEED);

console.log("\n[D1] Basic IndexedDB store");
{
  const { store, records } = makeStore();
  const empty = await store.load();
  check("1. empty store loads as no save", empty.state === null && empty.diagnostics.length === 0);

  const s = fresh();
  const diags = await store.save(s);
  check("2. current save writes successfully", diags.length === 0, JSON.stringify(diags));

  const loaded = await store.load();
  check("3. save reads back byte-equivalent", serializeSave(loaded.state!) === serializeSave(s));
  check("6. round trip preserves deterministic state", stateHash(loaded.state!) === stateHash(s));

  const s2 = advanceWeek(s);
  await store.save(s2);
  const reloaded = await store.load();
  check("4. overwrite replaces previous state", stateHash(reloaded.state!) === stateHash(s2));
  check("   overwrite does not accumulate records", (await records.keys()).length === 2);

  await store.clear();
  check("5. clear removes the current save", (await store.load()).state === null);
  check("   clear removed every record for the slot", (await records.keys()).length === 0);
}

console.log("\n[D2] Legacy localStorage migration");
{
  const legacy = localBackend();
  const s = fresh();
  legacy.map.set(STORAGE_KEY, serializeSave(s));
  const { store, records } = makeStore(createMemoryRecordStore(), legacy);

  const res = await store.load();
  check("7-8. legacy save is detected and migrated", res.state !== null &&
    res.diagnostics.some((d) => d.code === "save/migrated-to-idb"));
  check("9. migrated state equals the source after game migration", stateHash(res.state!) === stateHash(s));
  check("10. legacy live key removed only after a verified commit",
    !legacy.map.has(STORAGE_KEY) && legacy.map.has(MIGRATED_KEY) && !!(await records.get([K.core]))[K.core]);

  const again = await store.load();
  check("12. re-running load does not duplicate state",
    stateHash(again.state!) === stateHash(s) && (await records.keys()).length === 2 &&
    !again.diagnostics.some((d) => d.code === "save/migrated-to-idb"));
}
{
  // 11. Failed migration must preserve the legacy save.
  const legacy = localBackend();
  const s = fresh();
  const raw = serializeSave(s);
  legacy.map.set(STORAGE_KEY, raw);
  const records = createMemoryRecordStore({ failWrites: true });
  const { store } = makeStore(records, legacy);
  const res = await store.load();
  check("11. failed migration preserves the legacy save", legacy.map.get(STORAGE_KEY) === raw);
  check("    failed migration is reported", res.diagnostics.some((d) => d.code === "save/legacy-migration-failed"));
  check("    no partial IndexedDB save is exposed", (await records.keys()).length === 0);
}
{
  // Corrupt legacy save: nothing is written, source untouched.
  const legacy = localBackend();
  legacy.map.set(STORAGE_KEY, "{not json");
  const { store, records } = makeStore(createMemoryRecordStore(), legacy);
  const res = await store.load();
  check("corrupt legacy save leaves the source untouched", legacy.map.get(STORAGE_KEY) === "{not json");
  check("corrupt legacy save is preserved and reported",
    res.state === null && res.diagnostics.some((d) => d.code === "save/parse-failed"));
  const blocked = await store.save(fresh());
  check("writes stay blocked while the legacy save is unreadable",
    blocked.some((d) => d.code === "save/write-blocked"));
  void records;
}

console.log("\n[D3] Future-version protection");
{
  const records = createMemoryRecordStore();
  const s = fresh() as unknown as Record<string, unknown>;
  s.version = SAVE_VERSION + 5;
  const core = JSON.stringify(s);
  const manifest: SaveManifest = {
    saveId: SAVE_ID, storageFormatVersion: STORAGE_FORMAT_VERSION,
    gameSchemaVersion: SAVE_VERSION + 5, saveSeed: SEED, controlledClubId: "IDB City",
    createdAt: 1, updatedAt: 1, coreBytes: core.length, coreChecksum: checksum(core),
    chunkManifest: [], totalBytes: core.length,
  };
  await records.putAll([{ key: K.core, value: core }, { key: K.manifest, value: JSON.stringify(manifest) }]);
  const { store } = makeStore(records);
  const res = await store.load();
  check("13. future-version save is rejected safely",
    res.state === null && res.diagnostics.some((d) => d.code === "save/future-version" && /newer version/.test(d.detail ?? "")));
  check("14. future-version source remains untouched", (await records.get([K.core]))[K.core] === core);
  const diags = await store.save(fresh());
  check("15. no new game overwrites it automatically",
    diags.some((d) => d.code === "save/write-blocked") && (await records.get([K.core]))[K.core] === core);
}
{
  const records = createMemoryRecordStore();
  const s = fresh();
  const core = serializeSave(s);
  await records.putAll([
    { key: K.core, value: core },
    { key: K.manifest, value: JSON.stringify({
      saveId: SAVE_ID, storageFormatVersion: STORAGE_FORMAT_VERSION + 1, gameSchemaVersion: SAVE_VERSION,
      saveSeed: SEED, controlledClubId: "IDB City", createdAt: 1, updatedAt: 1,
      coreBytes: core.length, coreChecksum: checksum(core), chunkManifest: [], totalBytes: core.length,
    }) },
  ]);
  const { store } = makeStore(records);
  const res = await store.load();
  check("future STORAGE format is rejected separately from game schema",
    res.state === null && res.diagnostics.some((d) => d.code === "save/future-storage-format"));
  check("future storage-format save is not overwritten",
    (await store.save(fresh())).some((d) => d.code === "save/write-blocked"));
}

console.log("\n[D4] Atomicity + integrity");
{
  const records = createMemoryRecordStore();
  const { store } = makeStore(records);
  const good = fresh();
  await store.save(good);
  records.options.failWrites = true;
  const diags = await store.save(advanceWeek(good));
  check("16. failed transaction does not expose a partial save",
    diags.some((d) => d.code === "save/write-failed"));
  records.options.failWrites = false;
  const after = await store.load();
  check("17. previous valid save remains readable after a failed overwrite",
    stateHash(after.state!) === stateHash(good));
}
{
  const records = createMemoryRecordStore();
  const { store } = makeStore(records);
  await store.save(fresh());
  await records.deleteKeys([K.core]);
  const res = await store.load();
  check("18. missing core record is detected",
    res.state === null && res.diagnostics.some((d) => d.code === "save/core-missing"));
}
{
  const records = createMemoryRecordStore();
  const { store } = makeStore(records);
  await store.save(fresh());
  const core = (await records.get([K.core]))[K.core]!;
  await records.putAll([{ key: K.core, value: core.replace("IDB City", "IDB Citz") }]);
  const res = await store.load();
  check("19. checksum/manifest mismatch is detected",
    res.state === null && res.diagnostics.some((d) => d.code === "save/checksum-mismatch"));
  check("    a mismatched save is preserved, not overwritten",
    (await store.save(fresh())).some((d) => d.code === "save/write-blocked"));
}
{
  const records = createMemoryRecordStore();
  const { store } = makeStore(records);
  await store.save(fresh());
  await records.putAll([{ key: K.manifest, value: "{not json" }]);
  const res = await store.load();
  check("invalid manifest is detected", res.state === null &&
    res.diagnostics.some((d) => d.code === "save/manifest-invalid"));
}

console.log("\n[D5] Metadata separation");
{
  const recordsA = createMemoryRecordStore();
  const a = createIdbSaveStore({ records: recordsA, migrate: migrateSave, currentVersion: SAVE_VERSION, now: () => 1 });
  const recordsB = createMemoryRecordStore();
  const b = createIdbSaveStore({ records: recordsB, migrate: migrateSave, currentVersion: SAVE_VERSION, now: () => 999_999 });
  const s = fresh();
  await a.save(s); await b.save(s);
  const coreA = (await recordsA.get([K.core]))[K.core]!;
  const coreB = (await recordsB.get([K.core]))[K.core]!;
  check("20. storage timestamps do not change the simulation snapshot", coreA === coreB);
  const loaded = (await a.load()).state!;
  check("20b. loaded state hash is unaffected by storage metadata", stateHash(loaded) === stateHash(s));

  const stateKeys = Object.keys(loaded as unknown as Record<string, unknown>);
  const manifestOnly = ["saveId", "storageFormatVersion", "coreChecksum", "chunkManifest", "updatedAt", "createdAt", "totalBytes", "coreBytes"];
  check("21. manifest data is not injected into GameState",
    manifestOnly.every((k) => !stateKeys.includes(k)));

  const m = await a.readManifest();
  check("22. storage format version is separate from the game schema version",
    isManifest(m) && m!.storageFormatVersion === STORAGE_FORMAT_VERSION &&
    m!.gameSchemaVersion === SAVE_VERSION && STORAGE_FORMAT_VERSION !== SAVE_VERSION);
  check("    manifest carries save identity for future multi-slot use",
    m!.saveId === SAVE_ID && m!.saveSeed === s.saveSeed && m!.controlledClubId === "IDB City");
}

console.log("\n[D6] Clear/reset across every state");
{
  // after a migrated legacy save
  const legacy = localBackend();
  legacy.map.set(STORAGE_KEY, serializeSave(fresh()));
  const { store, records } = makeStore(createMemoryRecordStore(), legacy);
  await store.load();
  await store.clear();
  check("reset after a migrated legacy save wipes both stores",
    (await records.keys()).length === 0 && legacy.map.size === 0);
}
{
  // after a future-version save
  const records = createMemoryRecordStore();
  const s = fresh() as unknown as Record<string, unknown>;
  s.version = SAVE_VERSION + 5;
  const core = JSON.stringify(s);
  await records.putAll([
    { key: K.core, value: core },
    { key: K.manifest, value: JSON.stringify({
      saveId: SAVE_ID, storageFormatVersion: STORAGE_FORMAT_VERSION, gameSchemaVersion: SAVE_VERSION + 5,
      saveSeed: SEED, controlledClubId: "IDB City", createdAt: 1, updatedAt: 1,
      coreBytes: core.length, coreChecksum: checksum(core), chunkManifest: [], totalBytes: core.length,
    }) },
  ]);
  const { store } = makeStore(records);
  await store.load();
  await store.clear();
  check("reset after a future-version save unblocks writing",
    (await store.save(fresh())).length === 0 && (await records.keys()).length === 2);
}
{
  // failed migration then reset
  const legacy = localBackend();
  legacy.map.set(STORAGE_KEY, "{not json");
  const { store } = makeStore(createMemoryRecordStore(), legacy);
  await store.load();
  await store.clear();
  check("reset after a failed migration clears the legacy slot", legacy.map.size === 0);
  check("reset after a failed migration allows a new save", (await store.save(fresh())).length === 0);
}

console.log("\n[D7] Scale + benchmarks");
{
  const records = createMemoryRecordStore();
  const { store } = makeStore(records);
  let s: GameState = fresh();
  for (let season = 0; season < 5; season++) for (let w = 0; w < 46; w++) s = advanceWeek(s);
  const bytes = serializeSave(s).length;

  const t0 = performance.now();
  const diags = await store.save(s);
  const saveMs = performance.now() - t0;
  const t1 = performance.now();
  const loaded = await store.load();
  const loadMs = performance.now() - t1;

  console.log(`  · season-5 core: ${(bytes / 1024 / 1024).toFixed(2)} MB | save ${saveMs.toFixed(1)} ms | load ${loadMs.toFixed(1)} ms`);
  check("25. a season-5 save (beyond the localStorage danger line) stores and loads",
    diags.length === 0 && loaded.state !== null && stateHash(loaded.state!) === stateHash(s) && bytes > 4_000_000);
  check("23. load stays within the development baseline (<2000 ms)", loadMs < 2000, `${loadMs.toFixed(1)} ms`);
  check("24. save stays within the development baseline (<2000 ms)", saveMs < 2000, `${saveMs.toFixed(1)} ms`);
  check("metrics are reported by the store", store.metrics.lastSaveMs !== null && store.metrics.recordCount === 2);
}

console.log("\n[D8] Static audit: persistence stays inside the storage module");
{
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = `${dir}/${e}`;
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(e)) continue;
      if (p.includes("/lib/game/storage/") || p.includes("/__checks__/")) continue;
      const src = readFileSync(p, "utf8");
      if (/localStorage\s*[.[]/.test(src)) offenders.push(`${p} (localStorage)`);
      if (/\bindexedDB\b/.test(src)) offenders.push(`${p} (indexedDB)`);
      if (/"chairman\.save|football-club-owner"/.test(src)) offenders.push(`${p} (storage key)`);
    }
  };
  walk("src");
  check("no persistence details outside lib/game/storage", offenders.length === 0, offenders.join(", "));

  const engine = readFileSync("src/lib/game/engine.ts", "utf8");
  check("engine talks only to the SaveStore factory",
    /createSaveStore\(/.test(engine) && !/createLocalSaveStore|createIdbRecordStore/.test(engine));

  const types = readFileSync("src/lib/game/types.ts", "utf8");
  check("no storage metadata leaked into GameState types",
    !/storageFormatVersion|coreChecksum|chunkManifest|updatedAt/.test(types));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
