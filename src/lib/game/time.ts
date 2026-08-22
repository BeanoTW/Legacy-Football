/* =========================================================================
   Absolute timeline helpers
   -------------------------------------------------------------------------
   The game clock is (season, week) but almost every timing question — "is
   this due yet?", "how many weeks until it expires?", "when was the last
   cooldown tick?" — is easier and safer on a single monotonic axis.

   All scheduled generators, inbox expiry deadlines, cooldown timestamps
   and delayed consequences MUST use absolute weeks. Never subtract
   week-of-season values across a season rollover.
========================================================================= */

export const WEEKS_PER_SEASON = 46;

/** Convert (season, week) → single monotonic week index starting at 1. */
export function absoluteWeek(season: number, week: number): number {
  return (season - 1) * WEEKS_PER_SEASON + week;
}

/** Convert an absolute week index back to (season, week-of-season). */
export function fromAbsoluteWeek(abs: number): { season: number; week: number } {
  const zero = Math.max(0, abs - 1);
  return {
    season: Math.floor(zero / WEEKS_PER_SEASON) + 1,
    week: (zero % WEEKS_PER_SEASON) + 1,
  };
}

/** Add `weeks` to a (season, week) pair and return the new absolute index. */
export function addWeeksAbs(season: number, week: number, weeks: number): number {
  return absoluteWeek(season, week) + weeks;
}
