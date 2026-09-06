import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import { advanceFringeWorldToSeason, ensureFringeWorldState } from "../fringe";
import {
  advancePersistentFringePlayersToSeason,
  ensurePersistentFringePlayers,
} from "../fringePlayers";
import { projectFringePlayer } from "../fringePlayerProjection";

const base = newGame("Projection Audit FC", "Auditor", "FRINGE_PROJECTION_AUDIT");
const world = ensureFringeWorldState(base);
ensurePersistentFringePlayers(base);
const clubId = Object.keys(world).sort()[0];
if (!clubId) throw new Error("fringe club missing");
const club = world[clubId];

const first = projectFringePlayer(base, club, "MID");
const second = projectFringePlayer(base, club, "MID");
assert.deepEqual(second, first, "projection must be deterministic");
assert.equal(base.football?.players.some((player) => player.id === first.id), false);
assert.ok(first.id.startsWith("fp_"), "scouting must expose the persistent compact player id");
assert.ok(base.fringePlayers?.[first.id], "projected player must already exist in compact persistence");
assert.equal(first.identity.currentClubId, clubId);
assert.deepEqual(first.identity.dateOfBirth, base.fringePlayers?.[first.id].dateOfBirth);
assert.equal(first.currentAbility, base.fringePlayers?.[first.id].currentAbility);
assert.equal(first.potentialAbility, base.fringePlayers?.[first.id].potentialAbility);

const aged = structuredClone(base);
aged.season += 1;
aged.fringeWorld = structuredClone(world);
const agedWorld = advanceFringeWorldToSeason(aged);
advancePersistentFringePlayersToSeason(aged);
const agedClub = agedWorld[clubId];
const originalAfterYear = aged.fringePlayers?.[first.id];
const next = projectFringePlayer(aged, agedClub, "MID");
if (originalAfterYear && !originalAfterYear.retired) {
  assert.equal(next.id, first.id, "same active compact player should remain the scouting identity");
  assert.equal(next.identity.dateOfBirth.year, first.identity.dateOfBirth.year);
  assert.equal(next.age, first.age + 1, "persistent compact player should age naturally");
}

const turned = structuredClone(base);
turned.season += 10;
turned.fringeWorld = structuredClone(world);
const turnedClub = advanceFringeWorldToSeason(turned)[clubId];
advancePersistentFringePlayersToSeason(turned);
const replacement = projectFringePlayer(turned, turnedClub, "MID");
assert.ok(turned.fringePlayers?.[first.id], "old compact identity must survive long-horizon turnover");
assert.ok(turned.fringePlayers?.[replacement.id], "replacement projection must reference persistent compact state");
assert.equal(replacement.id.startsWith("wp-"), false, "legacy implicit world-player ids must not reappear");
assert.ok(replacement.age >= 16);
assert.equal(turned.football?.players.some((player) => player.id === replacement.id), false);

console.log("\nfringe-player-projection: passed");
