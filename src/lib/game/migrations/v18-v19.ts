import type { GameState } from "../types";
import { ensurePlayerRegistrationStateInPlace } from "../playerRegistration";
import type { Migration } from "./types";

/**
 * Split player parent-club ownership from playing registration without changing
 * any existing football behaviour. Pre-v19 attached players begin with both
 * references equal to currentClubId; free agents begin with both null.
 */
export const PLAYER_REGISTRATION_MIGRATIONS: Migration[] = [
  {
    from: 18,
    to: 19,
    describe: "Persist explicit player ownership and registration club references",
    up(save) {
      ensurePlayerRegistrationStateInPlace(save as unknown as GameState);
    },
  },
];
