import type { FixtureCompetition } from "./types";
import { hashString, mulberry32 } from "./rng";

export interface CupRoundSlot {
  competition: Extract<FixtureCompetition, "leagueCup" | "faCup">;
  round: number;
  week: number;
  dayOfWeek: number;
  label: string;
}

/**
 * Domestic cups occupy explicit midweek/weekend slots around the league
 * backbone. Progression only activates a club's next slot after it qualifies.
 */
export const DOMESTIC_CUP_SLOTS: readonly CupRoundSlot[] = [
  { competition: "leagueCup", round: 1, week: 7, dayOfWeek: 1, label: "League Cup R1" },
  { competition: "faCup", round: 1, week: 9, dayOfWeek: 5, label: "National Cup R1" },
  { competition: "leagueCup", round: 2, week: 11, dayOfWeek: 1, label: "League Cup R2" },
  { competition: "faCup", round: 2, week: 14, dayOfWeek: 5, label: "National Cup R2" },
  { competition: "leagueCup", round: 3, week: 16, dayOfWeek: 1, label: "League Cup R3" },
  { competition: "faCup", round: 3, week: 19, dayOfWeek: 5, label: "National Cup R3" },
  { competition: "leagueCup", round: 4, week: 21, dayOfWeek: 1, label: "League Cup QF" },
  { competition: "faCup", round: 4, week: 24, dayOfWeek: 5, label: "National Cup R4" },
  { competition: "leagueCup", round: 5, week: 26, dayOfWeek: 1, label: "League Cup SF" },
  { competition: "faCup", round: 5, week: 29, dayOfWeek: 5, label: "National Cup R5" },
  { competition: "leagueCup", round: 6, week: 32, dayOfWeek: 5, label: "League Cup Final" },
  { competition: "faCup", round: 6, week: 33, dayOfWeek: 5, label: "National Cup QF" },
  { competition: "faCup", round: 7, week: 38, dayOfWeek: 5, label: "National Cup SF" },
  { competition: "faCup", round: 8, week: 44, dayOfWeek: 5, label: "National Cup Final" },
] as const;

export interface CupTie {
  home: string;
  away: string;
}

export function seededCupDraw(clubs: readonly string[], seed: string): CupTie[] {
  const rng = mulberry32(hashString(seed));
  const pool = [...clubs];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const ties: CupTie[] = [];
  for (let i = 0; i + 1 < pool.length; i += 2) ties.push({ home: pool[i], away: pool[i + 1] });
  return ties;
}

export function cupSlot(
  competition: CupRoundSlot["competition"],
  round: number,
): CupRoundSlot | undefined {
  return DOMESTIC_CUP_SLOTS.find((slot) => slot.competition === competition && slot.round === round);
}
