import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { ensureFringeWorldState } from "../fringe";
import { preserveKnownIdentityInPlace } from "../playerLifecycle";
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
  const player = advanced[id];
  if (!player) continue; // irrelevant inactive identities may already be pruned
  assert.equal(player.dateOfBirth.year, initial[id].dateOfBirth.year);
  assert.ok(player.currentAbility <= player.potentialAbility);
  assert.ok(player.currentAbility >= 20);
  assert.ok(player.lastDevelopedSeason <= state.season);
}
assert.ok(
  initialIds.some(
    (id) =>
      !advanced[id] ||
      advanced[id].currentAbility !== initial[id].currentAbility ||
      advanced[id].retired,
  ),
  "multi-season fringe progression should produce development, decline, retirement or pruning",
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
assert.equal(
  JSON.stringify(state.fringePlayers),
  once,
  "same-season development, replenishment and pruning must be idempotent",
);

const replay = seededState();
replay.season += 5;
advancePersistentFringePlayersToSeason(replay);
assert.equal(
  JSON.stringify(replay.fringePlayers),
  once,
  "fringe development, replenishment and pruning must be deterministic for the same save",
);

const longHorizon = seededState();
const longInitial = structuredClone(longHorizon.fringePlayers ?? {});
const longInitialIds = new Set(Object.keys(longInitial));
const knownId = [...longInitialIds][0];
if (!knownId) throw new Error("known compact test player missing");
const knownCompact = longInitial[knownId];
preserveKnownIdentityInPlace(
  longHorizon,
  {
    playerId: knownCompact.playerId,
    firstName: "Known",
    lastName: "Retiree",
    dateOfBirth: knownCompact.dateOfBirth,
    nationality: "Scotland",
    primaryPosition: knownCompact.primaryPosition,
    currentClubId: knownCompact.currentClubId,
    createdSeason: knownCompact.createdSeason ?? longHorizon.season,
  },
  ["scouted"],
);

longHorizon.season += 25;
advancePersistentFringePlayersToSeason(longHorizon);
const longWorld = longHorizon.fringePlayers ?? {};
assert.ok(
  Object.keys(longWorld).some((id) => !longInitialIds.has(id)),
  "long-run retirement must create new identities rather than recycle retired player IDs",
);
assert.ok(
  Boolean(longWorld[knownId]),
  "chairman-known inactive identities must survive compact-world pruning",
);
assert.ok(
  [...longInitialIds].some((id) => id !== knownId && !longWorld[id]),
  "irrelevant inactive world identities must be pruned instead of growing the hot save forever",
);
for (const club of Object.values(longHorizon.fringeWorld ?? {})) {
  assert.equal(
    fringePlayersForClub(longHorizon, club.clubId).length,
    FRINGE_SQUAD_SIZE,
    "long-horizon Fringe squads must replenish back to the active target size",
  );
}

const longReplay = seededState();
const replayCompact = longReplay.fringePlayers?.[knownId];
if (!replayCompact) throw new Error("replay known compact test player missing");
preserveKnownIdentityInPlace(
  longReplay,
  {
    playerId: replayCompact.playerId,
    firstName: "Known",
    lastName: "Retiree",
    dateOfBirth: replayCompact.dateOfBirth,
    nationality: "Scotland",
    primaryPosition: replayCompact.primaryPosition,
    currentClubId: replayCompact.currentClubId,
    createdSeason: replayCompact.createdSeason ?? longReplay.season,
  },
  ["scouted"],
);
longReplay.season += 25;
advancePersistentFringePlayersToSeason(longReplay);
assert.equal(
  JSON.stringify(longReplay.fringePlayers),
  JSON.stringify(longHorizon.fringePlayers),
  "replacement and pruning decisions must be deterministic across long-horizon replay",
);

console.log("\nfringe-player-development: passed");
