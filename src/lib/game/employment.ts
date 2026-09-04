import type {
  ClubOperatingModel,
  ContractEmploymentType,
  GameState,
  PlayerContract,
  PlayerEmploymentStatus,
} from "./types";
import { footballLevelOfClub, type FootballLevel } from "./footballLevel";
import { clubReputation } from "./reputation";

/**
 * New-career / migration seed only. Once persisted, a club's operating model
 * is its own state and is not recalculated merely because league level changes.
 *
 * Levels 6-8 intentionally overlap: a strong lower-league club can operate
 * full-time while a smaller peer remains part-time.
 */
export function initialClubOperatingModelFor(
  level: FootballLevel,
  reputation: number,
): ClubOperatingModel {
  if (level <= 5) return "FullTime";
  if (level === 6) return reputation >= 32 ? "FullTime" : "PartTime";
  if (level === 7) return reputation >= 50 ? "FullTime" : "PartTime";
  return reputation >= 65 ? "FullTime" : "PartTime";
}

function derivedClubOperatingModel(state: GameState, clubId: string): ClubOperatingModel {
  return initialClubOperatingModelFor(
    footballLevelOfClub(state, clubId),
    clubReputation(state, clubId),
  );
}

/** Read persisted state, with a deterministic fallback for old/uninitialised saves. */
export function clubOperatingModel(state: GameState, clubId: string): ClubOperatingModel {
  return state.football?.employment?.clubModels?.[clubId] ?? derivedClubOperatingModel(state, clubId);
}

/**
 * Seed explicit club employment state and backfill live contracts. Idempotent.
 * Existing explicit contract employment is never rewritten.
 */
export function ensureEmploymentStateInPlace(state: GameState): void {
  if (!state.football) return;
  state.football.employment ??= { clubModels: {} };
  const models = state.football.employment.clubModels;

  const clubs = new Set<string>();
  for (const league of state.leagues ?? []) {
    for (const clubId of league.clubIds ?? []) clubs.add(clubId);
  }
  for (const contract of state.football.contracts ?? []) clubs.add(contract.clubId);

  for (const clubId of [...clubs].sort((a, b) => a.localeCompare(b))) {
    models[clubId] ??= derivedClubOperatingModel(state, clubId);
  }

  for (const contract of state.football.contracts ?? []) {
    contract.employmentType ??= models[contract.clubId] ?? derivedClubOperatingModel(state, contract.clubId);
  }
}

/**
 * Strategic operating-model mutation. Crucially this does NOT rewrite signed
 * contracts; players move to the new basis only when a future deal is issued.
 */
export function setClubOperatingModelInPlace(
  state: GameState,
  clubId: string,
  model: ClubOperatingModel,
): void {
  if (!state.football) return;
  ensureEmploymentStateInPlace(state);
  state.football.employment!.clubModels[clubId] = model;
}

export function contractEmploymentType(
  state: GameState,
  contract: PlayerContract,
): ContractEmploymentType {
  return contract.employmentType ?? clubOperatingModel(state, contract.clubId);
}

export function playerEmploymentStatus(
  state: GameState,
  playerId: string,
): PlayerEmploymentStatus {
  const player = state.football?.players.find((candidate) => candidate.id === playerId);
  if (!player?.contractId) return "NonContract";
  const contract = state.football?.contracts.find(
    (candidate) =>
      candidate.id === player.contractId &&
      (candidate.status === "Active" || candidate.status === "Expiring" || candidate.status === "Agreed"),
  );
  return contract ? contractEmploymentType(state, contract) : "NonContract";
}
