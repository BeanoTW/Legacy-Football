import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { ensureClubIdentityStateInPlace } from "../clubIdentity";
import { migrateClubReferencesToIdsInPlace } from "../clubReferenceMigration";
import {
  canonicalClubReference,
  clubDisplayName,
  isUserClubReference,
  sameClubReference,
  userClubReference,
} from "../clubReference";

const legacy = newGame("Gateway United", "Auditor", "CLUB_REFERENCE_GATEWAY");
ensureClubIdentityStateInPlace(legacy);
const userName = legacy.clubName;
const userId = legacy.clubIdentity?.userClubId;
if (!userId) throw new Error("user club id missing");
const aiName = legacy.leagues.flatMap((league) => league.clubIds).find((club) => club !== userName);
if (!aiName) throw new Error("AI club missing");
const aiId = canonicalClubReference(legacy, aiName);

assert.equal(userClubReference(legacy), userId);
assert.equal(isUserClubReference(legacy, userName), true);
assert.equal(isUserClubReference(legacy, userId), true);
assert.equal(isUserClubReference(legacy, aiName), false);
assert.equal(sameClubReference(legacy, userName, userId), true);
assert.equal(sameClubReference(legacy, aiName, aiId), true);
assert.equal(clubDisplayName(legacy, aiId), aiName);

const migrated = structuredClone(legacy);
migrateClubReferencesToIdsInPlace(migrated);
assert.equal(userClubReference(migrated), userId);
assert.equal(isUserClubReference(migrated, userId), true);
assert.equal(sameClubReference(migrated, aiName, aiId), true);
assert.equal(clubDisplayName(migrated, aiId), aiName);

console.log("\nclub-reference-gateway: passed");
