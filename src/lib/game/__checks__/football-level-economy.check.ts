import { profileForTier, revenueBaseline, weeklyWageFor } from "../economy.ts";
import {
  LEGACY_TIER_TO_FOOTBALL_LEVEL_OFFSET,
  footballLevelToLegacyTier,
  legacyTierToFootballLevel,
  type FootballLevel,
} from "../footballLevel.ts";
import {
  economicProfileForLevel,
  revenueBaselineForLevel,
  weeklyWageForLevel,
} from "../levelEconomy.ts";

if (LEGACY_TIER_TO_FOOTBALL_LEVEL_OFFSET !== 2) {
  throw new Error("Legacy tier bridge offset changed unexpectedly");
}

const expectedPairs: ReadonlyArray<readonly [number, FootballLevel]> = [
  [-1, 1],
  [0, 2],
  [1, 3],
  [2, 4],
  [3, 5],
  [4, 6],
];

for (const [tier, level] of expectedPairs) {
  if (legacyTierToFootballLevel(tier) !== level) {
    throw new Error(`Legacy tier ${tier} did not map to football level ${level}`);
  }
  if (footballLevelToLegacyTier(level) !== tier) {
    throw new Error(`Football level ${level} did not round-trip to legacy tier ${tier}`);
  }

  const legacyProfile = profileForTier(tier);
  const levelProfile = economicProfileForLevel(level);
  if (JSON.stringify(legacyProfile) !== JSON.stringify(levelProfile)) {
    throw new Error(`Football level ${level} changed the existing economic profile`);
  }

  const legacyWage = weeklyWageFor({
    ability: 67,
    tier,
    clubReputation: 54,
    age: 25,
    potential: 72,
  });
  const levelWage = weeklyWageForLevel({
    ability: 67,
    level,
    clubReputation: 54,
    age: 25,
    potential: 72,
  });
  if (legacyWage !== levelWage) {
    throw new Error(`Football level ${level} changed weekly wage calibration`);
  }

  const legacyRevenue = revenueBaseline(tier, 54, 23);
  const levelRevenue = revenueBaselineForLevel(level, 54, 23);
  if (JSON.stringify(legacyRevenue) !== JSON.stringify(levelRevenue)) {
    throw new Error(`Football level ${level} changed revenue calibration`);
  }
}

for (const badTier of [-2, 7]) {
  let threw = false;
  try {
    legacyTierToFootballLevel(badTier);
  } catch (error) {
    threw = error instanceof RangeError;
  }
  if (!threw) throw new Error(`Out-of-range legacy tier ${badTier} was accepted`);
}

console.log("✓ canonical football levels preserve legacy economic calibration");
