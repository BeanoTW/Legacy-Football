/* Commercial unification: protect v23 save value and single-source payments. */
import { newGame, SAVE_VERSION } from "../engine";
import { runMigrations, type MigrationDeps } from "../migrations";
import { staffPoolFor, squadRating } from "../engine";
import { commercialWeeklyIncome, runCommercialWeek } from "../commercial";
import { sponsorWeeklyIncome } from "../finance";
import { absoluteWeek } from "../time";
import type { GameState, Sponsor } from "../types";

const deps: MigrationDeps = { staffPoolFor, squadRating };
const assert = (ok: unknown, detail: string) => {
  if (!ok) throw new Error(detail);
};
const migrate = (state: GameState) =>
  runMigrations(structuredClone(state) as unknown as Record<string, unknown>, SAVE_VERSION, deps).state;

console.log("\n[COMMERCIAL V24] Legacy agreement preservation");
const source = newGame("Migration FC", "M. Auditor", "COMMERCIAL|MIGRATION|24");
source.version = 23;
const legacy: Sponsor[] = [
  { name: "Old Shirt Partner", weekly: 1_200, weeksLeft: 14 },
  { name: "Old Ground Partner", weekly: 425, weeksLeft: 29 },
];
source.sponsors = legacy;
const existing = source.commercial.contracts.length;
const beforeCash = source.cash;
const migrated = migrate(source);
assert(migrated.version === 24, "save did not reach v24");
assert(migrated.sponsors.length === 0, "legacy sponsor array was not retired");
const contracts = migrated.commercial.contracts.slice(existing);
assert(contracts.length === legacy.length, "active legacy agreements were dropped or duplicated");
assert(commercialWeeklyIncome(migrated) === 1_625, "remaining sponsorship value was not preserved");
assert(sponsorWeeklyIncome(migrated) === 1_625, "finance reader diverges from Commercial");
assert(migrated.cash === beforeCash, "migration improperly booked income");
const now = absoluteWeek(source.season, source.week);
for (let i = 0; i < legacy.length; i++) {
  assert(contracts[i].endAbsoluteWeek === now + legacy[i].weeksLeft, "legacy duration changed");
  assert(contracts[i].signingBonus === 0, "migration fabricated signing income");
}
console.log("  ✓ both sponsors, remaining terms and cash preserved");

const again = migrate(migrated);
assert(JSON.stringify(again) === JSON.stringify(migrated), "re-migration changes canonical state");
console.log("  ✓ v24 re-migration is byte-identical");

runCommercialWeek(migrated);
const payments = migrated.financeLedger.filter(
  (e) => e.sourceSystem === "commercial" &&
    e.linkedEntityId && contracts.some((c) => c.id === e.linkedEntityId) &&
    e.direction === "income",
);
assert(payments.length === 2, "legacy contracts did not each post once");
assert(payments.reduce((sum, e) => sum + e.amount, 0) === 1_625, "posted sponsorship differs from contracts");
runCommercialWeek(migrated);
const afterReplay = migrated.financeLedger.filter((e) => payments.some((p) => p.id === e.id));
assert(afterReplay.length === 2, "weekly commercial payout duplicated on replay");
console.log("  ✓ weekly payouts are deduplicated");

const clean = newGame("New FC", "N. Auditor", "COMMERCIAL|NEW|24");
assert(clean.version === 24 && clean.sponsors.length === 0, "new game still seeds legacy sponsorship");
console.log("  ✓ new careers use the canonical sponsorship state");
