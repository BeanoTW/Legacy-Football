import { strict as assert } from "node:assert";
import { cupSlot, DOMESTIC_CUP_SLOTS, seededCupDraw, startCupRound, recordCupWinner, nextCupRound, userCupFixture } from "../cupSchedule";
import { resolveAiDomesticCupRound } from "../aiDomesticCups";
import { setCalendarDay } from "../calendar";
import type { GameState } from "../types";

const drawA = seededCupDraw(["A", "B", "C", "D", "E", "F", "G", "H"], "season1|fa|r1");
const drawB = seededCupDraw(["A", "B", "C", "D", "E", "F", "G", "H"], "season1|fa|r1");
assert.deepEqual(drawA, drawB, "cup draws must be deterministic for a save");
assert.equal(new Set(drawA.flatMap((t) => [t.home, t.away])).size, 8, "every entrant must appear once");

assert.equal(cupSlot("leagueCup", 1)?.dayOfWeek, 1, "early League Cup should create midweek congestion");
assert.equal(cupSlot("faCup", 8)?.week, 44, "National Cup final belongs late in the season");
assert.ok(DOMESTIC_CUP_SLOTS.every((s) => s.week > 4), "competitive cups cannot occur during pre-season");

const r1 = startCupRound("faCup", 1, ["Tiny FC", "A", "B", "C"], "save1");
const tiny = userCupFixture(r1, "Tiny FC");
assert.ok(tiny && tiny.competition === "faCup", "a small club must receive a playable National Cup tie");

let settled = r1;
for (const tie of r1.ties) settled = recordCupWinner(settled, tie.home);
const r2 = nextCupRound(settled, "save1");
assert.ok(r2 && r2.round === 2, "round winners must progress into the next draw");
assert.deepEqual(new Set(r2!.entrants), new Set(settled.winners));

const datedCup = startCupRound("leagueCup", 1, ["A", "B", "C", "D"], "dated-cup");
const datedState = {
  week: cupSlot("leagueCup", 1)!.week,
  season: 1,
  saveSeed: "dated-cup",
  clubName: "User FC",
  inboxFlags: {},
} as unknown as GameState;
setCalendarDay(datedState, 0);
const beforeCupDay = resolveAiDomesticCupRound(datedState, datedCup);
assert.equal(beforeCupDay.ties.some((tie) => tie.winner), false, "AI cup ties must remain unresolved on Monday before a Tuesday round");
assert.equal(beforeCupDay.round, 1, "AI cup must not advance before its exact calendar day");

setCalendarDay(datedState, cupSlot("leagueCup", 1)!.dayOfWeek);
const onCupDay = resolveAiDomesticCupRound(datedState, datedCup);
assert.equal(onCupDay.round, 2, "AI cup round must become eligible on its scheduled Tuesday");

console.log("cup-schedule.check: ok");
