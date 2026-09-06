import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { canonicalClubReference, isUserClubReference } from "../clubReference";
import { clubFootballStrength } from "../footballStrength";
import { clubMatchStrength } from "../matchStrength";
import { clubStrengthAtLevel, simulateAiFixtureAtLevel } from "../league";
import { startMatchDay } from "../liveMatch";

const state = newGame("AI Match Integration FC", "AI Match Auditor", "AI_MATCH_INTEGRATION");
const fixture = state.fixtures[0];
if (!fixture) throw new Error("user fixture missing");
state.week = fixture.week;

const opponentId = canonicalClubReference(state, fixture.opponent);
state.aiClubPerformance = {
  schemaVersion: 1,
  processedSeasons: [],
  clubsById: {
    [opponentId]: {
      clubId: opponentId,
      performance: 2.25,
      lastUpdatedSeason: state.season - 1,
    },
  },
};

const raw = clubFootballStrength(state, fixture.opponent, state.season);
const realised = clubMatchStrength(state, fixture.opponent, state.season);
assert.equal(realised, raw + 2.25, "AI institutional state must be subordinate to canonical squad quality");
assert.equal(clubStrengthAtLevel(state, state.season, fixture.opponent, "focus"), realised);
assert.equal(clubStrengthAtLevel(state, state.season, fixture.opponent, "fringe"), realised);

const leagueId = state.playerLeagueId;
const otherAi = state.leagues
  .flatMap((league) => league.clubIds)
  .find((club) => !isUserClubReference(state, club) && club !== fixture.opponent);
if (!otherAi) throw new Error("second AI club missing");
const focusSim = simulateAiFixtureAtLevel(
  state,
  state.season,
  777,
  fixture.opponent,
  otherAi,
  leagueId,
  "focus",
);
const fringeSim = simulateAiFixtureAtLevel(
  state,
  state.season,
  777,
  fixture.opponent,
  otherAi,
  leagueId,
  "fringe",
);
assert.deepEqual(
  focusSim,
  fringeSim,
  "changing simulation fidelity must not change the AI performance adjustment",
);

const live = startMatchDay(state);
assert.ok(live.liveMatch);
assert.equal(
  live.liveMatch.oppStrength,
  realised,
  "interactive match brief must consume the same realised AI strength",
);

console.log("\nai-club-performance-integration: passed");
