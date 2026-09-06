import type { FootballPlayer, GameState } from "../types";
import { ensurePlayerRegistrationStateInPlace } from "../playerRegistration";
import type { Migration } from "./types";

/**
 * Establish ownership-vs-registration semantics without duplicating every club
 * reference. In all genuine v18 saves currentClubId is authoritative for both.
 */
export const PLAYER_REGISTRATION_MIGRATIONS: Migration[] = [
  {
    from: 18,
    to: 19,
    describe: "Establish sparse player ownership and registration identity",
    up(save) {
      const state = save as unknown as GameState;
      for (const player of state.football?.players ?? []) {
        const row = player as FootballPlayer & { registeredClubId?: string | null };
        // These keys did not exist in shipping v18. Discard any stray/dev copy
        // rather than allowing a stale display-name reference to survive the
        // already-completed club-ID migration.
        delete player.ownerClubId;
        delete row.registeredClubId;
      }
      ensurePlayerRegistrationStateInPlace(state);
    },
  },
];
