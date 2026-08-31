import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { ensureClubIdentityStateInPlace } from "../clubIdentity";
import { migrateClubReferencesToIdsInPlace } from "../clubReferenceMigration";
import { buildWorldSimulationPlan } from "../world";

const legacy = newGame("World Identity FC", "Auditor", "WORLD_CLUB_IDENTITY");
ensureClubIdentityStateInPlace(legacy);
const before = buildWorldSimulationPlan(legacy);
const migrated = structuredClone(legacy);
migrateClubReferencesToIdsInPlace(migrated);
const after = buildWorldSimulationPlan(migrated);

assert.equal(after.focusClubIds.length, before.focusClubIds.length);
assert.equal(after.fringeClubIds.length, before.fringeClubIds.length);
assert.deepEqual(after.focusLeagueIds, before.focusLeagueIds);

const userId = migrated.clubIdentity?.userClubId;
if (!userId) throw new Error("user club id missing");
const userProfile = after.clubs.find((club) => club.clubId === userId);
assert.ok(userProfile, "world planner must recognise the migrated user club id");
assert.ok(userProfile.reasons.includes("playerClub"));
assert.ok(userProfile.reasons.includes("sameLeague"));

const reasonCounts = (plan: ReturnType<typeof buildWorldSimulationPlan>) =>
  plan.clubs
    .map((club) => [...club.reasons].sort().join(","))
    .sort();
assert.deepEqual(
  reasonCounts(after),
  reasonCounts(before),
  "identity migration must not change world fidelity reasons",
);

console.log("\nworld-club-identity: passed");
