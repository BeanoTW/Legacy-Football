import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { ensureFringeWorldState } from "../fringe";
import { ensurePersistentFringePlayers, FRINGE_SQUAD_SIZE } from "../fringePlayers";

const state = newGame("Persistent Fringe FC", "Identity Auditor", "FRINGE_PLAYER_IDENTITY");
ensureFringeWorldState(state);
const first = ensurePersistentFringePlayers(state);
const ids = Object.keys(first).sort();
assert.ok(ids.length > 0, "fringe world should seed compact player identities");

const sampleClub = Object.values(state.fringeWorld ?? {})[0];
if (!sampleClub) throw new Error("fringe club missing");
const clubPlayers = Object.values(first).filter((player) => player.currentClubId === sampleClub.clubId);
assert.equal(clubPlayers.length, FRINGE_SQUAD_SIZE);
for (const player of clubPlayers) {
  assert.ok(player.playerId.length > 3);
  assert.ok(player.dateOfBirth.year > 1900);
  assert.ok(player.currentAbility > 0);
  assert.ok(player.potentialAbility >= player.currentAbility);
  assert.equal(player.currentClubId, sampleClub.clubId);
  assert.ok(player.contractExpirySeason > state.season);
}

const snapshot = JSON.stringify(first);
ensurePersistentFringePlayers(state);
assert.equal(JSON.stringify(state.fringePlayers), snapshot, "repeated seeding must not regenerate identities");

state.season += 1;
ensurePersistentFringePlayers(state);
for (const player of clubPlayers) {
  assert.ok(state.fringePlayers?.[player.playerId], "season advance must preserve the same compact identity");
  assert.deepEqual(state.fringePlayers?.[player.playerId]?.dateOfBirth, player.dateOfBirth);
}

console.log("\nfringe-player-identity: passed");
