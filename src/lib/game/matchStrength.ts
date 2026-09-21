import type { GameState } from "./types";
import { isUserClubReference } from "./clubReference";
import { clubFootballStrength } from "./footballStrength";
import { realisedPlayerClubStrength } from "./playerClubPerformance";
import { realisedAiClubStrength } from "./aiClubPerformance";
import { managerMatchStyle } from "./managerMatchStyle";
import { userMatchLineup } from "./matchLineup";
import { playerFitness, playerIsAvailable } from "./playerHealth";
import { playerRecentForm } from "./playerForm";
import { isUserClubReference as isOwnPlayerClub } from "./clubReference";
import { playerRegisteredClubId } from "./playerRegistration";

/**
 * Final match-day strength gateway. Squad/compact quality is calculated first;
 * the player club then applies its bounded management layer, while AI clubs
 * apply one bounded institutional-performance value. Fidelity never changes
 * the scale and neither performance layer replaces underlying squad quality.
 */
export function clubMatchStrength(
  state: GameState,
  clubRef: string,
  season = state.season,
): number {
  const base = clubFootballStrength(state, clubRef, season);
  return isUserClubReference(state, clubRef)
    ? realisedPlayerClubStrength(state, base)
    : realisedAiClubStrength(state, clubRef, base);
}


/**
 * The user's actual selected XI can drag match strength below the club's
 * underlying squad level. This deliberately applies only a bounded penalty:
 * selection matters, but it never becomes a second player-rating system.
 */
export function userSelectionStrengthPenalty(state: GameState): number {
  const style = managerMatchStyle(state);
  const lineup = userMatchLineup(state, style.formation);
  if (lineup.length < 11) return 0;

  const eligible = state.football.players.filter(
    (player) =>
      isOwnPlayerClub(state, playerRegisteredClubId(player)) &&
      playerIsAvailable(player, state),
  );
  if (eligible.length < 11) return 0;

  const effective = (playerId: string, ability: number, fitness: number) => {
    const fatiguePenalty = Math.max(0, 82 - fitness) * 0.08;
    const form = playerRecentForm(state, playerId);
    // Form is a manager signal first; only a very small performance residue
    // remains here so a five-game hot streak does not override core ability.
    const formResidue =
      form.appearances >= 2 ? Math.max(-0.8, Math.min(0.8, (form.averageRating - 6.45) * 0.45)) : 0;
    return ability - fatiguePenalty + formResidue;
  };

  const best = eligible
    .map((player) => effective(player.id, player.currentAbility, playerFitness(player)))
    .sort((a, b) => b - a)
    .slice(0, 11);
  const selected = lineup.map((player) =>
    effective(player.playerId, player.ability, player.fitness ?? 100),
  );
  const bestAvg = best.reduce((sum, value) => sum + value, 0) / best.length;
  const selectedAvg = selected.reduce((sum, value) => sum + value, 0) / selected.length;
  return Math.round(Math.max(-4, Math.min(0, selectedAvg - bestAvg)) * 100) / 100;
}

export function userMatchStrength(state: GameState, season = state.season): number {
  const base = clubMatchStrength(state, state.clubName, season);
  return Math.max(25, Math.min(95, Math.round((base + userSelectionStrengthPenalty(state)) * 100) / 100));
}
