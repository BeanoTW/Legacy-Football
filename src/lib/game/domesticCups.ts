import type { FixtureCompetition } from "./types";

export interface DomesticCupDefinition {
  id: Extract<FixtureCompetition, "leagueCup" | "faCup">;
  name: string;
  /** Lowest pyramid tier admitted. FA-style cup deliberately reaches Level 7. */
  maxTier: number;
  /** Later rounds are worth progressively more; values are intentionally meaningful but not season-breaking early on. */
  prizeByRound: readonly number[];
  finalPrize: number;
}

export const DOMESTIC_CUPS: readonly DomesticCupDefinition[] = [
  {
    id: "leagueCup",
    name: "League Cup",
    maxTier: 4,
    prizeByRound: [5_000, 10_000, 20_000, 40_000, 80_000, 150_000],
    finalPrize: 300_000,
  },
  {
    id: "faCup",
    name: "National Cup",
    maxTier: 7,
    prizeByRound: [2_500, 5_000, 10_000, 20_000, 45_000, 90_000, 180_000, 400_000, 900_000],
    finalPrize: 2_000_000,
  },
] as const;

export function domesticCupsForTier(tier: number): readonly DomesticCupDefinition[] {
  return DOMESTIC_CUPS.filter((cup) => tier <= cup.maxTier);
}

/**
 * Higher-tier clubs enter the National Cup later. This preserves the route
 * from qualifying football to a genuine giant-killing draw without forcing
 * elite clubs through the earliest rounds.
 */
export function faCupEntryRound(tier: number): number {
  if (tier <= 2) return 4;
  if (tier <= 4) return 3;
  if (tier <= 6) return 2;
  return 1;
}

export function cupRoundPrize(cup: DomesticCupDefinition, round: number, isFinal = false): number {
  if (isFinal) return cup.finalPrize;
  return cup.prizeByRound[Math.max(0, Math.min(cup.prizeByRound.length - 1, round - 1))] ?? 0;
}
