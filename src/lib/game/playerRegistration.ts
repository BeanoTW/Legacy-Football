import type { FootballPlayer, GameState } from "./types";

/**
 * Parent/contract-owning club. Falls back to the pre-v19 projection so runtime
 * compatibility remains safe while old or partially-migrated state is read.
 */
export function playerOwnerClubId(player: FootballPlayer): string | null {
  return player.ownerClubId !== undefined ? player.ownerClubId : player.currentClubId;
}

/**
 * Club the player is registered to represent. Before loans exist this equals
 * ownership; the fallback preserves pre-v19 behaviour exactly.
 */
export function playerRegisteredClubId(player: FootballPlayer): string | null {
  return player.registeredClubId !== undefined ? player.registeredClubId : player.currentClubId;
}

/**
 * Write canonical ownership + registration and keep currentClubId as the
 * compatibility projection of registration. This is the only helper new code
 * should use when all three intentionally move together.
 */
export function setPlayerClubIdentityInPlace(
  player: FootballPlayer,
  ownerClubId: string | null,
  registeredClubId: string | null = ownerClubId,
): void {
  player.ownerClubId = ownerClubId;
  player.registeredClubId = registeredClubId;
  player.currentClubId = registeredClubId;
}

/**
 * v19 seed/backfill. Idempotent: explicit values are never overwritten.
 * Existing saves therefore preserve today's exact ownership/squad behaviour.
 */
export function ensurePlayerRegistrationStateInPlace(state: GameState): void {
  for (const player of state.football?.players ?? []) {
    player.ownerClubId ??= player.currentClubId;
    player.registeredClubId ??= player.currentClubId;
    player.currentClubId = player.registeredClubId;
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
