import { strict as assert } from "node:assert";
import { motionFrameForSequence, type MatchMotionSide } from "../matchMotion";
import type { MatchPitchPoint, MatchSequence } from "../matchSequence";
import type { MatchLineupPlayer, MatchTeamPlan } from "../types";

const plan: MatchTeamPlan = {
  managerId: "motion-manager",
  managerName: "Motion Manager",
  formation: "4-4-2",
  philosophy: "Balanced",
  squadFit: 70,
  tempo: "Medium",
  pressing: "Medium",
  directness: "Medium",
};

const userLineup: MatchLineupPlayer[] = [
  { playerId: "u1", name: "User One", shirtNumber: 6, role: "CM", ability: 66 },
  { playerId: "u2", name: "User Two", shirtNumber: 9, role: "ST", ability: 70 },
];
const opponentLineup: MatchLineupPlayer[] = [
  { playerId: "o1", name: "Opp One", shirtNumber: 4, role: "CB", ability: 65 },
  { playerId: "o2", name: "Opp Two", shirtNumber: 1, role: "GK", ability: 65 },
];

const userBase = new Map<string, MatchPitchPoint>([
  ["u1", { x: 35, y: 48 }],
  ["u2", { x: 68, y: 50 }],
]);
const opponentBase = new Map<string, MatchPitchPoint>([
  ["o1", { x: 76, y: 50 }],
  ["o2", { x: 94, y: 50 }],
]);

const user: MatchMotionSide = {
  lineup: userLineup,
  basePositions: userBase,
  ours: true,
  plan,
};
const opponent: MatchMotionSide = {
  lineup: opponentLineup,
  basePositions: opponentBase,
  ours: false,
  plan,
};

const sequence: MatchSequence = {
  id: "motion-sequence",
  minute: 18,
  side: "us",
  phase: "progression",
  sourceType: "chance",
  sourceText: "Chance",
  pattern: "balanced",
  styleLabel: "Balanced build-up",
  participantIds: ["u1", "u2"],
  totalWeight: 2.2,
  actions: [
    {
      id: "a0",
      kind: "receive",
      side: "us",
      possessionSide: "us",
      playerId: "u1",
      playerName: "User One",
      start: { x: 36, y: 46 },
      end: { x: 36, y: 46 },
      weight: 0.4,
      commentary: "User One receives.",
    },
    {
      id: "a1",
      kind: "pass",
      side: "us",
      possessionSide: "us",
      playerId: "u1",
      playerName: "User One",
      targetPlayerId: "u2",
      targetPlayerName: "User Two",
      start: { x: 36, y: 46 },
      end: { x: 66, y: 51 },
      weight: 0.8,
      commentary: "User One finds User Two.",
    },
    {
      id: "a2",
      kind: "carry",
      side: "us",
      possessionSide: "us",
      playerId: "u2",
      playerName: "User Two",
      start: { x: 66, y: 51 },
      end: { x: 75, y: 50 },
      weight: 1,
      commentary: "User Two carries.",
    },
  ],
};

function point(
  map: Map<string, MatchPitchPoint>,
  id: string,
): MatchPitchPoint {
  const result = map.get(id);
  assert(result, `missing motion point for ${id}`);
  return result;
}

const action0End = motionFrameForSequence({
  sequence,
  actionIndex: 0,
  localProgress: 1,
  user,
  opponent,
});
const action1Start = motionFrameForSequence({
  sequence,
  actionIndex: 1,
  localProgress: 0,
  user,
  opponent,
});
assert.deepEqual(
  [...action0End.user.entries()],
  [...action1Start.user.entries()],
  "every user player must begin the next action exactly where the previous action ended",
);
assert.deepEqual(
  [...action0End.opponent.entries()],
  [...action1Start.opponent.entries()],
  "every opponent player must begin the next action exactly where the previous action ended",
);

const action1End = motionFrameForSequence({
  sequence,
  actionIndex: 1,
  localProgress: 1,
  user,
  opponent,
});
assert.deepEqual(
  point(action1End.user, "u2"),
  { x: 66, y: 51 },
  "the receiver must finish at the actual pass destination",
);

const action2Start = motionFrameForSequence({
  sequence,
  actionIndex: 2,
  localProgress: 0,
  user,
  opponent,
});
assert.deepEqual(
  [...action1End.user.entries()],
  [...action2Start.user.entries()],
  "receiving the pass must flow into the next action without a positional reset",
);

const action2Mid = motionFrameForSequence({
  sequence,
  actionIndex: 2,
  localProgress: 0.5,
  user,
  opponent,
});
const midCarrier = point(action2Mid.user, "u2");
assert(midCarrier.x > 66 && midCarrier.x < 75, "carrier must move continuously between action endpoints");

const entryEnd = motionFrameForSequence({
  sequence,
  actionIndex: 2,
  localProgress: 1,
  user,
  opponent,
});

const nextSequence: MatchSequence = {
  ...sequence,
  id: "next-sequence",
  minute: 24,
  actions: [
    {
      id: "next-a0",
      kind: "receive",
      side: "us",
      possessionSide: "us",
      playerId: "u2",
      playerName: "User Two",
      start: { x: 75, y: 50 },
      end: { x: 75, y: 50 },
      weight: 0.5,
      commentary: "User Two has it.",
    },
  ],
  totalWeight: 0.5,
};

const nextStart = motionFrameForSequence({
  sequence: nextSequence,
  actionIndex: 0,
  localProgress: 0,
  user,
  opponent,
  entrySequences: [sequence],
});
assert.deepEqual(
  [...entryEnd.user.entries()],
  [...nextStart.user.entries()],
  "the next possession must inherit the exact final positions of the entry sequence",
);

console.log("\nmatch-motion: passed");
