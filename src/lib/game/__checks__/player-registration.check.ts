import { strict as assert } from "node:assert";
import { migrateSave, newGame, SAVE_VERSION } from "../engine";
import {
  playerIsOwnedBy,
  playerIsRegisteredTo,
  playerOwnerClubId,
  playerRegisteredClubId,
  setPlayerClubIdentityInPlace,
} from "../playerRegistration";
import { freeAgents, squadOf, userSquad } from "../recruitment";

const state = newGame("Registration Identity FC", "Auditor", "PLAYER_REGISTRATION_AUDIT");
assert.equal(SAVE_VERSION, 19);

for (const player of state.football.players) {
  assert.notEqual(player.ownerClubId, undefined, `${player.id} missing explicit ownerClubId`);
  assert.notEqual(
    player.registeredClubId,
    undefined,
    `${player.id} missing explicit registeredClubId`,
  );
  assert.equal(
    player.currentClubId,
    player.registeredClubId,
    "legacy currentClubId must project playing registration",
  );
  assert.equal(
    player.ownerClubId,
    player.registeredClubId,
    "fresh pre-loan careers should begin with ownership and registration aligned",
  );
}

for (const freeAgent of freeAgents(state)) {
  assert.equal(playerOwnerClubId(freeAgent), null);
  assert.equal(playerRegisteredClubId(freeAgent), null);
}

const userPlayer = userSquad(state)[0];
assert.ok(userPlayer, "registration fixture needs a user player");
const userClub = userPlayer.ownerClubId!;
const rival = state.leagues
  .flatMap((league) => league.clubIds)
  .find((clubId) => clubId !== userClub);
assert.ok(rival, "registration fixture needs a rival club");

// This synthetic divergence is the contract loans will eventually use:
// parent club ownership stays put while playing registration moves.
setPlayerClubIdentityInPlace(userPlayer, userClub, rival);
assert.equal(playerOwnerClubId(userPlayer), userClub);
assert.equal(playerRegisteredClubId(userPlayer), rival);
assert.equal(userPlayer.currentClubId, rival, "compatibility projection should follow registration");
assert.ok(playerIsOwnedBy(userPlayer, userClub));
assert.ok(playerIsRegisteredTo(userPlayer, rival));
assert.ok(!squadOf(state, userClub).some((player) => player.id === userPlayer.id));
assert.ok(squadOf(state, rival).some((player) => player.id === userPlayer.id));

// v18 saves have only currentClubId. v19 must seed both explicit identities
// without moving anyone or changing their attachment state.
const legacy = newGame("Registration Migration FC", "Auditor", "PLAYER_REGISTRATION_MIGRATION");
legacy.version = 18;
for (const player of legacy.football.players) {
  delete player.ownerClubId;
  delete player.registeredClubId;
}
const before = legacy.football.players.map((player) => ({
  id: player.id,
  currentClubId: player.currentClubId,
  contractId: player.contractId,
}));
const migrated = migrateSave(JSON.parse(JSON.stringify(legacy)) as Record<string, unknown>);
assert.equal(migrated.version, 19);
assert.deepEqual(
  migrated.football.players.map((player) => ({
    id: player.id,
    currentClubId: player.currentClubId,
    contractId: player.contractId,
  })),
  before,
  "v19 migration must not move players or change contract attachment",
);
for (const player of migrated.football.players) {
  assert.equal(player.ownerClubId, player.currentClubId);
  assert.equal(player.registeredClubId, player.currentClubId);
}

console.log("player-registration: passed");
