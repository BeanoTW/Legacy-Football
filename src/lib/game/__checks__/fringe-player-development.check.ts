import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { ensureFringeWorldState } from "../fringe";
import {
  FRINGE_SQUAD_SIZE,
  advancePersistentFringePlayersToSeason,
  ensurePersistentFringePlayers,
  fringePlayersForClub,
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
for (const id of initialIds) {
  assert.ok(advanced[id], "development must preserve every existing compact identity");
  assert.equal(advanced[id].dateOfBirth.year, initial[id].dateOfBirth.year);
  assert.ok(advanced[id].currentAbility <= advanced[id].potentialAbility);
  assert.ok(advanced[id].currentAbility >= 20);
  assert.ok(advanced[id].lastDevelopedSeason <= state.season);
}
assert.ok(
  initialIds.some((id) => advanced[id].currentAbility !== initial[id].currentAbility || advanced[id].retired),
  "multi-season fringe progression should produce development, decline or retirement",
);
for (const club of Object.values(state.fringeWorld ?? {})) {
  assert.equal(
    fringePlayersForClub(state, club.clubId).length,
    FRINGE_SQUAD_SIZE,
    "retirement must not leave an active Fringe squad permanently short",
  );
}

const once = JSON.stringify(state.fringePlayers);
advancePersistentFringePlayersToSeason(state);
assert.equal(JSON.stringify(state.fringePlayers), once, "same-season development and replenishment must be idempotent");

const replay = seededState();
replay.season += 5;
advancePersistentFringePlayersToSeason(replay);
assert.equal(JSON.stringify(replay.fringePlayers), once, "fringe development and replenishment must be deterministic for the same save");

const longHorizon = seededState();
const longInitialIds = new Set(Object.keys(longHorizon.fringePlayers ?? {}));
longHorizon.season += 25;
advancePersistentFringePlayersToSeason(longHorizon);
const longWorld = longHorizon.fringePlayers ?? {};
assert.ok(
  Object.keys(longWorld).length > longInitialIds.size,
  "long-run retirement must create new identities rather than recycle retired player IDs",
);
assert.ok(
  [...longInitialIds].every((id) => Boolean(longWorld[id])),
  "retired identities must remain preserved after replacements enter",
);
for (const club of Object.values(longHorizon.fringeWorld ?? {})) {
  assert.equal(
    fringePlayersForClub(longHorizon, club.clubId).length,
    FRINGE_SQUAD_SIZE,
    "long-horizon Fringe squads must replenish back to the active target size",
  );
}

const longReplay = seededState();
longReplay.season += 25;
advancePersistentFringePlayersToSeason(longReplay);
assert.equal(
  JSON.stringify(longReplay.fringePlayers),
  JSON.stringify(longHorizon.fringePlayers),
  "replacement identities must be deterministic across long-horizon replay",
);

console.log("\nfringe-player-development: passed");
