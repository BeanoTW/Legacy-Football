import { negotiationWageForLevel } from "../levelEconomy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

for (const level of [1, 2, 3, 4, 5, 6] as const) {
  const raw = 287;
  const expectedLegacy = Math.max(250, Math.round(raw / 25) * 25);
  assert(
    negotiationWageForLevel(raw, level) === expectedLegacy,
    `level ${level} negotiation wage must preserve legacy £250/£25 policy`,
  );
}

assert(
  negotiationWageForLevel(137, 7) === 140,
  "level 7 negotiation wages should use £10 increments below £500",
);
assert(
  negotiationWageForLevel(72, 8) === 70,
  "level 8 negotiation wages should use £10 increments below £500",
);
assert(
  negotiationWageForLevel(12, 8) === 25,
  "level 8 negotiation wages should retain a £25 floor",
);
assert(
  negotiationWageForLevel(137, 7) < 250 && negotiationWageForLevel(72, 8) < 250,
  "semi-professional negotiation wages must be allowed below the old professional floor",
);

console.log("✓ negotiation wages preserve levels 1-6 and support semi-pro levels 7-8");
