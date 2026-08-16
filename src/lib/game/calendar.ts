/* Season calendar — extracted from engine.ts in Phase 0c.
 * Pure calendar knowledge: no state mutation, no domain logic.
 */
import type { GameState } from "./types";

export const CALENDAR = {
  preSeasonStart: 1,
  preSeasonEnd: 4,        // weeks 1-4: pre-season window open, friendlies
  firstHalfStart: 5,
  firstHalfEnd: 23,       // weeks 5-23: league round 1 (19 home)
  midSeasonStart: 24,
  midSeasonEnd: 27,       // weeks 24-27: mid-season window open, friendlies
  secondHalfStart: 28,
  secondHalfEnd: 46,      // weeks 28-46: league round 2 (19 away)
  seasonEnd: 46,
} as const;

export const SEASON_END_WEEK = CALENDAR.seasonEnd;
// Legacy exports kept for compatibility
export const WINDOW_PRESEASON_END = CALENDAR.preSeasonEnd;
export const WINDOW_MIDSEASON = CALENDAR.midSeasonStart;

/** Weeks within pre/mid windows that stage a friendly (small gate, no league impact). */
export const FRIENDLY_WEEKS = new Set<number>([2, 4, 25, 27]);

export type SeasonPhase = "preseason" | "firstHalf" | "midseason" | "secondHalf";

export function phaseOf(week: number): SeasonPhase {
  if (week <= CALENDAR.preSeasonEnd) return "preseason";
  if (week <= CALENDAR.firstHalfEnd) return "firstHalf";
  if (week <= CALENDAR.midSeasonEnd) return "midseason";
  return "secondHalf";
}

export function isTransferWindowOpen(s: GameState): boolean {
  const p = phaseOf(s.week);
  return p === "preseason" || p === "midseason";
}

export function windowStatus(s: GameState): {
  open: boolean;
  label: string;
  detail: string;
} {
  const p = phaseOf(s.week);
  if (p === "preseason") {
    return {
      open: true,
      label: "Pre-season window OPEN",
      detail: `Closes end of week ${CALENDAR.preSeasonEnd} · ${CALENDAR.preSeasonEnd - s.week + 1}w left · friendlies in progress`,
    };
  }
  if (p === "midseason") {
    return {
      open: true,
      label: "Mid-season window OPEN",
      detail: `Closes end of week ${CALENDAR.midSeasonEnd} · ${CALENDAR.midSeasonEnd - s.week + 1}w left`,
    };
  }
  if (p === "firstHalf") {
    return {
      open: false,
      label: "Window closed — league in play",
      detail: `Mid-season window opens week ${CALENDAR.midSeasonStart} (${CALENDAR.midSeasonStart - s.week}w)`,
    };
  }
  return {
    open: false,
    label: "Window closed — league in play",
    detail: `Pre-season window opens next season (${CALENDAR.seasonEnd - s.week + 1}w)`,
  };
}
