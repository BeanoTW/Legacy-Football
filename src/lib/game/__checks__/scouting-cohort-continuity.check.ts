import { strict as assert } from "node:assert";
import { advanceDay, newGame } from "../engine";
import { advanceFringeWorldToSeason } from "../fringe";
import { advancePersistentFringePlayersToSeason } from "../fringePlayers";
import { projectFringePlayer } from "../fringePlayerProjection";
import {
  createScoutingBrief,
  scoutingBrief,
  scoutingCandidateProfile,
  scoutingCandidateSource,
  scoutingSearchPlan,
} from "../scoutingDiscovery";
import { knownPlayerIdentity } from "../playerLifecycle";

function discover<T extends ReturnType<typeof newGame>>(
  state: T,
  input: Parameters<typeof createScoutingBrief>[1],
): T {
  let next = createScoutingBrief(state, input) as T;
  const days = scoutingSearchPlan(next).searchDays;
  for (let day = 0; day < days; day++) next = advanceDay(next) as T;
  return next;
}


const base = newGame("Scouting Cohort Audit FC", "Auditor", "SCOUTING_COHORT_CONTINUITY_AUDIT");
const discovered = discover(base, { id: "cohort-discovery", maxAge: 40 });
const brief = scoutingBrief(discovered, "cohort-discovery");
if (!brief) throw new Error("scouting brief missing");
const playerId = brief.candidateIds.find(
  (id) => scoutingCandidateSource(discovered, brief.id, id) === "fringe",
);
if (!playerId) throw new Error("fringe discovery missing");
const known = knownPlayerIdentity(discovered, playerId);
if (!known?.currentClubId) throw new Error("known fringe identity missing club");
const originalProfile = scoutingCandidateProfile(discovered, playerId);
assert.ok(originalProfile, "discovery must persist hidden profile");
assert.ok(playerId.startsWith("fp_"), "scouting must discover a persistent compact identity");
assert.ok(discovered.fringePlayers?.[playerId], "discovered identity must already exist in Fringe persistence");
assert.equal(discovered.football?.players.some((player) => player.id === playerId), false);

const nextSeason = structuredClone(discovered);
nextSeason.season += 1;
advanceFringeWorldToSeason(nextSeason);
advancePersistentFringePlayersToSeason(nextSeason);
const currentClub = nextSeason.fringeWorld?.[known.currentClubId];
if (!currentClub) throw new Error("fringe club disappeared unexpectedly");

const originalAfterYear = nextSeason.fringePlayers?.[playerId];
const projected = projectFringePlayer(nextSeason, currentClub, known.primaryPosition);
if (originalAfterYear && !originalAfterYear.retired) {
  assert.equal(projected.id, playerId, "active discovered compact player should remain the same world identity");
}

assert.equal(
  knownPlayerIdentity(nextSeason, playerId)?.dateOfBirth.year,
  known.dateOfBirth.year,
  "once discovered, known identity must not be rewritten by compact-world ageing",
);
assert.deepEqual(
  scoutingCandidateProfile(nextSeason, playerId),
  originalProfile,
  "captured scouting subject must stay stable after discovery",
);
assert.equal(nextSeason.football?.players.some((player) => player.id === playerId), false);

const longFuture = structuredClone(discovered);
longFuture.season += 10;
advanceFringeWorldToSeason(longFuture);
advancePersistentFringePlayersToSeason(longFuture);
const futureClub = longFuture.fringeWorld?.[known.currentClubId];
if (!futureClub) throw new Error("fringe club missing in future");
const futureProjection = projectFringePlayer(longFuture, futureClub, known.primaryPosition);
assert.ok(longFuture.fringePlayers?.[playerId], "old compact identity must survive retirement or turnover");
assert.ok(longFuture.fringePlayers?.[futureProjection.id], "future scouting projection must point at persistent compact state");
if (longFuture.fringePlayers?.[playerId]?.retired) {
  assert.notEqual(futureProjection.id, playerId, "retired compact player must yield the active scouting slot");
}
assert.ok(knownPlayerIdentity(longFuture, playerId), "previously discovered identity must survive world turnover");
assert.deepEqual(scoutingCandidateProfile(longFuture, playerId), originalProfile);
assert.equal(longFuture.football?.players.some((player) => player.id === playerId), false);

console.log("\nscouting-cohort-continuity: passed");
