import type { GameState } from "../types";
import type { Migration } from "./types";

export const V14_TO_V15: Migration = {
  from: 14,
  to: 15,
  describe: "Add persistent player scouting assignments",
  up(p) {
    const state = p as unknown as GameState;
    state.football.scoutingReports ??= [];
  },
};

export const SCOUTING_MIGRATIONS: Migration[] = [V14_TO_V15];
