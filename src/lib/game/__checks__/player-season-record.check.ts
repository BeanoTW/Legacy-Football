import { strict as assert } from "node:assert";
import { newGame, commitLiveMatchAndAdvance } from "../engine";
import { startMatchDay, kickoff, applyHalfTimeChoice } from "../liveMatch";
import { playerSeasonStats } from "../playerSeasonStats";
import { setCalendarDay } from "../calendar";

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
assert.equal(playerSeasonStats(saved).length, full.liveMatch?.engine?.userLineup?.length);
assert(playerSeasonStats(saved).every((row) => row.appearances === 1 && row.minutes === 90));
assert.deepEqual(playerSeasonStats(JSON.parse(JSON.stringify(saved))), playerSeasonStats(saved));
assert.deepEqual(commitLiveMatchAndAdvance(saved), saved, "repeat commit is a no-op");
assert.equal(playerSeasonStats(saved, saved.season + 1).length, 0);
console.log("player-season-record: passed");
