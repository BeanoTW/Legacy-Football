import {
  advanceFringeWorldToSeason,
  buildFringeWorldState,
  ensureFringeWorldState,
  fringeFinanceMovement,
  fringeFormFromFinish,
  fringeWorldSignature,
  reconcileFringeWorldState,
} from "../fringe";
import { buildWorldSimulationPlan } from "../world";
import { newGame } from "../newGame";
import { clubStrengthAtLevel, simulateAiFixtureAtLevel } from "../league";
import { clubStrengthFor } from "../reputation";
import {
  FREE_AGENT_POOL,
  SQUAD_SIZE,
  fringeFinanceWageFactor,
  reconcileRecruitmentFidelity,
  setWorldClubTracked,
} from "../recruitment";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const state = newGame("Player FC", "World Auditor", "fringe-check-seed");
const leagues = state.leagues;

const plan = buildWorldSimulationPlan(state);
const worldA = buildFringeWorldState(state);
const worldB = buildFringeWorldState({ ...state, leagues: [...leagues].reverse() });

const expectedFocusClubCount = plan.focusLeagueIds.reduce(
  (total, leagueId) => total + (leagues.find((league) => league.id === leagueId)?.clubIds.length ?? 0),
  0,
);
const expectedFringeClubCount = leagues.reduce((total, league) => total + league.clubIds.length, 0) - expectedFocusClubCount;
assert(plan.focusClubIds.length === expectedFocusClubCount, "opening world should fully simulate the player division and every adjacent promotion/relegation lane");
assert(plan.fringeClubIds.length === expectedFringeClubCount, "opening world should keep every non-adjacent club lightweight");
assert(Object.keys(worldA).length === plan.fringeClubIds.length, "only Fringe clubs belong in lightweight state");
assert(fringeWorldSignature(worldA) === fringeWorldSignature(worldB), "lightweight world must be deterministic regardless of league array order");
assert(!worldA["Player FC"], "player club must never be represented as Fringe");

const trackedState = setWorldClubTracked(state, plan.fringeClubIds[0], true);
const trackedClub = plan.fringeClubIds[0];
assert(trackedState.trackedClubIds?.includes(trackedClub), "tracked club identity must persist");
assert(trackedState.football.players.filter((player) => player.currentClubId === trackedClub).length === SQUAD_SIZE, "tracking a Fringe club must hydrate one detailed squad");
assert(!trackedState.fringeWorld?.[trackedClub], "a tracked Focus club must not retain duplicate compact state");
const reloadedTrackedState = JSON.parse(JSON.stringify(trackedState)) as typeof trackedState;
assert(buildWorldSimulationPlan(reloadedTrackedState).focusClubIds.includes(trackedClub), "tracked Focus status must survive save/load");
const trackedSquad = reloadedTrackedState.football.players.filter((player) => player.currentClubId === trackedClub);
const trackedAverage = Math.round(trackedSquad.reduce((total, player) => total + player.currentAbility, 0) / trackedSquad.length);
const untrackedState = setWorldClubTracked(reloadedTrackedState, trackedClub, false);
assert(!untrackedState.football.players.some((player) => player.currentClubId === trackedClub), "untracking a distant club must remove its detailed squad");
assert(Boolean(untrackedState.fringeWorld?.[trackedClub]), "untracking a distant club must compact its identity exactly once");
assert(untrackedState.fringeWorld?.[trackedClub]?.strength === trackedAverage, "a tracked club leaving Focus must compact its detailed squad strength");

const fringeClub = plan.fringeClubIds[0];
const persisted = worldA[fringeClub];
const reconciled = reconcileFringeWorldState(state, worldA);
assert(reconciled[fringeClub]?.strength === persisted.strength, "reconciliation must preserve persistent Fringe identity");
assert(clubStrengthAtLevel(state, state.season, fringeClub, "fringe") === Math.max(1, Math.min(100, persisted.strength + persisted.form)), "Fringe fixtures must read compact strength and form");
assert(clubStrengthAtLevel(state, state.season, fringeClub, "focus") === clubStrengthFor(state, fringeClub, state.season), "Focus fixtures must retain the detailed strength model");
const fringeOpponent = plan.fringeClubIds[1];
const lightweightResult = simulateAiFixtureAtLevel(state, state.season, 1, fringeClub, fringeOpponent, leagues[3].id, "fringe");
assert(JSON.stringify(lightweightResult) === JSON.stringify(simulateAiFixtureAtLevel(state, state.season, 1, fringeClub, fringeOpponent, leagues[3].id, "fringe")), "lightweight Fringe fixtures must remain deterministic");

const persistedState = JSON.parse(JSON.stringify(state)) as typeof state;
assert(fringeWorldSignature(ensureFringeWorldState(persistedState)) === fringeWorldSignature(state.fringeWorld ?? {}), "Fringe state must survive a save/load round trip");
const legacyState = structuredClone(state);
delete legacyState.fringeWorld;
assert(fringeWorldSignature(ensureFringeWorldState(legacyState)) === fringeWorldSignature(worldA), "older saves must hydrate missing Fringe state deterministically");

const advancedState = structuredClone(state);
advancedState.season = 3;
const advancedWorld = advanceFringeWorldToSeason(advancedState);
assert(Object.values(advancedWorld).every((club) => club.lastSimulatedSeason === 3), "Fringe clubs must catch up across skipped seasons");
assert(fringeWorldSignature(advancedWorld) !== fringeWorldSignature(worldA), "Fringe identity must evolve rather than freeze between seasons");
const advancedSignature = fringeWorldSignature(advancedWorld);
assert(fringeWorldSignature(advanceFringeWorldToSeason(advancedState)) === advancedSignature, "Fringe seasonal advancement must be idempotent");

const topFinishState = structuredClone(state);
topFinishState.clubRecords[fringeClub].leagueHistory.push({ season: 1, leagueId: worldA[fringeClub].leagueId, position: 1 });
topFinishState.season = 2;
const topFinishForm = fringeFormFromFinish(topFinishState, fringeClub, 2);
assert(topFinishForm !== null && topFinishForm > 0, "a top finish must produce positive Fringe form");

const movableProfile = plan.clubs.find((profile) => profile.level === "fringe" && profile.tier > 1 && profile.tier < leagues.length);
assert(movableProfile, "Fringe world must contain a club with leagues on both sides");
const movementState = structuredClone(state);
movementState.clubRecords[movableProfile.clubId].leagueHistory.push({ season: 1, leagueId: movableProfile.leagueId, position: 1 });
movementState.season = 2;
const moveClubToTier = (candidate: typeof movementState, tier: number) => {
  for (const league of candidate.leagues) league.clubIds = league.clubIds.filter((clubId) => clubId !== movableProfile.clubId);
  candidate.leagues.find((league) => league.tier === tier)!.clubIds.push(movableProfile.clubId);
};
const promotedState = structuredClone(movementState);
moveClubToTier(promotedState, movableProfile.tier - 1);
assert(fringeFinanceMovement(promotedState, movableProfile.clubId, 2) === 1, "promotion must lift compact financial momentum");

const movedState = { ...state, playerLeagueId: leagues[1].id };
const movedPlan = buildWorldSimulationPlan(movedState);
const movedWorld = reconcileFringeWorldState(movedState, worldA);
for (const id of movedPlan.focusClubIds) assert(!movedWorld[id], `Focus club ${id} must not retain a Fringe snapshot`);

assert(state.football.players.length === plan.focusClubIds.length * SQUAD_SIZE + FREE_AGENT_POOL, "opening recruitment must create detailed players only for Focus clubs");
assert(state.football.players.every((player) => player.currentClubId === null || plan.focusClubIds.includes(player.currentClubId)), "Fringe clubs must not receive detailed opening squads");

const recruitmentState = structuredClone(state);
recruitmentState.playerLeagueId = leagues[1].id;
const newlyFocusedClub = buildWorldSimulationPlan(recruitmentState).focusClubIds.find((clubId) => worldA[clubId]);
assert(newlyFocusedClub, "moving the Focus boundary must expose a previously Fringe club");
const compactStrength = 78;
recruitmentState.fringeWorld![newlyFocusedClub].strength = compactStrength;
const lowFinanceState = structuredClone(recruitmentState);
const highFinanceState = structuredClone(recruitmentState);
lowFinanceState.fringeWorld![newlyFocusedClub].financeBand = 1;
highFinanceState.fringeWorld![newlyFocusedClub].financeBand = 5;
reconcileRecruitmentFidelity(lowFinanceState);
reconcileRecruitmentFidelity(highFinanceState);
const hydratedWageBill = (candidate: typeof recruitmentState) => {
  const playerIds = new Set(candidate.football.players.filter((player) => player.currentClubId === newlyFocusedClub).map((player) => player.id));
  return candidate.football.contracts.filter((contract) => playerIds.has(contract.playerId) && contract.status === "Active").reduce((total, contract) => total + contract.weeklyWage, 0);
};
assert(hydratedWageBill(highFinanceState) > hydratedWageBill(lowFinanceState), "stronger Fringe finances must hydrate a higher but bounded contract load");
assert(fringeFinanceWageFactor(1) === 0.85 && fringeFinanceWageFactor(5) === 1.15, "Fringe finance bands must remain inside the conservative hydration range");

reconcileRecruitmentFidelity(recruitmentState);
const expandedPlan = buildWorldSimulationPlan(recruitmentState);
for (const id of expandedPlan.focusClubIds) assert(recruitmentState.football.players.filter((player) => player.currentClubId === id).length === SQUAD_SIZE, `new Focus club ${id} must be hydrated exactly once`);
const hydratedAverage = Math.round(recruitmentState.football.players.filter((player) => player.currentClubId === newlyFocusedClub).reduce((total, player) => total + player.currentAbility, 0) / SQUAD_SIZE);
assert(Math.abs(hydratedAverage - compactStrength) <= 5, "new Focus squads must inherit their compact Fringe strength");
assert(!recruitmentState.fringeWorld?.[newlyFocusedClub], "hydrated Focus clubs must relinquish their compact snapshot");

console.log("fringe-world.check.ts: PASS");
