import type { FootballPlayer, GameState } from "./types";
import { knownPlayerDetail } from "./knownPlayerDetail";
import {
  appendCareerLedgerInPlace,
  knownPlayerIdentity,
  preserveKnownPlayerInPlace,
  setKnownPlayerReasonInPlace,
} from "./playerLifecycle";

/**
 * Recruitment calls this only when a compact known player actually becomes
 * owned. Until that moment the player remains a projection and consumes no
 * detailed squad simulation slot.
 */
export function materializeKnownSigningInPlace(
  state: GameState,
  playerId: string,
): FootballPlayer | null {
  if (!state.football) return null;
  const existing = state.football.players.find((player) => player.id === playerId);
  if (existing) {
    preserveKnownPlayerInPlace(state, existing, ["owned"]);
    setKnownPlayerReasonInPlace(state, playerId, "negotiation", false);
    return existing;
  }

  const projected = knownPlayerDetail(state, playerId);
  if (!projected) return null;
  const signed: FootballPlayer = {
    ...projected,
    dateOfBirth: { ...projected.dateOfBirth },
    secondaryPositions: [...projected.secondaryPositions],
    currentClubId: state.clubName,
    contractId: null,
    transferStatus: "unlisted",
    availability: "available",
  };
  state.football.players.push(signed);
  preserveKnownPlayerInPlace(state, signed, ["owned"]);
  setKnownPlayerReasonInPlace(state, playerId, "negotiation", false);
  const known = knownPlayerIdentity(state, playerId);
  if (known) known.currentClubId = state.clubName;
  return signed;
}

/** Preserve a departing owned player's identity before detailed simulation can drop. */
export function preservePlayerDepartureInPlace(
  state: GameState,
  player: FootballPlayer,
  destinationClubId: string | null,
  transferFee: number,
): void {
  const known = preserveKnownPlayerInPlace(state, player, ["formerPlayer"]);
  if (!known) return;
  known.currentClubId = destinationClubId;
  setKnownPlayerReasonInPlace(state, player.id, "owned", false);
  setKnownPlayerReasonInPlace(state, player.id, "negotiation", false);
  appendCareerLedgerInPlace(state, player.id, {
    season: state.season,
    clubId: destinationClubId,
    transferFee: Math.max(0, Math.round(transferFee)),
    note: destinationClubId
      ? `Left ${state.clubName} for ${destinationClubId}`
      : `Left ${state.clubName}`,
  });
}

/** Record arrival after the canonical transfer engine has completed the deal. */
export function recordPlayerArrivalInPlace(
  state: GameState,
  player: FootballPlayer,
  fromClubId: string | null,
  transferFee: number,
): void {
  const known = preserveKnownPlayerInPlace(state, player, ["owned"]);
  if (!known) return;
  known.currentClubId = state.clubName;
  setKnownPlayerReasonInPlace(state, player.id, "negotiation", false);
  appendCareerLedgerInPlace(state, player.id, {
    season: state.season,
    clubId: state.clubName,
    transferFee: Math.max(0, Math.round(transferFee)),
    note: fromClubId ? `Joined ${state.clubName} from ${fromClubId}` : `Joined ${state.clubName}`,
  });
}
