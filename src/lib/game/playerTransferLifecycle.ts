import type { FootballPlayer, GameState } from "./types";
import { knownPlayerDetail } from "./knownPlayerDetail";
import {
  appendCareerLedgerInPlace,
  knownPlayerIdentity,
  preserveKnownPlayerInPlace,
  setKnownPlayerReasonInPlace,
} from "./playerLifecycle";
import { clubDisplayName, userClubReference } from "./clubReference";


function syncCompactTransferMirrorInPlace(
  state: GameState,
  player: FootballPlayer,
  clubId: string | null,
): void {
  const compact = state.fringePlayers?.[player.id];
  if (!compact) return;

  compact.currentAbility = player.currentAbility;
  compact.potentialAbility = player.potentialAbility;
  compact.lastDevelopedSeason = state.season;
  compact.retired = false;

  if (clubId === null) {
    compact.departed = true;
    return;
  }

  compact.currentClubId = clubId;
  compact.departed = false;
}

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
    currentClubId: userClubReference(state),
    contractId: null,
    transferStatus: "unlisted",
    availability: "available",
  };
  state.football.players.push(signed);
  preserveKnownPlayerInPlace(state, signed, ["owned"]);
  setKnownPlayerReasonInPlace(state, playerId, "negotiation", false);
  const known = knownPlayerIdentity(state, playerId);
  if (known) known.currentClubId = userClubReference(state);
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
  syncCompactTransferMirrorInPlace(state, player, destinationClubId);
  setKnownPlayerReasonInPlace(state, player.id, "owned", false);
  setKnownPlayerReasonInPlace(state, player.id, "negotiation", false);
  appendCareerLedgerInPlace(state, player.id, {
    season: state.season,
    clubId: destinationClubId,
    transferFee: Math.max(0, Math.round(transferFee)),
    note: destinationClubId
      ? `Left ${clubDisplayName(state, userClubReference(state))} for ${clubDisplayName(state, destinationClubId)}`
      : `Left ${clubDisplayName(state, userClubReference(state))}`,
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
  known.currentClubId = userClubReference(state);
  syncCompactTransferMirrorInPlace(state, player, userClubReference(state));
  setKnownPlayerReasonInPlace(state, player.id, "negotiation", false);
  appendCareerLedgerInPlace(state, player.id, {
    season: state.season,
    clubId: userClubReference(state),
    transferFee: Math.max(0, Math.round(transferFee)),
    note: fromClubId ? `Joined ${clubDisplayName(state, userClubReference(state))} from ${clubDisplayName(state, fromClubId)}` : `Joined ${clubDisplayName(state, userClubReference(state))}`,
  });
}
