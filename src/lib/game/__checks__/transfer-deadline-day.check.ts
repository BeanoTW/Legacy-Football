import {
  advanceDay,
  isTransferDeadlineDay,
  skipTransferDeadlineDay,
  transferDeadlineHour,
  transferDeadlineHoursRemaining,
} from "../engine";
import { calendarDay, setCalendarDay, setTransferDeadlineHour } from "../calendar";
import { newGame } from "../newGame";

let passed = 0;
function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`transfer-deadline-day: ${message}`);
  passed += 1;
}

let state = newGame("Deadline Town", "Chairman", "deadline-day-check");
state.week = 9;
setCalendarDay(state, 6);

check(isTransferDeadlineDay(state), "summer-window closing Sunday is deadline day");
check(transferDeadlineHour(state) === 0, "deadline day starts at hour zero");
check(transferDeadlineHoursRemaining(state) === 24, "deadline day starts with 24 hours remaining");

for (let hour = 1; hour <= 23; hour += 1) {
  state = advanceDay(state);
  check(state.week === 9, `hour ${hour} must not settle the week early`);
  check(calendarDay(state) === 6, `hour ${hour} must remain on Sunday`);
  check(transferDeadlineHour(state) === hour, `hour ${hour} must persist on the deadline clock`);
}

state = advanceDay(state);
check(state.week === 10, "the 24th hourly tick settles the closing week");
check(calendarDay(state) === 0, "deadline completion opens the next week on Monday");
check(!isTransferDeadlineDay(state), "deadline mode clears after the window closes");
check(transferDeadlineHoursRemaining(state) === 0, "no deadline hours remain after settlement");

let skipped = newGame("Skip Town", "Chairman", "deadline-day-skip-check");
skipped.week = 27;
setCalendarDay(skipped, 6);
setTransferDeadlineHour(skipped, 11);
check(isTransferDeadlineDay(skipped), "mid-season closing Sunday is deadline day");
skipped = skipTransferDeadlineDay(skipped);
check(skipped.week === 28, "skip-to-deadline settles the mid-season closing week");
check(calendarDay(skipped) === 0, "skip-to-deadline lands on Monday");

let ordinary = newGame("Ordinary Town", "Chairman", "ordinary-sunday-check");
ordinary.week = 3;
setCalendarDay(ordinary, 6);
ordinary = advanceDay(ordinary);
check(ordinary.week === 4, "ordinary Sunday still advances by a whole week boundary");
check(calendarDay(ordinary) === 0, "ordinary Sunday still lands on Monday");

console.log(`transfer-deadline-day.check: ${passed} checks passed`);
