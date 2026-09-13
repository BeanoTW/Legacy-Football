import { FRIENDLY_WEEKS } from "./calendar";
import type { GameState } from "./types";

/**
 * Home should preview the next actual fixture, not fall back to an anonymous
 * opponent simply because the current week is empty.
 */
export function nextScheduledFixture(state: GameState): GameState["fixtures"][number] | undefined {
  return state.fixtures
    .filter((fixture) => fixture.week >= state.week)
    .slice()
    .sort((a, b) => a.week - b.week)[0];
}

export function fixtureCompetitionLabel(week: number): "Friendly" | "League" {
  return FRIENDLY_WEEKS.has(week) ? "Friendly" : "League";
}

export function fixtureTimingLabel(state: GameState, fixture: GameState["fixtures"][number]): string {
  if (fixture.week === state.week) return "This week";
  const weeksAway = fixture.week - state.week;
  return weeksAway === 1 ? "Next week" : `In ${weeksAway} weeks`;
}
