import { strict as assert } from "node:assert";
import { FRIENDLY_WEEKS, WINDOW_PRESEASON_END, calendarDay, isTransferDeadlineWeek, isTransferWindowOpen, setCalendarDay } from "../calendar";
import { continuationInterrupt } from "../attention";
import { simulateFixtureToday, startMatchDay } from "../engine";
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


const friendlyState = newGame("Friendly Flow FC", "Chairman", "friendly-flow-check");
const friendly = friendlyState.fixtures.find((fixture) => fixture.competition === "preseason");
assert(friendly, "fresh game must expose a dated preseason friendly");
friendlyState.week = friendly.week;
friendlyState.inbox = [];
setCalendarDay(friendlyState, friendly.dayOfWeek ?? 5);
assert.equal(
  continuationInterrupt(friendlyState),
  "Matchday",
  "Continue must pause on a preseason friendly's actual date",
);
assert(startMatchDay(friendlyState).liveMatch, "preseason friendly must be watchable");
const simulatedFriendly = simulateFixtureToday(friendlyState);
assert.equal(
  simulatedFriendly.results.filter(
    (result) =>
      result.week === friendly.week &&
      result.opponent === friendly.opponent &&
      result.competition === "preseason",
  ).length,
  1,
  "preseason friendly must be explicitly simulatable",
);
assert.equal(
  continuationInterrupt(simulatedFriendly),
  null,
  "a simulated friendly must not leave Continue stuck on Matchday",
);
assert.equal(calendarDay(simulatedFriendly), friendly.dayOfWeek ?? 5);
