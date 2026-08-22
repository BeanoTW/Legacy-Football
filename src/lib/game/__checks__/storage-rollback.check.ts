/* Storage rollback regression check.
   Run with: bun src/lib/game/__checks__/storage-rollback.check.ts

   Protects against a subtle Phase 1b failure mode: when a transaction that
   updates an already-existing history chunk fails, the in-memory manifest must
   retain the previous committed metadata. Otherwise the next successful save
   can publish a manifest that silently forgets valid history chunks.
*/
import { advanceWeek, migrateSave, newGame, SAVE_VERSION } from "../engine";
import { compactState } from "../storage/compaction";
import { createIdbSaveStore } from "../storage/idbStore";
import { createMemoryRecordStore } from "../storage/memoryRecords";

const records = createMemoryRecordStore();
const store = createIdbSaveStore({
  records,
  migrate: migrateSave,
  currentVersion: SAVE_VERSION,
  now: () => 1_700_000_000_000,
});

let state = newGame("Rollback City", "Ada Atomic", "ROLLBACK|FIXED");
// Cross a season boundary so compaction creates at least one history chunk.
for (let i = 0; i < 47; i++) state = advanceWeek(state);

const initialDiagnostics = await store.save(state);
if (initialDiagnostics.length) {
  throw new Error(`initial chunked save failed: ${JSON.stringify(initialDiagnostics)}`);
}

const beforeFailure = await store.readManifest();
if (!beforeFailure || beforeFailure.chunkManifest.length === 0) {
  throw new Error("fixture did not create history chunks");
}
const expected = JSON.stringify(beforeFailure.chunkManifest);

// Re-saving the un-compacted in-memory state targets the same chunk keys.
records.options.failWrites = true;
const failedDiagnostics = await store.save(advanceWeek(state));
records.options.failWrites = false;
if (!failedDiagnostics.some((d) => d.code === "save/write-failed")) {
  throw new Error(`expected simulated write failure: ${JSON.stringify(failedDiagnostics)}`);
}

// Save an already-compacted core without calling load(). This forces the next
// manifest to use the store's in-memory chunk metadata. It must still include
// the exact entries from the last successful transaction.
const compactCore = compactState(state).core;
const recoveryDiagnostics = await store.save(compactCore);
if (recoveryDiagnostics.length) {
  throw new Error(`recovery save failed: ${JSON.stringify(recoveryDiagnostics)}`);
}

const afterRecovery = await store.readManifest();
if (!afterRecovery) throw new Error("manifest missing after recovery save");
const actual = JSON.stringify(afterRecovery.chunkManifest);
if (actual !== expected) {
  throw new Error(`failed transaction changed committed chunk manifest\nexpected ${expected}\nactual   ${actual}`);
}

console.log("✓ failed chunk overwrite restores the previous committed manifest exactly");
