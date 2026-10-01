/* Runtime verification for scheduled calendar press conferences.
   Run with: bun src/lib/game/__checks__/calendar-press.check.ts
*/
import { newGame } from "../engine";
import { runWeeklyGenerators } from "../inbox";
import {
  calendarPressDefinition,
  calendarPressKindFromConversationKey,
  calendarPressKindsForWeek,
  calendarPressRound,
  type CalendarPressKind,
} from "../calendarPressConference";
import { JOURNALISTS } from "../mediaRelations";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log("  ✓ " + label);
  } else {
    failed++;
    console.log("  ✗ " + label + (extra ? " — " + extra : ""));
  }
}

const schedule: Array<[number, CalendarPressKind, 2 | 3]> = [
  [1, "summer-window-open", 2],
  [4, "season-launch", 3],
  [10, "summer-window-review", 2],
  [23, "midseason-window-preview", 2],
  [28, "midseason-window-review", 2],
  [46, "season-review", 3],
];

console.log("\n[CP1] Six guaranteed calendar press moments");
for (const [week, kind, questions] of schedule) {
  let state = newGame("Calendar Press FC", "Chairman Test");
  state.inbox = [];
  state.scheduledGenerators = [];
  state.week = week;
  state = runWeeklyGenerators(state);

  const item = state.inbox.find((candidate) => candidate.generatorId === "calendar-press");
  check("week " + week + " emits " + kind, !!item && item.conversationKey?.includes(kind) === true);
  check("week " + week + " has three opening answers", item?.choices?.length === 3);
  check("week " + week + " question count is " + questions, calendarPressDefinition(state, kind).questionCount === questions);
  check("conversation key identifies " + kind, item ? calendarPressKindFromConversationKey(item.conversationKey ?? "") === kind : false);

  const again = runWeeklyGenerators(state);
  const copies = again.inbox.filter((candidate) => candidate.eventKey === item?.eventKey).length;
  check("week " + week + " does not duplicate on rerun", copies === 1);
}

console.log("\n[CP2] Only scheduled weeks emit calendar press");
{
  check("week 2 has no scheduled press", calendarPressKindsForWeek(2).length === 0);
  check("week 11 has no scheduled press", calendarPressKindsForWeek(11).length === 0);
  check("week 30 has no scheduled press", calendarPressKindsForWeek(30).length === 0);
}

console.log("\n[CP3] Calendar follow-ups respond to reporter relationship");
{
  const state = newGame("Calendar Press FC", "Chairman Test");
  const reporter = JOURNALISTS[0];
  if (!reporter) throw new Error("fixture needs reporter");
  const round = calendarPressRound(state, "season-launch", 2, ["transparent"], reporter);
  check("round two has a real question", round.question.length > 20);
  check("round two has three responses", round.answers.length === 3);

  const finalRound = calendarPressRound(state, "season-review", 3, ["transparent", "reassure"], reporter);
  check("season review supports third question", finalRound.question.length > 20);
  check("third round has three responses", finalRound.answers.length === 3);
}

console.log("\n=== " + passed + " passed, " + failed + " failed ===");
if (failed > 0) process.exit(1);
