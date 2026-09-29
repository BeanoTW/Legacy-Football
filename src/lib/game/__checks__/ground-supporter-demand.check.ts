/* Demand must reflect ground quality, not merely expanded seat supply. */
import { newGame } from "../engine";
import { facilityModifiers, recomputeDerived } from "../infrastructure";
import { unpricedDemand } from "../ticketForecast";

const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};
const base = newGame("Demand FC", "D. Auditor", "GROUND|DEMAND|1");
const original = unpricedDemand(base);

console.log("\n[GROUND DEMAND] Quality, capacity and bounds");
const improved = structuredClone(base);
for (const asset of improved.infrastructure.assets) {
  if (asset.type === "stand" || ["sanitary", "fanZone", "concessions", "hospitality"].includes(asset.id)) {
    asset.condition = Math.min(100, asset.condition + 20);
  }
}
recomputeDerived(improved);
assert(facilityModifiers(improved).supporterDemand > facilityModifiers(base).supporterDemand,
  "Improving supporter facilities did not increase the demand modifier");
assert(unpricedDemand(improved) > original,
  "Ground quality did not increase forecast attendance demand");
console.log("  ✓ improving stand and supporter-facility quality increases demand");

const expanded = structuredClone(base);
for (const asset of expanded.infrastructure.assets.filter((asset) => asset.type === "stand")) {
  asset.capacity += 2_000;
}
recomputeDerived(expanded);
assert(facilityModifiers(expanded).supporterDemand === facilityModifiers(base).supporterDemand,
  "Capacity expansion improperly creates supporter demand");
assert(unpricedDemand(expanded) === original,
  "Capacity expansion improperly inflates unpriced demand");
console.log("  ✓ adding seats alone does not manufacture supporters");

for (const condition of [0, 100]) {
  const extreme = structuredClone(base);
  for (const asset of extreme.infrastructure.assets) asset.condition = condition;
  recomputeDerived(extreme);
  const demand = facilityModifiers(extreme).supporterDemand;
  assert(demand >= 0.82 && demand <= 1.28, "Ground demand exceeds safe multiplier bounds");
}
console.log("  ✓ ground demand remains bounded");
