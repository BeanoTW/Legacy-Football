/* IndexedDB SaveStore verification — Phase 1a/1b.
   Run with: bun src/lib/game/__checks__/idb-storage.check.ts
*/
import { newGame, advanceWeek, migrateSave, SAVE_VERSION } from "../engine";
import { createIdbSaveStore } from "../storage/idbStore";
import { createMemoryRecordStore } from "../storage/memoryRecords";
import { createLegacyLocalSource, STORAGE_KEY, MIGRATED_KEY } from "../storage/localStore";
import { compactState } from "../storage/compaction";
import { serializeSave } from "../storage/serialize";
import {
  STORAGE_FORMAT_VERSION,
  checksum,
  coreKey,
  manifestKey,
  isManifest,
  type SaveManifest,
} from "../storage/manifest";
import { stateHash } from "../diagnostics/stateHash";
import type { GameState } from "../types";

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
  return { store, records };
}

const fresh = () => newGame("IDB City", "Ada Store", SEED);

console.log("\n[D1] Basic IndexedDB store");
{
  const { store, records } = makeStore();
  check("empty store loads as no save", (await store.load()).state === null);
  const s = fresh();
  check("current save writes successfully", (await store.save(s)).length === 0);
  const loaded = await store.load();
  check("save reads back byte-equivalent", serializeSave(loaded.state!) === serializeSave(s));
  check("round trip preserves deterministic state", stateHash(loaded.state!) === stateHash(s));
  const s2 = advanceWeek(s);
  await store.save(s2);
  check("overwrite replaces previous state", stateHash((await store.load()).state!) === stateHash(s2));
  check("overwrite does not accumulate records", (await records.keys()).length === 2);
  await store.clear();
  check("clear removes the current save", (await store.load()).state === null && (await records.keys()).length === 0);
}

console.log("\n[D2] Legacy localStorage migration");
{
  const legacy = localBackend();
  const s = fresh();
  legacy.map.set(STORAGE_KEY, serializeSave(s));
  const { store, records } = makeStore(createMemoryRecordStore(), legacy);
  const res = await store.load();
  check("legacy save is detected and migrated", res.state !== null && res.diagnostics.some((d) => d.code === "save/migrated-to-idb"));
  check("migrated state equals source", stateHash(res.state!) === stateHash(s));
  check("legacy live key removed only after verified commit", !legacy.map.has(STORAGE_KEY) && legacy.map.has(MIGRATED_KEY) && !!(await records.get([K.core]))[K.core]);
  const again = await store.load();
  check("re-running load does not duplicate state", stateHash(again.state!) === stateHash(s) && (await records.keys()).length === 2);
}
{
  const legacy = localBackend();
  const raw = serializeSave(fresh());
  legacy.map.set(STORAGE_KEY, raw);
  const records = createMemoryRecordStore({ failWrites: true });
  const { store } = makeStore(records, legacy);
  const res = await store.load();
  check("failed migration preserves legacy save", legacy.map.get(STORAGE_KEY) === raw);
  check("failed migration is reported", res.diagnostics.some((d) => d.code === "save/legacy-migration-failed"));
  check("failed migration exposes no partial IDB save", (await records.keys()).length === 0);
}
{
  const legacy = localBackend();
  legacy.map.set(STORAGE_KEY, "{not json");
  const { store } = makeStore(createMemoryRecordStore(), legacy);
  const res = await store.load();
  check("corrupt legacy save is preserved and reported", legacy.map.get(STORAGE_KEY) === "{not json" && res.state === null && res.diagnostics.some((d) => d.code === "save/parse-failed"));
  check("writes stay blocked while legacy save is unreadable", (await store.save(fresh())).some((d) => d.code === "save/write-blocked"));
}

console.log("\n[D3] Future-version protection");
{
  const records = createMemoryRecordStore();
  const s = fresh() as unknown as Record<string, unknown>;
  s.version = SAVE_VERSION + 5;
  const core = JSON.stringify(s);
  const manifest: SaveManifest = {
    saveId: SAVE_ID,
    storageFormatVersion: STORAGE_FORMAT_VERSION,
    gameSchemaVersion: SAVE_VERSION + 5,
    saveSeed: SEED,
    controlledClubId: "IDB City",
    createdAt: 1,
    updatedAt: 1,
    coreBytes: core.length,
    coreChecksum: checksum(core),
    chunkManifest: [],
    totalBytes: core.length,
  };
  await records.putAll([{ key: K.core, value: core }, { key: K.manifest, value: JSON.stringify(manifest) }]);
  const { store } = makeStore(records);
  const res = await store.load();
  check("future-version save is rejected safely", res.state === null && res.diagnostics.some((d) => d.code === "save/future-version"));
  check("future-version source remains untouched", (await records.get([K.core]))[K.core] === core);
  check("future-version save cannot be overwritten", (await store.save(fresh())).some((d) => d.code === "save/write-blocked"));
}
{
  const records = createMemoryRecordStore();
  const core = serializeSave(fresh());
  await records.putAll([
    { key: K.core, value: core },
    { key: K.manifest, value: JSON.stringify({ saveId: SAVE_ID, storageFormatVersion: STORAGE_FORMAT_VERSION + 1, gameSchemaVersion: SAVE_VERSION, saveSeed: SEED, controlledClubId: "IDB City", createdAt: 1, updatedAt: 1, coreBytes: core.length, coreChecksum: checksum(core), chunkManifest: [], totalBytes: core.length }) },
  ]);
  const { store } = makeStore(records);
  check("future storage format is rejected separately", (await store.load()).diagnostics.some((d) => d.code === "save/future-storage-format"));
  check("future storage format cannot be overwritten", (await store.save(fresh())).some((d) => d.code === "save/write-blocked"));
}

console.log("\n[D4] Atomicity + integrity");
{
  const records = createMemoryRecordStore();
  const { store } = makeStore(records);
  const good = fresh();
  await store.save(good);
  records.options.failWrites = true;
  check("failed transaction reports write failure", (await store.save(advanceWeek(good))).some((d) => d.code === "save/write-failed"));
  records.options.failWrites = false;
  check("previous valid save remains readable", stateHash((await store.load()).state!) === stateHash(good));
}
{
  const records = createMemoryRecordStore();
  const { store } = makeStore(records);
  await store.save(fresh());
  await records.deleteKeys([K.core]);
  check("missing core record is detected", (await store.load()).diagnostics.some((d) => d.code === "save/core-missing"));
}
{
  const records = createMemoryRecordStore();
  const { store } = makeStore(records);
  await store.save(fresh());
  const core = (await records.get([K.core]))[K.core]!;
  await records.putAll([{ key: K.core, value: core.replace("IDB City", "IDB Citz") }]);
  check("checksum mismatch is detected", (await store.load()).diagnostics.some((d) => d.code === "save/checksum-mismatch"));
  check("mismatched save is preserved", (await store.save(fresh())).some((d) => d.code === "save/write-blocked"));
}

console.log("\n[D5] Metadata separation");
{
  const recordsA = createMemoryRecordStore();
  const a = createIdbSaveStore({ records: recordsA, migrate: migrateSave, currentVersion: SAVE_VERSION, now: () => 1 });
  const recordsB = createMemoryRecordStore();
  const b = createIdbSaveStore({ records: recordsB, migrate: migrateSave, currentVersion: SAVE_VERSION, now: () => 999_999 });
  const s = fresh();
  await a.save(s);
  await b.save(s);
  check("storage timestamps do not change simulation snapshot", (await recordsA.get([K.core]))[K.core] === (await recordsB.get([K.core]))[K.core]);
  const loaded = (await a.load()).state!;
  check("loaded state hash is unaffected by storage metadata", stateHash(loaded) === stateHash(s));
  const stateKeys = Object.keys(loaded as unknown as Record<string, unknown>);
  check("manifest data is not injected into GameState", ["saveId", "storageFormatVersion", "coreChecksum", "chunkManifest", "updatedAt", "createdAt", "totalBytes", "coreBytes"].every((k) => !stateKeys.includes(k)));
  const m = await a.readManifest();
  check("storage format version is separate from game schema", isManifest(m) && m!.storageFormatVersion === STORAGE_FORMAT_VERSION && m!.gameSchemaVersion === SAVE_VERSION && (STORAGE_FORMAT_VERSION as number) !== (SAVE_VERSION as number));
  check("manifest carries save identity", m!.saveId === SAVE_ID && m!.saveSeed === s.saveSeed && m!.controlledClubId === "IDB City");
}

console.log("\n[D6] Clear/reset across protected states");
{
  const legacy = localBackend();
  legacy.map.set(STORAGE_KEY, serializeSave(fresh()));
  const { store, records } = makeStore(createMemoryRecordStore(), legacy);
  await store.load();
  await store.clear();
  check("reset after migrated legacy save wipes both stores", (await records.keys()).length === 0 && legacy.map.size === 0);
}
{
  const legacy = localBackend();
  legacy.map.set(STORAGE_KEY, "{not json");
  const { store } = makeStore(createMemoryRecordStore(), legacy);
  await store.load();
  await store.clear();
  check("reset after failed migration clears legacy slot", legacy.map.size === 0);
  check("reset after failed migration allows new save", (await store.save(fresh())).length === 0);
}

console.log("\n[D7] Scale + benchmarks");
{
  const records = createMemoryRecordStore();
  const { store } = makeStore(records);
  let s: GameState = fresh();
  for (let season = 0; season < 5; season++) for (let w = 0; w < 46; w++) s = advanceWeek(s);
  const rawBytes = serializeSave(s).length;
  const expectedCompact = compactState(s).core;
  const t0 = performance.now();
  const diags = await store.save(s);
  const saveMs = performance.now() - t0;
  const manifest = await store.readManifest();
  const t1 = performance.now();
  const loaded = await store.load();
  const loadMs = performance.now() - t1;
  const compactBytes = manifest?.coreBytes ?? Number.POSITIVE_INFINITY;
  const chunkCount = manifest?.chunkManifest.length ?? 0;
  console.log(`  · season-5 raw: ${(rawBytes / 1024 / 1024).toFixed(2)} MB | hot core: ${(compactBytes / 1024 / 1024).toFixed(2)} MB | chunks ${chunkCount} | save ${saveMs.toFixed(1)} ms | load ${loadMs.toFixed(1)} ms`);
  check("season-5 large save stores and loads", diags.length === 0 && loaded.state !== null && rawBytes > 4_000_000);
  check("reload is deterministic compact hot core", loaded.state !== null && stateHash(loaded.state) === stateHash(expectedCompact));
  check("historical detail is split into chunks", isManifest(manifest) && chunkCount > 0);
  check("compaction materially shrinks persisted core", isManifest(manifest) && compactBytes < rawBytes);
  check("load stays within development baseline", loadMs < 2000, `${loadMs.toFixed(1)} ms`);
  check("save stays within development baseline", saveMs < 2000, `${saveMs.toFixed(1)} ms`);
  check("metrics account for core plus chunks", isManifest(manifest) && store.metrics.lastSaveMs !== null && store.metrics.recordCount === 2 + manifest!.chunkManifest.length);
}

console.log("\n[D8] Static audit: game-save persistence stays inside storage module");
{
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const offenders: string[] = [];
  const legacySaveKeys = [STORAGE_KEY, MIGRATED_KEY, "football-club-owner"];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = `${dir}/${e}`;
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(e)) continue;
      if (p.includes("/lib/game/storage/") || p.includes("/__checks__/")) continue;
      const src = readFileSync(p, "utf8");
      if (/\bindexedDB\b/.test(src)) offenders.push(`${p} (indexedDB)`);
      if (legacySaveKeys.some((key) => src.includes(key))) offenders.push(`${p} (game save key)`);
    }
  };
  walk("src");
  check("no game-save persistence details outside lib/game/storage", offenders.length === 0, offenders.join(", "));

  const engine = readFileSync("src/lib/game/engine.ts", "utf8");
  check("engine talks only to SaveStore factory", /createSaveStore\(/.test(engine) && !/createLocalSaveStore|createIdbRecordStore/.test(engine));
  const types = readFileSync("src/lib/game/types.ts", "utf8");
  check("no storage metadata leaked into GameState types", !/storageFormatVersion|coreChecksum|chunkManifest|updatedAt/.test(types));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
