import type { GameState } from "./types";
import { sameClubReference } from "./clubReference";
import { clubStrengthFor } from "./reputation";

export const FOOTBALL_STRENGTH_MIN = 25;
export const FOOTBALL_STRENGTH_MAX = 95;

const clamp = (value: number) =>
  Math.max(FOOTBALL_STRENGTH_MIN, Math.min(FOOTBALL_STRENGTH_MAX, value));

/**
 * Canonical football-strength scale used at every simulation fidelity.
 * Detailed squads and compact Fringe squads both express player ability on
 * the same 25-95 match scale; club reputation remains a fallback only when
 * no individual squad representation exists.
 */
export function detailedSquadStrength(ratings: readonly number[]): number | null {
  const usable = ratings.filter(Number.isFinite).sort((a, b) => b - a).slice(0, 16);
  if (!usable.length) return null;
  return Math.round(clamp(usable.reduce((sum, rating) => sum + rating, 0) / usable.length) * 100) / 100;
}

export function compactSquadStrength(abilities: readonly number[]): number | null {
  return detailedSquadStrength(abilities);
}

export function clubFootballStrength(state: GameState, clubId: string, season = state.season): number {
  if (sameClubReference(state, clubId, state.clubName)) {
    const own = detailedSquadStrength(state.squad.map((player) => player.rating));
    if (own !== null) return own;
  }

  const detailed = Object.values(state.football?.players ?? {})
    .filter((player) => sameClubReference(state, player.currentClubId, clubId))
    .map((player) => player.currentAbility);
  const detailedStrength = detailedSquadStrength(detailed);
  if (detailedStrength !== null) return detailedStrength;

  const compact = Object.values(state.fringePlayers ?? {})
    .filter(
      (player) =>
        !player.retired &&
        !player.departed &&
        sameClubReference(state, player.currentClubId, clubId),
    )
    .map((player) => player.currentAbility);
  const compactStrength = compactSquadStrength(compact);
  if (compactStrength !== null) return compactStrength;

  return clubStrengthFor(state, clubId, season);
}
