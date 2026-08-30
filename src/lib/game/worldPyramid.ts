import type { League } from "./types";
import { CLUBS } from "./clubs";
import { LEAGUE_ID } from "./league";

export const WORLD_CLUBS_PER_DIVISION = 20;

export interface WorldDivisionDefinition {
  id: string;
  name: string;
  /** Persisted legacy economic tier. Multiple divisions may share one tier. */
  tier: number;
  reputationRange: [number, number];
  /** Stable regional/lane identity for parallel divisions at one football level. */
  lane?: string;
  /** Explicit upward routing. Required once a tier contains parallel divisions. */
  feedsInto?: readonly string[];
  /** Exactly one deepest division may be the default fresh-save starting lane. */
  freshStart?: boolean;
}

/**
 * Persistent domestic world. Existing definitions are immutable in identity and
 * order. New lower divisions are append-only. `tier` is an economic/football
 * level, NOT a unique division ordinal: future regional divisions may share it.
 */
export const WORLD_DIVISIONS: readonly WorldDivisionDefinition[] = [
  { id: LEAGUE_ID, name: "Division One", tier: 1, reputationRange: [55, 90] },
  { id: "league-2", name: "Division Two", tier: 2, reputationRange: [35, 62] },
  { id: "league-3", name: "Division Three", tier: 3, reputationRange: [24, 48] },
  {
    id: "league-4",
    name: "Division Four",
    tier: 4,
    reputationRange: [14, 36],
    freshStart: true,
  },
] as const;

/** Deepest football/economic tier, independent of how many parallel leagues exist. */
export function deepestWorldTier(
  definitions: readonly WorldDivisionDefinition[] = WORLD_DIVISIONS,
): number {
  return definitions.reduce((deepest, division) => Math.max(deepest, division.tier), 1);
}

export function worldDivisionsAtTier(
  tier: number,
  definitions: readonly WorldDivisionDefinition[] = WORLD_DIVISIONS,
): readonly WorldDivisionDefinition[] {
  return definitions.filter((division) => division.tier === tier);
}

/**
 * Resolve the one default fresh-save division. This remains explicit so adding
 * three sibling Level 7 leagues cannot accidentally place the user in all four.
 */
export function freshStartDivision(
  definitions: readonly WorldDivisionDefinition[] = WORLD_DIVISIONS,
): WorldDivisionDefinition {
  const deepest = deepestWorldTier(definitions);
  const deepestDivisions = worldDivisionsAtTier(deepest, definitions);
  const explicit = deepestDivisions.filter((division) => division.freshStart);
  if (explicit.length > 1) {
    throw new Error(`World has ${explicit.length} fresh-start divisions at tier ${deepest}; expected one.`);
  }
  return explicit[0] ?? deepestDivisions[0]!;
}

/**
 * Upward routing for a division. Single-lane legacy tiers infer the only league
 * one tier above. Parallel tiers must declare `feedsInto` before movement is
 * enabled; ambiguity is rejected rather than silently routing clubs wrongly.
 */
export function promotionDestinationsForDefinition(
  definition: WorldDivisionDefinition,
  definitions: readonly WorldDivisionDefinition[] = WORLD_DIVISIONS,
): readonly string[] {
  if (definition.tier <= 1) return [];
  if (definition.feedsInto?.length) return definition.feedsInto;
  const above = worldDivisionsAtTier(definition.tier - 1, definitions);
  return above.length === 1 ? [above[0].id] : [];
}

function worldLeagueShell(def: WorldDivisionDefinition, clubIds: string[]): League {
  const bottomTier = deepestWorldTier();
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
 * The player's club occupies one explicit bottom-tier starting lane. AI clubs
 * are then consumed from the stable CLUBS pool in order. Parallel sibling
 * divisions remain AI-only unless/until new-game regional selection chooses one.
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
  const startingDivisionId = freshStartDivision().id;
  return WORLD_DIVISIONS.map((def) => {
    const isStartingDivision = def.id === startingDivisionId;
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

  // Re-derive only structural competition settings. Membership and historical
  // fields remain untouched. Multiple leagues may now legitimately share tier.
  const bottomTier = deepestWorldTier();
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
