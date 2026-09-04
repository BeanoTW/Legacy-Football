import { strict as assert } from "node:assert";
import { migrateSave, newGame, SAVE_VERSION } from "../engine";
import {
  clubOperatingModel,
  contractEmploymentType,
  initialClubOperatingModelFor,
  playerEmploymentStatus,
  setClubOperatingModelInPlace,
} from "../employment";
import { footballLevelOfClub, footballLevelOfUser } from "../footballLevel";
import {
  activeContract,
  renewalTerms,
  renewContractInPlace,
  userSquad,
} from "../recruitment";

const state = newGame("Employment Audit FC", "Auditor", "EMPLOYMENT_MODEL_AUDIT");
assert.equal(SAVE_VERSION, 18, "employment model should be schema v18");
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

// Strategic club-model changes are forward-looking; signed deals are immutable.
setClubOperatingModelInPlace(state, userClubId, "FullTime");
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
assert.equal(migrated.version, 18);
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
