import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import {
  MIN_SQUAD_SIZE,
  rollRecruitmentToNewSeason,
  runRecruitmentWeek,
  squadOf,
  userSquad,
} from "../recruitment";
import { playerRegisteredClubId } from "../playerRegistration";
import { userClubReference } from "../clubReference";

const state = newGame("Rollover Cover FC", "Release Auditor", "ROLLOVER|COVER|FIXED");
const club = userClubReference(state);
const retainedCount = 13;
const removed = new Set(
  userSquad(state)
    .slice(retainedCount)
    .map((player) => player.id),
);
state.football.players = state.football.players.filter((player) => !removed.has(player.id));
state.football.contracts = state.football.contracts.filter(
  (contract) => !removed.has(contract.playerId),
);
assert.equal(userSquad(state).length, retainedCount);
const retained = new Set(userSquad(state).map((player) => player.id));
const transfers = state.football.transferHistory.length;

rollRecruitmentToNewSeason(state);

assert.equal(
  userSquad(state).length,
  MIN_SQUAD_SIZE,
  "new season must apply emergency cover before the next tick",
);
const needed = MIN_SQUAD_SIZE - retainedCount;
assert.equal(
  state.football.transferHistory.length,
  transfers + needed,
  "cover must register every required signing",
);
const signing = userSquad(state).find((player) => !retained.has(player.id));
assert(signing);
assert.equal(playerRegisteredClubId(signing), club);
assert(
  state.football.contracts.some(
    (contract) =>
      contract.playerId === signing.id && contract.status === "Active" && contract.weeklyWage > 0,
  ),
);

const playerIds = userSquad(state).map((player) => player.id);
rollRecruitmentToNewSeason(state);
assert.deepEqual(
  userSquad(state).map((player) => player.id),
  playerIds,
  "a covered squad must not receive extra signings",
);
assert.equal(state.football.transferHistory.length, transfers + needed);
// Rival clubs must recover from the same batch loss, including outside windows.
const rival = state.football.players.find(
  (player) => player.currentClubId && player.currentClubId !== club,
)?.currentClubId;
assert(rival);
const rivalRemoved = new Set(
  squadOf(state, rival)
    .slice(13)
    .map((player) => player.id),
);
state.football.players = state.football.players.filter((player) => !rivalRemoved.has(player.id));
state.football.contracts = state.football.contracts.filter(
  (contract) => !rivalRemoved.has(contract.playerId),
);
assert.equal(squadOf(state, rival).length, 13);
runRecruitmentWeek(state, false);
assert.equal(
  squadOf(state, rival).length,
  MIN_SQUAD_SIZE,
  "rival cover must not wait for a window or recruitment rotation",
);
assert(
  squadOf(state, rival).every((player) =>
    state.football.contracts.some(
      (contract) => contract.playerId === player.id && contract.weeklyWage > 0,
    ),
  ),
);
console.log("rollover-squad-cover: PASS");
