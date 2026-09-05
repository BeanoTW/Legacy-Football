import { strict as assert } from "node:assert";
import { migrateSave, newGame, SAVE_VERSION } from "../engine";
import { playerWageBill } from "../finance";
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
import {
  activeContract,
  ageOf,
  assignScout,
  availabilityReason,
  completeTransferInPlace,
  freeAgents,
  reconcileRecruitmentFidelity,
  releasePlayerInPlace,
  rollRecruitmentToNewSeason,
  scoutingView,
  setTransferStatusInPlace,
  squadOf,
  transferMarket,
  userSquad,
} from "../recruitment";
import { absoluteWeek } from "../time";
import {
  compactDepartingFocusPlayersInPlace,
  repairFreshFocusHydrationInPlace,
} from "../playerFidelityReconcile";
import { buildWorldSimulationPlan } from "../world";
import { runPlayerCareerRollover } from "../careers";
import { recruitmentWageForClub } from "../recruitmentEconomy";

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
const loanClub = buildWorldSimulationPlan(state).fringeClubIds[0];
assert.ok(loanClub, "loan fixture needs a fringe club");
const parentPayrollBeforeLoan = playerWageBill(state);

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
assert.equal(
  playerWageBill(state),
  parentPayrollBeforeLoan - Math.round((parentContract.weeklyWage * 60) / 100),
  "parent club payroll should receive the agreed loan wage relief",
);

// Loan registration must not make an owned player look like an external
// transfer target or scouting subject. Ownership/registration both count as
// first-hand club knowledge while the permanent market waits for the loan to end.
assert.equal(scoutingView(state, player).knowledge, 100);
assert.equal(availabilityReason(state, player), null);
assert.equal(
  transferMarket(state).some((entry) => entry.player.id === player.id),
  false,
);
const scoutOwnedLoanee = assignScout(state, player.id);
assert.equal(scoutOwnedLoanee.result.ok, false);
assert.match(scoutOwnedLoanee.result.reason, /already fully known/i);

// Active loans are chairman-relevant exceptions to the Focus/Fringe boundary.
// A loanee registered at a Fringe club must stay materialised so the parent
// contract and automatic return can still complete safely.
const parentContractId = activeContract(state, player.id)!.id;
reconcileRecruitmentFidelity(state);
assert.ok(
  state.football.players.some((row) => row.id === player.id),
  "Fringe registration must not discard an active loanee",
);
assert.equal(activeContract(state, player.id)?.id, parentContractId);
assert.equal(playerOwnerClubId(player), parentClub);
assert.equal(playerRegisteredClubId(player), loanClub);

// If the loan club becomes Focus, its native squad should hydrate around the
// existing loanee rather than treating that one visitor as the whole club.
state.trackedClubIds = [...(state.trackedClubIds ?? []), loanClub];
reconcileRecruitmentFidelity(state);
repairFreshFocusHydrationInPlace(state);
assert.ok(squadOf(state, loanClub).some((row) => row.id === player.id));
assert.ok(
  squadOf(state, loanClub).length >= 20,
  "Focus hydration must still create the loan club's native squad",
);
assert.equal(activeContract(state, player.id)?.id, parentContractId);
assert.equal(activeLoanForPlayer(state, player.id)?.id, started.loan.id);

// Move the club back out again; only its native squad compacts. The live loanee
// remains detailed until the agreement returns him to his parent.
state.trackedClubIds = (state.trackedClubIds ?? []).filter((id) => id !== loanClub);
compactDepartingFocusPlayersInPlace(state);
reconcileRecruitmentFidelity(state);
assert.ok(state.football.players.some((row) => row.id === player.id));
assert.equal(activeContract(state, player.id)?.id, parentContractId);
assert.equal(activeLoanForPlayer(state, player.id)?.id, started.loan.id);

// Season-boundary career logic must treat the active loan as a protected
// temporary registration: development can run, but retirement/AI transfer
// paths cannot dissolve or permanently move the player mid-agreement.
const beforeCareerOwner = playerOwnerClubId(player);
const beforeCareerRegistration = playerRegisteredClubId(player);
const beforeCareerContract = activeContract(state, player.id)!.id;
runPlayerCareerRollover(state);
assert.equal(playerOwnerClubId(player), beforeCareerOwner);
assert.equal(playerRegisteredClubId(player), beforeCareerRegistration);
assert.equal(activeContract(state, player.id)?.id, beforeCareerContract);
assert.equal(activeLoanForPlayer(state, player.id)?.id, started.loan.id);

// Temporary registration must not rewrite permanent wage expectations at the
// annual recruitment recalibration boundary. Economics stay anchored to the
// parent/contract-owning club for the duration of the loan.
rollRecruitmentToNewSeason(state);
assert.equal(
  player.wageExpectation,
  recruitmentWageForClub(
    state,
    parentClub,
    player.currentAbility,
    ageOf(player, state.season),
    player.potentialAbility,
  ),
);
assert.equal(playerOwnerClubId(player), parentClub);
assert.equal(playerRegisteredClubId(player), loanClub);

// Permanent ownership mutations must not cut across a live loan. The parent
// can only sell/release/list again after the temporary registration is closed.
const releaseDuringLoan = releasePlayerInPlace(state, player.id);
assert.equal(releaseDuringLoan.ok, false);
assert.match(releaseDuringLoan.reason, /active loan/i);
const listDuringLoan = setTransferStatusInPlace(state, player.id, "listed");
assert.equal(listDuringLoan.ok, false);
assert.match(listDuringLoan.reason, /active loan/i);

state.football.negotiations.push({
  id: "TN-LOAN-GUARD",
  playerId: player.id,
  fromClubId: parentClub,
  toClubId: loanClub,
  direction: "out",
  stage: "agreed",
  clubRounds: 1,
  playerRounds: 0,
  fee: 1000,
  proposedWeeklyWage: 0,
  proposedLengthSeasons: 3,
  proposedSigningBonus: 0,
  proposedRole: "First Team",
  createdSeason: state.season,
  createdAbsoluteWeek: absoluteWeek(state.season, state.week),
  expiresAtAbsoluteWeek: absoluteWeek(state.season, state.week) + 2,
  log: [],
});
const saleDuringLoan = completeTransferInPlace(state, "TN-LOAN-GUARD");
assert.equal(saleDuringLoan.ok, false);
assert.match(saleDuringLoan.reason, /active loan/i);
state.football.negotiations = state.football.negotiations.filter(
  (row) => row.id !== "TN-LOAN-GUARD",
);
assert.equal(playerOwnerClubId(player), parentClub);
assert.equal(playerRegisteredClubId(player), loanClub);
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
// compacts back to the ordinary one-club representation. Other rollover work
// above may legitimately have changed the wider squad payroll, so measure the
// restoration against the live pre-completion bill rather than the opening save.
state.week += 8;
const payrollBeforeCompletion = playerWageBill(state);
const expectedRestoredContribution = Math.round((activeContract(state, player.id)!.weeklyWage * 60) / 100);
const completed = processDuePlayerLoansInPlace(state);
assert.equal(completed, 1);
assert.equal(started.loan.status, "Completed");
assert.equal(started.loan.endedAbsoluteWeek, absoluteWeek(state.season, state.week));
assert.equal(playerOwnerClubId(player), parentClub);
assert.equal(playerRegisteredClubId(player), parentClub);
assert.equal(player.ownerClubId, undefined, "returned player should compact the owner override");
assert.ok(squadOf(state, parentClub).some((row) => row.id === player.id));
assert.equal(activeLoanForPlayer(state, player.id), undefined);
assert.equal(
  playerWageBill(state),
  payrollBeforeCompletion + expectedRestoredContribution,
  "completed loan should restore the parent's previously relieved wage share",
);

// Loan-club contribution is symmetrical: borrowing a contracted AI player adds
// only the agreed share of the parent wage to the user's payroll.
const incoming = newGame("Incoming Loan FC", "Auditor", "PLAYER_INCOMING_LOAN_AUDIT");
const incomingUserClub = playerOwnerClubId(userSquad(incoming)[0])!;
const incomingParentClub = buildWorldSimulationPlan(incoming).focusClubIds.find(
  (clubId) => clubId !== incomingUserClub,
)!;
const incomingPlayer = squadOf(incoming, incomingParentClub)[0];
assert.ok(incomingPlayer, "incoming loan fixture needs an AI player");
const incomingContract = activeContract(incoming, incomingPlayer.id)!;
const incomingPayrollBefore = playerWageBill(incoming);
const incomingStarted = startPlayerLoanInPlace(
  incoming,
  incomingPlayer.id,
  incomingUserClub,
  4,
  35,
  "Rotation",
);
assert.ok(incomingStarted.ok, incomingStarted.reason);
assert.equal(
  playerWageBill(incoming),
  incomingPayrollBefore + Math.round((incomingContract.weeklyWage * 35) / 100),
  "loan club payroll should add only its agreed contribution",
);

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
