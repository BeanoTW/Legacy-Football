import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import { advanceFringeWorldToSeason } from "../fringe";
import { projectFringePlayer } from "../fringePlayerProjection";
import {
  createScoutingBrief,
  scoutingBrief,
  scoutingCandidateProfile,
  scoutingCandidateSource,
} from "../scoutingDiscovery";
import { knownPlayerIdentity } from "../playerLifecycle";

const base = newGame("Scouting Cohort Audit FC", "Auditor", "SCOUTING_COHORT_CONTINUITY_AUDIT");
const discovered = createScoutingBrief(base, { id: "cohort-discovery", maxAge: 40 });
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
assert.equal(discovered.football?.players.some((player) => player.id === playerId), false);

const nextSeason = structuredClone(discovered);
nextSeason.season += 1;
advanceFringeWorldToSeason(nextSeason);
const currentClub = nextSeason.fringeWorld?.[known.currentClubId];
if (!currentClub) throw new Error("fringe club disappeared unexpectedly");

const projected = projectFringePlayer(nextSeason, currentClub, known.primaryPosition);
if (currentClub.cohortSeason === discovered.fringeWorld?.[known.currentClubId]?.cohortSeason) {
  assert.equal(projected.id, playerId, "undiscovered world projection should retain identity while cohort survives");
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
const futureClub = longFuture.fringeWorld?.[known.currentClubId];
if (!futureClub) throw new Error("fringe club missing in future");
const futureProjection = projectFringePlayer(longFuture, futureClub, known.primaryPosition);
assert.notEqual(futureProjection.id, playerId, "world cohort should eventually replace the implicit slot");
assert.ok(knownPlayerIdentity(longFuture, playerId), "previously discovered identity must survive world cohort replacement");
assert.deepEqual(scoutingCandidateProfile(longFuture, playerId), originalProfile);
assert.equal(longFuture.football?.players.some((player) => player.id === playerId), false);

console.log("\nscouting-cohort-continuity: passed");
