import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { buildWorldSimulationPlan } from "../world";
import {
  MAX_ADJACENT_FOCUS_LEAGUES,
  MAX_RECENT_OPPONENT_FOCUS_CLUBS,
  MAX_TRACKED_FOCUS_CLUBS,
  boundedAdjacentLeagueIds,
  boundedRecentOpponentIds,
  boundedTrackedClubIds,
} from "../worldFocusPolicy";
import { clubDisplayName, isUserClubReference } from "../clubReference";
import { setWorldClubTracked } from "../recruitment";

const state = newGame("Focus Bounds FC", "Focus Auditor", "FOCUS_BOUNDS_AUDIT");
const allClubs = state.leagues.flatMap((league) => league.clubIds);
const external = allClubs.filter((club) => !isUserClubReference(state, club));

const trackedInput = external.slice(0, 20);
const recentInput = external.slice(10, 30);
assert.ok(boundedTrackedClubIds(state, trackedInput).length <= MAX_TRACKED_FOCUS_CLUBS);
assert.ok(boundedRecentOpponentIds(state, recentInput).length <= MAX_RECENT_OPPONENT_FOCUS_CLUBS);

const playerLeague = state.leagues.find((league) => league.id === state.playerLeagueId);
if (!playerLeague) throw new Error("player league missing");
assert.ok(
  boundedAdjacentLeagueIds(state.leagues, playerLeague.tier).length <= MAX_ADJACENT_FOCUS_LEAGUES,
);

const plan = buildWorldSimulationPlan(state, {
  trackedClubIds: trackedInput,
  recentOpponentIds: recentInput,
});
assert.ok(plan.focusLeagueIds.length <= 1 + MAX_ADJACENT_FOCUS_LEAGUES);
assert.ok(
  plan.clubs.some((club) => isUserClubReference(state, club.clubId) && club.reasons.includes("playerClub")),
);

const retainedTracked = boundedTrackedClubIds(state, trackedInput);
for (const clubId of retainedTracked) {
  assert.ok(plan.clubs.find((club) => club.clubId === clubId)?.reasons.includes("tracked"));
}
const expiredTracked = trackedInput.filter((club) => !retainedTracked.includes(club));
for (const clubId of expiredTracked) {
  const profile = plan.clubs.find((club) => club.clubId === clubId);
  if (!profile) continue;
  assert.ok(!profile.reasons.includes("tracked"), "old tracked relevance must be allowed to decay");
}

const retainedRecent = boundedRecentOpponentIds(state, recentInput);
for (const clubId of retainedRecent) {
  assert.ok(plan.clubs.find((club) => club.clubId === clubId)?.reasons.includes("recentOpponent"));
}


let trackingState = state;
for (const clubId of external.slice(0, MAX_TRACKED_FOCUS_CLUBS + 4)) {
  trackingState = setWorldClubTracked(trackingState, clubId, true);
}
assert.equal(
  trackingState.trackedClubIds?.length,
  MAX_TRACKED_FOCUS_CLUBS,
  "chairman tracking action must keep the persisted attention list bounded",
);
assert.deepEqual(
  trackingState.trackedClubIds,
  external.slice(4, MAX_TRACKED_FOCUS_CLUBS + 4),
  "tracking should retain the most recently selected clubs rather than alphabetical ids",
);

const aliasTarget = external[MAX_TRACKED_FOCUS_CLUBS + 5];
if (!aliasTarget) throw new Error("tracking alias fixture missing");
const aliasName = clubDisplayName(trackingState, aliasTarget);
trackingState = setWorldClubTracked(trackingState, aliasName, true);
assert.ok(
  trackingState.trackedClubIds?.includes(aliasTarget),
  "display-name tracking requests must persist the canonical opaque club id",
);
assert.ok(
  !(trackingState.trackedClubIds ?? []).includes(aliasName) || aliasName === aliasTarget,
  "tracking must not create a second display-name identity",
);

console.log("\nworld-focus-bounds: passed");
