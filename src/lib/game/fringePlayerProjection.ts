import type { FringeClubState, GameState, Position } from "./types";
import { legacyTierToFootballLevel } from "./footballLevel";
import { recruitmentPlayerValue, recruitmentWageForLevel } from "./recruitmentEconomy";
import { fringePlayersForClub } from "./fringePlayers";
import { fringePlayerPresentation } from "./fringePlayerPresentation";
import type { KnownPlayerSeed } from "./playerLifecycle";

const BASE_YEAR = 2000;

export interface FringePlayerProjection {
  id: string;
  identity: KnownPlayerSeed;
  currentAbility: number;
  potentialAbility: number;
  marketValue: number;
  wageExpectation: number;
  age: number;
  primaryPosition: Position;
}

/**
 * Project one actual persistent compact player for scouting. The projection is
 * presentation/economy only: identity, DOB, ability and club ownership come
 * directly from fringePlayers and no FootballPlayer is hydrated merely because
 * a scout discovered the player.
 */
export function projectFringePlayer(
  state: GameState,
  club: FringeClubState,
  position: Position,
): FringePlayerProjection {
  const player = fringePlayersForClub(state, club.clubId).find(
    (candidate) => candidate.primaryPosition === position,
  );
  if (!player) {
    throw new Error(`compact fringe squad ${club.clubId} has no active ${position}`);
  }

  const presentation = fringePlayerPresentation(
    state.saveSeed,
    player.playerId,
    player.primaryPosition,
  );
  const age = Math.max(16, BASE_YEAR + state.season - 1 - player.dateOfBirth.year);
  const identity: KnownPlayerSeed = {
    playerId: player.playerId,
    firstName: presentation.firstName,
    lastName: presentation.lastName,
    dateOfBirth: { ...player.dateOfBirth },
    nationality: presentation.nationality,
    primaryPosition: player.primaryPosition,
    currentClubId: player.currentClubId,
    createdSeason: player.createdSeason ?? state.season,
  };
  const level = legacyTierToFootballLevel(club.tier);

  return {
    id: player.playerId,
    identity,
    currentAbility: player.currentAbility,
    potentialAbility: player.potentialAbility,
    marketValue: recruitmentPlayerValue(
      player.currentAbility,
      player.potentialAbility,
      age,
      level,
    ),
    wageExpectation: recruitmentWageForLevel(
      level,
      player.currentAbility,
      club.reputation,
      age,
      player.potentialAbility,
    ),
    age,
    primaryPosition: player.primaryPosition,
  };
}
