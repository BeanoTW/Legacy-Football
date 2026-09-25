import type { GameState } from "./types";
import { clubDisplayName, isUserClubReference } from "./clubReference";
import { clubPresentationName } from "./clubPresentation";
import { clubReputation } from "./reputation";
import { footballLevelOfClub, footballLevelOfUser, type FootballLevel } from "./footballLevel";
import {
  economicProfileForLevel,
  revenueBaselineForLevel,
} from "./levelEconomy";

export interface ClubFinancialProfile {
  level: FootballLevel;
  annualRevenue: number;
  annualWageBudget: number;
  wageRevenueRatio: number;
  commercialRevenue: number;
  broadcastRevenue: number;
  matchdayRevenue: number;
  source: "authored-2026" | "derived";
}

type AuthoredFinanceSeed = {
  revenue: number;
  wageRatio: number;
  commercialShare?: number;
  broadcastShare?: number;
  matchdayShare?: number;
};

/**
 * Season-one Premier Division calibration.
 *
 * Manchester United is anchored directly to its FY2026 public results:
 * £677.6m revenue, split £317.3m commercial / £206.8m broadcast / £153.5m
 * matchday. Employee benefit expense was £302.0m; for gameplay we retain the
 * broader football wage budget concept using a conservative 55% revenue ratio.
 *
 * Other clubs are deliberately rounded calibration estimates informed by the
 * 2026 Deloitte league distribution and recent public accounts. They are not
 * presented to players as audited figures; they simply establish believable
 * relative economic power at career start.
 */
const PREMIER_FINANCE: Readonly<Record<string, AuthoredFinanceSeed>> = {
  "Arsenol": { revenue: 690_000_000, wageRatio: 0.58 },
  "Monchester City": { revenue: 720_000_000, wageRatio: 0.61 },
  "Liverpoul": { revenue: 715_000_000, wageRatio: 0.56 },
  "Monchester United": {
    revenue: 677_600_000,
    wageRatio: 0.55,
    commercialShare: 317.3 / 677.6,
    broadcastShare: 206.8 / 677.6,
    matchdayShare: 153.5 / 677.6,
  },
  "Chelsey": { revenue: 560_000_000, wageRatio: 0.69 },
  "Tottenham Hotspurs": { revenue: 535_000_000, wageRatio: 0.52 },
  "Newcastle City": { revenue: 360_000_000, wageRatio: 0.66 },
  "Aston Viller": { revenue: 325_000_000, wageRatio: 0.69 },
  "Westham United": { revenue: 300_000_000, wageRatio: 0.62 },
  "Brighton & Hove Athletic": { revenue: 255_000_000, wageRatio: 0.56 },
  "Nottingham Wood": { revenue: 245_000_000, wageRatio: 0.70 },
  "Crystal Palais": { revenue: 230_000_000, wageRatio: 0.61 },
  "Evertoon": { revenue: 225_000_000, wageRatio: 0.66 },
  "Fulhem": { revenue: 220_000_000, wageRatio: 0.60 },
  "Brentford City": { revenue: 205_000_000, wageRatio: 0.55 },
  "AFC Bournemuth": { revenue: 190_000_000, wageRatio: 0.60 },
  "Leeds City": { revenue: 185_000_000, wageRatio: 0.67 },
  "Sunderland Town": { revenue: 175_000_000, wageRatio: 0.68 },
  "Ipswich City": { revenue: 165_000_000, wageRatio: 0.66 },
  "Hull United": { revenue: 155_000_000, wageRatio: 0.68 },
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function derivedProfile(
  level: FootballLevel,
  reputation: number,
  homeMatches: number,
): ClubFinancialProfile {
  const baseline = revenueBaselineForLevel(level, reputation, homeMatches);
  const economy = economicProfileForLevel(level);
  const ratio = economy.expectedWageRevenueRatio;
  return {
    level,
    annualRevenue: baseline.totalSeason,
    annualWageBudget: Math.round(baseline.totalSeason * ratio),
    wageRevenueRatio: ratio,
    commercialRevenue: baseline.commercialSeason,
    broadcastRevenue: baseline.broadcastSeason,
    matchdayRevenue: baseline.matchdaySeason,
    source: "derived",
  };
}

export function clubFinancialProfile(
  state: GameState,
  clubRef: string,
  homeMatches = 19,
): ClubFinancialProfile {
  const level = isUserClubReference(state, clubRef)
    ? footballLevelOfUser(state)
    : footballLevelOfClub(state, clubRef);
  const reputation = clubReputation(state, clubRef);

  if (level !== 1 || isUserClubReference(state, clubRef)) {
    return derivedProfile(level, reputation, homeMatches);
  }

  const presentationName = clubPresentationName(clubDisplayName(state, clubRef));
  const authored = PREMIER_FINANCE[presentationName];
  if (!authored) return derivedProfile(level, reputation, homeMatches);

  const commercialShare = authored.commercialShare ?? 0.34;
  const broadcastShare = authored.broadcastShare ?? 0.47;
  const matchdayShare = authored.matchdayShare ?? Math.max(0, 1 - commercialShare - broadcastShare);
  const totalShare = commercialShare + broadcastShare + matchdayShare;
  const annualRevenue = authored.revenue;
  const wageRevenueRatio = clamp(authored.wageRatio, 0.35, 0.9);

  return {
    level,
    annualRevenue,
    annualWageBudget: Math.round(annualRevenue * wageRevenueRatio),
    wageRevenueRatio,
    commercialRevenue: Math.round(annualRevenue * commercialShare / totalShare),
    broadcastRevenue: Math.round(annualRevenue * broadcastShare / totalShare),
    matchdayRevenue: Math.round(annualRevenue * matchdayShare / totalShare),
    source: "authored-2026",
  };
}

export function clubFinancialWeeklyWageBudget(
  state: GameState,
  clubRef: string,
  homeMatches = 19,
): number {
  return Math.round(clubFinancialProfile(state, clubRef, homeMatches).annualWageBudget / 52);
}

export function clubFinancialBand(state: GameState, clubRef: string): number {
  const revenue = clubFinancialProfile(state, clubRef).annualRevenue;
  if (revenue >= 600_000_000) return 5;
  if (revenue >= 350_000_000) return 4;
  if (revenue >= 180_000_000) return 3;
  if (revenue >= 50_000_000) return 2;
  return 1;
}
