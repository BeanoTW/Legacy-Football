import { strict as assert } from "node:assert";
import { DETAILED_POSITIONS } from "../positions";
import {
  MANAGER_FORMATIONS,
  MANAGER_FORMATION_POINTS,
  MANAGER_FORMATION_ROWS,
  MANAGER_FORMATION_SLOTS,
} from "../managerFormationLayout";

const validPositions = new Set<string>(DETAILED_POSITIONS);

for (const formation of MANAGER_FORMATIONS) {
  const slots = MANAGER_FORMATION_SLOTS[formation];
  const rows = MANAGER_FORMATION_ROWS[formation];
  const points = MANAGER_FORMATION_POINTS[formation];

  assert.equal(slots.length, 11, `${formation} must define exactly eleven tactical slots`);
  for (const position of slots) {
    assert.ok(validPositions.has(position), `${formation} contains unsupported tactical position ${position}`);
  }

  assert.equal(points.length, 11, `${formation} must define exactly eleven pitch coordinates`);
  for (const point of points) {
    assert.ok(point.x >= 5 && point.x <= 95, `${formation} pitch x must stay on the playable board`);
    assert.ok(point.y >= 8 && point.y <= 92, `${formation} pitch y must stay on the playable board`);
  }

  const indices = rows.flat();
  assert.equal(indices.length, 11, `${formation} pitch rows must contain exactly eleven slot indices`);
  assert.deepEqual(
    [...indices].sort((a, b) => a - b),
    Array.from({ length: 11 }, (_, index) => index),
    `${formation} pitch rows must cover slots 0-10 exactly once`,
  );
}

assert.deepEqual(
  [...Object.keys(MANAGER_FORMATION_SLOTS)].sort(),
  [...MANAGER_FORMATIONS].sort(),
  "every supported manager formation must have a slot layout",
);
assert.deepEqual(
  [...Object.keys(MANAGER_FORMATION_POINTS)].sort(),
  [...MANAGER_FORMATIONS].sort(),
  "every supported manager formation must have pitch coordinates",
);
assert.deepEqual(
  [...Object.keys(MANAGER_FORMATION_ROWS)].sort(),
  [...MANAGER_FORMATIONS].sort(),
  "every supported manager formation must have a pitch-row layout",
);

console.log("\nmanager-formation-layout: passed");


const threeFiveTwo = MANAGER_FORMATION_SLOTS["3-5-2"];
const threeFiveTwoPoints = MANAGER_FORMATION_POINTS["3-5-2"];
const cdmDepths = threeFiveTwo
  .map((slot, index) => slot === "CDM" ? threeFiveTwoPoints[index].y : null)
  .filter((value): value is number => value !== null);
const camDepth = threeFiveTwoPoints[threeFiveTwo.indexOf("CAM")].y;
const wideMidDepths = threeFiveTwo
  .map((slot, index) => slot === "LM" || slot === "RM" ? threeFiveTwoPoints[index].y : null)
  .filter((value): value is number => value !== null);
assert.ok(cdmDepths.every((depth) => depth > camDepth), "3-5-2 CDMs must sit deeper than the CAM");
assert.ok(wideMidDepths.every((depth) => depth < cdmDepths[0]), "3-5-2 wide midfielders must sit ahead of the holding midfielders");

const fiveThreeTwo = MANAGER_FORMATION_SLOTS["5-3-2"];
const fiveThreeTwoPoints = MANAGER_FORMATION_POINTS["5-3-2"];
const wingBackDepths = fiveThreeTwo
  .map((slot, index) => slot === "LWB" || slot === "RWB" ? fiveThreeTwoPoints[index].y : null)
  .filter((value): value is number => value !== null);
const centreBackDepths = fiveThreeTwo
  .map((slot, index) => slot === "CB" ? fiveThreeTwoPoints[index].y : null)
  .filter((value): value is number => value !== null);
assert.ok(
  wingBackDepths.every((depth) => depth < Math.min(...centreBackDepths)),
  "5-3-2 wing-backs must sit ahead of the centre-backs",
);
