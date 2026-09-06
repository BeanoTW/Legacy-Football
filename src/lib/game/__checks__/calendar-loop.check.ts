import { advanceDay, newGame } from "../engine";
import { calendarDay, MATCHDAY_INDEX } from "../calendar";
import { scoutingAssignment, scoutingReport, startScouting } from "../scouting";
import { isUserClubReference } from "../clubReference";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let state = newGame("Calendar City", "Ada Calendar", "CALENDAR|LOOP|FIXED");
const startingWeek = state.week;

assert(calendarDay(state) === 0, "new games must start on Monday");

const target = state.football.players.find(
  (player) => player.currentClubId !== null && !isUserClubReference(state, player.currentClubId),
);
assert(target, "fresh world must contain an external scouting target");
state = startScouting(state, target.id);
assert(scoutingAssignment(state, target.id)?.weeksObserved === 0, "new scouting assignment must start at zero days");

for (let day = 1; day <= MATCHDAY_INDEX; day++) {
  state = advanceDay(state);
  assert(state.week === startingWeek, "advancing within the week must not settle the week early");
  assert(calendarDay(state) === day, `calendar must advance visibly to day index ${day}`);
  const assignment = scoutingAssignment(state, target.id);
  assert(assignment?.weeksObserved === day, `scouting must progress to day ${day} with the visible calendar`);
  if (day === 4) {
    const report = scoutingReport(state, target);
    assert(report.knowledgePct === 67, "four-day report must expose partial scouting knowledge");
    assert(!report.complete, "four-day scouting report must remain partial");
    assert(state.inbox.some((item) => item.eventKey?.includes(`scouting:${target.id}`) && item.eventKey.endsWith(":d4")), "four-day milestone must create an inbox report");
  }
}

state = advanceDay(state);
assert(state.week === startingWeek, "Saturday to Sunday must remain inside the same week");
assert(calendarDay(state) === 6, "Saturday to Sunday must advance the visible calendar");
assert(scoutingAssignment(state, target.id)?.status === "complete", "sixth scouting day must complete the assignment");
assert(scoutingReport(state, target).knowledgePct === 100, "six-day scouting report must expose full knowledge");
assert(state.inbox.some((item) => item.eventKey?.includes(`scouting:${target.id}`) && item.eventKey.endsWith(":d6")), "six-day milestone must create the final inbox report");

state = advanceDay(state);
assert(state.week === startingWeek + 1, "crossing Sunday must settle exactly one week");
assert(calendarDay(state) === 0, "a newly settled week must restart on Monday");
assert(scoutingAssignment(state, target.id)?.weeksObserved === 6, "weekly settlement must not double-progress completed scouting");

console.log("calendar-loop.check.ts: PASS");
