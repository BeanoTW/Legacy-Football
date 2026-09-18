import { postMatchReaction } from "../matchReaction";
import type { FixtureResult, GameState } from "../types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const result = (patch: Partial<FixtureResult> = {}): FixtureResult => ({
  week: 3,
  opponent: "Rovers",
  home: true,
  goalsFor: 1,
  goalsAgainst: 0,
  attendance: 1000,
  gateReceipts: 0,
  tvIncome: 0,
  result: "W",
  ...patch,
});

const state = (leagueFixture: boolean): GameState =>
  ({
    saveSeed: "reaction-check",
    clubName: "Legacy FC",
    season: 1,
    week: 4,
    playerLeagueId: "L7",
    leagueSchedule: leagueFixture
      ? [{ league: "L7", round: 3, week: 3, home: "Legacy FC", away: "Rovers" }]
      : [],
    results: [],
    league: [
      { team: "Legacy FC", p: 3, w: 2, d: 0, l: 1, gf: 5, ga: 3, pts: 6 },
      { team: "Rovers", p: 3, w: 1, d: 0, l: 2, gf: 3, ga: 5, pts: 3 },
    ],
  }) as GameState;

const friendlyWin = postMatchReaction(state(false), result());
assert(friendlyWin.stakes === "friendly", "non-league fixtures should be treated as friendlies");
assert(!/ecstatic|devastat|crisis/i.test(friendlyWin.subject + friendlyWin.body), "friendly copy must stay proportionate");

const friendlyLoss = postMatchReaction(
  state(false),
  result({ result: "L", goalsFor: 0, goalsAgainst: 4 }),
);
assert(friendlyLoss.stakes === "friendly", "even a heavy friendly loss remains low stakes");
assert(/result is secondary/i.test(friendlyLoss.body), "friendly defeat should explicitly de-emphasise scoreline");

const leagueWin = postMatchReaction(state(true), result());
assert(leagueWin.stakes !== "friendly", "scheduled league fixtures must use competitive context");
assert(/three points|momentum|statement/i.test(leagueWin.subject), "league win should use competitive language");

const poorRun = state(true);
poorRun.results = [
  result({ week: 0, result: "L", goalsFor: 0, goalsAgainst: 1 }),
  result({ week: 1, result: "D", goalsFor: 1, goalsAgainst: 1 }),
  result({ week: 2, result: "L", goalsFor: 0, goalsAgainst: 2 }),
];
const anotherLoss = postMatchReaction(
  poorRun,
  result({ result: "L", goalsFor: 0, goalsAgainst: 1 }),
);
assert(anotherLoss.tone === "concerned", "a sustained winless run should increase concern");

console.log("match-reaction.check: ok");
