import { strict as assert } from "node:assert";
import { CLUBS } from "../clubs";
import { newGame } from "../newGame";
import {
  BUILTIN_CLUB_IDENTITIES,
  clubDisplayNameForId,
  clubIdForLegacyName,
  clubIdForState,
  ensureClubIdentityStateInPlace,
  isOpaqueClubId,
  registeredClubDisplayName,
  renameRegisteredClubInPlace,
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

const state = newGame(userName, "Identity Auditor", "CLUB_IDENTITY_AUDIT");
const registry = ensureClubIdentityStateInPlace(state);
assert.equal(registry.userClubId, userId);
assert.equal(registry.clubsById[userId]?.displayName, userName);
const builtInName = state.leagues.flatMap((league) => league.clubIds).find((club) => club !== userName);
if (!builtInName) throw new Error("built-in club missing");
const builtInId = clubIdForState(state, builtInName);
assert.equal(registry.clubsById[builtInId]?.displayName, builtInName);

const beforeRenameId = registry.userClubId;
assert.equal(renameRegisteredClubInPlace(state, beforeRenameId, "Renamed United"), true);
assert.equal(state.clubName, "Renamed United");
assert.equal(state.clubIdentity?.userClubId, beforeRenameId, "display rename must not change identity");
assert.equal(registeredClubDisplayName(state, beforeRenameId), "Renamed United");
assert.equal(ensureClubIdentityStateInPlace(state), registry, "registry seeding must be idempotent");

console.log("\nclub-identity: passed");
