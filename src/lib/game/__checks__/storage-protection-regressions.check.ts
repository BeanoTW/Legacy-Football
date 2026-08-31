import { migrateSave, newGame, SAVE_VERSION } from "../engine";
import { createIdbSaveStore } from "../storage/idbStore";
import { createMemoryRecordStore } from "../storage/memoryRecords";
import {
  STORAGE_FORMAT_VERSION,
  checksum,
  coreKey,
  manifestKey,
  type SaveManifest,
} from "../storage/manifest";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const SAVE_ID = "primary";
const SEED = "STORAGE|PROTECTION|REGRESSION";
const K = { core: coreKey(SAVE_ID), manifest: manifestKey(SAVE_ID) };
const fresh = () => newGame("Storage City", "Ada Storage", SEED);

function makeStore() {
  const records = createMemoryRecordStore();
  const store = createIdbSaveStore({
    records,
    migrate: migrateSave,
    currentVersion: SAVE_VERSION,
    now: () => 1_700_000_000_000,
  });
  return { records, store };
}

console.log("\n[SPR1] Invalid manifest is preserved and blocks overwrite");
{
  const { records, store } = makeStore();
  await store.save(fresh());
  await records.putAll([
    { key: K.manifest, value: JSON.stringify({ saveId: SAVE_ID, broken: true }) },
  ]);
  const loaded = await store.load();
  assert(loaded.state === null, "invalid manifest must not expose a state");
  assert(
    loaded.diagnostics.some((d) => d.code === "save/manifest-invalid"),
    "invalid manifest must be diagnosed explicitly",
  );
  assert(
    (await store.save(fresh())).some((d) => d.code === "save/write-blocked"),
    "invalid manifest must block overwrite until reset",
  );
}

console.log("\n[SPR2] Reset clears future-version protection and re-enables saving");
{
  const { records, store } = makeStore();
  const raw = fresh() as unknown as Record<string, unknown>;
  raw.version = SAVE_VERSION + 5;
  const core = JSON.stringify(raw);
  const manifest: SaveManifest = {
    saveId: SAVE_ID,
    storageFormatVersion: STORAGE_FORMAT_VERSION,
    gameSchemaVersion: SAVE_VERSION + 5,
    saveSeed: SEED,
    controlledClubId: "Storage City",
    createdAt: 1,
    updatedAt: 1,
    coreBytes: core.length,
    coreChecksum: checksum(core),
    chunkManifest: [],
    totalBytes: core.length,
  };
  await records.putAll([
    { key: K.core, value: core },
    { key: K.manifest, value: JSON.stringify(manifest) },
  ]);

  const loaded = await store.load();
  assert(
    loaded.diagnostics.some((d) => d.code === "save/future-version"),
    "future-version save must be protected",
  );
  assert(
    (await store.save(fresh())).some((d) => d.code === "save/write-blocked"),
    "future-version protection must block overwrite before reset",
  );

  await store.clear();
  assert((await records.keys()).length === 0, "reset must remove the protected save slot");
  assert((await store.save(fresh())).length === 0, "reset must re-enable normal saving");
}

console.log("storage-protection-regressions.check.ts: PASS");
