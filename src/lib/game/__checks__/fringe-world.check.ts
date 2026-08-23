import { buildFringeWorldState, fringeWorldSignature, reconcileFringeWorldState } from "../fringe";
import { buildWorldSimulationPlan } from "../world";
import { makeExpandedLeagues } from "../worldPyramid";
import { initClubReputations } from "../pyramid";
import { FREE_AGENT_POOL, SQUAD_SIZE, generateWorld, reconcileRecruitmentFidelity } from "../recruitment";

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


const generated = generateWorld(state);
assert(
  generated.players.length === plan.focusClubIds.length * SQUAD_SIZE + FREE_AGENT_POOL,
  "opening recruitment must create detailed players only for Focus clubs",
);
assert(
  generated.players.every((player) => player.currentClubId === null || plan.focusClubIds.includes(player.currentClubId)),
  "Fringe clubs must not receive detailed opening squads",
);

const recruitmentState = {
  ...state,
  squad: [],
  football: {
    players: generated.players,
    contracts: generated.contracts,
    negotiations: [],
    shortlist: [],
    department: {} as any,
    transferHistory: [],
    contractHistory: [],
    seasonHistory: [],
    nextContractId: generated.contracts.length + 1,
    nextNegotiationId: 1,
    nextRecordId: 1,
    generatedSeason: state.season,
  },
} as any;
recruitmentState.playerLeagueId = leagues[1].id;
reconcileRecruitmentFidelity(recruitmentState);
const expandedPlan = buildWorldSimulationPlan(recruitmentState);
for (const id of expandedPlan.focusClubIds) {
  assert(
    recruitmentState.football.players.filter((player: any) => player.currentClubId === id).length === SQUAD_SIZE,
    `new Focus club ${id} must be hydrated exactly once`,
  );
}
const signatureAfterHydration = recruitmentState.football.players.map((player: any) => player.id).sort().join("|");
reconcileRecruitmentFidelity(recruitmentState);
assert(
  recruitmentState.football.players.map((player: any) => player.id).sort().join("|") === signatureAfterHydration,
  "repeated reconciliation must not duplicate hydrated players",
);

console.log("fringe-world.check.ts: PASS");
