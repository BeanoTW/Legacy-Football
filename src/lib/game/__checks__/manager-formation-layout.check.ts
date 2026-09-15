import { strict as assert } from "node:assert";
import { DETAILED_POSITIONS } from "../positions";
import {
  MANAGER_FORMATIONS,
  MANAGER_FORMATION_ROWS,
  MANAGER_FORMATION_SLOTS,
} from "../managerFormationLayout";

const validPositions = new Set<string>(DETAILED_POSITIONS);

for (const formation of MANAGER_FORMATIONS) {
  const slots = MANAGER_FORMATION_SLOTS[formation];
  const rows = MANAGER_FORMATION_ROWS[formation];

  assert.equal(slots.length, 11, `${formation} must define exactly eleven tactical slots`);
  for (const position of slots) {
    assert.ok(validPositions.has(position), `${formation} contains unsupported tactical position ${position}`);
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
  [...Object.keys(MANAGER_FORMATION_ROWS)].sort(),
  [...MANAGER_FORMATIONS].sort(),
  "every supported manager formation must have a pitch-row layout",
);

console.log("\nmanager-formation-layout: passed");
