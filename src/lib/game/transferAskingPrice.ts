import type { FootballPlayer, GameState } from "./types";

/* =========================================================================
   Chairman asking price
   -------------------------------------------------------------------------
   A presentation preference the Owner-Director sets for an owned player.
   It is not a simulation threshold: buying clubs still judge their own
   ceilings. It only pre-fills the counter we send when a bid arrives.
   Stored under the same inboxFlags key the old Sell Players desk used, so
   existing saves keep their asking prices.
========================================================================= */

const askKey = (playerId: string) => `transfer.ask.${playerId}`;

/** Default ask is 15% above market value, matching the previous sales desk. */
export function transferAskingPrice(state: GameState, player: FootballPlayer): number {
  const stored = state.inboxFlags?.[askKey(player.id)];
  return typeof stored === "number" && Number.isFinite(stored)
    ? Math.max(0, Math.round(stored))
    : Math.round(player.marketValue * 1.15);
}

export function hasCustomTransferAskingPrice(state: GameState, playerId: string): boolean {
  const stored = state.inboxFlags?.[askKey(playerId)];
  return typeof stored === "number" && Number.isFinite(stored);
}

/** Pure update: returns a new state with the asking price recorded. */
export function withTransferAskingPrice(
  state: GameState,
  playerId: string,
  value: number,
): GameState {
  return {
    ...state,
    inboxFlags: { ...state.inboxFlags, [askKey(playerId)]: Math.max(0, Math.round(value)) },
  };
}
