/* Budget controls — extracted verbatim from engine.ts (Phase 0c).
 *
 * The transfer pot is real money: allocating moves cash out of the club's
 * spendable balance and releasing puts it back. Both legs are booked through
 * postEntry so cash, the ledger and the weekly projection stay reconciled.
 */
import type { GameState } from "./types";
import { postEntry } from "./finance";

export function setTransferBudget(
  s: GameState,
  amount: number,
): { state: GameState; ok: boolean; reason?: string } {
  const target = Math.max(0, Math.round(amount));
  const delta = target - s.transferBudget;
  if (delta > 0 && delta > s.cash) {
    return { state: s, ok: false, reason: "Not enough spendable cash to allocate" };
  }
  const ns: GameState = structuredClone(s);
  ns.transferBudget = target;
  if (delta !== 0) {
    postEntry(ns, {
      category: "Transfers",
      subcategory: delta > 0 ? "Budget ring-fence" : "Budget release",
      description:
        delta > 0
          ? "Cash ring-fenced into the transfer budget"
          : "Unused transfer budget returned to spendable cash",
      amount: Math.abs(delta),
      direction: delta > 0 ? "expense" : "income",
      sourceSystem: "transfers",
    });
  }
  return { state: ns, ok: true };
}

export function setWageBudget(s: GameState, amount: number): GameState {
  return { ...s, wageBudgetWeekly: Math.max(0, Math.round(amount)) };
}
