/* Runtime verification for recurring football-calendar press conferences.
   Run with: bun src/lib/game/__checks__/calendar-press-conferences.check.ts
*/
import { newGame } from "../engine";
import { resolvePressConference, runWeeklyGenerators } from "../inbox";
import { calendarPressRound, pressOutcomeLabel } from "../pressConference";
import type { GameState } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`);
  }
}

function fixture(): GameState {
  const state = newGame("Calendar Press FC", "Chairman Test");
  state.saveSeed = "CALENDAR_PRESS_CHECK";
  state.inbox = [];
  state.scheduledGenerators = [];
  state.inboxFlags = {};
  return state;
}

const expected: Record<number, string> = {
  1: "summer-window-open",
  4: "season-preview",
  10: "summer-window-review",
  20: "midseason-checkpoint",
  23: "winter-window-preview",
  28: "winter-window-review",
  46: "season-review",
};

console.log("\n[CP1] Calendar cadence");
for (const [weekText, context] of Object.entries(expected)) {
  const week = Number(weekText);
  let state = fixture();
  state.week = week;
  state = runWeeklyGenerators(state);
  const item = state.inbox.find((candidate) => candidate.generatorId === "calendar-press");
  check(`week ${week} emits ${context}`, !!item && item.eventKey.includes(`:${context}:`), item?.eventKey);
  check(`week ${week} opens with three response styles`, item?.choices?.length === 3);

  const repeated = runWeeklyGenerators(state);
  const copies = repeated.inbox.filter((candidate) => candidate.eventKey === item?.eventKey).length;
  check(`week ${week} dedupes on rerun`, copies === 1, `copies=${copies}`);
}

console.log("\n[CP2] Non-event week stays quiet");
{
  let state = fixture();
  state.week = 15;
  state = runWeeklyGenerators(state);
  check("week 15 has no scheduled press conference", !state.inbox.some((item) => item.generatorId === "calendar-press"));
}

console.log("\n[CP3] Generic follow-up rounds and atomic completion");
{
  let state = fixture();
  state.week = 4;
  state = runWeeklyGenerators(state);
  const item = state.inbox.find((candidate) => candidate.generatorId === "calendar-press");
  check("season curtain-raiser exists", !!item);

  if (item?.choices?.length) {
    const first = item.choices.find((choice) => choice.id === "transparent") ?? item.choices[0];
    const roundTwo = calendarPressRound(state, "season-preview", 2, ["transparent"]);
    const roundThree = calendarPressRound(state, "season-preview", 3, ["transparent", "reassure"]);
    check("calendar round two has a question and three answers", roundTwo.question.length > 10 && roundTwo.answers.length === 3);
    check("calendar round three has a question and three answers", roundThree.question.length > 10 && roundThree.answers.length === 3);

    const summary = {
      outcome: pressOutcomeLabel(["transparent", "reassure", "transparent"]),
      exchanges: [
        { question: item.body.split(/\n\s*\n/).at(-1) ?? "", answer: first.label },
        { question: roundTwo.question, answer: roundTwo.answers[0].label },
        { question: roundThree.question, answer: roundThree.answers[0].label },
      ],
    };
    const resolved = resolvePressConference(
      state,
      item.id,
      first.id,
      [...roundTwo.answers[0].effects, ...roundThree.answers[0].effects],
      summary,
    );
    const completed = resolved.inbox.find((candidate) => candidate.id === item.id);
    check("scheduled press conference completes atomically", completed?.status === "completed");
    check("scheduled press transcript persists", completed?.pressConference?.exchanges.length === 3);
  }
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
