/* =========================================================================
   Deterministic RNG utilities
   -------------------------------------------------------------------------
   Inbox generators must be pure functions of GameState. Any randomness
   used for gameplay-significant outcomes (sponsor uplift values,
   pushback success, etc.) has to be seeded from stable inputs so that:

     - Reloading the save and re-running the same week produces the
       identical inbox items and follow-up outcomes.
     - Two independent evaluations of the same generator with the same
       state agree on IDs, monetary values and choice outcomes.

   Do NOT use Math.random(), Date.now() or crypto.randomUUID() for any
   value that is persisted into an InboxItem or that determines a
   follow-up outcome.
========================================================================= */

/** FNV-1a 32-bit string hash. Fast, dependency-free, adequate as a seed. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Force to unsigned 32-bit.
  return h >>> 0;
}

/** Mulberry32 — small, well-distributed 32-bit seedable PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a seeded RNG from an arbitrary list of stable inputs. Typical
 * call site: `seededRng(saveSeed, generatorId, subjectName, season)`.
 */
export function seededRng(...parts: (string | number)[]): () => number {
  return mulberry32(hashString(parts.join("|")));
}

/** Convenience: uniform float in [min, max). */
export function rngRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Convenience: uniform integer in [min, max] inclusive. */
export function rngInt(rng: () => number, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}
