import { strict as assert } from "node:assert";
import type { GameState } from "../types";
import { advanceDay, hasFixtureToday } from "../engine";
import { setCalendarDay } from "../calendar";

const state = {
  week: 7,
  fixtures: [
    { week: 7, opponent: "Cup Town", home: true, competition: "leagueCup", dayOfWeek: 1 },
    { week: 7, opponent: "League City", home: false },
  ],
  inboxFlags: {},
} as unknown as GameState;

setCalendarDay(state, 0);
assert.equal(hasFixtureToday(state), false, "Monday must not claim a Tuesday/Saturday fixture");
setCalendarDay(state, 1);
assert.equal(hasFixtureToday(state), true, "Tuesday cup fixture must be detected");
setCalendarDay(state, 5);
assert.equal(hasFixtureToday(state), true, "legacy undated league fixture must default to Saturday");
setCalendarDay(state, 6);
assert.equal(hasFixtureToday(state), false, "Sunday must remain a settlement day without a fixture");


console.log("dated-fixture-day.check: ok");
