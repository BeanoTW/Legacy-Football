import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { PRESEASON_MATCH_SLOTS } from "../preseason";

const state = newGame("Dalton Town", "Chairman", "preseason-fixtures-check");
const fixtures = state.leagueSchedule
  .filter((fixture) => fixture.competition === "preseason")
  .sort((a, b) => a.week - b.week || (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0));

assert.equal(fixtures.length, 3, "fresh careers should open with three pre-season matches");
assert.deepEqual(
  fixtures.map(({ week, dayOfWeek }) => ({ week, dayOfWeek })),
  [...PRESEASON_MATCH_SLOTS],
  "pre-season matches should use the intended 5-day then 4-day rhythm",
);
assert.ok(fixtures.every((fixture) => fixture.week < 5), "friendlies must finish before competitive league football");
assert.ok(fixtures.every((fixture) => fixture.competition === "preseason"), "friendlies need explicit competition identity");

console.log("preseason-fixtures.check: ok");
