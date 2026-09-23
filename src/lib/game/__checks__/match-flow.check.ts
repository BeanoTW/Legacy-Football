import { strict as assert } from "node:assert";
import { bridgeMinute, commentaryBridge } from "../matchFlow";
import type { MatchEvent } from "../types";

const previous: MatchEvent = {
  minute: 12,
  type: "chance",
  side: "them",
  text: "A shot goes wide.",
  phase: "finalThird",
  zone: "box",
  sequenceId: "flow-prev",
};

const next: MatchEvent = {
  minute: 27,
  type: "goal",
  side: "us",
  text: "GOAL!",
  phase: "buildUp",
  zone: "box",
  sequenceId: "flow-next",
};

const first = commentaryBridge(previous, next, "Legacy FC", "Rovers");
const replay = commentaryBridge(previous, next, "Legacy FC", "Rovers");
assert(first, "a meaningful gap must produce a commentary bridge");
assert.deepEqual(first, replay, "commentary bridges must be deterministic");
assert(first.durationMs >= 2_200, "bridge must add readable match time");
assert(first.durationMs <= 5_400, "bridge duration must remain bounded");
assert.equal(bridgeMinute(first, 0), 12, "bridge clock starts at the previous event");
assert.equal(bridgeMinute(first, 1), 27, "bridge clock reaches the next event");
assert(
  bridgeMinute(first, 0.5) > 12 && bridgeMinute(first, 0.5) < 27,
  "bridge clock must progress through quiet match time",
);

const opening = commentaryBridge(undefined, next, "Legacy FC", "Rovers");
assert(opening, "the opening event must be bridged from kickoff");
assert.equal(opening.fromMinute, 0, "opening match flow must begin at 0'");

const adjacent: MatchEvent = { ...next, minute: 13, sequenceId: "flow-adjacent" };
assert.equal(
  commentaryBridge(previous, adjacent, "Legacy FC", "Rovers"),
  null,
  "adjacent events should not get artificial dead time",
);

console.log("\nmatch-flow: passed");
