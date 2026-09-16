import { strict as assert } from "node:assert";
import type { ManagerMatchStyle } from "../managerMatchStyle";
import { halfGoals, halfPresentation } from "../matchday";

const seed = "manager-match-presentation-check";
const opponent = "Test United";

const possession: ManagerMatchStyle = {
  formation: "4-3-3",
  philosophy: "Possession",
  possessionBias: 0.08,
  chanceBias: -0.01,
  pressing: "Medium",
  tempo: "Low",
  directness: "Low",
  attackModifier: 1,
  defenseModifier: 1,
};

const direct: ManagerMatchStyle = {
  formation: "4-4-2",
  philosophy: "Direct",
  possessionBias: -0.05,
  chanceBias: 0.04,
  pressing: "High",
  tempo: "High",
  directness: "High",
  attackModifier: 1,
  defenseModifier: 1,
};

const goals = halfGoals(seed, 1, 65, 62, 1, 1);
const possessionA = halfPresentation(seed, 1, 0, 45, goals.usGoals, goals.themGoals, opponent, possession);
const possessionB = halfPresentation(seed, 1, 0, 45, goals.usGoals, goals.themGoals, opponent, possession);
const directEvents = halfPresentation(seed, 1, 0, 45, goals.usGoals, goals.themGoals, opponent, direct);

assert.deepEqual(possessionA, possessionB, "same seed and manager style must reproduce identical presentation");

const eventShape = (events: typeof possessionA) =>
  events.map(({ minute, type, side }) => ({ minute, type, side }));

assert.deepEqual(
  eventShape(possessionA),
  eventShape(directEvents),
  "manager style must not move event minutes, types or sides",
);

const nonUserText = (events: typeof possessionA) =>
  events.filter((event) => !(event.type === "chance" && event.side === "us"));

assert.deepEqual(
  nonUserText(possessionA),
  nonUserText(directEvents),
  "manager style must not alter opposition, card or goal presentation",
);

assert.deepEqual(
  halfGoals(seed, 1, 65, 62, 1, 1),
  goals,
  "presentation generation must not disturb scoreline determinism",
);

console.log("\nmanager-match-presentation: passed");
