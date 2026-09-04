import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import {
  AI_CLUB_PERFORMANCE_LIMIT,
  AI_CLUB_PERFORMANCE_RETENTION,
  advanceAiClubPerformanceSeasonInPlace,
  aiClubPerformanceModifier,
  realisedAiClubStrength,
} from "../aiClubPerformance";
import { isOpaqueClubId } from "../clubIdentity";
import { isUserClubReference, userClubReference } from "../clubReference";
import type { LeagueRow } from "../types";

const state = newGame("AI Performance Audit FC", "AI Auditor", "AI_PERFORMANCE_AUDIT");
const league = state.leagues.find((candidate) => candidate.clubIds.some((club) => isUserClubReference(state, club)));
if (!league) throw new Error("user league missing");
const userId = userClubReference(state);
const aiClubs = league.clubIds.filter((club) => !isUserClubReference(state, club));
const over = aiClubs[0];
const under = aiClubs[1];
if (!over || !under) throw new Error("AI clubs missing");

const order = [over, userId, ...aiClubs.filter((club) => club !== over && club !== under), under];
function tableFor(clubs: string[]): LeagueRow[] {
  return clubs.map((team, index) => ({
    team,
    p: 38,
    w: Math.max(0, 25 - index),
    d: 5,
    l: Math.max(0, 8 + index),
    gf: Math.max(20, 72 - index * 2),
    ga: 28 + index * 2,
    pts: Math.max(1, 80 - index * 3),
  }));
}

state.clubSnapshots.push(
  {
    season: 1,
    club: over,
    leagueId: league.id,
    tier: league.tier,
    reputation: 50,
    strength: 60,
    expectedFinish: 10,
    expectation: "midTable",
    actualFinish: 1,
    reputationAfter: 52,
  },
  {
    season: 1,
    club: under,
    leagueId: league.id,
    tier: league.tier,
    reputation: 50,
    strength: 60,
    expectedFinish: 10,
    expectation: "midTable",
    actualFinish: order.length,
    reputationAfter: 48,
  },
);

const seasonOne = [
  {
    leagueId: league.id,
    tier: league.tier,
    table: tableFor(order),
    champion: over,
    promoted: [over],
    relegated: [under],
  },
];
advanceAiClubPerformanceSeasonInPlace(state, seasonOne, 1);

assert.ok(state.aiClubPerformance);
assert.deepEqual(state.aiClubPerformance.processedSeasons, [1]);
assert.ok(Object.keys(state.aiClubPerformance.clubsById).every(isOpaqueClubId));
assert.equal(aiClubPerformanceModifier(state, userId), 0, "user club must not receive AI institutional state");
const overOne = aiClubPerformanceModifier(state, over);
const underOne = aiClubPerformanceModifier(state, under);
assert.ok(overOne > 0, "overachievement should create positive institutional momentum");
assert.ok(underOne < 0, "underachievement/relegation should create negative institutional momentum");
assert.ok(Math.abs(overOne) <= AI_CLUB_PERFORMANCE_LIMIT);
assert.ok(Math.abs(underOne) <= AI_CLUB_PERFORMANCE_LIMIT);
assert.equal(realisedAiClubStrength(state, over, 60), 60 + overOne);

const once = JSON.stringify(state.aiClubPerformance);
advanceAiClubPerformanceSeasonInPlace(state, seasonOne, 1);
assert.equal(JSON.stringify(state.aiClubPerformance), once, "same season update must be idempotent");

// With no new over/under-performance signal, the institutional state should
// lose more than half its magnitude in one season rather than turning into a
// permanent second reputation.
state.clubSnapshots.push(
  {
    season: 2,
    club: over,
    leagueId: league.id,
    tier: league.tier,
    reputation: 52,
    strength: 61,
    expectedFinish: 1,
    expectation: "winLeague",
    actualFinish: 1,
    reputationAfter: 52,
  },
  {
    season: 2,
    club: under,
    leagueId: league.id,
    tier: league.tier,
    reputation: 48,
    strength: 58,
    expectedFinish: order.length,
    expectation: "survival",
    actualFinish: order.length,
    reputationAfter: 48,
  },
);
advanceAiClubPerformanceSeasonInPlace(
  state,
  [
    {
      leagueId: league.id,
      tier: league.tier,
      table: tableFor(order),
      champion: "",
      promoted: [],
      relegated: [],
    },
  ],
  2,
);
const overTwo = aiClubPerformanceModifier(state, over);
const underTwo = aiClubPerformanceModifier(state, under);
assert.ok(Math.abs(overTwo) <= Math.abs(overOne) * AI_CLUB_PERFORMANCE_RETENTION + 0.01);
assert.ok(Math.abs(underTwo) <= Math.abs(underOne) * AI_CLUB_PERFORMANCE_RETENTION + 0.01);

// Sustained extreme overachievement may keep momentum high, but the hard limit
// must hold forever and the user club must remain outside this AI model.
for (let season = 3; season <= 10; season += 1) {
  state.clubSnapshots.push({
    season,
    club: over,
    leagueId: league.id,
    tier: league.tier,
    reputation: 55,
    strength: 62,
    expectedFinish: order.length,
    expectation: "survival",
    actualFinish: 1,
    reputationAfter: 55,
  });
  advanceAiClubPerformanceSeasonInPlace(
    state,
    [
      {
        leagueId: league.id,
        tier: league.tier,
        table: tableFor(order),
        champion: over,
        promoted: [over],
        relegated: [],
      },
    ],
    season,
  );
  assert.ok(Math.abs(aiClubPerformanceModifier(state, over)) <= AI_CLUB_PERFORMANCE_LIMIT);
}
assert.equal(aiClubPerformanceModifier(state, userId), 0);
assert.ok(realisedAiClubStrength(state, over, 95) <= 95);
assert.ok(realisedAiClubStrength(state, under, 25) >= 25);

console.log("\nai-club-performance: passed");
