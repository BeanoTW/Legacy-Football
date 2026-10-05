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
  const expectedChoices = context === "season-preview" ? 6 : 3;
  check(
    `week ${week} opens with ${expectedChoices} meaningful response choices`,
    item?.choices?.length === expectedChoices,
  );

  const repeated = runWeeklyGenerators(state);
  const copies = repeated.inbox.filter((candidate) => candidate.eventKey === item?.eventKey).length;
  check(`week ${week} dedupes on rerun`, copies === 1, `copies=${copies}`);
}

console.log("\n[CP1b] Veteran calendar restores the window-opening briefing");
{
  let veteran = fixture();
  veteran.season = 2;
  veteran.week = 1;
  veteran = runWeeklyGenerators(veteran);
  const item = veteran.inbox.find((candidate) => candidate.generatorId === "calendar-press");
  check(
    "season 2 week 1 emits summer-window-open",
    !!item && item.eventKey.includes(":summer-window-open:"),
    item?.eventKey,
  );
}

console.log("\n[CP1c] Calendar meetings do not reuse the same script");
{
  let summer = fixture();
  summer.season = 2;
  summer.week = 1;
  summer = runWeeklyGenerators(summer);
  const summerItem = summer.inbox.find((candidate) => candidate.generatorId === "calendar-press");

  let winter = fixture();
  winter.week = 23;
  winter = runWeeklyGenerators(winter);
  const winterItem = winter.inbox.find((candidate) => candidate.generatorId === "calendar-press");

  check(
    "summer and winter opening answers differ",
    !!summerItem?.choices?.[0] &&
      !!winterItem?.choices?.[0] &&
      summerItem.choices[0].label !== winterItem.choices[0].label,
  );

  const summerRound = calendarPressRound(summer, "summer-window-open", 2, ["transparent"]);
  const seasonRound = calendarPressRound(summer, "season-review", 2, ["transparent"]);
  check(
    "follow-up answer sets vary by conference context",
    summerRound.answers[0].label !== seasonRound.answers[0].label,
  );
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
    const first = item.choices.find((choice) => choice.id === "promotion") ?? item.choices[0];
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
    check(
      "opening statement persists as narrative memory",
      resolved.inboxFlags["press:season-preview:s1"] === "promotion",
      String(resolved.inboxFlags["press:season-preview:s1"]),
    );

    let remembered = structuredClone(resolved);
    remembered.week = 20;
    const callbackRound = calendarPressRound(
      remembered,
      "midseason-checkpoint",
      2,
      ["reassure"],
    );
    check(
      "mid-season press quotes the opening promise back",
      callbackRound.question.includes("Promotion is the target."),
      callbackRound.question,
    );
  }
}

console.log("\n[CP4] New-save onboarding only");
{
  let state = fixture();
  state.week = 1;
  state = runWeeklyGenerators(state);
  check(
    "opening week contains role/world onboarding",
    state.inbox.some((item) => item.eventKey === "new-save-onboarding:your-role") &&
      state.inbox.some((item) => item.eventKey === "new-save-onboarding:living-world"),
  );
  const openingPress = state.inbox.find((item) => item.generatorId === "calendar-press");
  check(
    "new save gets the owner-director unveiling press conference in week 1",
    !!openingPress && openingPress.eventKey.includes(":summer-window-open:s1"),
    openingPress?.eventKey,
  );
  check(
    "opening press conference asks for a real response",
    (openingPress?.choices?.length ?? 0) >= 3,
  );
  check(
    "welcome is informational rather than a fake decision",
    state.inbox.find((item) => item.generatorId === "board-welcome")?.status === "unread",
  );

  let veteran = fixture();
  veteran.season = 2;
  veteran.week = 1;
  veteran = runWeeklyGenerators(veteran);
  check(
    "onboarding never repeats in later seasons",
    !veteran.inbox.some((item) => item.generatorId === "new-save-onboarding" || item.generatorId === "board-welcome"),
  );
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
