import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { ensureFringeWorldState } from "../fringe";
import {
  advancePersistentFringePlayersToSeason,
  ensurePersistentFringePlayers,
  fringePlayersForClub,
} from "../fringePlayers";
import {
  compactDetailedPlayerForFringe,
  hydrateCompactFringePlayer,
} from "../fringePlayerFidelity";
import { projectFringePlayer } from "../fringePlayerProjection";

const state = newGame("Fidelity Audit FC", "Auditor", "FRINGE_FIDELITY_AUDIT");
const world = ensureFringeWorldState(state);
ensurePersistentFringePlayers(state);
const club = Object.values(world).sort((a, b) => a.clubId.localeCompare(b.clubId))[0];
if (!club) throw new Error("fringe club missing");
const compact = fringePlayersForClub(state, club.clubId)[0];
if (!compact) throw new Error("compact fringe player missing");

const hydrated = hydrateCompactFringePlayer(state, compact, "PC-FIDELITY");
assert.equal(hydrated.id, compact.playerId);
assert.deepEqual(hydrated.dateOfBirth, compact.dateOfBirth);
assert.equal(hydrated.primaryPosition, compact.primaryPosition);
assert.equal(hydrated.currentAbility, compact.currentAbility);
assert.equal(hydrated.potentialAbility, compact.potentialAbility);
assert.equal(hydrated.currentClubId, compact.currentClubId);
assert.equal(hydrated.contractId, "PC-FIDELITY");

const projected = projectFringePlayer(state, club, compact.primaryPosition);
if (projected.id === compact.playerId) {
  assert.equal(projected.identity.firstName, hydrated.firstName);
  assert.equal(projected.identity.lastName, hydrated.lastName);
  assert.equal(projected.identity.nationality, hydrated.nationality);
}

const roundTrip = compactDetailedPlayerForFringe(
  state,
  hydrated,
  compact.contractExpirySeason,
);
assert.equal(roundTrip.playerId, compact.playerId);
assert.deepEqual(roundTrip.dateOfBirth, compact.dateOfBirth);
assert.equal(roundTrip.primaryPosition, compact.primaryPosition);
assert.equal(roundTrip.currentAbility, compact.currentAbility);
assert.equal(roundTrip.potentialAbility, compact.potentialAbility);
assert.equal(roundTrip.currentClubId, compact.currentClubId);
assert.equal(roundTrip.contractExpirySeason, compact.contractExpirySeason);

const evolved = structuredClone(state);
evolved.season += 5;
advancePersistentFringePlayersToSeason(evolved);
const survivor = evolved.fringePlayers?.[compact.playerId];
if (survivor && !survivor.retired) {
  const detailedAfterDevelopment = hydrateCompactFringePlayer(evolved, survivor);
  assert.equal(detailedAfterDevelopment.id, compact.playerId);
  assert.equal(detailedAfterDevelopment.currentAbility, survivor.currentAbility);
  assert.deepEqual(detailedAfterDevelopment.dateOfBirth, compact.dateOfBirth);
}

assert.equal(
  state.football?.players.some((player) => player.id === compact.playerId),
  false,
  "pure fidelity helpers must not hydrate the canonical detailed store by themselves",
);

console.log("\nfringe-player-fidelity: passed");
