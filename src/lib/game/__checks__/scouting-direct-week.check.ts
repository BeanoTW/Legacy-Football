import { advanceDay, advanceWeek, newGame } from "../engine";
import { calendarDay } from "../calendar";
import { scoutingAssignment, scoutingReport, startScouting } from "../scouting";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function externalTarget(state: ReturnType<typeof newGame>) {
  const target = state.football.players.find((player) => player.currentClubId !== state.clubName);
  assert(target, "fresh world must contain an external scouting target");
  return target;
}

console.log("\n[SDW1] Direct Monday advanceWeek settles the remaining scouting days");
{
  let state = newGame("Weekly City", "Ada Weekly", "SCOUT|DIRECT|MONDAY");
  const target = externalTarget(state);
  state = startScouting(state, target.id);
  const startingWeek = state.week;

  state = advanceWeek(state);

  const assignment = scoutingAssignment(state, target.id);
  assert(state.week === startingWeek + 1, "direct advanceWeek settles exactly one week");
  assert(calendarDay(state) === 0, "direct weekly settlement returns the visible calendar to Monday");
  assert(assignment?.weeksObserved === 6, "Monday direct advance observes exactly the six remaining scouting days");
  assert(assignment.status === "complete", "direct weekly settlement completes a six-day scouting assignment");
  assert(scoutingReport(state, target).knowledgePct === 100, "direct weekly settlement produces full scouting knowledge");
  const reports = state.inbox.filter((item) => item.eventKey?.startsWith(`scouting:${target.id}:`));
  assert(reports.filter((item) => item.eventKey?.endsWith(":d4")).length === 1, "direct settlement emits one four-day milestone");
  assert(reports.filter((item) => item.eventKey?.endsWith(":d6")).length === 1, "direct settlement emits one six-day milestone");
}

console.log("\n[SDW2] Daily progress to Sunday then advanceWeek does not duplicate scouting");
{
  let state = newGame("Weekly City", "Ada Weekly", "SCOUT|DIRECT|SUNDAY");
  const target = externalTarget(state);
  state = startScouting(state, target.id);
  for (let i = 0; i < 6; i++) state = advanceDay(state);

  assert(calendarDay(state) === 6, "daily path reaches Sunday before settlement");
  assert(scoutingAssignment(state, target.id)?.weeksObserved === 6, "daily path already completes six scouting days");
  const beforeReports = state.inbox.filter((item) => item.eventKey?.startsWith(`scouting:${target.id}:`)).length;

  state = advanceWeek(state);

  const afterReports = state.inbox.filter((item) => item.eventKey?.startsWith(`scouting:${target.id}:`)).length;
  assert(scoutingAssignment(state, target.id)?.weeksObserved === 6, "weekly settlement does not progress a completed assignment again");
  assert(afterReports === beforeReports, "weekly settlement does not duplicate milestone reports after daily progress");
}

console.log("\n[SDW3] Midweek direct advanceWeek counts only unvisited days");
{
  let state = newGame("Weekly City", "Ada Weekly", "SCOUT|DIRECT|MIDWEEK");
  const target = externalTarget(state);
  state = startScouting(state, target.id);
  state = advanceDay(state);
  state = advanceDay(state);
  assert(calendarDay(state) === 2, "precondition reaches Wednesday");
  assert(scoutingAssignment(state, target.id)?.weeksObserved === 2, "two visible days are already observed");

  state = advanceWeek(state);

  const assignment = scoutingAssignment(state, target.id);
  assert(assignment?.weeksObserved === 6, "midweek direct settlement advances only to the Sunday boundary");
  assert(assignment.status === "complete", "midweek direct settlement completes the report exactly once");
  const reports = state.inbox.filter((item) => item.eventKey?.startsWith(`scouting:${target.id}:`));
  assert(reports.filter((item) => item.eventKey?.endsWith(":d4")).length === 1, "midweek path emits one partial report");
  assert(reports.filter((item) => item.eventKey?.endsWith(":d6")).length === 1, "midweek path emits one final report");
}

console.log("scouting-direct-week.check.ts: PASS");
