import { strict as assert } from "node:assert";
import {
  activeMatchLineupAtMinute,
  buildMatchFlowSequence,
  buildMatchSequence,
  flowSequenceDurationMs,
  frameForSequence,
  sequenceResultVisible,
} from "../matchSequence";
import type { MatchEvent, MatchLineupPlayer, MatchSubstitution } from "../types";

const lineup: MatchLineupPlayer[] = [
  { playerId: "gk", name: "Goal Keeper", shirtNumber: 1, role: "GK", ability: 64 },
  { playerId: "lb", name: "Leo Back", shirtNumber: 3, role: "LB", ability: 64 },
  { playerId: "cb1", name: "Calum One", shirtNumber: 4, role: "CB", ability: 65 },
  { playerId: "cb2", name: "Calum Two", shirtNumber: 5, role: "CB", ability: 63 },
  { playerId: "rb", name: "Ryan Back", shirtNumber: 2, role: "RB", ability: 66 },
  { playerId: "cm1", name: "Mason One", shirtNumber: 6, role: "CM", ability: 67 },
  { playerId: "cm2", name: "Mason Two", shirtNumber: 8, role: "CM", ability: 68 },
  { playerId: "cam", name: "Casey Maker", shirtNumber: 10, role: "CAM", ability: 70 },
  { playerId: "lw", name: "Lewis Wing", shirtNumber: 11, role: "LW", ability: 69 },
  { playerId: "rw", name: "Rory Wing", shirtNumber: 7, role: "RW", ability: 69 },
  { playerId: "st", name: "Sam Striker", shirtNumber: 9, role: "ST", ability: 72 },
];

const bench: MatchLineupPlayer[] = [
  { playerId: "sub", name: "Fin Sub", shirtNumber: 14, role: "ST", ability: 71 },
];

const goal: MatchEvent = {
  minute: 72,
  type: "goal",
  side: "us",
  text: "GOAL — Fin Sub finds the net after Casey Maker's pass!",
  phase: "finalThird",
  zone: "box",
  xg: 0.22,
  sequenceId: "goal-sequence-contract",
  actorPlayerId: "sub",
  actorName: "Fin Sub",
  secondaryPlayerId: "cam",
  secondaryName: "Casey Maker",
};

const subs: MatchSubstitution[] = [
  {
    minute: 60,
    side: "us",
    playerOffId: "st",
    playerOffName: "Sam Striker",
    playerOnId: "sub",
    playerOnName: "Fin Sub",
    reason: "tactical",
  },
];

const input = {
  event: goal,
  userLineup: lineup,
  opponentLineup: lineup.map((player) => ({ ...player, playerId: `opp-${player.playerId}` })),
  userBench: bench,
  opponentBench: [],
  substitutions: subs,
};

const first = buildMatchSequence(input);
const replay = buildMatchSequence(input);
assert(first, "goal event must create a football sequence");
assert.deepEqual(first, replay, "same event and active lineup must create the same sequence");

const active = activeMatchLineupAtMinute(lineup, bench, subs, "us", 72);
assert(active.some((player) => player.playerId === "sub"), "introduced substitute must be active");
assert(!active.some((player) => player.playerId === "st"), "substituted-off player must be absent");

assert(first.participantIds.includes("sub"), "canonical scorer must participate");
assert(first.participantIds.includes("cam"), "canonical creator must participate");
assert(
  first.actions
    .filter((action) => ["pass", "throughBall", "cross"].includes(action.kind))
    .every((action) => action.playerId !== action.targetPlayerId),
  "a football sequence cannot pass a player to himself",
);

const shot = first.actions.find((action) => action.kind === "shot");
assert(shot, "goal sequence must contain a shot");
assert(
  shot.end.x > 99 || shot.end.x < 1,
  "goal shot must visibly cross the goal line",
);
assert.equal(first.actions.at(-1)?.kind, "goal", "goal sequence must terminate as a goal");
assert(!sequenceResultVisible(first, 0.5), "result must not reveal halfway through the move");
assert(sequenceResultVisible(first, 0.999), "result must reveal at the terminal action");

const lateFrame = frameForSequence(first, 0.999);
assert.equal(lateFrame.action.kind, "goal", "late sequence frame must render the goal outcome");

const chance: MatchEvent = {
  ...goal,
  minute: 35,
  type: "chance",
  text: "A low effort is saved by the goalkeeper.",
  sequenceId: "chance-sequence-contract",
  actorPlayerId: "st",
  actorName: "Sam Striker",
  secondaryPlayerId: undefined,
  secondaryName: undefined,
};
const chanceSequence = buildMatchSequence({
  ...input,
  event: chance,
  substitutions: [],
});
assert(chanceSequence, "chance event must create a football sequence");
assert.equal(chanceSequence.actions.at(-1)?.kind, "save", "saved chance must terminate as a save");
const chanceShot = chanceSequence.actions.find((action) => action.kind === "shot");
assert(chanceShot, "chance must contain a shot");
assert(
  chanceShot.end.x < 99 && chanceShot.end.x > 1,
  "saved chance must not visually cross the goal line",
);


const directPlan = {
  managerId: "direct",
  managerName: "Direct Manager",
  formation: "4-4-2",
  philosophy: "Direct",
  squadFit: 70,
  tempo: "Medium" as const,
  pressing: "Medium" as const,
  directness: "High" as const,
};
const patientPlan = {
  ...directPlan,
  managerId: "patient",
  managerName: "Patient Manager",
  philosophy: "Possession",
  tempo: "Low" as const,
  directness: "Low" as const,
};
const highPressPlan = {
  ...directPlan,
  managerId: "press",
  managerName: "Press Manager",
  philosophy: "Front-foot",
  tempo: "High" as const,
  pressing: "High" as const,
  directness: "Medium" as const,
};

const directEvent: MatchEvent = {
  ...chance,
  minute: 51,
  phase: "progression",
  sequenceId: "direct-style-sequence",
};
const directSequence = buildMatchSequence({
  ...input,
  event: directEvent,
  substitutions: [],
  userPlan: directPlan,
  opponentPlan: highPressPlan,
});
assert(directSequence, "direct manager event must create a sequence");
assert.equal(directSequence.pattern, "direct", "high directness must produce a direct attacking pattern");
assert(
  directSequence.actions.some((item) => item.kind === "throughBall" || item.kind === "cross"),
  "direct pattern must contain a vertical final action",
);
assert(
  directSequence.actions.some((item) => item.kind === "press"),
  "a high-press opponent must visibly close the ball in the sequence",
);

const transitionEvent: MatchEvent = {
  ...chance,
  minute: 63,
  phase: "transition",
  sequenceId: "high-press-transition-sequence",
};
const pressSequence = buildMatchSequence({
  ...input,
  event: transitionEvent,
  substitutions: [],
  userPlan: highPressPlan,
  opponentPlan: directPlan,
});
assert(pressSequence, "high-press transition must create a sequence");
assert.equal(pressSequence.pattern, "highPress", "high pressing manager must show a high-press regain");
assert.equal(
  pressSequence.actions[0]?.kind,
  "interception",
  "high-press transition must visibly begin with a regain",
);

const lowTempoSequence = buildMatchSequence({
  ...input,
  event: directEvent,
  substitutions: [],
  userPlan: { ...directPlan, tempo: "Low" as const },
  opponentPlan: directPlan,
});
const highTempoSequence = buildMatchSequence({
  ...input,
  event: directEvent,
  substitutions: [],
  userPlan: { ...directPlan, tempo: "High" as const },
  opponentPlan: directPlan,
});
assert(lowTempoSequence && highTempoSequence, "tempo comparison must produce sequences");
assert(
  lowTempoSequence.totalWeight > highTempoSequence.totalWeight,
  "manager tempo must change how quickly the same football pattern unfolds",
);

const possessionSequence = buildMatchSequence({
  ...input,
  event: { ...directEvent, sequenceId: "possession-style-sequence" },
  substitutions: [],
  userPlan: patientPlan,
  opponentPlan: directPlan,
});
assert(possessionSequence, "possession manager event must create a sequence");
assert(
  possessionSequence.pattern === "patient" || possessionSequence.pattern === "wide",
  "possession football must use patient or wide build-up rather than direct play",
);
assert(
  possessionSequence.actions.some((item) =>
    ["recycle", "switch", "overlap", "cutback", "cross"].includes(item.kind),
  ),
  "possession build-up must expose richer ball circulation",
);


const quietSequence = buildMatchFlowSequence({
  nextEvent: directEvent,
  previousEvent: { ...chance, minute: 38, sequenceId: "quiet-previous" },
  userLineup: lineup,
  opponentLineup: lineup.map((player) => ({ ...player, playerId: `quiet-opp-${player.playerId}` })),
  userBench: [],
  opponentBench: [],
  substitutions: [],
  userPlan: patientPlan,
  opponentPlan: directPlan,
});
assert(quietSequence, "a gap between highlights must create structured open play");
assert.equal(quietSequence.sourceType, "info", "quiet possession must never masquerade as a canonical chance");
assert(
  !quietSequence.actions.some((item) => ["shot", "save", "block", "miss", "goal"].includes(item.kind)),
  "quiet possession must never invent a shot or result",
);
assert(
  quietSequence.actions.some((item) => ["pass", "recycle", "switch"].includes(item.kind)),
  "quiet match flow must keep the ball circulating between real players",
);
assert(
  quietSequence.actions.every((item) => item.playerId === undefined || quietSequence.participantIds.includes(item.playerId)),
  "open-play action actors must belong to the structured possession",
);
assert(
  quietSequence.actions.filter((item) => ["pass", "recycle", "switch", "throughBall"].includes(item.kind)).length >= 3,
  "a meaningful quiet spell must contain several readable passes",
);
assert(
  flowSequenceDurationMs(quietSequence, 13) > 5_500,
  "longer quiet spells must receive meaningful real-time playback",
);

console.log("\nmatch-sequence: passed");
