import { strict as assert } from "node:assert";
import { migrateSave, newGame, SAVE_VERSION } from "../engine";
import {
  activeLoanForPlayer,
  endPlayerLoanInPlace,
  processDuePlayerLoansInPlace,
  startPlayerLoanInPlace,
} from "../loans";
import {
  playerOwnerClubId,
  playerRegisteredClubId,
} from "../playerRegistration";
import { activeContract, freeAgents, squadOf, userSquad } from "../recruitment";
import { absoluteWeek } from "../time";

const state = newGame("Loan Audit FC", "Auditor", "PLAYER_LOAN_AUDIT");
assert.equal(SAVE_VERSION, 20);
assert.deepEqual(state.football.loans, []);
assert.equal(state.football.nextLoanId, 1);

const player = userSquad(state)[0];
assert.ok(player, "loan fixture needs a user player");
const parentClub = playerOwnerClubId(player)!;
const parentContract = activeContract(state, player.id);
assert.ok(parentContract, "loan fixture needs a live parent contract");
const contractSnapshot = {
  id: parentContract.id,
  clubId: parentContract.clubId,
  weeklyWage: parentContract.weeklyWage,
  employmentType: parentContract.employmentType,
  status: parentContract.status,
};
const loanClub = state.leagues
  .flatMap((league) => league.clubIds)
  .find((clubId) => clubId !== parentClub)!;
assert.ok(loanClub, "loan fixture needs another club");

const started = startPlayerLoanInPlace(state, player.id, loanClub, 8, 60, "Regular");
assert.ok(started.ok, started.reason);
assert.ok(started.loan);
assert.equal(started.loan.id, "PL-000001");
assert.equal(started.loan.parentClubId, parentClub);
assert.equal(started.loan.loanClubId, loanClub);
assert.equal(started.loan.loanClubWageContributionPct, 60);
assert.equal(started.loan.playingTimeExpectation, "Regular");
assert.equal(started.loan.status, "Active");
assert.equal(playerOwnerClubId(player), parentClub, "loan must preserve parent ownership");
assert.equal(playerRegisteredClubId(player), loanClub, "loan must move playing registration");
assert.equal(player.ownerClubId, parentClub, "divergent ownership should persist one sparse override");
assert.ok(!squadOf(state, parentClub).some((row) => row.id === player.id));
assert.ok(squadOf(state, loanClub).some((row) => row.id === player.id));
assert.deepEqual(
  {
    id: activeContract(state, player.id)!.id,
    clubId: activeContract(state, player.id)!.clubId,
    weeklyWage: activeContract(state, player.id)!.weeklyWage,
    employmentType: activeContract(state, player.id)!.employmentType,
    status: activeContract(state, player.id)!.status,
  },
  contractSnapshot,
  "loan must not replace or rewrite the parent contract",
);
assert.equal(activeLoanForPlayer(state, player.id)?.id, started.loan.id);

const duplicate = startPlayerLoanInPlace(state, player.id, parentClub, 3, 50, "Rotation");
assert.equal(duplicate.ok, false, "already-loaned player cannot start another loan");

const tooLong = newGame("Long Loan FC", "Auditor", "PLAYER_LOAN_TOO_LONG");
const tooLongPlayer = userSquad(tooLong)[0];
const tooLongContract = activeContract(tooLong, tooLongPlayer.id)!;
const contractEnd = absoluteWeek(tooLongContract.expirySeason, tooLongContract.expiryWeek);
const now = absoluteWeek(tooLong.season, tooLong.week);
const tooLongClub = tooLong.leagues
  .flatMap((league) => league.clubIds)
  .find((clubId) => clubId !== playerOwnerClubId(tooLongPlayer))!;
const rejectedLong = startPlayerLoanInPlace(
  tooLong,
  tooLongPlayer.id,
  tooLongClub,
  contractEnd - now + 1,
  50,
  "Rotation",
);
assert.equal(rejectedLong.ok, false);
assert.match(rejectedLong.reason, /beyond the parent-club contract/i);

const freeAgent = freeAgents(state)[0];
assert.ok(freeAgent, "loan fixture needs a free agent");
const freeLoan = startPlayerLoanInPlace(state, freeAgent.id, loanClub, 4, 50, "Backup");
assert.equal(freeLoan.ok, false);
assert.match(freeLoan.reason, /Free agents cannot be loaned/i);

// Advance exactly to the due week. The agreement closes and sparse identity
// compacts back to the ordinary one-club representation.
state.week += 8;
const completed = processDuePlayerLoansInPlace(state);
assert.equal(completed, 1);
assert.equal(started.loan.status, "Completed");
assert.equal(started.loan.endedAbsoluteWeek, absoluteWeek(state.season, state.week));
assert.equal(playerOwnerClubId(player), parentClub);
assert.equal(playerRegisteredClubId(player), parentClub);
assert.equal(player.ownerClubId, undefined, "returned player should compact the owner override");
assert.ok(squadOf(state, parentClub).some((row) => row.id === player.id));
assert.equal(activeLoanForPlayer(state, player.id), undefined);

// Early termination uses the same return-to-parent boundary.
const second = startPlayerLoanInPlace(state, player.id, loanClub, 4, 25, "Backup");
assert.ok(second.ok, second.reason);
assert.equal(second.loan?.id, "PL-000002");
const terminated = endPlayerLoanInPlace(state, second.loan!.id, "Terminated");
assert.ok(terminated.ok, terminated.reason);
assert.equal(second.loan!.status, "Terminated");
assert.equal(playerOwnerClubId(player), parentClub);
assert.equal(playerRegisteredClubId(player), parentClub);
assert.equal(player.ownerClubId, undefined);

// v19 saves gain only empty loan state; no player, contract or club attachment moves.
const legacy = newGame("Loan Migration FC", "Auditor", "PLAYER_LOAN_MIGRATION");
legacy.version = 19;
delete legacy.football.loans;
delete legacy.football.nextLoanId;
const beforePlayers = legacy.football.players.map((row) => ({
  id: row.id,
  currentClubId: row.currentClubId,
  ownerClubId: row.ownerClubId,
  contractId: row.contractId,
}));
const beforeContracts = JSON.stringify(legacy.football.contracts);
const migrated = migrateSave(JSON.parse(JSON.stringify(legacy)) as Record<string, unknown>);
assert.equal(migrated.version, 20);
assert.deepEqual(migrated.football.loans, []);
assert.equal(migrated.football.nextLoanId, 1);
assert.deepEqual(
  migrated.football.players.map((row) => ({
    id: row.id,
    currentClubId: row.currentClubId,
    ownerClubId: row.ownerClubId,
    contractId: row.contractId,
  })),
  beforePlayers,
);
assert.equal(JSON.stringify(migrated.football.contracts), beforeContracts);

console.log("loans: passed");
