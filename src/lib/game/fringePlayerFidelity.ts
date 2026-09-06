import type { FootballPlayer, GameState } from "./types";
import type { CompactFringePlayer } from "./fringePlayers";
import { fringePlayerPresentation } from "./fringePlayerPresentation";
import {
  recruitmentLevelOfClub,
  recruitmentPlayerValue,
  recruitmentWageForClub,
} from "./recruitmentEconomy";

const BASE_YEAR = 2000;

function ageInSeason(player: { dateOfBirth: { year: number } }, season: number): number {
  return Math.max(16, BASE_YEAR + season - 1 - player.dateOfBirth.year);
}

/**
 * Raise one compact persistent identity into detailed Focus representation.
 * The same id, DOB, position and ability state cross the fidelity boundary;
 * only presentation and detailed market fields are derived here.
 */
export function hydrateCompactFringePlayer(
  state: GameState,
  compact: CompactFringePlayer,
  contractId: string | null = null,
): FootballPlayer {
  const presentation = fringePlayerPresentation(
    state.saveSeed,
    compact.playerId,
    compact.primaryPosition,
  );
  const age = ageInSeason(compact, state.season);
  const level = recruitmentLevelOfClub(state, compact.currentClubId);

  return {
    id: compact.playerId,
    firstName: presentation.firstName,
    lastName: presentation.lastName,
    dateOfBirth: { ...compact.dateOfBirth },
    nationality: presentation.nationality,
    preferredFoot: presentation.preferredFoot,
    primaryPosition: compact.primaryPosition,
    secondaryPositions: [...presentation.secondaryPositions],
    currentClubId: compact.currentClubId,
    reputation: Math.max(5, Math.min(98, Math.round(compact.currentAbility * 0.85))),
    currentAbility: compact.currentAbility,
    potentialAbility: compact.potentialAbility,
    marketValue: recruitmentPlayerValue(
      compact.currentAbility,
      compact.potentialAbility,
      age,
      level,
    ),
    wageExpectation: recruitmentWageForClub(
      state,
      compact.currentClubId,
      compact.currentAbility,
      age,
      compact.potentialAbility,
    ),
    personality: presentation.personality,
    contractId,
    transferStatus: "unlisted",
    availability: "available",
    createdSeason: compact.createdSeason ?? state.season,
  };
}

/**
 * Drop a detailed player back to cheap Fringe representation without changing
 * the human being. This is intentionally lossless for the fields required to
 * rehydrate the same player later.
 */
export function compactDetailedPlayerForFringe(
  state: GameState,
  player: FootballPlayer,
  contractExpirySeason: number,
): CompactFringePlayer {
  if (!player.currentClubId) {
    throw new Error(`cannot compact unattached player ${player.id} into a Fringe club`);
  }
  return {
    playerId: player.id,
    dateOfBirth: { ...player.dateOfBirth },
    primaryPosition: player.primaryPosition,
    currentAbility: player.currentAbility,
    potentialAbility: player.potentialAbility,
    currentClubId: player.currentClubId,
    contractExpirySeason,
    lastDevelopedSeason: state.season,
    createdSeason: player.createdSeason,
  };
}
