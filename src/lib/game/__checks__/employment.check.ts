import { strict as assert } from "node:assert";
import { migrateSave, newGame, SAVE_VERSION } from "../engine";
import {
  clubOperatingModel,
  contractEmploymentType,
  employmentNegotiationWageFactorFor,
  employmentRecruitmentReputationBonusFor,
  initialClubOperatingModelFor,
  playerEmploymentStatus,
  professionaliseUserClub,
  setClubOperatingModelInPlace,
  userProfessionalisationReadiness,
} from "../employment";
import { footballLevelOfClub, footballLevelOfUser } from "../footballLevel";
import { clubReputation } from "../reputation";
import { assetById } from "../infrastructure";
import {
  activeContract,
  freeAgents,
  playerInterestAssessment,
  renewalTerms,
  renewContractInPlace,
  userSquad,
  wageDemand,
} from "../recruitment";

const state = newGame("Employment Audit FC", "Auditor", "EMPLOYMENT_MODEL_AUDIT");
assert.equal(SAVE_VERSION, 19, "latest schema should include employment plus player registration");
assert.ok(state.clubIdentity, "fresh opaque club identity state missing");
assert.ok(state.football.employment, "fresh game should persist club employment state");

const userClubId = state.clubIdentity.userClubId;
assert.equal(footballLevelOfUser(state), 7, "fixture assumes the new career begins at level 7");
assert.equal(
  clubOperatingModel(state, userClubId),
  "PartTime",
  "new level-7 chairman club should begin as a part-time operation",
);

assert.equal(initialClubOperatingModelFor(7, 49), "PartTime");
assert.equal(initialClubOperatingModelFor(7, 50), "FullTime");
assert.equal(initialClubOperatingModelFor(6, 31), "PartTime");
assert.equal(initialClubOperatingModelFor(6, 32), "FullTime");
assert.equal(initialClubOperatingModelFor(8, 64), "PartTime");
assert.equal(initialClubOperatingModelFor(8, 65), "FullTime");

assert.equal(
  employmentNegotiationWageFactorFor("PartTime", 7),
  1,
  "part-time Level 7 must retain the calibrated wage baseline",
);
assert.equal(
  employmentNegotiationWageFactorFor("FullTime", 7),
  1.15,
  "full-time Level 7 should carry explicit professional wage pressure",
);
assert.equal(
  employmentNegotiationWageFactorFor("FullTime", 5),
  1,
  "already-professional levels must not be double-charged by the employment factor",
);

assert.equal(
  employmentRecruitmentReputationBonusFor("PartTime", 7),
  0,
  "part-time Level 7 must retain the existing recruitment-interest baseline",
);
assert.equal(
  employmentRecruitmentReputationBonusFor("FullTime", 7),
  4,
  "full-time Level 7 should gain a modest recruitment-attraction advantage",
);
assert.equal(
  employmentRecruitmentReputationBonusFor("FullTime", 5),
  0,
  "professional levels must not receive a duplicate employment attraction bonus",
);

for (const league of state.leagues) {
  for (const clubId of league.clubIds) {
    const model = clubOperatingModel(state, clubId);
    const level = footballLevelOfClub(state, clubId);
    assert.ok(model === "PartTime" || model === "FullTime");
    if (level <= 5) {
      assert.equal(model, "FullTime", `level-${level} club ${clubId} should seed full-time`);
    }
  }
}

const userContracts = state.football.contracts.filter(
  (contract) =>
    contract.clubId === userClubId &&
    (contract.status === "Active" || contract.status === "Expiring"),
);
assert.ok(userContracts.length > 0, "opening user contracts missing");
assert.ok(
  userContracts.every((contract) => contract.employmentType === "PartTime"),
  "opening part-time club contracts should persist their signed employment basis",
);

const samplePlayer = userSquad(state)[0];
assert.ok(samplePlayer, "opening user squad missing");
const oldContract = activeContract(state, samplePlayer.id);
assert.ok(oldContract, "opening active contract missing");
assert.equal(playerEmploymentStatus(state, samplePlayer.id), "PartTime");
const signedWageBefore = oldContract.weeklyWage;
const partTimeDemand = wageDemand(state, samplePlayer, oldContract.squadRole);
const interestCandidate = freeAgents(state)[0];
assert.ok(interestCandidate, "employment interest fixture needs a free agent");
interestCandidate.reputation = clubReputation(state, userClubId) + 6;
const partTimeInterest = playerInterestAssessment(state, interestCandidate);
assert.equal(
  partTimeInterest.level,
  "uncertain",
  "six reputation points above a part-time Level 7 club should need convincing",
);

// Strategic club-model changes are forward-looking; signed deals are immutable.
setClubOperatingModelInPlace(state, userClubId, "FullTime");
const fullTimeDemand = wageDemand(state, samplePlayer, oldContract.squadRole);
const fullTimeInterest = playerInterestAssessment(state, interestCandidate);
assert.equal(
  fullTimeInterest.level,
  "keen",
  "the full-time attraction bonus should make the same borderline free agent keen",
);
assert.ok(
  fullTimeDemand > partTimeDemand,
  `full-time wage demand should exceed part-time demand: ${partTimeDemand} -> ${fullTimeDemand}`,
);
assert.equal(
  oldContract.weeklyWage,
  signedWageBefore,
  "changing operating model must never uplift an already-signed wage",
);
assert.equal(clubOperatingModel(state, userClubId), "FullTime");
assert.equal(
  oldContract.employmentType,
  "PartTime",
  "professionalising the club must not silently rewrite an existing contract",
);
assert.equal(
  contractEmploymentType(state, oldContract),
  "PartTime",
  "signed contract employment remains authoritative after club model changes",
);

state.finance.budgets.wages = 1_000_000;
state.cash = Math.max(state.cash, 1_000_000);
const baseTerms = renewalTerms(state, samplePlayer.id);
assert.ok(baseTerms, "renewal terms missing");
const renewed = renewContractInPlace(state, samplePlayer.id, {
  weeklyWage: Math.ceil(baseTerms.weeklyWage * 1.1),
  signingBonus: 0,
});
assert.ok(renewed.ok, renewed.reason);
const freshContract = activeContract(state, samplePlayer.id);
assert.ok(freshContract, "renewed contract missing");
assert.notEqual(freshContract.id, oldContract.id, "renewal should issue a new contract row");
assert.equal(
  freshContract.employmentType,
  "FullTime",
  "new contract should inherit the club's current operating model",
);
assert.equal(
  oldContract.employmentType,
  "PartTime",
  "old contract history must keep the basis it was actually signed under",
);
assert.equal(playerEmploymentStatus(state, samplePlayer.id), "FullTime");
const closedHistory = state.football.contractHistory.find(
  (record) => record.contractId === oldContract.id,
);
assert.equal(
  closedHistory?.employmentType,
  "PartTime",
  "closed contract history should retain its signed employment basis",
);

// Professionalisation is a one-way chairman decision gated by the real training asset.
const transition = newGame(
  "Professionalisation Audit FC",
  "Auditor",
  "PROFESSIONALISATION_AUDIT",
);
const transitionClubId = transition.clubIdentity!.userClubId;
const openingReadiness = userProfessionalisationReadiness(transition);
assert.equal(openingReadiness.trainingLevel, 1, "fresh career should begin on public pitches");
assert.equal(
  openingReadiness.allowed,
  false,
  "public pitches must not support a full-time football operation",
);
assert.match(openingReadiness.reason, /Basic ground/i);

const transitionContracts = transition.football.contracts
  .filter(
    (contract) =>
      contract.clubId === transitionClubId &&
      (contract.status === "Active" || contract.status === "Expiring"),
  )
  .map((contract) => ({
    id: contract.id,
    weeklyWage: contract.weeklyWage,
    employmentType: contract.employmentType,
  }));
assert.ok(transitionContracts.length > 0, "professionalisation fixture needs player contracts");

const training = assetById(transition, "training");
assert.ok(training, "professionalisation fixture needs the canonical training asset");
training.level = 2;
const ready = userProfessionalisationReadiness(transition);
assert.equal(ready.allowed, true, ready.reason);
assert.equal(ready.trainingLabel, "Basic ground");
assert.equal(ready.futureWageFactor, 1.15);
assert.equal(ready.recruitmentReputationBonus, 4);

const switched = professionaliseUserClub(transition);
assert.ok(switched.result.ok, switched.result.reason);
assert.equal(
  clubOperatingModel(switched.state, transitionClubId),
  "FullTime",
  "successful professionalisation should persist the club's full-time model",
);
assert.deepEqual(
  switched.state.football.contracts
    .filter((contract) => transitionContracts.some((before) => before.id === contract.id))
    .map((contract) => ({
      id: contract.id,
      weeklyWage: contract.weeklyWage,
      employmentType: contract.employmentType,
    })),
  transitionContracts,
  "professionalisation must not rewrite existing employment terms or wages",
);
const repeated = professionaliseUserClub(switched.state);
assert.equal(repeated.result.ok, false, "professionalisation must be a one-way transition");
assert.match(repeated.result.reason, /already operates full-time/i);

// A v17 save has no explicit employment state. Migration must add it without
// altering any existing contractual money or duration.
const legacy = newGame("Employment Migration FC", "Auditor", "EMPLOYMENT_MIGRATION_AUDIT");
const contractualBefore = legacy.football.contracts.map((contract) => ({
  id: contract.id,
  clubId: contract.clubId,
  weeklyWage: contract.weeklyWage,
  startSeason: contract.startSeason,
  startWeek: contract.startWeek,
  expirySeason: contract.expirySeason,
  expiryWeek: contract.expiryWeek,
  status: contract.status,
}));
legacy.version = 17;
delete legacy.football.employment;
for (const contract of legacy.football.contracts) delete contract.employmentType;

const migrated = migrateSave(JSON.parse(JSON.stringify(legacy)) as Record<string, unknown>);
assert.equal(migrated.version, 19);
assert.ok(migrated.football.employment, "v17 migration should seed explicit club models");
assert.deepEqual(
  migrated.football.contracts.map((contract) => ({
    id: contract.id,
    clubId: contract.clubId,
    weeklyWage: contract.weeklyWage,
    startSeason: contract.startSeason,
    startWeek: contract.startWeek,
    expirySeason: contract.expirySeason,
    expiryWeek: contract.expiryWeek,
    status: contract.status,
  })),
  contractualBefore,
  "employment migration must not rewrite existing contract money, duration or status",
);
assert.ok(
  migrated.football.contracts.every(
    (contract) =>
      contract.employmentType === "PartTime" || contract.employmentType === "FullTime",
  ),
  "v17 migration should backfill every persisted contract employment term",
);

console.log(
  `employment: passed — user ${clubOperatingModel(state, userClubId)}, renewed ${freshContract.employmentType}`,
);
