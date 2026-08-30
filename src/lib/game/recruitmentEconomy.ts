import type { GameState } from "./types";
import { clubReputation } from "./reputation";
import {
  footballLevelOfClub,
  footballLevelOfUser,
  type FootballLevel,
} from "./footballLevel";
import {
  contractWageForLevel,
  negotiationWageForLevel,
  normaliseTransferFeeForLevel,
  playerValueForLevel,
  sustainableWeeklyWageBillForLevel,
  transferFeePolicyForLevel,
  weeklyWageForLevel,
} from "./levelEconomy";

/**
 * Recruitment-facing economic adapters.
 *
 * Recruitment should reason in football levels, never persisted legacy tiers.
 * Keeping these lookups here also prevents transfer, contract and squad code
 * from duplicating the legacy-tier bridge while old saves are still supported.
 */
export function recruitmentLevelOfClub(state: GameState, clubId: string): FootballLevel {
  return footballLevelOfClub(state, clubId);
}

export function recruitmentLevelOfUser(state: GameState): FootballLevel {
  return footballLevelOfUser(state);
}

export function recruitmentWageForClub(
  state: GameState,
  clubId: string,
  ability: number,
  age?: number,
  potential?: number,
): number {
  return weeklyWageForLevel({
    ability,
    level: recruitmentLevelOfClub(state, clubId),
    clubReputation: clubReputation(state, clubId),
    age,
    potential,
  });
}

export function recruitmentWageForLevel(
  level: FootballLevel,
  ability: number,
  clubRep = 55,
  age?: number,
  potential?: number,
): number {
  return weeklyWageForLevel({ ability, level, clubReputation: clubRep, age, potential });
}

export function recruitmentContractWageForLevel(
  level: FootballLevel,
  baseWeeklyWage: number,
  scalar: number,
): number {
  return contractWageForLevel(baseWeeklyWage, scalar, level);
}

export function recruitmentContractWageForClub(
  state: GameState,
  clubId: string,
  baseWeeklyWage: number,
  scalar: number,
): number {
  return contractWageForLevel(baseWeeklyWage, scalar, recruitmentLevelOfClub(state, clubId));
}

export function recruitmentNegotiationWageForLevel(
  level: FootballLevel,
  rawWeeklyWage: number,
): number {
  return negotiationWageForLevel(rawWeeklyWage, level);
}

export function recruitmentUserNegotiationWage(state: GameState, rawWeeklyWage: number): number {
  return negotiationWageForLevel(rawWeeklyWage, recruitmentLevelOfUser(state));
}

export function recruitmentPlayerValue(
  ability: number,
  potential: number,
  age: number,
  level: FootballLevel,
): number {
  return playerValueForLevel(ability, potential, age, level);
}

export function recruitmentTransferFeePolicyForClub(state: GameState, clubId: string) {
  return transferFeePolicyForLevel(recruitmentLevelOfClub(state, clubId));
}

export function recruitmentTransferFeePolicyForUser(state: GameState) {
  return transferFeePolicyForLevel(recruitmentLevelOfUser(state));
}

export function recruitmentNormaliseTransferFeeForClub(
  state: GameState,
  clubId: string,
  rawFee: number,
  floor: "none" | "asking" = "none",
): number {
  return normaliseTransferFeeForLevel(rawFee, recruitmentLevelOfClub(state, clubId), floor);
}

export function recruitmentNormaliseTransferFeeForUser(
  state: GameState,
  rawFee: number,
  floor: "none" | "asking" = "none",
): number {
  return normaliseTransferFeeForLevel(rawFee, recruitmentLevelOfUser(state), floor);
}

export function recruitmentSustainableWageBill(
  state: GameState,
  clubId: string,
  homeMatches = 23,
): number {
  return sustainableWeeklyWageBillForLevel(
    recruitmentLevelOfClub(state, clubId),
    clubReputation(state, clubId),
    homeMatches,
  );
}

export function recruitmentUserSustainableWageBill(state: GameState, homeMatches = 23): number {
  return sustainableWeeklyWageBillForLevel(
    recruitmentLevelOfUser(state),
    clubReputation(state, state.clubName),
    homeMatches,
  );
}
