import {
  SEASON_MATCH_WEEKS,
  abilityWageIndex,
  clubSizeFactor,
  profileForTier,
  revenueBaseline,
  sustainableWeeklyWageBill,
  weeklyWageFor,
  type LeagueEconomicProfile,
  type RevenueBaseline,
  type WageInputs,
} from "./economy";
import { footballLevelToLegacyTier, type FootballLevel } from "./footballLevel";

const int = (n: number) => Math.round(n);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Native profiles only exist where the old economy had no calibrated analogue.
 * Levels 1-6 deliberately continue through the legacy bridge until migration is
 * complete, preserving every existing career's numbers exactly.
 */
const NATIVE_LOWER_LEVEL_PROFILES: Partial<Record<FootballLevel, LeagueEconomicProfile>> = {
  7: {
    tier: 5,
    label: "Regional Premier",
    typicalRevenue: [350_000, 1_400_000],
    broadcastSeason: 45_000,
    commercialBaseline: 130_000,
    typicalAttendance: 850,
    ticketPriceReference: 11,
    wageMultiplier: 0.58,
    wageBands: {
      fringe: [50, 120],
      rotation: [100, 220],
      firstTeam: [180, 380],
      key: [320, 650],
      star: [550, 1_100],
    },
    staffCostFactor: 0.19,
    matchdayCostFactor: 0.2,
    infrastructureCostFactor: 0.25,
    expectedWageRevenueRatio: 0.44,
    transferMarketScale: 0.035,
    prize: {
      basePayment: 26_000,
      positionStep: 1_300,
      championBonus: 18_000,
      promotionBonus: 65_000,
      relegationCushion: 0,
    },
  },
  8: {
    tier: 6,
    label: "Regional Division One",
    typicalRevenue: [180_000, 750_000],
    broadcastSeason: 18_000,
    commercialBaseline: 70_000,
    typicalAttendance: 420,
    ticketPriceReference: 9,
    wageMultiplier: 0.34,
    wageBands: {
      fringe: [25, 80],
      rotation: [60, 150],
      firstTeam: [120, 260],
      key: [220, 450],
      star: [380, 800],
    },
    staffCostFactor: 0.12,
    matchdayCostFactor: 0.13,
    infrastructureCostFactor: 0.17,
    expectedWageRevenueRatio: 0.4,
    transferMarketScale: 0.015,
    prize: {
      basePayment: 12_000,
      positionStep: 650,
      championBonus: 9_000,
      promotionBonus: 35_000,
      relegationCushion: 0,
    },
  },
};

export function economicProfileForLevel(level: FootballLevel): LeagueEconomicProfile {
  return NATIVE_LOWER_LEVEL_PROFILES[level] ?? profileForTier(footballLevelToLegacyTier(level));
}

export interface LevelWageInputs extends Omit<WageInputs, "tier"> {
  level: FootballLevel;
}

function nativeWeeklyWage({
  ability,
  level,
  clubReputation = 50,
  age,
  potential,
}: LevelWageInputs): number {
  const profile = economicProfileForLevel(level);
  const size = 0.78 + clubSizeFactor(clubReputation) * 0.26;
  let wage = abilityWageIndex(ability) * profile.wageMultiplier * size;
  if (typeof age === "number") {
    const ageFactor =
      age < 21 ? 0.6 + (age - 16) * 0.06 : age > 32 ? Math.max(0.6, 1 - (age - 32) * 0.08) : 1;
    wage *= ageFactor;
  }
  if (typeof potential === "number" && potential > ability) {
    wage *= 1 + Math.min(0.18, (potential - ability) / 120);
  }
  const step = wage < 500 ? 10 : wage < 2_000 ? 25 : 100;
  return Math.max(25, int(wage / step) * step);
}

export function weeklyWageForLevel(inputs: LevelWageInputs): number {
  if (inputs.level >= 7) return nativeWeeklyWage(inputs);
  const { level, ...legacyInputs } = inputs;
  return weeklyWageFor({ ...legacyInputs, tier: footballLevelToLegacyTier(level) });
}

export function contractWageForLevel(
  baseWeeklyWage: number,
  scalar: number,
  level: FootballLevel,
): number {
  const raw = Math.max(0, baseWeeklyWage * scalar);
  if (level <= 6) return Math.max(200, int(raw / 25) * 25);
  const step = raw < 500 ? 10 : 25;
  return Math.max(25, int(raw / step) * step);
}

/**
 * Normalises a wage produced during player talks or renewal negotiations.
 * Levels 1-6 exactly preserve recruitment's historic £250 floor and £25
 * increments. Levels 7-8 use semi-professional £25 floors with £10 increments
 * below £500 so negotiation does not erase the lower-level wage curve.
 */
export function negotiationWageForLevel(rawWeeklyWage: number, level: FootballLevel): number {
  const raw = Math.max(0, rawWeeklyWage);
  if (level <= 6) return Math.max(250, int(raw / 25) * 25);
  const step = raw < 500 ? 10 : 25;
  return Math.max(25, int(raw / step) * step);
}

export interface TransferFeePolicy {
  valueFloor: number;
  valueStep: number;
  askingFloor: number;
  feeStep: number;
}

/**
 * Levels 1-6 retain recruitment's historic transfer granularity exactly.
 * Native semi-professional levels use nominal four-figure values and smaller
 * fee increments so their market does not masquerade as a professional one.
 */
export function transferFeePolicyForLevel(level: FootballLevel): TransferFeePolicy {
  if (level <= 6) {
    return { valueFloor: 10_000, valueStep: 5_000, askingFloor: 20_000, feeStep: 5_000 };
  }
  if (level === 7) {
    return { valueFloor: 1_000, valueStep: 500, askingFloor: 1_000, feeStep: 500 };
  }
  return { valueFloor: 500, valueStep: 250, askingFloor: 500, feeStep: 250 };
}

export function normaliseTransferFeeForLevel(
  rawFee: number,
  level: FootballLevel,
  floor: "none" | "asking" = "none",
): number {
  const policy = transferFeePolicyForLevel(level);
  const minimum = floor === "asking" ? policy.askingFloor : 0;
  return Math.max(minimum, int(Math.max(0, rawFee) / policy.feeStep) * policy.feeStep);
}

export function playerValueForLevel(
  ability: number,
  potential: number,
  age: number,
  level: FootballLevel,
): number {
  const peak = clamp(1.25 - Math.abs(age - 25) * 0.045, 0.35, 1.25);
  const upside = 1 + Math.max(0, potential - ability) / 90;
  const scale = economicProfileForLevel(level).transferMarketScale;
  const raw = ability ** 3 * 0.55 * peak * upside * scale;
  const policy = transferFeePolicyForLevel(level);
  return Math.max(policy.valueFloor, int(raw / policy.valueStep) * policy.valueStep);
}

export function revenueBaselineForLevel(
  level: FootballLevel,
  reputation = 50,
  homeMatches = 23,
): RevenueBaseline {
  if (level <= 6) return revenueBaseline(footballLevelToLegacyTier(level), reputation, homeMatches);
  const profile = economicProfileForLevel(level);
  const size = clubSizeFactor(reputation);
  const attendance = profile.typicalAttendance * size;
  const perHead = profile.ticketPriceReference * 1.32;
  const matchdaySeason = int(attendance * perHead * homeMatches);
  const broadcastSeason = int(profile.broadcastSeason * (0.85 + size * 0.15));
  const commercialSeason = int(profile.commercialBaseline * size);
  return {
    matchdaySeason,
    broadcastSeason,
    commercialSeason,
    totalSeason: matchdaySeason + broadcastSeason + commercialSeason,
    weeklyCommercial: int(commercialSeason / SEASON_MATCH_WEEKS),
    weeklyBroadcast: int(broadcastSeason / SEASON_MATCH_WEEKS),
  };
}

export function sustainableWeeklyWageBillForLevel(
  level: FootballLevel,
  reputation = 50,
  homeMatches = 23,
): number {
  if (level <= 6) return sustainableWeeklyWageBill(footballLevelToLegacyTier(level), reputation);
  const profile = economicProfileForLevel(level);
  const revenue = revenueBaselineForLevel(level, reputation, homeMatches);
  return int((revenue.totalSeason * profile.expectedWageRevenueRatio) / SEASON_MATCH_WEEKS);
}
