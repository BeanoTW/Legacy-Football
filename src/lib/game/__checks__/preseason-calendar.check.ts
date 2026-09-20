import { strict as assert } from "node:assert";
import { FRIENDLY_WEEKS, WINDOW_PRESEASON_END, isTransferDeadlineWeek, isTransferWindowOpen } from "../calendar";
import { newGame } from "../newGame";
import { weekForLeagueRound } from "../pyramid";

assert.deepEqual(
  [...FRIENDLY_WEEKS],
  [1, 2, 3, 4],
  "pre-season preparation must occupy weeks 1-4 only",
);
assert.equal(weekForLeagueRound(1), 5, "league football must not begin during pre-season");
assert.equal(FRIENDLY_WEEKS.has(25), false, "mid-season friendlies must not return");
assert.equal(FRIENDLY_WEEKS.has(27), false, "mid-season friendlies must not return");

const state = newGame("Dalton Town", "Chairman", "summer-window-check");
state.week = 5;
assert.equal(isTransferWindowOpen(state), true, "summer window must remain open when league football begins");
state.week = WINDOW_PRESEASON_END;
assert.equal(isTransferWindowOpen(state), true, "summer window stays open through its deadline week");
assert.equal(isTransferDeadlineWeek(state), true, "summer deadline moves with the extended window");
state.week = WINDOW_PRESEASON_END + 1;
assert.equal(isTransferWindowOpen(state), false, "summer window closes after deadline week");

console.log("preseason-calendar.check: ok");
