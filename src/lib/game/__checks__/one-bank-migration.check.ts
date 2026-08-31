import { migrateSave, newGame, SAVE_VERSION } from "../engine";

type RawSave = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const KEY = "migration:v14:transfer-budget-release";
const rawClone = (value: unknown): RawSave => structuredClone(value) as unknown as RawSave;

console.log("\n[OBM1] v13 ring-fenced transfer funds are released exactly once");
{
  const current = newGame("Migration City", "Ada Migration", "ONE|BANK|V13");
  const legacy = rawClone(current);
  legacy.version = 13;
  legacy.transferBudget = 125_000;
  const beforeCash = legacy.cash as number;
  const beforeHistory = JSON.stringify({
    results: legacy.results,
    matchRecords: legacy.matchRecords,
    seasonHistory: legacy.seasonHistory,
    clubSnapshots: legacy.clubSnapshots,
    clubRecords: legacy.clubRecords,
  });

  const migrated = migrateSave(legacy);
  assert(migrated.version === SAVE_VERSION, "v13 save reaches the current schema");
  assert(migrated.transferBudget === 0, "legacy transfer pot is retired");
  assert(
    migrated.cash === beforeCash + 125_000,
    "ring-fenced funds return to the club bank balance once",
  );
  const releases = migrated.financeLedger.filter((entry) => entry.dedupeKey === KEY);
  assert(
    releases.length === 1,
    "migration writes exactly one canonical budget-release ledger entry",
  );
  assert(
    releases[0].amount === 125_000 && releases[0].direction === "income",
    "release entry records the exact retired pot",
  );
  assert(
    JSON.stringify({
      results: migrated.results,
      matchRecords: migrated.matchRecords,
      seasonHistory: migrated.seasonHistory,
      clubSnapshots: migrated.clubSnapshots,
      clubRecords: migrated.clubRecords,
    }) === beforeHistory,
    "cash migration does not rewrite sporting history",
  );

  const remigrated = migrateSave(rawClone(migrated));
  assert(
    remigrated.cash === migrated.cash,
    "re-migrating a current save cannot release the funds again",
  );
  assert(remigrated.transferBudget === 0, "re-migration keeps the legacy pot retired");
  assert(
    remigrated.financeLedger.filter((entry) => entry.dedupeKey === KEY).length === 1,
    "re-migration cannot duplicate the release ledger entry",
  );
}

console.log("\n[OBM2] v13 saves with no transfer pot fabricate no release");
{
  const current = newGame("Migration City", "Ada Migration", "ONE|BANK|ZERO");
  const legacy = rawClone(current);
  legacy.version = 13;
  legacy.transferBudget = 0;
  const beforeCash = legacy.cash as number;
  const migrated = migrateSave(legacy);
  assert(migrated.cash === beforeCash, "zero-pot migration leaves cash unchanged");
  assert(migrated.transferBudget === 0, "zero-pot migration keeps the legacy field retired");
  assert(
    !migrated.financeLedger.some((entry) => entry.dedupeKey === KEY),
    "zero-pot migration writes no fake budget-release entry",
  );
}

console.log("\n[OBM3] v14+ saves never execute the v13 cash-release step");
{
  const current = newGame("Migration City", "Ada Migration", "ONE|BANK|V14");
  const v14 = rawClone(current);
  v14.version = 14;
  v14.transferBudget = 0;
  const beforeCash = v14.cash as number;
  const beforeEntries = (v14.financeLedger as unknown[]).length;
  const migrated = migrateSave(v14);
  assert(migrated.version === SAVE_VERSION, "v14 save reaches the current schema");
  assert(migrated.cash === beforeCash, "v14 migration does not re-release transfer cash");
  assert(migrated.transferBudget === 0, "v14 migration preserves the retired transfer pot");
  assert(
    migrated.financeLedger.length === beforeEntries,
    "v14 migration adds no transfer-release ledger movement",
  );
}

console.log("one-bank-migration.check.ts: PASS");
