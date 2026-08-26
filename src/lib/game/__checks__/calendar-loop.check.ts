import { advanceDay, newGame } from "../engine";
import { calendarDay, MATCHDAY_INDEX } from "../calendar";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let state = newGame("Calendar City", "Ada Calendar", "CALENDAR|LOOP|FIXED");
const startingWeek = state.week;

assert(calendarDay(state) === 0, "new games must start on Monday");

for (let day = 1; day <= MATCHDAY_INDEX; day++) {
  state = advanceDay(state);
  assert(state.week === startingWeek, "advancing within the week must not settle the week early");
  assert(calendarDay(state) === day, `calendar must advance visibly to day index ${day}`);
}

state = advanceDay(state);
assert(state.week === startingWeek, "Saturday to Sunday must remain inside the same week");
assert(calendarDay(state) === 6, "Saturday to Sunday must advance the visible calendar");

state = advanceDay(state);
assert(state.week === startingWeek + 1, "crossing Sunday must settle exactly one week");
assert(calendarDay(state) === 0, "a newly settled week must restart on Monday");

console.log("calendar-loop.check.ts: PASS");
