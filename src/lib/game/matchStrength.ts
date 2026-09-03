import type { GameState } from "./types";
import { isUserClubReference } from "./clubReference";
import { clubFootballStrength } from "./footballStrength";
import { realisedPlayerClubStrength } from "./playerClubPerformance";
import { realisedAiClubStrength } from "./aiClubPerformance";

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
