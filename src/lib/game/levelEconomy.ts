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
import {
  footballLevelToLegacyTier,
  type FootballLevel,
} from "./footballLevel";

const int = (n: number) => Math.round(n);

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

/**
 * Canonical football-level facade over the economy.
 *
 * Levels 1-6 route through the old calibrated tier model using the explicit
 * fixed-offset bridge. Levels 7-8 are native because no historic save could
 * have occupied them and therefore no backwards-compatibility number exists.
 */
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

export function revenueBaselineForLevel(
  level: FootballLevel,
  reputation = 50,
  homeMatches = 23,
): RevenueBaseline {
  if (level <= 6) {
    return revenueBaseline(footballLevelToLegacyTier(level), reputation, homeMatches);
  }

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
  if (level <= 6) {
    return sustainableWeeklyWageBill(footballLevelToLegacyTier(level), reputation);
  }

  const profile = economicProfileForLevel(level);
  const revenue = revenueBaselineForLevel(level, reputation, homeMatches);
  return int((revenue.totalSeason * profile.expectedWageRevenueRatio) / SEASON_MATCH_WEEKS);
}
