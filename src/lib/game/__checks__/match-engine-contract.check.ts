import { strict as assert } from "node:assert";
import { calendarDay, setCalendarDay } from "../calendar";
import { startMatchDay } from "../liveMatch";
import { simulateMatchHalf, totalMatchStats } from "../matchEngine";
import type { ManagerMatchStyle } from "../managerMatchStyle";
import { newGame } from "../newGame";

const style: ManagerMatchStyle = {
  formation: "4-3-3",
  philosophy: "Possession",
  possessionBias: 0.08,
  chanceBias: 0.01,
  attackModifier: 1.04,
  defenseModifier: 1.02,
  tempo: "Medium",
  pressing: "High",
  directness: "Low",
};

const input = {
  seedBase: "match-engine-contract",
  half: 1 as const,
  fromMinute: 0,
  toMinute: 45,
  ourStrength: 66,
  opponentStrength: 63,
  opponentName: "Contract United",
  style,
};
const first = simulateMatchHalf(input);
const replay = simulateMatchHalf(input);
assert.deepEqual(first, replay, "the canonical half contract must replay exactly");
assert.equal(
  first.snapshot.us.possession + first.snapshot.them.possession,
  100,
  "possession must reconcile",
);
assert(first.snapshot.us.shots >= first.snapshot.usGoals, "user goals cannot exceed shots");
assert(
  first.snapshot.them.shotsOnTarget >= first.snapshot.themGoals,
  "opponent goals cannot exceed shots on target",
);
assert(
  first.events
    .filter((event) => event.type === "goal" || event.type === "chance")
    .every((event) => event.sequenceId && event.phase && event.zone && event.xg !== undefined),
  "viewer-capable attacking events must include stable sequence and spatial data",
);

const totals = totalMatchStats({
  version: 1,
  userPlan: {
    managerId: null,
    managerName: "A",
    formation: "4-3-3",
    philosophy: "Possession",
    squadFit: 60,
    tempo: "Medium",
    pressing: "High",
    directness: "Low",
  },
  opponentPlan: {
    managerId: null,
    managerName: "B",
    formation: "4-4-2",
    philosophy: "Balanced",
    squadFit: 60,
    tempo: "Medium",
    pressing: "Medium",
    directness: "Medium",
  },
  halves: [first.snapshot, { ...first.snapshot, half: 2 }],
});
assert(totals, "played halves must produce totals");
assert.equal(totals.us.shots, first.snapshot.us.shots * 2, "counting stats must add across halves");
assert.equal(
  totals.us.possession,
  first.snapshot.us.possession,
  "rate stats must average across halves",
);

const game = newGame("Calendar FC", "Chair", "calendar-match-contract");
const currentDay = calendarDay(game);
game.fixtures = [
  {
    week: game.week,
    dayOfWeek: currentDay === 1 ? 2 : 1,
    opponent: "Wrong Day FC",
    home: true,
    competition: "preseason",
  },
  {
    week: game.week,
    dayOfWeek: currentDay,
    opponent: "Today FC",
    home: false,
    competition: "preseason",
  },
];
setCalendarDay(game, currentDay);
const started = startMatchDay(game);
assert.equal(
  started.liveMatch?.fixture.opponent,
  "Today FC",
  "live match must select today's fixture, not the week's first fixture",
);
assert.equal(
  started.liveMatch?.engine?.version,
  1,
  "new live matches must persist the canonical engine contract",
);

console.log("\nmatch-engine-contract: passed");
