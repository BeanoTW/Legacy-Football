import { buildFringeWorldState, fringeWorldSignature, reconcileFringeWorldState } from "../fringe";
import { buildWorldSimulationPlan } from "../world";
import { makeExpandedLeagues } from "../worldPyramid";
import { initClubReputations } from "../pyramid";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const leagues = makeExpandedLeagues("Player FC");
const state = {
  saveSeed: "fringe-check-seed",
  season: 1,
  clubName: "Player FC",
  playerLeagueId: leagues[0].id,
  leagues,
  clubReputations: initClubReputations(leagues, "fringe-check-seed"),
} as any;

const plan = buildWorldSimulationPlan(state);
const worldA = buildFringeWorldState(state);
const worldB = buildFringeWorldState({ ...state, leagues: [...leagues].reverse() });

assert(plan.focusClubIds.length === 40, "expanded opening world should retain a 40-club Focus bubble");
assert(plan.fringeClubIds.length === 40, "expanded opening world should expose 40 lightweight Fringe clubs");
assert(Object.keys(worldA).length === plan.fringeClubIds.length, "only Fringe clubs belong in lightweight state");
assert(fringeWorldSignature(worldA) === fringeWorldSignature(worldB), "lightweight world must be deterministic regardless of league array order");
assert(!worldA["Player FC"], "player club must never be represented as Fringe");

const fringeClub = plan.fringeClubIds[0];
const persisted = worldA[fringeClub];
const reconciled = reconcileFringeWorldState(state, worldA);
assert(reconciled[fringeClub]?.strength === persisted.strength, "reconciliation must preserve persistent Fringe identity");

// Move the player down one tier: the old distant tier can enter Focus and its
// lightweight entries must be removed rather than duplicated across fidelity layers.
const movedState = { ...state, playerLeagueId: leagues[1].id };
const movedPlan = buildWorldSimulationPlan(movedState);
const movedWorld = reconcileFringeWorldState(movedState, worldA);
for (const id of movedPlan.focusClubIds) {
  assert(!movedWorld[id], `Focus club ${id} must not retain a Fringe snapshot`);
}

console.log("fringe-world.check.ts: PASS");
