import { strict as assert } from "node:assert";
import { newGame, commitLiveMatchAndAdvance } from "../engine";
import { startMatchDay, kickoff, applyHalfTimeChoice } from "../liveMatch";
import { playerSeasonLeaders, playerSeasonStats } from "../playerSeasonStats";
import { setCalendarDay } from "../calendar";
import { tickSelectedMatchday } from "../tick/matchday";

const game = newGame("Record FC", "Chair", "record-regression");
const opponent = game.fixtures[0].opponent;
game.fixtures = [
  { week: game.week, dayOfWeek: 1, competition: "preseason", opponent, home: true },
  { week: game.week, dayOfWeek: 5, competition: "preseason", opponent, home: false },
];
setCalendarDay(game, 5);
const full = applyHalfTimeChoice(kickoff(startMatchDay(game)), "steady");
const saved = commitLiveMatchAndAdvance(full);
assert.equal(saved.week, game.week, "watching a fixture must not skip the rest of the week");
assert.equal(
  saved.results.at(-1)?.dayOfWeek,
  5,
  "commit the selected fixture, not the first of the week",
);
assert.equal(saved.results.at(-1)?.goalsFor, full.liveMatch?.ourGoals);
assert.equal(Object.keys(saved.playerMatchHistory ?? {}).length, 1);
assert(
  playerSeasonStats(saved).length >= (full.liveMatch?.engine?.userLineup?.length ?? 0),
  "used substitutes should join the season record without dropping starters",
);
assert(
  playerSeasonStats(saved).every(
    (row) => row.appearances === 1 && row.minutes > 0 && row.minutes <= 90,
  ),
);
assert.equal(
  playerSeasonStats(saved).reduce((sum, row) => sum + row.starts, 0),
  11,
  "exactly eleven players must receive starts",
);
assert.equal(
  playerSeasonStats(saved).reduce((sum, row) => sum + row.substituteAppearances, 0),
  full.liveMatch?.engine?.substitutions?.filter((sub) => sub.side === "us").length ?? 0,
  "used substitutes must reconcile with the season record",
);
assert.deepEqual(playerSeasonStats(JSON.parse(JSON.stringify(saved))), playerSeasonStats(saved));
assert.deepEqual(commitLiveMatchAndAdvance(saved), saved, "repeat commit is a no-op");
assert.equal(playerSeasonStats(saved, saved.season + 1).length, 0);
console.log("player-season-record: passed");


const auto = newGame("Auto Record FC", "Chair", "auto-record-regression");
const autoOpponent = auto.fixtures[0].opponent;
auto.fixtures = [
  {
    week: auto.week,
    dayOfWeek: 3,
    competition: "preseason",
    opponent: autoOpponent,
    home: true,
  },
];
const autoOutcome = tickSelectedMatchday(auto, auto.fixtures[0]);
assert(autoOutcome.fxResult, "auto-resolved fixture must produce a result");
assert.equal(
  Object.keys(auto.playerMatchHistory ?? {}).length,
  1,
  "auto-resolved user fixture must persist player performances",
);
const autoStats = playerSeasonStats(auto);
assert(autoStats.length >= 11 && autoStats.length <= 14);
assert(
  autoStats.every((row) => row.appearances === 1 && row.minutes > 0 && row.minutes <= 90),
);
assert.equal(
  autoStats.reduce((sum, row) => sum + row.goals, 0),
  autoOutcome.fxResult!.goalsFor,
  "recorded player goals must reconcile to the settled team score",
);
const autoReplay = newGame("Auto Record FC", "Chair", "auto-record-regression");
autoReplay.fixtures = structuredClone(auto.fixtures);
const replayOutcome = tickSelectedMatchday(autoReplay, autoReplay.fixtures[0]);
assert.deepEqual(replayOutcome.fxResult, autoOutcome.fxResult);
assert.deepEqual(
  playerSeasonStats(autoReplay),
  autoStats,
  "auto-resolved player performances must be deterministic",
);


const leaders = playerSeasonLeaders(saved);
const savedRows = playerSeasonStats(saved);
assert.equal(
  leaders.topScorer?.goals,
  Math.max(...savedRows.map((row) => row.goals)),
  "top scorer leader must reflect the canonical season rows",
);
assert.equal(
  leaders.mostUsed?.minutes,
  Math.max(...savedRows.map((row) => row.minutes)),
  "most-used leader must reflect recorded minutes",
);
