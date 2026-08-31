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

const state = newGame("Focus Bounds FC", "Focus Auditor", "FOCUS_BOUNDS_AUDIT");
const allClubs = state.leagues.flatMap((league) => league.clubIds);
const external = allClubs.filter((club) => club !== state.clubName);

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
assert.ok(plan.clubs.some((club) => club.clubId === state.clubName && club.reasons.includes("playerClub")));

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

console.log("\nworld-focus-bounds: passed");
