import type { FootballPlayer, GameState } from "./types";
import { knownPlayerDetail } from "./knownPlayerDetail";
import { scoutingCandidateProfile } from "./scoutingDiscovery";
import { recruitmentNormaliseTransferFeeForClub } from "./recruitmentEconomy";
import { seededRng, rngRange } from "./rng";

/**
 * Resolve a recruitment target without changing simulation fidelity. Detailed
 * players win; otherwise a known/scouted compact identity is projected.
 */
export function recruitmentTargetPlayer(
  state: GameState,
  playerId: string,
): FootballPlayer | null {
  return state.football?.players.find((player) => player.id === playerId) ?? knownPlayerDetail(state, playerId);
}

/**
 * Seller valuation for a compact target. Detailed contracted players continue
 * to use recruitment.ts's canonical askingPrice path; this is only the
 * contract-free compact-world fallback.
 */
export function compactPlayerAskingPrice(
  state: GameState,
  player: FootballPlayer,
): number | null {
  if (!player.currentClubId) return 0;
  if (state.football?.players.some((candidate) => candidate.id === player.id)) return null;
  const profile = scoutingCandidateProfile(state, player.id);
  if (!profile) return null;

  const rng = seededRng(state.saveSeed, "compactSellerValue", player.id, player.currentClubId);
  const sellerPremium = rngRange(rng, 1.04, 1.28);
  return recruitmentNormaliseTransferFeeForClub(
    state,
    player.currentClubId,
    Math.max(0, Math.round(profile.marketValue * sellerPremium)),
  );
}
