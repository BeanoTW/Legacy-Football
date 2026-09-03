import { strict as assert } from "node:assert";
import type { GameState } from "../types";
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
import {
  recruitmentSnapshot,
  setTransferStatus,
  SQUAD_SIZE,
  userSquad,
} from "../recruitment";

function nonOpaqueRefs(state: GameState): string[] {
  const bad: string[] = [];
  const add = (label: string, refs: Array<string | null | undefined>) => {
    refs.forEach((ref, index) => {
      if (ref && !isOpaqueClubId(ref)) bad.push(`${label}[${index}]=${ref}`);
    });
  };

  add("tracked", state.trackedClubIds ?? []);
  add("league", state.leagues.flatMap((league) => league.clubIds));
  add("fixtures", state.fixtures.map((fixture) => fixture.opponent));
  add("schedule", state.leagueSchedule.flatMap((fixture) => [fixture.home, fixture.away]));
  add("matches", state.matchRecords.flatMap((record) => [record.home, record.away]));
  add("table", state.league.map((row) => row.team));
  add("results", state.results.map((result) => result.opponent));
  add(
    "seasonHistory",
    state.seasonHistory.flatMap((history) => [
      history.champion,
      history.runnerUp,
      ...history.promoted,
      ...history.relegated,
      ...history.finalTable.map((row) => row.team),
    ]),
  );
  add(
    "predictions",
    state.seasonPredictions.flatMap((prediction) => [
      prediction.predictedChampion,
      ...prediction.promotionFavourites,
      ...prediction.relegationFavourites,
      ...prediction.clubs.map((club) => club.club),
    ]),
  );
  add("snapshots", state.clubSnapshots.map((snapshot) => snapshot.club));
  add("recordKeys", Object.keys(state.clubRecords));
  add("recordValues", Object.values(state.clubRecords).map((record) => record.club));
  add("reputationKeys", Object.keys(state.clubReputations));
  add("fringeKeys", Object.keys(state.fringeWorld ?? {}));
  add("fringeValues", Object.values(state.fringeWorld ?? {}).map((club) => club.clubId));
  add("fringePlayers", Object.values(state.fringePlayers ?? {}).map((player) => player.currentClubId));
  add("commercial", (state.commercial?.contracts ?? []).map((contract) => contract.clubId));
  add("football.players", (state.football?.players ?? []).map((player) => player.currentClubId));
  add("football.contracts", (state.football?.contracts ?? []).map((contract) => contract.clubId));
  add("football.contractHistory", (state.football?.contractHistory ?? []).map((record) => record.clubId));
  add(
    "football.transfers",
    (state.football?.transferHistory ?? []).flatMap((transfer) => [
      transfer.fromClubId,
      transfer.toClubId,
    ]),
  );
  add(
    "football.negotiations",
    (state.football?.negotiations ?? []).flatMap((negotiation) => [
      negotiation.fromClubId,
      negotiation.toClubId,
    ]),
  );
  add(
    "knownPlayers",
    (state.football?.playerLifecycle?.knownPlayers ?? []).flatMap((player) => [
      player.currentClubId,
      ...player.career.map((entry) => entry.clubId),
    ]),
  );
  add(
    "rememberedPlayers",
    (state.football?.rememberedPlayers?.seasons ?? []).map((entry) => entry.clubId),
  );
  return bad;
}

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

// Recruitment is a high-risk legacy boundary because it historically used
// clubName as identity. Its public read model and clone-returning UI actions
// must both work on opaque saves without leaking the canonical ID into the
// presentation field.
const displayName = state.clubName;
assert.equal(userSquad(state).length, SQUAD_SIZE, "opaque saves must retain the full user squad");
assert.equal(recruitmentSnapshot(state).squadSize, SQUAD_SIZE);
assert.equal(state.clubName, displayName, "recruitment reads must restore the display name");
const ownedPlayer = userSquad(state)[0];
assert.ok(ownedPlayer);
const listed = setTransferStatus(state, ownedPlayer.id, "listed");
assert.equal(listed.result.ok, true);
assert.equal(listed.state.clubName, displayName, "recruitment UI clones must restore display metadata");
assert.ok(
  isOpaqueClubId(listed.state.football.players.find((player) => player.id === ownedPlayer.id)!.currentClubId!),
  "recruitment UI mutations must retain opaque ownership",
);
state = listed.state;

// Reach the first scheduled user fixture without bypassing normal weekly
// orchestration, then ensure live-match identity resolves the opaque schedule.
const firstFixtureWeek = state.fixtures[0].week;
while (state.week < firstFixtureWeek) state = advanceWeek(state);
const identity = matchIdentity(state);
assert.ok(identity, "opaque schedule must still resolve the user's match identity");
assert.ok(isOpaqueClubId(identity.homeClub));
assert.ok(isOpaqueClubId(identity.awayClub));
assert.ok(isOpaqueClubId(identity.opponent));
assert.equal(state.clubName, displayName, "weekly legacy boundaries must restore display metadata");
assert.ok(userSquad(state).length >= 16, "weekly recruitment must retain a viable user squad");

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
assert.equal(state.clubName, displayName, "rollover must preserve user-facing club name metadata");
assert.ok(state.fixtures.length > 0, "opaque-ID rollover must regenerate user fixtures");
assert.ok(state.fixtures.every((fixture) => isOpaqueClubId(fixture.opponent)));
assert.ok(userSquad(state).length >= 16, "opaque-ID rollover must retain a viable user squad");
const badAfterRollover = nonOpaqueRefs(state);
assert.ok(
  persistedClubReferencesAreOpaque(state),
  `runtime systems must not reintroduce display-name club references after rollover: ${badAfterRollover.slice(0, 20).join(", ")}`,
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
