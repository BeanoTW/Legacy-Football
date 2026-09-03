import type { GameState, LeagueRow } from "./types";
import { canonicalClubReference, isUserClubReference, sameClubReference } from "./clubReference";
import { FOOTBALL_STRENGTH_MAX, FOOTBALL_STRENGTH_MIN } from "./footballStrength";

/**
 * AI clubs deliberately do not run the player's cohesion/morale simulation.
 * They carry one tiny institutional-performance value instead. It is expressed
 * directly as a bounded match-strength adjustment so it cannot quietly become
 * a second reputation or overwhelm squad quality.
 */
export const AI_CLUB_PERFORMANCE_LIMIT = 3;
export const AI_CLUB_PERFORMANCE_RETENTION = 0.45;

export interface AiClubPerformanceRecord {
  clubId: string;
  /** Match-strength points, bounded to ±AI_CLUB_PERFORMANCE_LIMIT. */
  performance: number;
  lastUpdatedSeason: number;
}

export interface AiClubPerformanceState {
  schemaVersion: 1;
  processedSeasons: number[];
  clubsById: Record<string, AiClubPerformanceRecord>;
}

declare module "./types" {
  interface GameState {
    aiClubPerformance?: AiClubPerformanceState;
  }
}

export interface CompletedAiLeagueSummary {
  leagueId: string;
  tier: number;
  table: LeagueRow[];
  champion: string;
  promoted: string[];
  relegated: string[];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

function emptyState(): AiClubPerformanceState {
  return { schemaVersion: 1, processedSeasons: [], clubsById: {} };
}

function priorPerformance(state: GameState, clubRef: string): number {
  const clubId = canonicalClubReference(state, clubRef);
  return state.aiClubPerformance?.clubsById[clubId]?.performance ?? 0;
}

function expectedFinish(state: GameState, clubRef: string, season: number, actual: number): number {
  const snapshot = (state.clubSnapshots ?? []).find(
    (candidate) =>
      candidate.season === season && sameClubReference(state, candidate.club, clubRef),
  );
  return snapshot?.expectedFinish ?? actual;
}

/**
 * Close one season of AI institutional form. Previous state is multiplied by
 * 0.45 before the new season signal is applied, so even repeated success or
 * failure mean-reverts aggressively and can never drift without bound.
 */
export function advanceAiClubPerformanceSeasonInPlace(
  state: GameState,
  outcomes: readonly CompletedAiLeagueSummary[],
  season = state.season,
): AiClubPerformanceState {
  const performanceState = state.aiClubPerformance ?? emptyState();
  if (performanceState.processedSeasons.includes(season)) {
    state.aiClubPerformance = performanceState;
    return performanceState;
  }

  for (const outcome of outcomes) {
    const championId = outcome.champion ? canonicalClubReference(state, outcome.champion) : null;
    const promoted = new Set(outcome.promoted.map((club) => canonicalClubReference(state, club)));
    const relegated = new Set(outcome.relegated.map((club) => canonicalClubReference(state, club)));

    outcome.table.forEach((row, index) => {
      if (isUserClubReference(state, row.team)) return;
      const clubId = canonicalClubReference(state, row.team);
      const actual = index + 1;
      const expected = expectedFinish(state, row.team, season, actual);
      const expectationSignal = clamp((expected - actual) * 0.15, -1.25, 1.25);
      let eventSignal = 0;
      if (clubId === championId) eventSignal += 0.3;
      if (promoted.has(clubId)) eventSignal += 0.45;
      if (relegated.has(clubId)) eventSignal -= 0.55;

      const previous = priorPerformance(state, row.team);
      const next = round2(
        clamp(
          previous * AI_CLUB_PERFORMANCE_RETENTION + expectationSignal + eventSignal,
          -AI_CLUB_PERFORMANCE_LIMIT,
          AI_CLUB_PERFORMANCE_LIMIT,
        ),
      );
      performanceState.clubsById[clubId] = {
        clubId,
        performance: next,
        lastUpdatedSeason: season,
      };
    });
  }

  performanceState.processedSeasons = [...performanceState.processedSeasons, season].sort(
    (a, b) => a - b,
  );
  state.aiClubPerformance = performanceState;
  return performanceState;
}

export function aiClubPerformanceModifier(state: GameState, clubRef: string): number {
  if (isUserClubReference(state, clubRef)) return 0;
  const clubId = canonicalClubReference(state, clubRef);
  return state.aiClubPerformance?.clubsById[clubId]?.performance ?? 0;
}

export function realisedAiClubStrength(state: GameState, clubRef: string, baseStrength: number): number {
  return round2(
    clamp(
      baseStrength + aiClubPerformanceModifier(state, clubRef),
      FOOTBALL_STRENGTH_MIN,
      FOOTBALL_STRENGTH_MAX,
    ),
  );
}
