import { strict as assert } from "node:assert";
import { advanceWeek, newGame } from "../engine";
import {
  clubDisplayName,
  isUserClubReference,
  userClubReference,
} from "../clubReference";
import {
  migrateClubReferencesToIdsInPlace,
  persistedClubReferencesAreOpaque,
} from "../clubReferenceMigration";
import { ensureClubIdentityStateInPlace, isOpaqueClubId } from "../clubIdentity";
import { ensurePersistentFringePlayers } from "../fringePlayers";
import { matchIdentity } from "../matchday";
import { pyramidIntegrity } from "../pyramid";

let state = newGame("Opaque Runtime FC", "Identity Auditor", "OPAQUE_RUNTIME_CHECK");
ensurePersistentFringePlayers(state);
ensureClubIdentityStateInPlace(state);
migrateClubReferencesToIdsInPlace(state);

const userId = userClubReference(state);
assert.ok(isOpaqueClubId(userId), "migrated user reference must be opaque");
assert.equal(clubDisplayName(state, userId), "Opaque Runtime FC");
assert.ok(
  state.leagues.some((league) => league.clubIds.some((club) => isUserClubReference(state, club))),
  "migrated user club must remain in the pyramid",
);
assert.ok(state.fixtures.length > 0, "migration must preserve the user's fixture projection");
assert.ok(state.fixtures.every((fixture) => isOpaqueClubId(fixture.opponent)));
assert.ok(persistedClubReferencesAreOpaque(state), "all migrated persisted club refs must be opaque");
assert.equal(pyramidIntegrity(state).ok, true, pyramidIntegrity(state).problems.join("; "));

// Reach the first scheduled user fixture without bypassing normal weekly
// orchestration, then ensure live-match identity resolves the opaque schedule.
const firstFixtureWeek = state.fixtures[0].week;
while (state.week < firstFixtureWeek) state = advanceWeek(state);
const identity = matchIdentity(state);
assert.ok(identity, "opaque schedule must still resolve the user's match identity");
assert.ok(isOpaqueClubId(identity.homeClub));
assert.ok(isOpaqueClubId(identity.awayClub));
assert.ok(isOpaqueClubId(identity.opponent));

// A full rollover is the strongest runtime probe because it touches league
// finalisation, promotion/relegation, legacy accumulation, AI performance,
// schedule regeneration and recruitment fidelity. No subsystem may reintroduce
// display-name references after the migration boundary.
let safety = 0;
while (state.season === 1) {
  state = advanceWeek(state);
  safety += 1;
  assert.ok(safety <= 60, "opaque-ID season must roll over within 60 weekly ticks");
}

const migratedUserLeague = state.leagues.find((league) =>
  league.clubIds.some((club) => isUserClubReference(state, club)),
);
assert.ok(migratedUserLeague, "user club must retain league membership after opaque-ID rollover");
assert.equal(state.playerLeagueId, migratedUserLeague.id);
assert.ok(state.fixtures.length > 0, "opaque-ID rollover must regenerate user fixtures");
assert.ok(state.fixtures.every((fixture) => isOpaqueClubId(fixture.opponent)));
assert.ok(
  persistedClubReferencesAreOpaque(state),
  "runtime systems must not reintroduce display-name club references after rollover",
);
assert.equal(pyramidIntegrity(state).ok, true, pyramidIntegrity(state).problems.join("; "));
assert.ok(
  Object.values(state.clubLegacy?.clubsById ?? {}).every(
    (record) =>
      isOpaqueClubId(record.clubId) &&
      (!record.recordAttendance || isOpaqueClubId(record.recordAttendance.opponentId)),
  ),
  "club legacy must remain keyed by opaque references",
);
assert.ok(
  Object.values(state.aiClubPerformance?.clubsById ?? {}).every((record) =>
    isOpaqueClubId(record.clubId),
  ),
  "AI institutional state must remain keyed by opaque references",
);

console.log("\nclub-reference-runtime: passed");
