import type { FootballPlayer, GameState, TransferNegotiation } from "./types";
import {
  compactPlayerCanBeApproached,
  recruitmentTargetAskingPrice,
  recruitmentTargetPlayer,
} from "./knownPlayerTransferEconomy";
import { syncKnownPlayerNegotiationReasonInPlace } from "./knownPlayerNegotiation";
import {
  materializeKnownSigningInPlace,
  preservePlayerDepartureInPlace,
  recordPlayerArrivalInPlace,
} from "./playerTransferLifecycle";

/** Resolve detailed and compact-known transfer targets through one read-only path. */
export function transferTargetPlayer(state: GameState, playerId: string): FootballPlayer | null {
  return recruitmentTargetPlayer(state, playerId);
}

/**
 * Compact discovery is itself the approach gate because compact players do not
 * carry invented detailed contract/squad-ranking facts. Detailed players stay
 * on recruitment.ts's existing football-availability rules.
 */
export function transferTargetAvailabilityReason(
  state: GameState,
  player: FootballPlayer,
  detailedAvailabilityReason: (state: GameState, player: FootballPlayer) => string | null,
): string | null {
  if (compactPlayerCanBeApproached(state, player)) return "Scouted player — club can be approached";
  return recruitmentTargetPlayer(state, player.id) === player &&
    state.football?.players.some((candidate) => candidate.id === player.id)
    ? detailedAvailabilityReason(state, player)
    : null;
}

/** Detailed contracts and compact seller profiles feed one negotiation price. */
export function transferTargetAskingPrice(
  state: GameState,
  player: FootballPlayer,
  detailedAskingPrice: (state: GameState, player: FootballPlayer) => number,
): number {
  return recruitmentTargetAskingPrice(state, player, detailedAskingPrice);
}

/** Keep the temporary negotiation lifecycle reason aligned with negotiation stage. */
export function syncTransferTargetNegotiationInPlace(
  state: GameState,
  negotiation: TransferNegotiation,
): void {
  syncKnownPlayerNegotiationReasonInPlace(state, negotiation);
}

/**
 * Materialise an incoming compact player only at the actual completion
 * boundary. Detailed targets are returned unchanged.
 */
export function materializeTransferTargetForCompletionInPlace(
  state: GameState,
  negotiation: TransferNegotiation,
): FootballPlayer | null {
  if (negotiation.direction !== "in") return transferTargetPlayer(state, negotiation.playerId);
  const detailed = state.football?.players.find((player) => player.id === negotiation.playerId);
  return detailed ?? materializeKnownSigningInPlace(state, negotiation.playerId);
}

/** Write cheap persistent identity/history after the canonical transfer mutation succeeds. */
export function recordCompletedTransferLifecycleInPlace(
  state: GameState,
  negotiation: TransferNegotiation,
  player: FootballPlayer,
): void {
  if (negotiation.direction === "in") {
    recordPlayerArrivalInPlace(state, player, negotiation.fromClubId, negotiation.fee);
    return;
  }
  preservePlayerDepartureInPlace(state, player, negotiation.toClubId, negotiation.fee);
}
