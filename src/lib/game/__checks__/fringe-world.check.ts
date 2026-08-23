import {
  buildFringeWorldState,
  ensureFringeWorldState,
  fringeWorldSignature,
  reconcileFringeWorldState,
} from "../fringe";
import { buildWorldSimulationPlan } from "../world";
import { newGame } from "../newGame";
import { FREE_AGENT_POOL, SQUAD_SIZE, reconcileRecruitmentFidelity } from "../recruitment";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const state = newGame("Player FC", "World Auditor", "fringe-check-seed");
const leagues = state.leagues;

const plan = buildWorldSimulationPlan(state);
const worldA = buildFringeWorldState(state);
const worldB = buildFringeWorldState({ ...state, leagues: [...leagues].reverse() });

assert(
  plan.focusClubIds.length === 40,
  "expanded opening world should retain a 40-club Focus bubble",
);
assert(
  plan.fringeClubIds.length === 40,
  "expanded opening world should expose 40 lightweight Fringe clubs",
);
assert(
  Object.keys(worldA).length === plan.fringeClubIds.length,
  "only Fringe clubs belong in lightweight state",
);
assert(
  fringeWorldSignature(worldA) === fringeWorldSignature(worldB),
  "lightweight world must be deterministic regardless of league array order",
);
assert(!worldA["Player FC"], "player club must never be represented as Fringe");

const fringeClub = plan.fringeClubIds[0];
const persisted = worldA[fringeClub];
const reconciled = reconcileFringeWorldState(state, worldA);
assert(
  reconciled[fringeClub]?.strength === persisted.strength,
  "reconciliation must preserve persistent Fringe identity",
);

const persistedState = JSON.parse(JSON.stringify(state)) as typeof state;
assert(
  fringeWorldSignature(ensureFringeWorldState(persistedState)) ===
    fringeWorldSignature(state.fringeWorld ?? {}),
  "Fringe state must survive a save/load round trip",
);
const legacyState = structuredClone(state);
delete legacyState.fringeWorld;
assert(
  fringeWorldSignature(ensureFringeWorldState(legacyState)) === fringeWorldSignature(worldA),
  "older version-12 saves must hydrate missing Fringe state deterministically",
);

// Move the player down one tier: the old distant tier can enter Focus and its
// lightweight entries must be removed rather than duplicated across fidelity layers.
const movedState = { ...state, playerLeagueId: leagues[1].id };
const movedPlan = buildWorldSimulationPlan(movedState);
const movedWorld = reconcileFringeWorldState(movedState, worldA);
for (const id of movedPlan.focusClubIds) {
  assert(!movedWorld[id], `Focus club ${id} must not retain a Fringe snapshot`);
}

assert(
  state.football.players.length === plan.focusClubIds.length * SQUAD_SIZE + FREE_AGENT_POOL,
  "opening recruitment must create detailed players only for Focus clubs",
);
assert(
  state.football.players.every(
    (player) => player.currentClubId === null || plan.focusClubIds.includes(player.currentClubId),
  ),
  "Fringe clubs must not receive detailed opening squads",
);

const recruitmentState = structuredClone(state);
recruitmentState.playerLeagueId = leagues[1].id;
reconcileRecruitmentFidelity(recruitmentState);
const expandedPlan = buildWorldSimulationPlan(recruitmentState);
for (const id of expandedPlan.focusClubIds) {
  assert(
    recruitmentState.football.players.filter((player) => player.currentClubId === id).length ===
      SQUAD_SIZE,
    `new Focus club ${id} must be hydrated exactly once`,
  );
}
const signatureAfterHydration = recruitmentState.football.players
  .map((player) => player.id)
  .sort()
  .join("|");
reconcileRecruitmentFidelity(recruitmentState);
assert(
  recruitmentState.football.players
    .map((player) => player.id)
    .sort()
    .join("|") === signatureAfterHydration,
  "repeated reconciliation must not duplicate hydrated players",
);

console.log("fringe-world.check.ts: PASS");
