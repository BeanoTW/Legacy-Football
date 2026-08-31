import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { ensureFringeWorldState } from "../fringe";
import {
  advancePersistentFringePlayersToSeason,
  ensurePersistentFringePlayers,
} from "../fringePlayers";

function seededState() {
  const state = newGame("Fringe Development FC", "Development Auditor", "FRINGE_PLAYER_DEVELOPMENT");
  ensureFringeWorldState(state);
  ensurePersistentFringePlayers(state);
  return state;
}

const state = seededState();
const initial = structuredClone(state.fringePlayers ?? {});
const initialIds = Object.keys(initial).sort();
assert.ok(initialIds.length > 0);

state.season += 5;
advancePersistentFringePlayersToSeason(state);
const advanced = state.fringePlayers ?? {};
assert.deepEqual(Object.keys(advanced).sort(), initialIds, "development must preserve compact identity keys");
assert.ok(
  initialIds.some((id) => advanced[id].currentAbility !== initial[id].currentAbility || advanced[id].retired),
  "multi-season fringe progression should produce development, decline or retirement",
);
for (const id of initialIds) {
  assert.equal(advanced[id].dateOfBirth.year, initial[id].dateOfBirth.year);
  assert.ok(advanced[id].currentAbility <= advanced[id].potentialAbility);
  assert.ok(advanced[id].currentAbility >= 20);
  assert.ok(advanced[id].lastDevelopedSeason <= state.season);
}

const once = JSON.stringify(advanced);
advancePersistentFringePlayersToSeason(state);
assert.equal(JSON.stringify(state.fringePlayers), once, "same-season development must be idempotent");

const replay = seededState();
replay.season += 5;
advancePersistentFringePlayersToSeason(replay);
assert.equal(JSON.stringify(replay.fringePlayers), once, "fringe development must be deterministic for the same save");

console.log("\nfringe-player-development: passed");
