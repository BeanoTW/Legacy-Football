import type { GameState } from "./types";
import { clubReferencesEqual } from "./clubReference";

export const MAX_TRACKED_FOCUS_CLUBS = 8;
export const MAX_RECENT_OPPONENT_FOCUS_CLUBS = 6;
export const MAX_ADJACENT_FOCUS_LEAGUES = 2;

function uniqueReferences(
  state: Pick<GameState, "clubName" | "clubIdentity">,
  refs: readonly string[],
): string[] {
  const out: string[] = [];
  for (const ref of refs) {
    if (!out.some((existing) => clubReferencesEqual(state, existing, ref))) out.push(ref);
  }
  return out;
}

/**
 * Tracking is a relevance hint, not an instruction to grow detailed simulation
 * forever. Keep the most recently supplied references within a hard budget.
 */
export function boundedTrackedClubIds(
  state: Pick<GameState, "clubName" | "clubIdentity">,
  refs: readonly string[],
): string[] {
  const unique = uniqueReferences(state, refs);
  return unique.slice(Math.max(0, unique.length - MAX_TRACKED_FOCUS_CLUBS));
}

/** Recent opponents are intentionally ephemeral and independently bounded. */
export function boundedRecentOpponentIds(
  state: Pick<GameState, "clubName" | "clubIdentity">,
  refs: readonly string[],
): string[] {
  const unique = uniqueReferences(state, refs);
  return unique.slice(Math.max(0, unique.length - MAX_RECENT_OPPONENT_FOCUS_CLUBS));
}

/**
 * At regional splits there may be several divisions at the same adjacent tier.
 * Only the closest deterministic subset receives full fidelity; individual
 * tracked/recent clubs outside it can still enter Focus without hydrating their
 * entire league.
 */
export function boundedAdjacentLeagueIds(
  leagues: readonly { id: string; tier: number }[],
  playerTier: number,
): string[] {
  const candidates = leagues
    .filter((league) => Math.abs(league.tier - playerTier) === 1)
    .sort((a, b) => {
      const aDirection = a.tier < playerTier ? 0 : 1;
      const bDirection = b.tier < playerTier ? 0 : 1;
      return aDirection - bDirection || a.id.localeCompare(b.id);
    });

  const above = candidates.filter((league) => league.tier < playerTier).slice(0, 1);
  const below = candidates.filter((league) => league.tier > playerTier).slice(0, 1);
  return [...above, ...below].slice(0, MAX_ADJACENT_FOCUS_LEAGUES).map((league) => league.id);
}
