import type { GameState } from "../types";
import type { Migration } from "./types";
import { ensureClubIdentityStateInPlace } from "../clubIdentity";

export const CLUB_IDENTITY_MIGRATIONS: Migration[] = [
  {
    from: 15,
    to: 16,
    describe: "Persist opaque immutable club identity registry before reference migration",
    up(save) {
      ensureClubIdentityStateInPlace(save as unknown as GameState);
    },
  },
];
