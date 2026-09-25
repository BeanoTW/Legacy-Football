import { strict as assert } from "node:assert";
import { advanceWeek, newGame } from "../engine";
import { makePyramidSchedule } from "../pyramid";
import { fixturesForClub, makeLeagueRows } from "../schedule";
import { isUserClubReference, userClubReference } from "../clubReference";

const state = newGame("Fast Forward FC", "Calendar Auditor", "VARIABLE_LEAGUE_FAST_FORWARD");
const userClub = userClubReference(state);
const source = state.leagues.find((league) =>
  league.clubIds.some((club) => isUserClubReference(state, club)),
)!;
const target = state.leagues.find((league) => league.id === "league-2")!;
assert.equal(target.clubIds.length, 24, "fixture requires a 24-club division");

const displaced = target.clubIds[0]!;
source.clubIds = source.clubIds.map((club) =>
  isUserClubReference(state, club) ? displaced : club,
);
target.clubIds = target.clubIds.map((club, index) => (index === 0 ? userClub : club));
state.playerLeagueId = target.id;
state.league = makeLeagueRows(target.clubIds);
state.leagueSchedule = makePyramidSchedule(
  state.leagues,
  state.saveSeed + "|variable-fast-forward",
);
state.fixtures = fixturesForClub(state.leagueSchedule, userClub);

const byWeek = new Map<number, typeof state.fixtures>();
for (const fixture of state.fixtures.filter((row) => (row.competition ?? "league") === "league")) {
  const rows = byWeek.get(fixture.week) ?? [];
  rows.push(fixture);
  byWeek.set(fixture.week, rows);
}
const doubleWeek = [...byWeek.entries()].find(([, fixtures]) => fixtures.length === 2);
assert.ok(doubleWeek, "24-club schedule must contain a two-match user week");

const [week, fixtures] = doubleWeek;
assert.deepEqual(
  fixtures.map((fixture) => fixture.dayOfWeek ?? 5).sort((a, b) => a - b),
  [2, 5],
  "double week must contain the intended midweek and weekend dates",
);

state.week = week;
const override = {
  gf: 2,
  ga: 0,
  attendance: 5_000,
  gate: 50_000,
  tv: 1_000,
  matchdayOps: 5_000,
  winBonus: 0,
};
const after = advanceWeek(state, override);

const weekResults = after.results.filter(
  (result) => result.week === week && (result.competition ?? "league") === "league",
);
assert.equal(weekResults.length, 2, "direct weekly advance must resolve both user league fixtures");
assert.equal(
  new Set(weekResults.map((result) => result.dayOfWeek ?? 5)).size,
  2,
  "the two user results must retain distinct match dates",
);

const userRecords = after.matchRecords.filter(
  (record) =>
    record.season === state.season &&
    record.week === week &&
    record.league === target.id &&
    record.userInvolved,
);
assert.equal(userRecords.length, 2, "both user fixtures must reach the canonical league record");

const expectedWeekFixtures = state.leagueSchedule.filter(
  (fixture) => fixture.week === week && fixture.league === target.id,
);
const recordedWeekFixtures = after.matchRecords.filter(
  (record) => record.season === state.season && record.week === week && record.league === target.id,
);
assert.equal(
  recordedWeekFixtures.length,
  expectedWeekFixtures.length,
  "AI and user fixtures must together complete every Championship fixture in the double week",
);

const replay = advanceWeek(structuredClone(state), override);
assert.deepEqual(
  replay.matchRecords.filter((record) => record.week === week),
  after.matchRecords.filter((record) => record.week === week),
  "double-match fast-forward must remain deterministic across reload",
);

console.log("variable-league-fast-forward.check.ts: PASS");
