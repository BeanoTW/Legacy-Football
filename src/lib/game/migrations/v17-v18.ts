import type { GameState } from "../types";
import { ensureEmploymentStateInPlace } from "../employment";
import type { Migration } from "./types";

/**
 * Employment becomes explicit without changing any historical wage, duration
 * or club ownership. Existing live contracts inherit the club operating model
 * deterministically once; future club-model changes do not rewrite them.
 */
export const EMPLOYMENT_MIGRATIONS: Migration[] = [
  {
    from: 17,
    to: 18,
    describe: "Persist club operating models and player contract employment terms",
    up(save) {
      ensureEmploymentStateInPlace(save as unknown as GameState);
    },
  },
];
