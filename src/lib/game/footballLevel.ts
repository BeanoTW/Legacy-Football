import type { GameState, League } from "./types";
import { isUserClubReference } from "./clubReference";

/**
 * Canonical English football level used by the expanded world model.
 * Level 1 is the top flight; larger numbers are lower in the pyramid.
 */
export type FootballLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Legacy saves and the live four-division world use a tier number whose
 * economic meaning is two places above the canonical football level scale:
 *
 *   legacy -1 -> level 1 (Premier Division)
 *   legacy  0 -> level 2 (Championship)
 *   legacy  1 -> level 3 (League One analogue)
 *   legacy  2 -> level 4 (League Two analogue)
 *   legacy  3 -> level 5 (National League analogue)
 *   legacy  4 -> level 6 (regional National League analogue)
 *
 * Keep this bridge explicit until every save and subsystem stores football
 * level directly. Never silently reinterpret a persisted legacy tier.
 */
export const LEGACY_TIER_TO_FOOTBALL_LEVEL_OFFSET = 2;

export function legacyTierToFootballLevel(tier: number): FootballLevel {
  const level = Math.round(tier) + LEGACY_TIER_TO_FOOTBALL_LEVEL_OFFSET;
  if (level < 1 || level > 8) {
    throw new RangeError(`Legacy tier ${tier} maps outside football levels 1-8`);
  }
  return level as FootballLevel;
}

export function footballLevelToLegacyTier(level: FootballLevel): number {
  return level - LEGACY_TIER_TO_FOOTBALL_LEVEL_OFFSET;
}

export function footballLevelOfLeague(league: Pick<League, "tier">): FootballLevel {
  return legacyTierToFootballLevel(league.tier);
}

export function footballLevelOfClub(state: GameState, clubId: string): FootballLevel {
  const league = (state.leagues ?? []).find((candidate) => candidate.clubIds?.includes(clubId));
  return legacyTierToFootballLevel(league?.tier ?? 1);
}

export function footballLevelOfUser(state: GameState): FootballLevel {
  const league =
    (state.leagues ?? []).find((candidate) => candidate.id === state.playerLeagueId) ??
    (state.leagues ?? []).find((candidate) =>
      candidate.clubIds?.some((club) => isUserClubReference(state, club)),
    );
  return legacyTierToFootballLevel(league?.tier ?? 1);
}
