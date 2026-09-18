import { strict as assert } from "node:assert";
import { cupSlot, DOMESTIC_CUP_SLOTS, seededCupDraw } from "../cupSchedule";

const drawA = seededCupDraw(["A", "B", "C", "D", "E", "F", "G", "H"], "season1|fa|r1");
const drawB = seededCupDraw(["A", "B", "C", "D", "E", "F", "G", "H"], "season1|fa|r1");
assert.deepEqual(drawA, drawB, "cup draws must be deterministic for a save");
assert.equal(new Set(drawA.flatMap((t) => [t.home, t.away])).size, 8, "every entrant must appear once");

assert.equal(cupSlot("leagueCup", 1)?.dayOfWeek, 1, "early League Cup should create midweek congestion");
assert.equal(cupSlot("faCup", 8)?.week, 44, "National Cup final belongs late in the season");
assert.ok(DOMESTIC_CUP_SLOTS.every((s) => s.week > 4), "competitive cups cannot occur during pre-season");

console.log("cup-schedule.check: ok");
