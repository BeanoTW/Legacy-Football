import { strict as assert } from "node:assert";
import { resolveKnockoutDraw } from "../knockout";

const normal = resolveKnockoutDraw(2, 1, "x");
assert.equal(normal.winner, "home");
assert.equal(normal.afterExtraTime, false);

for (let i = 0; i < 100; i += 1) {
  const d = resolveKnockoutDraw(1, 1, `tie-${i}`);
  assert.ok(d.winner === "home" || d.winner === "away");
  assert.ok(d.homeGoals !== d.awayGoals || (d.penalties && d.penalties.home !== d.penalties.away));
}
assert.deepEqual(resolveKnockoutDraw(0, 0, "stable"), resolveKnockoutDraw(0, 0, "stable"));

console.log("knockout.check: ok");
