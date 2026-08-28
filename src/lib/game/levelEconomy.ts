import {
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

/**
 * Canonical football-level facade over the existing calibrated economy.
 *
 * During migration, the underlying numbers remain untouched so existing
 * careers do not experience a wage/revenue/valuation shock. New systems must
 * enter through this module using football levels 1-8. The legacy economy can
 * then be replaced profile-by-profile without changing callers again.
 */
export function economicProfileForLevel(level: FootballLevel): LeagueEconomicProfile {
  return profileForTier(footballLevelToLegacyTier(level));
}

export interface LevelWageInputs extends Omit<WageInputs, "tier"> {
  level: FootballLevel;
}

export function weeklyWageForLevel({ level, ...inputs }: LevelWageInputs): number {
  return weeklyWageFor({ ...inputs, tier: footballLevelToLegacyTier(level) });
}

export function revenueBaselineForLevel(
  level: FootballLevel,
  reputation = 50,
  homeMatches = 23,
): RevenueBaseline {
  return revenueBaseline(footballLevelToLegacyTier(level), reputation, homeMatches);
}

export function sustainableWeeklyWageBillForLevel(
  level: FootballLevel,
  reputation = 50,
  homeMatches = 23,
): number {
  return sustainableWeeklyWageBill(
    footballLevelToLegacyTier(level),
    reputation,
    homeMatches,
  );
}
