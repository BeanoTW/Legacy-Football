import { postEntry } from "../finance";
import type { GameState } from "../types";
import type { Migration } from "./types";

/**
 * v14 removes the separate transfer pot. Any money previously ring-fenced is
 * returned to the bank through the canonical ledger so cash reconciliation is
 * preserved. Existing careers keep their current league membership.
 */
export const V13_TO_V14: Migration = {
  from: 13,
  to: 14,
  describe: "Consolidate transfer funds into club cash",
  up(p) {
    const s = p as unknown as GameState;
    const ringFenced = Math.max(0, Math.round(Number(s.transferBudget) || 0));
    if (ringFenced > 0) {
      postEntry(s, {
        category: "Transfers",
        subcategory: "Budget release",
        description: "Transfer funds consolidated into the club bank balance",
        amount: ringFenced,
        direction: "income",
        sourceSystem: "migration",
        dedupeKey: "migration:v14:transfer-budget-release",
      });
    }
    s.transferBudget = 0;
  },
};

export const CASH_MIGRATIONS: Migration[] = [V13_TO_V14];
