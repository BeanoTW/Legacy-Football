import type { League } from "./types";
import { CLUBS } from "./clubs";
import { LEAGUE_ID } from "./league";


export interface WorldDivisionDefinition {
  id: string;
  name: string;
  /** Persisted legacy economic tier. Multiple divisions may share one tier. */
  tier: number;
  reputationRange: [number, number];
  /** Real-world sized membership for this competition. */
  clubCount: number;
  /** Promotion/relegation slots exposed to the movement planner. */
  promotionPlaces: number;
  relegationPlaces: number;
  /** Stable regional/lane identity for parallel divisions at one football level. */
  lane?: string;
  /** Explicit upward routing. Required once a tier contains parallel divisions. */
  feedsInto?: readonly string[];
  /** A new chairman may choose this as their Level 7 starting lane. */
  startable?: boolean;
  /** Backwards-compatible default if no lane is explicitly selected. */
  freshStart?: boolean;
}

/**
 * Persistent domestic world. Existing definitions are immutable in identity and
 * order. New lower divisions are append-only. `tier` is an economic/football
 * level, NOT a unique division ordinal: regional divisions legitimately share it.
 *
 * Persisted tier 5 maps to canonical football Level 7 through the fixed +2 bridge.
 */
export const WORLD_DIVISIONS: readonly WorldDivisionDefinition[] = [
  {
    id: LEAGUE_ID,
    name: "Division One",
    tier: 1,
    clubCount: 20,
    promotionPlaces: 0,
    relegationPlaces: 3,
    reputationRange: [55, 90],
  },
  {
    id: "league-2",
    name: "Division Two",
    tier: 2,
    clubCount: 24,
    promotionPlaces: 3,
    relegationPlaces: 3,
    reputationRange: [35, 62],
  },
  {
    id: "league-3",
    name: "Division Three",
    tier: 3,
    clubCount: 24,
    promotionPlaces: 3,
    relegationPlaces: 4,
    reputationRange: [24, 48],
  },
  {
    id: "league-4",
    name: "Division Four",
    tier: 4,
    clubCount: 24,
    promotionPlaces: 4,
    relegationPlaces: 2,
    reputationRange: [14, 36],
  },
  {
    id: "national-league",
    name: "National League",
    tier: 5,
    clubCount: 24,
    promotionPlaces: 2,
    relegationPlaces: 4,
    reputationRange: [12, 32],
    feedsInto: ["league-4"],
  },
  {
    id: "national-league-north",
    name: "National League North",
    tier: 6,
    clubCount: 24,
    promotionPlaces: 2,
    relegationPlaces: 4,
    reputationRange: [10, 28],
    lane: "north",
    feedsInto: ["national-league"],
  },
  {
    id: "national-league-south",
    name: "National League South",
    tier: 6,
    clubCount: 24,
    promotionPlaces: 2,
    relegationPlaces: 4,
    reputationRange: [10, 28],
    lane: "south",
    feedsInto: ["national-league"],
  },
  {
    id: "regional-premier-central",
    name: "Regional Premier Central",
    tier: 7,
    clubCount: 22,
    promotionPlaces: 2,
    relegationPlaces: 0,
    reputationRange: [8, 24],
    lane: "central",
    feedsInto: ["national-league-north"],
    startable: true,
    freshStart: true,
  },
  {
    id: "regional-premier-south",
    name: "Regional Premier South",
    tier: 7,
    clubCount: 22,
    promotionPlaces: 2,
    relegationPlaces: 0,
    reputationRange: [8, 24],
    lane: "south",
    feedsInto: ["national-league-south"],
    startable: true,
  },
  {
    id: "regional-premier-isthmian",
    name: "Regional Premier Isthmian",
    tier: 7,
    clubCount: 22,
    promotionPlaces: 2,
    relegationPlaces: 0,
    reputationRange: [8, 24],
    lane: "isthmian",
    feedsInto: ["national-league-south"],
    startable: true,
  },
  {
    id: "regional-premier-north",
    name: "Regional Premier North",
    tier: 7,
    clubCount: 22,
    promotionPlaces: 2,
    relegationPlaces: 0,
    reputationRange: [8, 24],
    lane: "north",
    feedsInto: ["national-league-north"],
    startable: true,
  },
] as const;

export const STARTING_REGIONAL_DIVISIONS = WORLD_DIVISIONS.filter(
  (division) => division.startable,
);

export function worldClubCount(
  definitions: readonly WorldDivisionDefinition[] = WORLD_DIVISIONS,
): number {
  return definitions.reduce((total, division) => total + division.clubCount, 0);
}

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
 * sibling Level 7 leagues cannot accidentally place the user in every lane.
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
 * one tier above. Parallel tiers declare `feedsInto`; ambiguity is rejected
 * rather than silently routing clubs wrongly.
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
  return {
    id: def.id,
    name: def.name,
    tier: def.tier,
    clubIds,
    promotionPlaces: def.promotionPlaces,
    relegationPlaces: def.relegationPlaces,
    prizeMoney: 0,
    reputationRange: def.reputationRange,
  };
}

/**
 * Builds the complete persistent domestic world for a fresh save.
 *
 * The player's club occupies one explicit Level 7 starting lane. AI clubs are
 * consumed from the stable CLUBS pool in order. The other Level 7 lanes remain
 * AI-only until movement can place the user there through future regional logic.
 */
export function makeExpandedLeagues(
  clubName: string,
  startingDivisionId: string = freshStartDivision().id,
): League[] {
  const startingDefinition = WORLD_DIVISIONS.find(
    (division) => division.id === startingDivisionId && division.startable,
  );
  if (!startingDefinition) {
    throw new Error(`Invalid Level 7 starting division: ${startingDivisionId}`);
  }

  const requiredAiClubs = worldClubCount() - 1;
  const pool = CLUBS.filter((club) => club !== clubName);
  if (pool.length < requiredAiClubs) {
    throw new Error(
      `World requires ${requiredAiClubs} AI clubs for ${WORLD_DIVISIONS.length} divisions; only ${pool.length} are available.`,
    );
  }

  let cursor = 0;
  return WORLD_DIVISIONS.map((def) => {
    const isStartingDivision = def.id === startingDefinition.id;
    const slots = def.clubCount - (isStartingDivision ? 1 : 0);
    const aiClubs = pool.slice(cursor, cursor + slots);
    cursor += slots;
    const clubIds = isStartingDivision ? [clubName, ...aiClubs] : aiClubs;
    return worldLeagueShell(def, clubIds);
  });
}

/**
 * Add missing lower divisions to an existing save without reshuffling a club
 * that already exists. Existing saves are never implicitly demoted into newly
 * introduced Level 7 leagues: current membership remains authoritative.
 *
 * The returned leagues contain no new-season fixtures. A newly introduced
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
      if (clubIds.length === def.clubCount) break;
    }
    if (clubIds.length !== def.clubCount) {
      throw new Error(
        `Cannot expand ${def.name}: expected ${def.clubCount} unused clubs, found ${clubIds.length}.`,
      );
    }
    clubIds.forEach((clubId) => used.add(clubId));
    out.push(worldLeagueShell(def, clubIds));
  }

  // Re-derive only structural competition settings. Membership and historical
  // fields remain untouched. Multiple leagues may legitimately share tier 5.
  for (const league of out) {
    const def = WORLD_DIVISIONS.find((candidate) => candidate.id === league.id);
    if (!def) continue;
    league.name = def.name;
    league.tier = def.tier;
    league.promotionPlaces = def.promotionPlaces;
    league.relegationPlaces = def.relegationPlaces;
    league.reputationRange = def.reputationRange;
  }

  return out.sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
}

/** Backwards-compatible name for callers added during the world-builder phase. */
export const makeWorldLeagues = makeExpandedLeagues;
