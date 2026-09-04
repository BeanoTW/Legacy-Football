import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { ensureClubIdentityStateInPlace, registeredClubDisplayName } from "../clubIdentity";
import { migrateClubReferencesToIdsInPlace } from "../clubReferenceMigration";
import { fixtureId, leagueOf, resolveWeek, simulateAiFixture } from "../league";

const state = newGame("League Identity FC", "Auditor", "LEAGUE_CLUB_IDENTITY");
ensureClubIdentityStateInPlace(state);
migrateClubReferencesToIdsInPlace(state);
const userId = state.clubIdentity?.userClubId;
if (!userId) throw new Error("user club id missing");
const fixture = state.leagueSchedule.find((f) => f.home === userId || f.away === userId);
if (!fixture) throw new Error("migrated user fixture missing");

const aiFixture = state.leagueSchedule.find(
  (candidate) =>
    candidate.week === fixture.week &&
    candidate.home !== userId &&
    candidate.away !== userId,
);
if (!aiFixture) throw new Error("AI fixture missing");
const homeName = registeredClubDisplayName(state, aiFixture.home);
const awayName = registeredClubDisplayName(state, aiFixture.away);
if (!homeName || !awayName) throw new Error("AI fixture display names missing");
const idSimulation = simulateAiFixture(
  state,
  state.season,
  aiFixture.round,
  aiFixture.home,
  aiFixture.away,
  leagueOf(aiFixture),
);
const legacyNameSimulation = simulateAiFixture(
  state,
  state.season,
  aiFixture.round,
  homeName,
  awayName,
  leagueOf(aiFixture),
);
assert.deepEqual(
  idSimulation,
  legacyNameSimulation,
  "opaque club IDs must not reroll deterministic fixture simulation",
);

resolveWeek(state, fixture.week);
const userFixtureId = fixtureId(state.season, fixture.round, fixture.home, fixture.away, leagueOf(fixture));
assert.equal(
  state.matchRecords.some((record) => record.id === userFixtureId),
  false,
  "migrated user fixture must not be incorrectly AI-resolved",
);
assert.ok(
  state.matchRecords.some((record) => record.week === fixture.week && !record.userInvolved),
  "other fixtures in the week should still resolve normally",
);

console.log("\nleague-club-identity: passed");
