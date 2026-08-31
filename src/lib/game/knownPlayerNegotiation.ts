import type { GameState, SquadRole, TransferNegotiation } from "./types";
import { knownPlayerDetail } from "./knownPlayerDetail";
import {
  preserveKnownPlayerInPlace,
  setKnownPlayerReasonInPlace,
} from "./playerLifecycle";

/**
 * Recruitment owns transfer mutation. This module only manages the knowledge
 * lifecycle around a recruitment negotiation so compact players can be
 * approached without being inserted into football.players.
 */
export function markKnownPlayerNegotiationInPlace(
  state: GameState,
  playerId: string,
  enabled: boolean,
): boolean {
  const player = knownPlayerDetail(state, playerId);
  if (!player) return false;
  preserveKnownPlayerInPlace(state, player, ["negotiation"]);
  setKnownPlayerReasonInPlace(state, playerId, "negotiation", enabled);
  return true;
}

export interface KnownPlayerApproach {
  playerId: string;
  fromClubId: string | null;
  role: SquadRole;
  fee: number;
}

/**
 * Validate and preserve a compact target before recruitment opens talks.
 * No hydration occurs here; callers pass the projected FootballPlayer to the
 * recruitment-owned negotiation path.
 */
export function prepareKnownPlayerApproachInPlace(
  state: GameState,
  playerId: string,
  fee: number,
  role: SquadRole = "First Team",
): KnownPlayerApproach | null {
  const player = knownPlayerDetail(state, playerId);
  if (!player || player.currentClubId === state.clubName) return null;
  preserveKnownPlayerInPlace(state, player, ["negotiation"]);
  return {
    playerId,
    fromClubId: player.currentClubId,
    role,
    fee: player.currentClubId === null ? 0 : Math.max(0, Math.round(fee)),
  };
}

/**
 * Negotiation is a temporary fidelity reason. Identity/history remain after
 * talks close; only the reason is removed.
 */
export function syncKnownPlayerNegotiationReasonInPlace(
  state: GameState,
  negotiation: TransferNegotiation,
): void {
  if (negotiation.direction !== "in") return;
  const active =
    negotiation.stage === "clubTalks" ||
    negotiation.stage === "playerTalks" ||
    negotiation.stage === "agreed";
  markKnownPlayerNegotiationInPlace(state, negotiation.playerId, active);
}
