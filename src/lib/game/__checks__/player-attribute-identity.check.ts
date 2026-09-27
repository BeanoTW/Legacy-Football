import { strict as assert } from "node:assert";
import { playerAttributeIdentity } from "../playerAttributeIdentity";
import type { AttributeKnowledge } from "../scouting";

const known = (key: AttributeKnowledge["key"], label: string, exact: number): AttributeKnowledge => ({
  key,
  label,
  exact,
  known: true,
});

const hidden = (key: AttributeKnowledge["key"], label: string): AttributeKnowledge => ({
  key,
  label,
  known: false,
});

const winger = playerAttributeIdentity("RW", [
  known("pace", "Pace", 82),
  known("acceleration", "Acceleration", 84),
  known("dribbling", "Dribbling", 80),
  known("crossing", "Crossing", 68),
  known("vision", "Vision", 60),
  known("finishing", "Finishing", 62),
  known("composure", "Composure", 61),
]);
assert.equal(winger?.label, "Direct winger", "fast technical wide players should read as direct wingers");
assert.ok(winger?.strengths.includes("Acceleration"), "archetype should expose revealed top strengths");

const target = playerAttributeIdentity("ST", [
  known("strength", "Strength", 82),
  known("jumping", "Jumping", 84),
  known("firstTouch", "First touch", 76),
  known("finishing", "Finishing", 68),
  known("positioning", "Positioning", 66),
  known("composure", "Composure", 65),
]);
assert.equal(target?.label, "Target forward", "strong aerial strikers should read as target forwards");

const partial = playerAttributeIdentity("CAM", [
  known("vision", "Vision", 78),
  hidden("firstTouch", "First touch"),
  hidden("shortPassing", "Short passing"),
  known("dribbling", "Dribbling", 72),
]);
assert.equal(partial, null, "insufficiently scouted players must not receive an archetype from hidden attributes");

console.log("\nplayer-attribute-identity: passed");
