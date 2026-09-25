import type { GameState } from "./types";
import { sameClubReference } from "./clubReference";
import { WORLD_DIVISIONS, promotionDestinationsForDefinition } from "./worldPyramid";

export const MAX_TRACKED_FOCUS_CLUBS = 8;
export const MAX_RECENT_OPPONENT_FOCUS_CLUBS = 6;
export const MAX_ADJACENT_FOCUS_LEAGUES = 2;

function uniqueReferences(
  state: Pick<GameState, "clubName" | "clubIdentity">,
  refs: readonly string[],
): string[] {
  const out: string[] = [];
  for (const ref of refs) {
    if (!out.some((existing) => sameClubReference(state, existing, ref))) out.push(ref);
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
  playerLeagueId?: string,
): string[] {
  const available = new Set(leagues.map((league) => league.id));
  const playerDefinition = playerLeagueId
    ? WORLD_DIVISIONS.find((division) => division.id === playerLeagueId)
    : undefined;

  // Regional pyramid routing is explicit. A Southern/Isthmian Level 7 career
  // should focus National League South, not whichever Level 6 id sorts first.
  const routedAbove = playerDefinition
    ? promotionDestinationsForDefinition(playerDefinition, WORLD_DIVISIONS)
        .filter((id) => available.has(id))
        .slice(0, 1)
    : [];

  const routedBelow = playerLeagueId
    ? WORLD_DIVISIONS
        .filter(
          (division) =>
            division.tier === playerTier + 1 &&
            (division.feedsInto ?? []).includes(playerLeagueId) &&
            available.has(division.id),
        )
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, 1)
        .map((division) => division.id)
    : [];

  const candidates = leagues
    .filter((league) => Math.abs(league.tier - playerTier) === 1)
    .sort((a, b) => {
      const aDirection = a.tier < playerTier ? 0 : 1;
      const bDirection = b.tier < playerTier ? 0 : 1;
      return aDirection - bDirection || a.id.localeCompare(b.id);
    });

  const fallbackAbove = candidates.filter((league) => league.tier < playerTier).map((league) => league.id);
  const fallbackBelow = candidates.filter((league) => league.tier > playerTier).map((league) => league.id);
  const above = routedAbove.length ? routedAbove : fallbackAbove.slice(0, 1);
  const below = routedBelow.length ? routedBelow : fallbackBelow.slice(0, 1);
  return [...above, ...below].slice(0, MAX_ADJACENT_FOCUS_LEAGUES);
}
