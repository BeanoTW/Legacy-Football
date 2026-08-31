import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import {
  clubIdForState,
  isOpaqueClubId,
  type ClubIdentityState,
} from "../clubIdentity";
import { CLUB_IDENTITY_MIGRATIONS } from "../migrations/v15-v16";
import type { AnySave, MigrationCtx } from "../migrations/types";

const current = newGame("Migration United", "Auditor", "CLUB_ID_MIGRATION");
const legacy = structuredClone(current);
delete legacy.clubIdentity;

const beforeLeagueMembers = legacy.leagues.map((league) => [...league.clubIds]);
const beforePlayerClub = legacy.football?.players.find((player) => player.currentClubId)?.currentClubId ?? null;
const step = CLUB_IDENTITY_MIGRATIONS[0];
assert.equal(step.from, 15);
assert.equal(step.to, 16);

const ctx: MigrationCtx = {
  deps: {
    staffPoolFor: () => [],
    squadRating: () => 0,
  },
  warn() {},
};
step.up(legacy as unknown as AnySave, ctx);

const identity = legacy.clubIdentity as ClubIdentityState | undefined;
assert.ok(identity, "staged v15->v16 step must seed a persistent club identity registry");
assert.ok(isOpaqueClubId(identity.userClubId));
assert.equal(identity.clubsById[identity.userClubId]?.displayName, legacy.clubName);
assert.deepEqual(
  legacy.leagues.map((league) => league.clubIds),
  beforeLeagueMembers,
  "identity-registry step must not rewrite references before the reference migration",
);
assert.equal(
  legacy.football?.players.find((player) => player.currentClubId)?.currentClubId ?? null,
  beforePlayerClub,
);

for (const league of legacy.leagues) {
  for (const club of league.clubIds) {
    const id = clubIdForState(legacy, club);
    assert.ok(isOpaqueClubId(id));
    assert.equal(identity.clubsById[id]?.displayName, club);
  }
}

const once = structuredClone(identity);
step.up(legacy as unknown as AnySave, ctx);
assert.deepEqual(legacy.clubIdentity, once, "registry migration must be idempotent");

console.log("\nclub-identity-migration: passed");
