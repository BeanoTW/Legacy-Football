import { strict as assert } from "node:assert";
import { CLUBS } from "../clubs";
import {
  BUILTIN_CLUB_IDENTITIES,
  clubDisplayNameForId,
  clubIdForLegacyName,
  isOpaqueClubId,
  userClubId,
} from "../clubIdentity";

assert.equal(BUILTIN_CLUB_IDENTITIES.length, CLUBS.length);
assert.equal(new Set(BUILTIN_CLUB_IDENTITIES.map((club) => club.id)).size, CLUBS.length);
for (const club of BUILTIN_CLUB_IDENTITIES) {
  assert.ok(isOpaqueClubId(club.id), `club id must be opaque: ${club.id}`);
  assert.equal(clubDisplayNameForId(club.id), club.displayName);
  assert.equal(clubIdForLegacyName(club.displayName), club.id);
  assert.ok(!club.id.toLowerCase().includes(club.displayName.toLowerCase().replace(/\s+/g, "")));
}

const userName = "Renameable United";
const userId = clubIdForLegacyName(userName, userName);
assert.equal(userId, userClubId());
assert.equal(clubIdForLegacyName("A Totally Different Name", "A Totally Different Name"), userId);
assert.equal(clubDisplayNameForId(userId, "New Display Name"), "New Display Name");

const customA = clubIdForLegacyName("Historic Custom Club");
const customB = clubIdForLegacyName("Historic Custom Club");
assert.equal(customA, customB, "legacy custom migration must be deterministic");
assert.ok(isOpaqueClubId(customA));

console.log("\nclub-identity: passed");
