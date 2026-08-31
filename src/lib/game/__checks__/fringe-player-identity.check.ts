import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { ensureFringeWorldState } from "../fringe";
import {
  ensurePersistentFringePlayers,
  fringePlayersForClub,
  FRINGE_SQUAD_SIZE,
} from "../fringePlayers";

const state = newGame("Persistent Fringe FC", "Identity Auditor", "FRINGE_PLAYER_IDENTITY");
ensureFringeWorldState(state);
const first = ensurePersistentFringePlayers(state);
const ids = Object.keys(first).sort();
assert.ok(ids.length > 0, "fringe world should seed compact player identities");

const sampleClub = Object.values(state.fringeWorld ?? {})[0];
if (!sampleClub) throw new Error("fringe club missing");
const clubPlayers = fringePlayersForClub(state, sampleClub.clubId);
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

// Crossing into Focus removes the club snapshot, not its cheap persistent
// identities. Crossing back to Fringe must expose the same people again.
const beforeBoundaryIds = clubPlayers.map((player) => player.playerId).sort();
const originalFringeWorld = state.fringeWorld;
state.fringeWorld = Object.fromEntries(
  Object.entries(originalFringeWorld ?? {}).filter(([clubId]) => clubId !== sampleClub.clubId),
);
ensurePersistentFringePlayers(state);
for (const playerId of beforeBoundaryIds) {
  assert.ok(state.fringePlayers?.[playerId], "entering Focus must not delete compact identity history");
}
state.fringeWorld = originalFringeWorld;
const afterBoundaryIds = fringePlayersForClub(state, sampleClub.clubId)
  .map((player) => player.playerId)
  .sort();
assert.deepEqual(afterBoundaryIds, beforeBoundaryIds, "returning to Fringe must reuse the same identities");

console.log("\nfringe-player-identity: passed");
