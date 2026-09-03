/* =========================================================================
   Real-world football economy calibration.

   Single source of truth for what money LOOKS LIKE at each level of the
   pyramid: wages, attendances, ticket prices, broadcast and central
   distributions, commercial baselines, prize money and cost factors.

   Nothing in here holds state. Every value is derived from a league tier
   plus (optionally) the club's standing inside that tier, so promotion and
   relegation move a club's whole economy without any special-casing.

   Tier map (English pyramid analogues):
     -1  Premier Division   (top flight)
      0  Championship
      1  Division One       (League One analogue) — the player's start tier
      2  Division Two       (League Two analogue)
      3  Regional/National  (semi-professional)
========================================================================= */
import type { GameState } from "./types";
import { isUserClubReference } from "./clubReference";

const int = (n: number) => Math.round(n);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const SEASON_MATCH_WEEKS = 46;

export interface WageBands {
  /** £/week ranges a club at this level pays each squad stratum. */
  fringe: [number, number];
  rotation: [number, number];
  firstTeam: [number, number];
  key: [number, number];
  star: [number, number];
}

export interface LeagueEconomicProfile {
  tier: number;
  label: string;
  /** Plausible annual club turnover range at this level, £. */
  typicalRevenue: [number, number];
  /** Central broadcast + solidarity payments, £/season/club. */
  broadcastSeason: number;
  /** Baseline annual commercial income (sponsorship + retail) for an average club. */
  commercialBaseline: number;
  /** Baseline average home league attendance for an average club at this level. */
  typicalAttendance: number;
  /** Reference general-admission ticket price, £. */
  ticketPriceReference: number;
  /** Multiplier applied to the ability wage curve. Drives the whole wage economy. */
  wageMultiplier: number;
  wageBands: WageBands;
  /** Cost factors relative to Division One (= 1.0). */
  staffCostFactor: number;
  matchdayCostFactor: number;
  infrastructureCostFactor: number;
  /** Sustainable wages-to-revenue ratio at this level (0-1). */
  expectedWageRevenueRatio: number;
  /** Transfer fee scale relative to Division One (= 1.0). */
  transferMarketScale: number;
  prize: {
    basePayment: number;
    positionStep: number;
    championBonus: number;
    promotionBonus: number;
    relegationCushion: number;
  };
}

/* ---------------------------------------------------------------------
   Wage curve. One exponential in ability, one multiplier per tier.
   The shape is deliberately non-linear: an 85 costs many multiples of a 65.
--------------------------------------------------------------------- */

/** Dimensionless ability cost index. 40 => 100, 60 => ~448, 80 => ~2009. */
export function abilityWageIndex(ability: number): number {
  return 100 * Math.exp(0.075 * (clamp(ability, 20, 99) - 40));
}

const TIER_PROFILES: Record<number, LeagueEconomicProfile> = {
  [-1]: {
    tier: -1,
    label: "Premier Division",
    typicalRevenue: [120_000_000, 650_000_000],
    broadcastSeason: 110_000_000,
    commercialBaseline: 55_000_000,
    typicalAttendance: 38_000,
    ticketPriceReference: 38,
    wageMultiplier: 54,
    wageBands: {
      fringe: [7_200, 18_000],
      rotation: [18_000, 42_000],
      firstTeam: [36_000, 78_000],
      key: [66_000, 150_000],
      star: [120_000, 300_000],
    },
    staffCostFactor: 6.5,
    matchdayCostFactor: 5.5,
    infrastructureCostFactor: 5,
    expectedWageRevenueRatio: 0.7,
    transferMarketScale: 40,
    prize: {
      basePayment: 22_000_000,
      positionStep: 2_400_000,
      championBonus: 8_000_000,
      promotionBonus: 0,
      relegationCushion: 40_000_000,
    },
  },
  0: {
    tier: 0,
    label: "Championship",
    typicalRevenue: [18_000_000, 60_000_000],
    broadcastSeason: 8_000_000,
    commercialBaseline: 7_500_000,
    typicalAttendance: 19_000,
    ticketPriceReference: 26,
    wageMultiplier: 13,
    wageBands: {
      fringe: [1_500, 3_600],
      rotation: [3_600, 8_400],
      firstTeam: [7_200, 15_600],
      key: [13_200, 27_000],
      star: [24_000, 54_000],
    },
    staffCostFactor: 2.4,
    matchdayCostFactor: 2.4,
    infrastructureCostFactor: 2.2,
    expectedWageRevenueRatio: 0.85,
    transferMarketScale: 8,
    prize: {
      basePayment: 2_400_000,
      positionStep: 180_000,
      championBonus: 1_200_000,
      promotionBonus: 6_000_000,
      relegationCushion: 0,
    },
  },
  1: {
    tier: 1,
    label: "Division One",
    typicalRevenue: [5_500_000, 14_000_000],
    broadcastSeason: 1_500_000,
    commercialBaseline: 1_700_000,
    typicalAttendance: 8_500,
    ticketPriceReference: 20,
    wageMultiplier: 4.2,
    wageBands: {
      fringe: [300, 850],
      rotation: [850, 1_800],
      firstTeam: [1_700, 3_600],
      key: [3_300, 6_600],
      star: [6_000, 13_200],
    },
    staffCostFactor: 1,
    matchdayCostFactor: 1,
    infrastructureCostFactor: 1,
    expectedWageRevenueRatio: 0.6,
    transferMarketScale: 1,
    prize: {
      basePayment: 420_000,
      positionStep: 26_000,
      championBonus: 300_000,
      promotionBonus: 900_000,
      relegationCushion: 0,
    },
  },
  2: {
    tier: 2,
    label: "Division Two",
    typicalRevenue: [3_000_000, 8_000_000],
    broadcastSeason: 1_100_000,
    commercialBaseline: 900_000,
    typicalAttendance: 4_600,
    ticketPriceReference: 18,
    wageMultiplier: 2.4,
    wageBands: {
      fringe: [200, 500],
      rotation: [500, 1_000],
      firstTeam: [950, 1_900],
      key: [1_800, 3_600],
      star: [3_300, 7_200],
    },
    staffCostFactor: 0.65,
    matchdayCostFactor: 0.62,
    infrastructureCostFactor: 0.7,
    expectedWageRevenueRatio: 0.55,
    transferMarketScale: 0.45,
    prize: {
      basePayment: 260_000,
      positionStep: 15_000,
      championBonus: 200_000,
      promotionBonus: 500_000,
      relegationCushion: 0,
    },
  },
  3: {
    tier: 3,
    label: "National Division",
    typicalRevenue: [900_000, 3_000_000],
    broadcastSeason: 260_000,
    commercialBaseline: 320_000,
    typicalAttendance: 2_100,
    ticketPriceReference: 14,
    wageMultiplier: 1.15,
    wageBands: {
      fringe: [100, 250],
      rotation: [200, 500],
      firstTeam: [400, 900],
      key: [850, 1_700],
      star: [1_500, 3_000],
    },
    staffCostFactor: 0.35,
    matchdayCostFactor: 0.35,
    infrastructureCostFactor: 0.42,
    expectedWageRevenueRatio: 0.5,
    transferMarketScale: 0.12,
    prize: {
      basePayment: 90_000,
      positionStep: 5_000,
      championBonus: 70_000,
      promotionBonus: 200_000,
      relegationCushion: 0,
    },
  },
};

const scaleProfile = (
  p: LeagueEconomicProfile,
  tier: number,
  k: number,
): LeagueEconomicProfile => ({
  ...p,
  tier,
  label: `Tier ${tier}`,
  typicalRevenue: [int(p.typicalRevenue[0] * k), int(p.typicalRevenue[1] * k)],
  broadcastSeason: int(p.broadcastSeason * k),
  commercialBaseline: int(p.commercialBaseline * k),
  typicalAttendance: Math.max(300, int(p.typicalAttendance * Math.sqrt(k))),
  ticketPriceReference: Math.max(6, int(p.ticketPriceReference * Math.pow(k, 0.35))),
  wageMultiplier: Math.max(0.6, p.wageMultiplier * k),
  staffCostFactor: p.staffCostFactor * k,
  matchdayCostFactor: p.matchdayCostFactor * k,
  infrastructureCostFactor: p.infrastructureCostFactor * Math.pow(k, 0.7),
  transferMarketScale: p.transferMarketScale * k,
  prize: {
    basePayment: int(p.prize.basePayment * k),
    positionStep: int(p.prize.positionStep * k),
    championBonus: int(p.prize.championBonus * k),
    promotionBonus: int(p.prize.promotionBonus * k),
    relegationCushion: int(p.prize.relegationCushion * k),
  },
});

/** Economic profile for any tier. Unknown tiers extrapolate off the ends. */
export function profileForTier(tier: number): LeagueEconomicProfile {
  const t = Math.round(tier);
  const known = TIER_PROFILES[t];
  if (known) return known;
  if (t < -1) return scaleProfile(TIER_PROFILES[-1], t, Math.pow(1.6, -1 - t));
  return scaleProfile(TIER_PROFILES[3], t, Math.pow(0.45, t - 3));
}

export const KNOWN_TIERS = Object.keys(TIER_PROFILES)
  .map(Number)
  .sort((a, b) => a - b);

/* ---------------------------------------------------------------------
   Tier resolution from state
--------------------------------------------------------------------- */

export function tierOfClub(s: GameState, clubId: string): number {
  const l = (s.leagues ?? []).find((x) => x.clubIds?.includes(clubId));
  return l?.tier ?? 1;
}

export function tierOfUser(s: GameState): number {
  const l =
    (s.leagues ?? []).find((x) => x.id === s.playerLeagueId) ??
    (s.leagues ?? []).find((x) => x.clubIds?.some((club) => isUserClubReference(s, club)));
  return l?.tier ?? 1;
}

export const profileFor = (s: GameState): LeagueEconomicProfile => profileForTier(tierOfUser(s));
export const profileForClub = (s: GameState, clubId: string): LeagueEconomicProfile =>
  profileForTier(tierOfClub(s, clubId));

/**
 * How big a club is relative to the average club at its own level.
 * Reputation 50 is the tier average; the spread is deliberately wide because
 * big clubs in small leagues are a real and important phenomenon.
 */
export function clubSizeFactor(reputation: number): number {
  return clamp(0.45 + (clamp(reputation, 1, 99) / 50) * 0.55, 0.45, 1.9);
}

/* ---------------------------------------------------------------------
   Wages
--------------------------------------------------------------------- */

export interface WageInputs {
  ability: number;
  tier: number;
  /** Club reputation 0-100. Bigger clubs pay above the level's average. */
  clubReputation?: number;
  age?: number;
  potential?: number;
}

/**
 * Canonical £/week a player of a given ability commands at a given level.
 * Everything else in the game (renewals, transfers, AI clubs) routes here.
 */
export function weeklyWageFor({
  ability,
  tier,
  clubReputation = 50,
  age,
  potential,
}: WageInputs): number {
  const p = profileForTier(tier);
  const size = 0.78 + clubSizeFactor(clubReputation) * 0.26; // ~0.9 - 1.27
  let w = abilityWageIndex(ability) * p.wageMultiplier * size;

  if (typeof age === "number") {
    // Peak-earning years pay most; teenagers and veterans cost less.
    const ageFactor =
      age < 21 ? 0.6 + (age - 16) * 0.06 : age > 32 ? Math.max(0.6, 1 - (age - 32) * 0.08) : 1;
    w *= ageFactor;
  }
  if (typeof potential === "number" && potential > ability) {
    w *= 1 + Math.min(0.18, (potential - ability) / 120);
  }
  const step = w < 2_000 ? 25 : w < 20_000 ? 100 : 500;
  return Math.max(200, int(w / step) * step);
}

/** Which wage band a weekly wage sits in for the given level. */
export function wageBandOf(tier: number, weekly: number): keyof WageBands | "aboveScale" {
  const b = profileForTier(tier).wageBands;
  const order: (keyof WageBands)[] = ["fringe", "rotation", "firstTeam", "key", "star"];
  for (const k of order) if (weekly <= b[k][1]) return k;
  return "aboveScale";
}

/* ---------------------------------------------------------------------
   Revenue baselines — what an average club at this level should earn
--------------------------------------------------------------------- */

export interface RevenueBaseline {
  matchdaySeason: number;
  broadcastSeason: number;
  commercialSeason: number;
  totalSeason: number;
  weeklyCommercial: number;
  weeklyBroadcast: number;
}

export function revenueBaseline(tier: number, reputation = 50, homeMatches = 23): RevenueBaseline {
  const p = profileForTier(tier);
  const size = clubSizeFactor(reputation);
  const attendance = p.typicalAttendance * size;
  // Gate plus ancillary spend per head (food, retail, hospitality, parking).
  const perHead = p.ticketPriceReference * 1.32;
  const matchdaySeason = int(attendance * perHead * homeMatches);
  const broadcastSeason = int(p.broadcastSeason * (0.85 + size * 0.15));
  const commercialSeason = int(p.commercialBaseline * size);
  return {
    matchdaySeason,
    broadcastSeason,
    commercialSeason,
    totalSeason: matchdaySeason + broadcastSeason + commercialSeason,
    weeklyCommercial: int(commercialSeason / SEASON_MATCH_WEEKS),
    weeklyBroadcast: int(broadcastSeason / SEASON_MATCH_WEEKS),
  };
}

/** Sustainable weekly wage bill (players + staff) for a club at this level. */
export function sustainableWeeklyWageBill(tier: number, reputation = 50): number {
  const p = profileForTier(tier);
  const rev = revenueBaseline(tier, reputation);
  return int((rev.totalSeason * p.expectedWageRevenueRatio) / SEASON_MATCH_WEEKS);
}

/* ---------------------------------------------------------------------
   Squad wage structure — a derived, read-only view for UI and checks
--------------------------------------------------------------------- */

export interface WageStructure {
  count: number;
  totalWeekly: number;
  averageWeekly: number;
  medianWeekly: number;
  highestWeekly: number;
  lowestWeekly: number;
  topFiveSharePct: number;
  /** Highest wage divided by the median. A healthy squad sits around 3-6. */
  compression: number;
  bands: Record<keyof WageBands | "aboveScale", number>;
}

export function wageStructureFrom(weeklyWages: number[], tier: number): WageStructure {
  const w = [...weeklyWages].filter((x) => x > 0).sort((a, b) => b - a);
  const bands: WageStructure["bands"] = {
    fringe: 0,
    rotation: 0,
    firstTeam: 0,
    key: 0,
    star: 0,
    aboveScale: 0,
  };
  for (const x of w) bands[wageBandOf(tier, x)]++;
  if (!w.length) {
    return {
      count: 0,
      totalWeekly: 0,
      averageWeekly: 0,
      medianWeekly: 0,
      highestWeekly: 0,
      lowestWeekly: 0,
      topFiveSharePct: 0,
      compression: 0,
      bands,
    };
  }
  const total = w.reduce((a, b) => a + b, 0);
  const median = w[Math.floor(w.length / 2)];
  const topFive = w.slice(0, 5).reduce((a, b) => a + b, 0);
  return {
    count: w.length,
    totalWeekly: int(total),
    averageWeekly: int(total / w.length),
    medianWeekly: int(median),
    highestWeekly: w[0],
    lowestWeekly: w[w.length - 1],
    topFiveSharePct: (topFive / total) * 100,
    compression: median > 0 ? w[0] / median : 0,
    bands,
  };
}
