import type { GameState } from "../types";
import { migrateClubReferencesToIdsInPlace } from "../clubReferenceMigration";
import type { Migration } from "./types";

/**
 * Staged separately from v15->v16 so saves first persist an identity registry,
 * then rewrite foreign-key-like references only once runtime consumers are ID-aware.
 */
export const CLUB_REFERENCE_MIGRATIONS: Migration[] = [
  {
    from: 16,
    to: 17,
    describe: "Rewrite persisted club references from display names to opaque club IDs",
    up(save) {
      migrateClubReferencesToIdsInPlace(save as unknown as GameState);
    },
  },
];
