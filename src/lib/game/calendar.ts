/* Season calendar — extracted from engine.ts in Phase 0c.
 * Pure calendar knowledge: no domain mutation outside the dedicated clock flag.
 */
import type { GameState } from "./types";

export const CALENDAR = {
  preSeasonStart: 1,
  preSeasonEnd: 4,
  firstHalfStart: 5,
  firstHalfEnd: 23,
  midSeasonStart: 24,
  midSeasonEnd: 27,
  secondHalfStart: 28,
  secondHalfEnd: 46,
  seasonEnd: 46,
} as const;

export const SEASON_END_WEEK = CALENDAR.seasonEnd;
export const WINDOW_PRESEASON_END = CALENDAR.preSeasonEnd;
export const WINDOW_MIDSEASON = CALENDAR.midSeasonStart;

export const FRIENDLY_WEEKS = new Set<number>([2, 4, 25, 27]);
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const MATCHDAY_INDEX = 5;
const DAY_FLAG = "calendar.dayOfWeek";
const DEADLINE_HOUR_FLAG = "calendar.transferDeadlineHour";

export type SeasonPhase = "preseason" | "firstHalf" | "midseason" | "secondHalf";

export function phaseOf(week: number): SeasonPhase {
  if (week <= CALENDAR.preSeasonEnd) return "preseason";
  if (week <= CALENDAR.firstHalfEnd) return "firstHalf";
  if (week <= CALENDAR.midSeasonEnd) return "midseason";
  return "secondHalf";
}

export function calendarDay(state: GameState): number {
  const raw = state.inboxFlags?.[DAY_FLAG];
  if (typeof raw !== "number" || !Number.isInteger(raw)) return 0;
  return Math.max(0, Math.min(6, raw));
}

export function calendarDayName(state: GameState): (typeof DAY_NAMES)[number] {
  return DAY_NAMES[calendarDay(state)];
}

export function setCalendarDay(state: GameState, day: number): void {
  state.inboxFlags ??= {};
  state.inboxFlags[DAY_FLAG] = Math.max(0, Math.min(6, Math.trunc(day)));
}

export function isMatchday(state: GameState): boolean {
  return calendarDay(state) === MATCHDAY_INDEX;
}

export function isTransferWindowOpen(s: GameState): boolean {
  const p = phaseOf(s.week);
  return p === "preseason" || p === "midseason";
}

export function isTransferDeadlineWeek(state: GameState): boolean {
  return state.week === CALENDAR.preSeasonEnd || state.week === CALENDAR.midSeasonEnd;
}

export function isTransferDeadlineDay(state: GameState): boolean {
  return isTransferWindowOpen(state) && isTransferDeadlineWeek(state) && calendarDay(state) === 6;
}

/**
 * Deadline day owns a deliberately narrow sub-day clock. The rest of the game
 * remains day/week based; only the final transfer-window Sunday advances in
 * one-hour steps so negotiations can become a distinct last-day experience.
 */
export function transferDeadlineHour(state: GameState): number {
  if (!isTransferDeadlineDay(state)) return 0;
  const raw = state.inboxFlags?.[DEADLINE_HOUR_FLAG];
  if (typeof raw !== "number" || !Number.isInteger(raw)) return 0;
  return Math.max(0, Math.min(23, raw));
}

export function transferDeadlineHoursRemaining(state: GameState): number {
  if (!isTransferDeadlineDay(state)) return 0;
  return 24 - transferDeadlineHour(state);
}

export function setTransferDeadlineHour(state: GameState, hour: number): void {
  state.inboxFlags ??= {};
  state.inboxFlags[DEADLINE_HOUR_FLAG] = Math.max(0, Math.min(23, Math.trunc(hour)));
}

export function clearTransferDeadlineHour(state: GameState): void {
  if (!state.inboxFlags) return;
  delete state.inboxFlags[DEADLINE_HOUR_FLAG];
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
