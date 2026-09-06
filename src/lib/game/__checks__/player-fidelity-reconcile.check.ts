import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { ensurePersistentFringePlayers, fringePlayersForClub } from "../fringePlayers";
import { clubFootballStrength } from "../footballStrength";
import {
  compactDepartingFocusPlayersInPlace,
  repairFreshFocusHydrationInPlace,
} from "../playerFidelityReconcile";
import { reconcileRecruitmentFidelity } from "../recruitment";
import { buildWorldSimulationPlan } from "../world";

const state = newGame("Fidelity Boundary FC", "Boundary Auditor", "FIDELITY_BOUNDARY_AUDIT");
ensurePersistentFringePlayers(state);
const openingPlan = buildWorldSimulationPlan(state);
const clubId = openingPlan.fringeClubIds[0];
if (!clubId) throw new Error("fringe club missing");

const originalCompact = fringePlayersForClub(state, clubId);
assert.equal(originalCompact.length, 20);
const originalIds = originalCompact.map((player) => player.playerId).sort();
const compactStrength = clubFootballStrength(state, clubId);

// Move the club into Focus. The legacy reconciler still creates temporary
// detailed placeholders; the persistence seam must replace them with the same
// compact people rather than accepting the rerolled identities.
state.trackedClubIds = [...(state.trackedClubIds ?? []), clubId];
reconcileRecruitmentFidelity(state);
repairFreshFocusHydrationInPlace(state);
const focused = state.football?.players.filter((player) => player.currentClubId === clubId) ?? [];
assert.equal(focused.length, 20);
assert.deepEqual(
  focused.map((player) => player.id).sort(),
  originalIds,
  "Fringe→Focus must hydrate the same persistent player ids",
);
for (const player of focused) {
  const compact = state.fringePlayers?.[player.id];
  assert.ok(compact);
  assert.deepEqual(player.dateOfBirth, compact.dateOfBirth);
  assert.equal(player.primaryPosition, compact.primaryPosition);
  assert.equal(player.currentAbility, compact.currentAbility);
  assert.equal(player.potentialAbility, compact.potentialAbility);
}
assert.equal(
  clubFootballStrength(state, clubId),
  compactStrength,
  "crossing into Focus must not create a strength discontinuity",
);

// Mutate one real detailed player as if development/transfer-era football had
// changed him while the club was in Focus, then move the boundary back out.
const evolved = focused[0];
evolved.currentAbility = Math.min(evolved.potentialAbility, evolved.currentAbility + 2);
const evolvedAbility = evolved.currentAbility;
state.trackedClubIds = (state.trackedClubIds ?? []).filter((id) => id !== clubId);
compactDepartingFocusPlayersInPlace(state);
reconcileRecruitmentFidelity(state);
assert.equal(
  state.football?.players.some((player) => player.currentClubId === clubId),
  false,
  "Focus→Fringe must remove detailed duplicates",
);
assert.equal(
  state.fringePlayers?.[evolved.id]?.currentAbility,
  evolvedAbility,
  "Focus development must survive compaction",
);
assert.equal(fringePlayersForClub(state, clubId).length, 20, "compacted active squad must stay bounded");

// Re-enter Focus a second time: the evolved player must still be the same
// person and carry the compacted ability back into detailed simulation.
state.trackedClubIds = [...(state.trackedClubIds ?? []), clubId];
reconcileRecruitmentFidelity(state);
repairFreshFocusHydrationInPlace(state);
const returned = state.football?.players.find((player) => player.id === evolved.id);
assert.ok(returned, "returning Focus club must rehydrate the same player");
assert.equal(returned.currentAbility, evolvedAbility);
assert.deepEqual(returned.dateOfBirth, evolved.dateOfBirth);
assert.equal(returned.currentClubId, clubId);
assert.equal(
  new Set(state.football?.players.map((player) => player.id)).size,
  state.football?.players.length,
  "fidelity transitions must not duplicate detailed player ids",
);

console.log("\nplayer-fidelity-reconcile: passed");
