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

export function isCompactRecruitmentTarget(state: GameState, playerId: string): boolean {
  return Boolean(
    knownPlayerDetail(state, playerId) &&
      !state.football?.players.some((player) => player.id === playerId),
  );
}

/**
 * Compact players deliberately have no detailed contract or squad-ranking
 * rows. Discovery itself is therefore the availability gate: once a real
 * compact identity has been surfaced by scouting, its club can be approached.
 * This avoids inventing detailed contract facts merely to negotiate.
 */
export function compactPlayerCanBeApproached(
  state: GameState,
  player: FootballPlayer,
): boolean {
  if (!isCompactRecruitmentTarget(state, player.id)) return false;
  if (!player.currentClubId || player.currentClubId === state.clubName) return false;
  if (player.transferStatus === "agreedTransfer") return false;
  return scoutingCandidateProfile(state, player.id) !== null;
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
  if (!isCompactRecruitmentTarget(state, player.id)) return null;
  const profile = scoutingCandidateProfile(state, player.id);
  if (!profile) return null;

  const rng = seededRng(state.saveSeed, "compactSellerValue", player.id, player.currentClubId);
  const sellerPremium = rngRange(rng, 1.04, 1.28);
  return recruitmentNormaliseTransferFeeForClub(
    state,
    player.currentClubId,
    Math.max(0, Math.round(profile.marketValue * sellerPremium)),
    "asking",
  );
}

/** One price entry point for the canonical negotiation engine. */
export function recruitmentTargetAskingPrice(
  state: GameState,
  player: FootballPlayer,
  detailedAskingPrice: (state: GameState, player: FootballPlayer) => number,
): number {
  const compact = compactPlayerAskingPrice(state, player);
  return compact ?? detailedAskingPrice(state, player);
}
