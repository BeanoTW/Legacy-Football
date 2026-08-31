import type { GameState } from "./types";
import {
  knownPlayerIdentity,
  playerLifecycleState,
  preserveKnownPlayerInPlace,
  setKnownPlayerReasonInPlace,
} from "./playerLifecycle";

/**
 * Chairman shortlist across both detailed and compact known-player fidelity.
 * The legacy recruitment shortlist remains the detailed-player compatibility
 * path; lifecycle reasons preserve compact targets even when fidelity
 * reconciliation prunes detailed-only ids.
 */
export function chairmanShortlistIds(state: GameState): string[] {
  const ids = new Set(state.football?.shortlist ?? []);
  for (const known of playerLifecycleState(state).knownPlayers) {
    if (known.reasons.includes("shortlisted")) ids.add(known.playerId);
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

export function isChairmanShortlisted(state: GameState, playerId: string): boolean {
  return chairmanShortlistIds(state).includes(playerId);
}

/**
 * Toggle a chairman-known target without requiring it to become detailed.
 * Detailed players also keep the legacy shortlist in sync for existing UI and
 * transfer flows; compact players persist through their lifecycle reason.
 */
export function toggleChairmanShortlist(state: GameState, playerId: string): GameState {
  const next = structuredClone(state);
  if (!next.football) return next;

  const detailed = next.football.players.find((player) => player.id === playerId);
  if (detailed) preserveKnownPlayerInPlace(next, detailed, []);
  const known = knownPlayerIdentity(next, playerId);
  if (!known) return next;

  const enabled = !isChairmanShortlisted(next, playerId);
  setKnownPlayerReasonInPlace(next, playerId, "shortlisted", enabled);

  next.football.shortlist ??= [];
  const legacyIndex = next.football.shortlist.indexOf(playerId);
  if (detailed && enabled && legacyIndex < 0) next.football.shortlist.push(playerId);
  if (legacyIndex >= 0 && !enabled) next.football.shortlist.splice(legacyIndex, 1);

  return next;
}
