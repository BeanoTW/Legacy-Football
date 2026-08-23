import {
  advanceFringeWorldToSeason,
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

const advancedState = structuredClone(state);
advancedState.season = 3;
const advancedWorld = advanceFringeWorldToSeason(advancedState);
assert(
  Object.values(advancedWorld).every((club) => club.lastSimulatedSeason === 3),
  "Fringe clubs must catch up across skipped seasons",
);
assert(
  fringeWorldSignature(advancedWorld) !== fringeWorldSignature(worldA),
  "Fringe identity must evolve rather than freeze between seasons",
);
const advancedSignature = fringeWorldSignature(advancedWorld);
assert(
  fringeWorldSignature(advanceFringeWorldToSeason(advancedState)) === advancedSignature,
  "Fringe seasonal advancement must be idempotent",
);
const replayedAdvance = structuredClone(state);
replayedAdvance.season = 3;
assert(
  fringeWorldSignature(advanceFringeWorldToSeason(replayedAdvance)) === advancedSignature,
  "Fringe seasonal advancement must be deterministic after reload",
);
assert(
  Object.values(advancedWorld).every(
    (club) =>
      club.strength >= 1 &&
      club.strength <= 100 &&
      club.form >= -5 &&
      club.form <= 5 &&
      club.financeBand >= 1 &&
      club.financeBand <= 5,
  ),
  "advanced Fringe values must remain inside their compact bounds",
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
const newlyFocusedClub = buildWorldSimulationPlan(recruitmentState).focusClubIds.find(
  (clubId) => worldA[clubId],
);
assert(newlyFocusedClub, "moving the Focus boundary must expose a previously Fringe club");
const compactStrength = 78;
recruitmentState.fringeWorld![newlyFocusedClub].strength = compactStrength;
reconcileRecruitmentFidelity(recruitmentState);
const expandedPlan = buildWorldSimulationPlan(recruitmentState);
for (const id of expandedPlan.focusClubIds) {
  assert(
    recruitmentState.football.players.filter((player) => player.currentClubId === id).length ===
      SQUAD_SIZE,
    `new Focus club ${id} must be hydrated exactly once`,
  );
}
const hydratedAverage = Math.round(
  recruitmentState.football.players
    .filter((player) => player.currentClubId === newlyFocusedClub)
    .reduce((total, player) => total + player.currentAbility, 0) / SQUAD_SIZE,
);
assert(
  Math.abs(hydratedAverage - compactStrength) <= 5,
  "new Focus squads must inherit their compact Fringe strength",
);
assert(
  !recruitmentState.fringeWorld?.[newlyFocusedClub],
  "hydrated Focus clubs must relinquish their compact snapshot",
);
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

const departingState = structuredClone(state);
const detailedClub = plan.focusClubIds.find(
  (clubId) => clubId !== state.clubName && leagues[0].clubIds.includes(clubId),
);
assert(detailedClub, "opening Focus must contain a non-player top-tier club");
const detailedSquad = departingState.football.players.filter(
  (player) => player.currentClubId === detailedClub,
);
const detailedAverage = Math.round(
  detailedSquad.reduce((total, player) => total + player.currentAbility, 0) / detailedSquad.length,
);
departingState.playerLeagueId = leagues[3].id;
reconcileRecruitmentFidelity(departingState);
assert(
  departingState.fringeWorld?.[detailedClub]?.strength === detailedAverage,
  "clubs leaving Focus must compact their detailed squad strength",
);
assert(
  !departingState.football.players.some((player) => player.currentClubId === detailedClub),
  "compacted Fringe clubs must not retain detailed players",
);

console.log("fringe-world.check.ts: PASS");
