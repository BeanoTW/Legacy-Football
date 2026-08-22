/* Archive-aware reader helpers — Phase 1b.
 *
 * Once historical detail has been compacted out of the hot core, the live
 * simulation must still behave EXACTLY as if that detail were present for the
 * handful of quantities it genuinely depends on:
 *
 *   - finance reconciliation (cash === income − expense across all time)
 *   - dedupe guards (finance dedupeKeys, inbox eventKeys)
 *   - cumulative "spend to date" style aggregates
 *   - per-season commercial income
 *
 * Everything here is a pure read over `state.archive`, which is absent on a
 * freshly simulated (never-compacted) state. Absent archive => zero residue,
 * so behaviour is bit-identical to pre-1b.
 */
import type { ArchivedFinanceBucket, GameState } from "./types";

const EMPTY_KEYS: string[] = [];

/** Sorted-array membership test (guardKeys are stored sorted + unique). */
function sortedHas(keys: string[], key: string): boolean {
  let lo = 0;
  let hi = keys.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = keys[mid]!;
    if (v === key) return true;
    if (v < key) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

/** Has this finance dedupe key already been posted in archived history? */
export function archivedFinanceGuard(s: GameState, dedupeKey: string): boolean {
  const keys = s.archive?.finance.guardKeys ?? EMPTY_KEYS;
  return keys.length > 0 && sortedHas(keys, dedupeKey);
}

/** Event keys of archived inbox items that a generator could re-emit. */
export function archivedInboxGuardKeys(s: GameState): string[] {
  return s.archive?.inbox.guardKeys ?? EMPTY_KEYS;
}

/** Signed net (income − expense) of everything archived. */
export function archivedNet(s: GameState): number {
  return s.archive?.finance.net ?? 0;
}

/** Consecutive losing weeks at the tail of the archived range. */
export function archivedTrailingLossWeeks(s: GameState): number {
  return s.archive?.finance.trailingLossWeeks ?? 0;
}

/** Highest absolute week represented in the archive (0 when none). */
export function archivedLastAbsoluteWeek(s: GameState): number {
  return s.archive?.finance.lastAbsoluteWeek ?? 0;
}

/** Sum archived finance buckets matching a predicate. */
export function archivedBucketSum(
  s: GameState,
  match: (b: ArchivedFinanceBucket) => boolean,
): number {
  let total = 0;
  for (const b of s.archive?.finance.buckets ?? []) if (match(b)) total += b.amount;
  return total;
}

/** Commercial income banked in a season that has since been archived. */
export function archivedCommercialIncome(s: GameState, season: number): number {
  return s.archive?.finance.commercialIncomeBySeason?.[String(season)] ?? 0;
}
