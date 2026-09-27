import type { GameState } from "../types";
import { hashString } from "../rng";
import { clubReputation } from "../reputation";
import { footballLevelOfClub, footballLevelOfLeague, type FootballLevel } from "../footballLevel";
import { playerReputationForAbility } from "../playerOverall";
import type { Migration } from "./types";

function deepestWorldLevel(state: GameState): FootballLevel {
  return state.leagues.reduce<FootballLevel>(
    (deepest, league) => {
      const level = footballLevelOfLeague(league);
      return level > deepest ? level : deepest;
    },
    1,
  );
}

function deterministicNoise(state: GameState, playerId: string): number {
  const raw = hashString(`${state.saveSeed}|player-reputation-v23|${playerId}`) >>> 0;
  return (raw % 7) - 3;
}

/**
 * v22 unified club reputation. v23 applies the matching player-reputation
 * model to existing detailed players without touching ability, potential,
 * contracts or career history.
 */
export const PLAYER_REPUTATION_MIGRATIONS: Migration[] = [
  {
    from: 22,
    to: 23,
    describe: "Calibrate player reputation to ability, football level and club standing",
    up(save) {
      const state = save as unknown as GameState;
      const deepest = deepestWorldLevel(state);
      for (const player of state.football?.players ?? []) {
        const level = player.currentClubId
          ? footballLevelOfClub(state, player.currentClubId)
          : deepest;
        const standing = player.currentClubId
          ? clubReputation(state, player.currentClubId)
          : undefined;
        player.reputation = playerReputationForAbility(
          player.currentAbility,
          level,
          standing,
          deterministicNoise(state, player.id),
        );
      }
    },
  },
];
