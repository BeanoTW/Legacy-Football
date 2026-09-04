import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { clubFootballStrength } from "../footballStrength";
import {
  advancePlayerClubPerformanceWeekInPlace,
  ensurePlayerClubPerformanceInPlace,
  realisedPlayerClubStrength,
} from "../playerClubPerformance";
import { hasFullSchedule, leagueOf, playerLeagueId, simulateFixture } from "../league";
import { startMatchDay } from "../liveMatch";
import { isUserClubReference } from "../clubReference";
import { tickMatchday } from "../tick/matchday";

const state = newGame("Performance Integration FC", "Integration Auditor", "PERFORMANCE_INTEGRATION");
const fixture = state.fixtures[0];
if (!fixture) throw new Error("user fixture missing");
state.week = fixture.week;

const performance = ensurePlayerClubPerformanceInPlace(state);
performance.cohesion = 85;
performance.morale = 80;
advancePlayerClubPerformanceWeekInPlace(state);

const baseStrength = clubFootballStrength(state, state.clubName, state.season);
const realisedStrength = realisedPlayerClubStrength(state, baseStrength);
assert.ok(realisedStrength > baseStrength, "positive club state should realise slightly more squad quality");

const opponentStrength = clubFootballStrength(state, fixture.opponent, state.season);
const sched = hasFullSchedule(state)
  ? state.leagueSchedule.find(
      (candidate) =>
        candidate.week === state.week &&
        ((isUserClubReference(state, candidate.home) && candidate.away === fixture.opponent) ||
          (isUserClubReference(state, candidate.away) && candidate.home === fixture.opponent)),
    )
  : undefined;
const homeClub = fixture.home ? state.clubName : fixture.opponent;
const awayClub = fixture.home ? fixture.opponent : state.clubName;
const round = sched?.round ?? state.week;
const leagueId = sched ? leagueOf(sched) : playerLeagueId(state);
const expected = simulateFixture(state, state.season, round, homeClub, awayClub, leagueId, {
  homeStrength: fixture.home ? realisedStrength : opponentStrength,
  awayStrength: fixture.home ? opponentStrength : realisedStrength,
});

const auto = structuredClone(state);
const outcome = tickMatchday(auto).fxResult;
assert.ok(outcome);
assert.equal(outcome.goalsFor, fixture.home ? expected.homeGoals : expected.awayGoals);
assert.equal(outcome.goalsAgainst, fixture.home ? expected.awayGoals : expected.homeGoals);

const live = startMatchDay(state);
assert.ok(live.liveMatch);
assert.equal(
  live.liveMatch.ourStrength,
  realisedStrength + (fixture.home ? 3 : 0),
  "interactive match must use the same realised player-club strength",
);
assert.equal(
  live.liveMatch.oppStrength,
  opponentStrength,
  "interactive opponent must stay on canonical football strength until AI performance state exists",
);
assert.equal(
  live.playerClubPerformance?.lastProcessedAbsoluteWeek,
  state.playerClubPerformance?.lastProcessedAbsoluteWeek,
  "starting a live match must not process the weekly performance state twice",
);

console.log("\nplayer-club-performance-integration: passed");
