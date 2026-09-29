import type { GameState } from "./types";
import { economicProfileForLevel } from "./levelEconomy";
import { footballLevelOfUser } from "./footballLevel";

/** Both watched and simulated fixtures use the same level-scaled finance. */
export function matchdayBroadcastFee(s: GameState, draw: number): number {
  const econ = economicProfileForLevel(footballLevelOfUser(s));
  return Math.round(((econ.broadcastSeason * 0.07) / 23) * (0.85 + draw * 0.3));
}

export function matchdayOperatingCost(s: GameState, home: boolean, attendance: number): number {
  const econ = economicProfileForLevel(footballLevelOfUser(s));
  return home
    ? Math.round((4_200 + attendance * 1.35) * econ.matchdayCostFactor)
    : Math.round(3_200 * econ.matchdayCostFactor);
}
