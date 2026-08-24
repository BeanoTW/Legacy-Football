/* Presentation helpers — extracted from engine.ts in Phase 0c.
 * Formatting only: no state, no domain logic.
 */
export const fmtMoney = (n: number) => {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(1)}k`;
  return `${sign}£${abs.toFixed(0)}`;
};

export const fmtMoneyExact = (n: number) => {
  const sign = n < 0 ? "-" : "";
  return `${sign}£${Math.abs(Math.round(n)).toLocaleString()}`;
};

/** Ordinal suffix for a 1-based position: 1 -> "st", 12 -> "th". */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"],
    v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
