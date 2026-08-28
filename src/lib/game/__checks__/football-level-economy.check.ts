import { profileForTier, revenueBaseline, weeklyWageFor } from "../economy.ts";
import {
  LEGACY_TIER_TO_FOOTBALL_LEVEL_OFFSET,
  footballLevelToLegacyTier,
  legacyTierToFootballLevel,
  type FootballLevel,
} from "../footballLevel.ts";
import {
  contractWageForLevel,
  economicProfileForLevel,
  playerValueForLevel,
  revenueBaselineForLevel,
  sustainableWeeklyWageBillForLevel,
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

function legacyPlayerValue(ability: number, potential: number, age: number, tier: number): number {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const peak = clamp(1.25 - Math.abs(age - 25) * 0.045, 0.35, 1.25);
  const upside = 1 + Math.max(0, potential - ability) / 90;
  const scale = profileForTier(tier).transferMarketScale;
  const raw = ability ** 3 * 0.55 * peak * upside * scale;
  return Math.max(10_000, Math.round(raw / 5_000) * 5_000);
}

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

  const legacyValue = legacyPlayerValue(67, 72, 25, tier);
  const levelValue = playerValueForLevel(67, 72, 25, level);
  if (legacyValue !== levelValue) {
    throw new Error(`Football level ${level} changed player valuation calibration`);
  }

  const legacyRevenue = revenueBaseline(tier, 54, 23);
  const levelRevenue = revenueBaselineForLevel(level, 54, 23);
  if (JSON.stringify(legacyRevenue) !== JSON.stringify(levelRevenue)) {
    throw new Error(`Football level ${level} changed revenue calibration`);
  }

  const baseContractWage = 137;
  const contractScalar = 1.08;
  const legacyContractWage = Math.max(
    200,
    Math.round((baseContractWage * contractScalar) / 25) * 25,
  );
  const levelContractWage = contractWageForLevel(baseContractWage, contractScalar, level);
  if (legacyContractWage !== levelContractWage) {
    throw new Error(`Football level ${level} changed historic opening-contract wage policy`);
  }
}

const level7 = economicProfileForLevel(7);
const level8 = economicProfileForLevel(8);
if (level7.label !== "Regional Premier" || level8.label !== "Regional Division One") {
  throw new Error("Native level 7-8 economy labels are missing");
}
if (level7.typicalAttendance <= level8.typicalAttendance) {
  throw new Error("Level 7 attendance should exceed level 8 attendance");
}
if (level7.wageMultiplier <= level8.wageMultiplier) {
  throw new Error("Level 7 wage pressure should exceed level 8 wage pressure");
}
if (level7.transferMarketScale <= level8.transferMarketScale) {
  throw new Error("Level 7 transfer market should exceed level 8 transfer market");
}

const lowerWage7 = weeklyWageForLevel({ ability: 52, level: 7, clubReputation: 45, age: 25 });
const lowerWage8 = weeklyWageForLevel({ ability: 52, level: 8, clubReputation: 45, age: 25 });
if (!(lowerWage7 > lowerWage8 && lowerWage8 >= 25)) {
  throw new Error(`Unexpected lower-league wages: level 7 £${lowerWage7}, level 8 £${lowerWage8}`);
}

const lowerContractWage7 = contractWageForLevel(110, 1.05, 7);
const lowerContractWage8 = contractWageForLevel(70, 1.05, 8);
if (!(lowerContractWage7 > lowerContractWage8 && lowerContractWage8 >= 25)) {
  throw new Error(
    `Unexpected lower-level contract wages: level 7 £${lowerContractWage7}, level 8 £${lowerContractWage8}`,
  );
}
if (lowerContractWage7 >= 200 || lowerContractWage8 >= 200) {
  throw new Error("Semi-professional contract policy is still pinned to the historic £200 floor");
}

const lowerValue7 = playerValueForLevel(52, 58, 24, 7);
const lowerValue8 = playerValueForLevel(52, 58, 24, 8);
if (!(lowerValue7 >= lowerValue8 && lowerValue8 >= 10_000)) {
  throw new Error(`Unexpected lower-league values: level 7 £${lowerValue7}, level 8 £${lowerValue8}`);
}

const lowerRevenue7 = revenueBaselineForLevel(7, 50, 23).totalSeason;
const lowerRevenue8 = revenueBaselineForLevel(8, 50, 23).totalSeason;
if (lowerRevenue7 <= lowerRevenue8) {
  throw new Error("Level 7 revenue baseline should exceed level 8");
}

const wageBudget7 = sustainableWeeklyWageBillForLevel(7, 50, 23);
const wageBudget8 = sustainableWeeklyWageBillForLevel(8, 50, 23);
if (!(wageBudget7 > wageBudget8 && wageBudget8 > 0)) {
  throw new Error("Native lower-level sustainable wage budgets are not ordered correctly");
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

console.log(
  "✓ canonical football levels preserve legacy wages, values and revenues with native levels 7-8",
);
