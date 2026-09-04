import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { clubIdForState, ensureClubIdentityStateInPlace, registeredClubDisplayName } from "../clubIdentity";
import { migrateClubReferencesToIdsInPlace } from "../clubReferenceMigration";
import { buildWorldSimulationPlan } from "../world";
import { makeFringeClubState } from "../fringe";

const legacy = newGame("Fringe Identity FC", "Auditor", "FRINGE_CLUB_IDENTITY");
ensureClubIdentityStateInPlace(legacy);
const fringeProfile = buildWorldSimulationPlan(legacy).clubs.find((club) => club.level === "fringe");
if (!fringeProfile) throw new Error("fringe club missing");
const opaqueClubId = fringeProfile.clubId;
const legacyClubName = registeredClubDisplayName(legacy, opaqueClubId);
const before = makeFringeClubState(
  legacy,
  legacyClubName,
  fringeProfile.leagueId,
  fringeProfile.tier,
);

const migrated = structuredClone(legacy);
const migratedClubId = clubIdForState(legacy, legacyClubName);
migrateClubReferencesToIdsInPlace(migrated);
const migratedLeague = migrated.leagues.find((league) => league.clubIds.includes(migratedClubId));
if (!migratedLeague) throw new Error("migrated fringe club missing");
const after = makeFringeClubState(migrated, migratedClubId, migratedLeague.id, migratedLeague.tier);

assert.equal(after.reputation, before.reputation);
assert.equal(after.strength, before.strength, "club ID migration must not reroll fringe strength");
assert.equal(after.form, before.form, "club ID migration must not reroll fringe form");
assert.equal(after.financeBand, before.financeBand, "club ID migration must not reroll fringe finances");
assert.equal(after.squadMeanAge, before.squadMeanAge, "club ID migration must not reroll cohort age");
assert.equal(after.cohortSeason, before.cohortSeason);

console.log("\nfringe-club-identity: passed");
