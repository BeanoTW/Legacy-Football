import type { GameState } from "./types";

/**
 * Simulation fidelity is deliberately separate from league tier.
 * A League One club can be fully simulated because it matters to the player,
 * while a Premier League club on the other side of the world can remain fringe.
 */
export type WorldSimulationLevel = "focus" | "fringe";

export type WorldFocusReason =
  | "playerClub"
  | "sameLeague"
  | "promotionNeighbour"
  | "relegationNeighbour"
  | "recentOpponent"
  | "tracked";

export interface WorldClubSimulationProfile {
  clubId: string;
  leagueId: string;
  tier: number;
  level: WorldSimulationLevel;
  reasons: WorldFocusReason[];
}

export interface WorldSimulationPlan {
  season: number;
  playerLeagueId: string;
  focusLeagueIds: string[];
  clubs: WorldClubSimulationProfile[];
  focusClubIds: string[];
  fringeClubIds: string[];
}

export interface WorldFocusOptions {
  /** Explicitly tracked clubs become focus clubs without mutating GameState. */
  trackedClubIds?: readonly string[];
  /** Recent opponents can temporarily receive full fidelity. */
  recentOpponentIds?: readonly string[];
  /** Include the divisions immediately above/below the player's league. */
  includeAdjacentLeagues?: boolean;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/**
 * Pure deterministic planner for world simulation fidelity.
 *
 * Phase 2 deliberately does NOT change match results yet. It establishes the
 * boundary every future world subsystem can query before doing expensive work.
 * The player's division is always focus. Adjacent promotion/relegation leagues
 * are focus by default so movement across the pyramid never crosses an
 * unmodelled boundary.
 */
export function buildWorldSimulationPlan(
  state: Pick<GameState, "season" | "clubName" | "playerLeagueId" | "leagues" | "trackedClubIds">,
  options: WorldFocusOptions = {},
): WorldSimulationPlan {
  const playerLeague = state.leagues.find((league) => league.id === state.playerLeagueId);
  if (!playerLeague) {
    throw new Error(
      `Cannot build world simulation plan: player league ${state.playerLeagueId} is missing.`,
    );
  }

  const focusLeagueIds = new Set<string>([playerLeague.id]);
  const includeAdjacent = options.includeAdjacentLeagues ?? true;

  if (includeAdjacent) {
    for (const league of state.leagues) {
      if (Math.abs(league.tier - playerLeague.tier) === 1) {
        focusLeagueIds.add(league.id);
      }
    }
  }

  const tracked = new Set([...(state.trackedClubIds ?? []), ...(options.trackedClubIds ?? [])]);
  const recent = new Set(options.recentOpponentIds ?? []);

  const clubs: WorldClubSimulationProfile[] = [];
  for (const league of [...state.leagues].sort(
    (a, b) => a.tier - b.tier || a.id.localeCompare(b.id),
  )) {
    for (const clubId of uniqueSorted(league.clubIds)) {
      const reasons: WorldFocusReason[] = [];

      if (clubId === state.clubName) reasons.push("playerClub");
      if (league.id === playerLeague.id) reasons.push("sameLeague");
      if (includeAdjacent && league.tier === playerLeague.tier - 1)
        reasons.push("promotionNeighbour");
      if (includeAdjacent && league.tier === playerLeague.tier + 1)
        reasons.push("relegationNeighbour");
      if (recent.has(clubId)) reasons.push("recentOpponent");
      if (tracked.has(clubId)) reasons.push("tracked");

      clubs.push({
        clubId,
        leagueId: league.id,
        tier: league.tier,
        level: reasons.length > 0 ? "focus" : "fringe",
        reasons,
      });
    }
  }

  const focusClubIds = uniqueSorted(
    clubs.filter((club) => club.level === "focus").map((club) => club.clubId),
  );
  const fringeClubIds = uniqueSorted(
    clubs.filter((club) => club.level === "fringe").map((club) => club.clubId),
  );

  return {
    season: state.season,
    playerLeagueId: playerLeague.id,
    focusLeagueIds: uniqueSorted([...focusLeagueIds]),
    clubs,
    focusClubIds,
    fringeClubIds,
  };
}

export function simulationLevelForClub(
  plan: WorldSimulationPlan,
  clubId: string,
): WorldSimulationLevel {
  return plan.clubs.find((club) => club.clubId === clubId)?.level ?? "fringe";
}

/** Stable signature used by verification and future cache invalidation. */
export function worldSimulationPlanSignature(plan: WorldSimulationPlan): string {
  return plan.clubs
    .map((club) => `${club.clubId}:${club.leagueId}:${club.level}:${club.reasons.join(",")}`)
    .join("|");
}
