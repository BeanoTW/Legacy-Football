import type { GameState } from "./types";
import { sameClubReference } from "./clubReference";
import { clubStrengthFor } from "./reputation";
import { clubOverallProfile } from "./playerOverall";
import { playerFitness, playerIsAvailable } from "./playerHealth";

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
    const ownPlayers = Object.values(state.football?.players ?? {}).filter(
      (player) =>
        sameClubReference(state, player.currentClubId, clubId) &&
        playerIsAvailable(player, state),
    );
    const ownDetailed = detailedSquadStrength(
      ownPlayers.map((player) => {
        const fitness = playerFitness(player);
        const fatiguePenalty = Math.max(0, 82 - fitness) * 0.08;
        return player.currentAbility - fatiguePenalty;
      }),
    );
    if (ownDetailed !== null) return ownDetailed;

    const ownLegacy = detailedSquadStrength(state.squad.map((player) => player.rating));
    if (ownLegacy !== null) return ownLegacy;
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

  // Most outer-world clubs deliberately do not materialise 20 player rows
  // until the chairman needs them. Their persisted Fringe strength is already
  // on the canonical player-OVR scale and must therefore beat the old
  // reputation-derived fallback (which is a prestige scale, not squad OVR).
  const fringe = Object.values(state.fringeWorld ?? {}).find((candidate) =>
    sameClubReference(state, candidate.clubId, clubId),
  );
  if (fringe && Number.isFinite(fringe.strength)) {
    return Math.round(clamp(fringe.strength) * 100) / 100;
  }

  const profile = clubOverallProfile(state, clubId);
  if (Number.isFinite(profile.average)) return Math.round(clamp(profile.average) * 100) / 100;

  return clubStrengthFor(state, clubId, season);
}
