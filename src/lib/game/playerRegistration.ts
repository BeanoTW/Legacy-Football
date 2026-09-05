import type { FootballPlayer, GameState } from "./types";

/**
 * Parent/contract-owning club. Ordinary players need no duplicate persisted
 * reference: absent ownerClubId means ownership matches playing registration.
 */
export function playerOwnerClubId(player: FootballPlayer): string | null {
  return player.ownerClubId !== undefined ? player.ownerClubId : player.currentClubId;
}

/** Club the player is registered to represent. */
export function playerRegisteredClubId(player: FootballPlayer): string | null {
  return player.currentClubId;
}

/**
 * Write ownership + registration through one boundary. The ordinary case is
 * compact: when owner and registration match, no owner override is persisted.
 */
export function setPlayerClubIdentityInPlace(
  player: FootballPlayer,
  ownerClubId: string | null,
  registeredClubId: string | null = ownerClubId,
): void {
  player.currentClubId = registeredClubId;
  if (ownerClubId === registeredClubId) delete player.ownerClubId;
  else player.ownerClubId = ownerClubId;
}

/**
 * v19 normalisation/backfill. Pre-v19 saves already encode registration in
 * currentClubId, so no duplicate field is needed. Any stray owner value equal
 * to registration is compacted away; a genuine divergence is preserved.
 */
export function ensurePlayerRegistrationStateInPlace(state: GameState): void {
  for (const player of state.football?.players ?? []) {
    const row = player as FootballPlayer & { registeredClubId?: string | null };
    // registeredClubId existed only during v19 development and was never a
    // shipping schema contract. If encountered, fold it into the canonical
    // playing-registration field before removing the duplicate.
    if (row.registeredClubId !== undefined) {
      player.currentClubId = row.registeredClubId;
      delete row.registeredClubId;
    }
    if (player.ownerClubId === player.currentClubId) delete player.ownerClubId;
  }
}

/** Squad membership is registration, not ownership. */
export function playerIsRegisteredTo(player: FootballPlayer, clubId: string): boolean {
  return playerRegisteredClubId(player) === clubId;
}

/** Contract/parent-club relationship is ownership, not registration. */
export function playerIsOwnedBy(player: FootballPlayer, clubId: string): boolean {
  return playerOwnerClubId(player) === clubId;
}
