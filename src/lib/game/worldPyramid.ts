import type { League } from "./types";
import { CLUBS } from "./clubs";
import { LEAGUE_ID } from "./league";

export const WORLD_CLUBS_PER_DIVISION = 20;

export interface WorldDivisionDefinition {
  id: string;
  name: string;
  tier: number;
  reputationRange: [number, number];
}

/**
 * Persistent domestic world. Keep definitions ordered by tier and append new
 * lower divisions rather than reshuffling existing tiers: save identity and
 * seeded schedules depend on stable league/club membership.
 */
export const WORLD_DIVISIONS: readonly WorldDivisionDefinition[] = [
  { id: LEAGUE_ID, name: "Division One", tier: 1, reputationRange: [55, 90] },
  { id: "league-2", name: "Division Two", tier: 2, reputationRange: [35, 62] },
  { id: "league-3", name: "Division Three", tier: 3, reputationRange: [24, 48] },
  { id: "league-4", name: "Division Four", tier: 4, reputationRange: [14, 36] },
] as const;

function worldLeagueShell(def: WorldDivisionDefinition, clubIds: string[]): League {
  const bottomTier = WORLD_DIVISIONS.length;
  return {
    id: def.id,
    name: def.name,
    tier: def.tier,
    clubIds,
    promotionPlaces: def.tier === 1 ? 0 : 2,
    relegationPlaces: def.tier === bottomTier ? 0 : 2,
    prizeMoney: 0,
    reputationRange: def.reputationRange,
  };
}

/**
 * Builds the complete persistent domestic world for a fresh save.
 *
 * The player's club occupies the first tier-1 slot. AI clubs are then consumed
 * from the stable CLUBS pool in order. This gives the Focus/Fringe planner a
 * real outer world without making simulation fidelity itself tier-dependent.
 */
export function makeExpandedLeagues(clubName: string): League[] {
  const requiredAiClubs = WORLD_DIVISIONS.length * WORLD_CLUBS_PER_DIVISION - 1;
  const pool = CLUBS.filter((club) => club !== clubName);
  if (pool.length < requiredAiClubs) {
    throw new Error(
      `World requires ${requiredAiClubs} AI clubs for ${WORLD_DIVISIONS.length} divisions; only ${pool.length} are available.`,
    );
  }

  let cursor = 0;
  return WORLD_DIVISIONS.map((def) => {
    const slots = def.tier === 1 ? WORLD_CLUBS_PER_DIVISION - 1 : WORLD_CLUBS_PER_DIVISION;
    const aiClubs = pool.slice(cursor, cursor + slots);
    cursor += slots;
    const clubIds = def.tier === 1 ? [clubName, ...aiClubs] : aiClubs;
    return worldLeagueShell(def, clubIds);
  });
}

/** Backwards-compatible name for callers added during the world-builder phase. */
export const makeWorldLeagues = makeExpandedLeagues;
