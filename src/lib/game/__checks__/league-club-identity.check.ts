import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { ensureClubIdentityStateInPlace } from "../clubIdentity";
import { migrateClubReferencesToIdsInPlace } from "../clubReferenceMigration";
import { fixtureId, leagueOf, resolveWeek } from "../league";

const state = newGame("League Identity FC", "Auditor", "LEAGUE_CLUB_IDENTITY");
ensureClubIdentityStateInPlace(state);
migrateClubReferencesToIdsInPlace(state);
const userId = state.clubIdentity?.userClubId;
if (!userId) throw new Error("user club id missing");
const fixture = state.leagueSchedule.find((f) => f.home === userId || f.away === userId);
if (!fixture) throw new Error("migrated user fixture missing");

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
