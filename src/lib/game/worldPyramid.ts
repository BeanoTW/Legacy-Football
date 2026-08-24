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
 * The player's club occupies the first bottom-tier slot. AI clubs are then consumed
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
  const startingTier = WORLD_DIVISIONS.length;
  return WORLD_DIVISIONS.map((def) => {
    const isStartingDivision = def.tier === startingTier;
    const slots = isStartingDivision
      ? WORLD_CLUBS_PER_DIVISION - 1
      : WORLD_CLUBS_PER_DIVISION;
    const aiClubs = pool.slice(cursor, cursor + slots);
    cursor += slots;
    const clubIds = isStartingDivision ? [clubName, ...aiClubs] : aiClubs;
    return worldLeagueShell(def, clubIds);
  });
}

/**
 * Add any missing lower divisions to an existing save without reshuffling a
 * club that already exists. This is intentionally different from fresh-world
 * construction: promoted/relegated memberships in the live save are canonical
 * and must survive a schema upgrade exactly.
 *
 * The returned leagues contain NO new-season fixtures. A newly introduced
 * division joins competitive simulation at the next rollover, preserving the
 * active season that existed before the world expansion.
 */
export function expandExistingLeagues(existing: readonly League[], clubName: string): League[] {
  const out = existing.map((league) => ({ ...league, clubIds: [...league.clubIds] }));
  const target = makeExpandedLeagues(clubName);
  const used = new Set(out.flatMap((league) => league.clubIds));

  for (const def of WORLD_DIVISIONS) {
    const present = out.find((league) => league.id === def.id);
    if (present) continue;

    const preferred = target.find((league) => league.id === def.id)?.clubIds ?? [];
    const candidates = [...preferred, ...CLUBS].filter((clubId) => clubId !== clubName);
    const clubIds: string[] = [];
    for (const clubId of candidates) {
      if (used.has(clubId) || clubIds.includes(clubId)) continue;
      clubIds.push(clubId);
      if (clubIds.length === WORLD_CLUBS_PER_DIVISION) break;
    }
    if (clubIds.length !== WORLD_CLUBS_PER_DIVISION) {
      throw new Error(
        `Cannot expand ${def.name}: expected ${WORLD_CLUBS_PER_DIVISION} unused clubs, found ${clubIds.length}.`,
      );
    }
    clubIds.forEach((clubId) => used.add(clubId));
    out.push(worldLeagueShell(def, clubIds));
  }

  // The old bottom division becomes an interior division once a lower tier is
  // appended. Re-derive only structural competition settings; membership and
  // every historical field remain untouched.
  const bottomTier = WORLD_DIVISIONS.length;
  for (const league of out) {
    const def = WORLD_DIVISIONS.find((candidate) => candidate.id === league.id);
    if (!def) continue;
    league.name = def.name;
    league.tier = def.tier;
    league.promotionPlaces = def.tier === 1 ? 0 : 2;
    league.relegationPlaces = def.tier === bottomTier ? 0 : 2;
    league.reputationRange = def.reputationRange;
  }

  return out.sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
}

/** Backwards-compatible name for callers added during the world-builder phase. */
export const makeWorldLeagues = makeExpandedLeagues;
