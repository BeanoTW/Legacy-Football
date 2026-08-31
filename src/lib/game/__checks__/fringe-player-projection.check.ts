import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import { advanceFringeWorldToSeason, ensureFringeWorldState } from "../fringe";
import { projectFringePlayer } from "../fringePlayerProjection";

const base = newGame("Projection Audit FC", "Auditor", "FRINGE_PROJECTION_AUDIT");
const world = ensureFringeWorldState(base);
const clubId = Object.keys(world).sort()[0];
if (!clubId) throw new Error("fringe club missing");
const club = world[clubId];

const first = projectFringePlayer(base, club, "MID");
const second = projectFringePlayer(base, club, "MID");
assert.deepEqual(second, first, "projection must be deterministic");
assert.equal(base.football?.players.some((player) => player.id === first.id), false);
assert.equal(first.identity.currentClubId, clubId);
assert.equal(first.identity.createdSeason, club.cohortSeason);

const aged = structuredClone(base);
aged.season += 1;
aged.fringeWorld = structuredClone(world);
const agedWorld = advanceFringeWorldToSeason(aged);
const agedClub = agedWorld[clubId];
const next = projectFringePlayer(aged, agedClub, "MID");
if (agedClub.cohortSeason === club.cohortSeason) {
  assert.equal(next.id, first.id, "identity should survive a season when cohort survives");
  assert.equal(next.identity.dateOfBirth.year, first.identity.dateOfBirth.year);
  assert.equal(next.age, first.age + 1, "same cohort player should age naturally");
}

const turned = structuredClone(base);
turned.season += 10;
turned.fringeWorld = structuredClone(world);
const turnedClub = advanceFringeWorldToSeason(turned)[clubId];
const replacement = projectFringePlayer(turned, turnedClub, "MID");
assert.ok((turnedClub.playerGeneration ?? 0) > (club.playerGeneration ?? 0));
assert.notEqual(replacement.id, first.id, "cohort turnover should create a new implicit identity");
assert.ok(replacement.age >= 17 && replacement.age <= 35);
assert.equal(turned.football?.players.some((player) => player.id === replacement.id), false);

console.log("\nfringe-player-projection: passed");
