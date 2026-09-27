import type { GameState } from "../types";
import { canonicalClubReference, userClubReference } from "../clubReference";
import type { Migration } from "./types";

const clamp = (value: number) => Math.max(0, Math.min(100, value));

/**
 * v21 still carried two user-club reputation values: the old top-level field
 * used by finance/commercial/staff systems and the canonical club map used by
 * the living world. Existing careers should preserve the value the chairman
 * actually saw and played under, then keep one mirrored value from here on.
 */
export const USER_REPUTATION_MIGRATIONS: Migration[] = [
  {
    from: 21,
    to: 22,
    describe: "Unify controlled-club reputation across legacy and canonical state",
    up(save) {
      const state = save as unknown as GameState;
      const legacy = Number(state.reputation);
      if (!Number.isFinite(legacy)) return;

      state.clubReputations ??= {};
      const userRef = userClubReference(state);
      const canonical = canonicalClubReference(state, userRef);
      const next = Math.round(clamp(legacy) * 10) / 10;
      state.clubReputations[canonical] = next;

      if (
        canonical !== state.clubName &&
        Object.prototype.hasOwnProperty.call(state.clubReputations, state.clubName)
      ) {
        delete state.clubReputations[state.clubName];
      }
      state.reputation = next;
    },
  },
];
