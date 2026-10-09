import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import { MIN_SQUAD_SIZE, rollRecruitmentToNewSeason, userSquad } from "../recruitment";
import { playerRegisteredClubId } from "../playerRegistration";
import { userClubReference } from "../clubReference";

const state = newGame("Rollover Cover FC", "Release Auditor", "ROLLOVER|COVER|FIXED");
const club = userClubReference(state);
const removed = new Set(userSquad(state).slice(MIN_SQUAD_SIZE - 1).map((player) => player.id));
state.football.players = state.football.players.filter((player) => !removed.has(player.id));
state.football.contracts = state.football.contracts.filter((contract) => !removed.has(contract.playerId));
assert.equal(userSquad(state).length, MIN_SQUAD_SIZE - 1);
const retained = new Set(userSquad(state).map((player) => player.id));
const transfers = state.football.transferHistory.length;

rollRecruitmentToNewSeason(state);

assert.equal(userSquad(state).length, MIN_SQUAD_SIZE, "new season must apply emergency cover before the next tick");
assert.equal(state.football.transferHistory.length, transfers + 1, "cover must register one genuine signing");
const signing = userSquad(state).find((player) => !retained.has(player.id));
assert(signing);
assert.equal(playerRegisteredClubId(signing), club);
assert(state.football.contracts.some((contract) => contract.playerId === signing.id && contract.status === "Active" && contract.weeklyWage > 0));

const playerIds = userSquad(state).map((player) => player.id);
rollRecruitmentToNewSeason(state);
assert.deepEqual(userSquad(state).map((player) => player.id), playerIds, "a covered squad must not receive extra signings");
assert.equal(state.football.transferHistory.length, transfers + 1);
console.log("rollover-squad-cover: PASS");
