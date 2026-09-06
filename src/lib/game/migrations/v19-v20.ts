import type { GameState } from "../types";
import { ensureLoanStateInPlace } from "../loans";
import type { Migration } from "./types";

/** Persist canonical loan agreement state without changing any existing player. */
export const LOAN_MIGRATIONS: Migration[] = [
  {
    from: 19,
    to: 20,
    describe: "Persist player loan agreements and deterministic loan ids",
    up(save) {
      ensureLoanStateInPlace(save as unknown as GameState);
    },
  },
];
