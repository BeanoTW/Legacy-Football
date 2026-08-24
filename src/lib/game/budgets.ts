/* Budget controls — extracted verbatim from engine.ts (Phase 0c). */
import type { GameState } from "./types";

/**
 * @deprecated Transfer spending now comes directly from club cash. Kept as a
 * compatibility surface for older callers; it never ring-fences money.
 */
export function setTransferBudget(
  s: GameState,
  _amount: number,
): { state: GameState; ok: boolean; reason?: string } {
  const ns: GameState = structuredClone(s);
  ns.transferBudget = 0;
  return { state: ns, ok: true, reason: "Transfer spending now uses club cash" };
}

export function setWageBudget(s: GameState, amount: number): GameState {
  return { ...s, wageBudgetWeekly: Math.max(0, Math.round(amount)) };
}
