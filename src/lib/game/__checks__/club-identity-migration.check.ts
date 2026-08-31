import { strict as assert } from "node:assert";
import { migrateSave, newGame, SAVE_VERSION } from "../engine";
import { clubIdForState, isOpaqueClubId } from "../clubIdentity";

const current = newGame("Migration United", "Auditor", "CLUB_ID_MIGRATION");
const legacy = structuredClone(current);
legacy.version = 15;
delete legacy.clubIdentity;

const beforeLeagueMembers = legacy.leagues.map((league) => [...league.clubIds]);
const beforePlayerClub = legacy.football?.players.find((player) => player.currentClubId)?.currentClubId ?? null;

const migrated = migrateSave(legacy as unknown as Record<string, unknown>);
assert.equal(migrated.version, SAVE_VERSION);
assert.equal(SAVE_VERSION, 16);
assert.ok(migrated.clubIdentity, "v15 save must gain a persistent club identity registry");
assert.ok(isOpaqueClubId(migrated.clubIdentity.userClubId));
assert.equal(migrated.clubIdentity.clubsById[migrated.clubIdentity.userClubId]?.displayName, migrated.clubName);
assert.deepEqual(
  migrated.leagues.map((league) => league.clubIds),
  beforeLeagueMembers,
  "identity-registry migration must not silently rewrite references before the reference pass",
);
assert.equal(
  migrated.football?.players.find((player) => player.currentClubId)?.currentClubId ?? null,
  beforePlayerClub,
);

for (const league of migrated.leagues) {
  for (const club of league.clubIds) {
    const id = clubIdForState(migrated, club);
    assert.ok(isOpaqueClubId(id));
    assert.equal(migrated.clubIdentity.clubsById[id]?.displayName, club);
  }
}

console.log("\nclub-identity-migration: passed");
