import type {
  ClubOperatingModel,
  ContractEmploymentType,
  GameState,
  PlayerContract,
  PlayerEmploymentStatus,
} from "./types";
import { footballLevelOfClub, type FootballLevel } from "./footballLevel";
import { clubReputation } from "./reputation";
import { isUserClubReference, userClubReference } from "./clubReference";
import { ASSET_CONFIG, assetById } from "./infrastructure";
import { stadiumAccreditation } from "./stadiumAccreditation";

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

/**
 * Employment pressure on NEW wage negotiations.
 *
 * Levels 1-6 keep their already-calibrated professional economy unchanged.
 * At native semi-professional levels 7-8, going full-time raises future wage
 * expectations without touching any signed contract.
 */
export function employmentNegotiationWageFactorFor(
  model: ClubOperatingModel,
  level: FootballLevel,
): number {
  return model === "FullTime" && level >= 7 ? 1.15 : 1;
}

/**
 * Recruitment-attraction benefit of a lower-league full-time setup.
 *
 * This is deliberately modest: it acts like +4 club reputation when judging
 * whether a player is willing to talk. Higher levels are already professional
 * by economic design and receive no duplicate bonus.
 */
export function employmentRecruitmentReputationBonusFor(
  model: ClubOperatingModel,
  level: FootballLevel,
): number {
  return model === "FullTime" && level >= 7 ? 4 : 0;
}

export const PROFESSIONALISATION_MIN_TRAINING_LEVEL = 2;

export interface ProfessionalisationReadiness {
  allowed: boolean;
  reason: string;
  currentModel: ClubOperatingModel;
  footballLevel: FootballLevel;
  trainingLevel: number;
  trainingLabel: string;
  minimumTrainingLevel: number;
  stadiumCapacity: number;
  minimumStadiumCapacity: number;
  stadiumReady: boolean;
  futureWageFactor: number;
  recruitmentReputationBonus: number;
}

/**
 * One canonical picture of whether the controlled club is ready to become
 * full-time. The facility requirement is deliberately based on the real
 * training-ground asset: construction has to finish before this becomes true.
 */
export function userProfessionalisationReadiness(
  state: GameState,
): ProfessionalisationReadiness {
  const clubId = userClubReference(state);
  const currentModel = clubOperatingModel(state, clubId);
  const footballLevel = footballLevelOfClub(state, clubId);
  const training = assetById(state, "training");
  const trainingLevel = training?.level ?? 0;
  const trainingLabel =
    ASSET_CONFIG.training.levels[Math.max(0, trainingLevel - 1)] ?? "No training ground";
  const ground = stadiumAccreditation(state);
  const impact = {
    currentModel,
    footballLevel,
    trainingLevel,
    trainingLabel,
    minimumTrainingLevel: PROFESSIONALISATION_MIN_TRAINING_LEVEL,
    stadiumCapacity: ground.usableCapacity,
    minimumStadiumCapacity: 1_950,
    stadiumReady: ground.professionalisationReady,
    futureWageFactor: employmentNegotiationWageFactorFor("FullTime", footballLevel),
    recruitmentReputationBonus: employmentRecruitmentReputationBonusFor(
      "FullTime",
      footballLevel,
    ),
  };

  if (currentModel === "FullTime") {
    return { ...impact, allowed: false, reason: "The club already operates full-time." };
  }
  if (!training) {
    return {
      ...impact,
      allowed: false,
      reason: "The club needs a recognised training ground before it can become full-time.",
    };
  }
  if (training.status === "closed") {
    return {
      ...impact,
      allowed: false,
      reason: "The training ground must be open before the club can become full-time.",
    };
  }
  if (trainingLevel < PROFESSIONALISATION_MIN_TRAINING_LEVEL) {
    return {
      ...impact,
      allowed: false,
      reason: "Upgrade the Training Ground to Basic ground or better first.",
    };
  }
  if (!ground.professionalisationReady) {
    const missing = ground.professionalisationRequirements.find((item) => !item.met);
    return {
      ...impact,
      allowed: false,
      reason: missing ? `Ground accreditation: ${missing.label} must reach ${missing.required}.` : "The ground does not yet meet the full-time operating standard.",
    };
  }
  return {
    ...impact,
    allowed: true,
    reason: "The training ground and stadium meet the requirements for full-time operation.",
  };
}

export interface EmploymentActionResult {
  ok: boolean;
  reason: string;
}

/**
 * Irreversible chairman transition into full-time operation. Existing player
 * contracts keep the employment basis and wage they were signed on.
 */
export function professionaliseUserClubInPlace(state: GameState): EmploymentActionResult {
  const readiness = userProfessionalisationReadiness(state);
  if (!readiness.allowed) return { ok: false, reason: readiness.reason };
  setClubOperatingModelInPlace(state, userClubReference(state), "FullTime");
  return {
    ok: true,
    reason:
      "The club is now full-time. Existing contracts are unchanged; new terms use the full-time employment model.",
  };
}

export function professionaliseUserClub(
  state: GameState,
): { state: GameState; result: EmploymentActionResult } {
  const next = structuredClone(state);
  const result = professionaliseUserClubInPlace(next);
  return result.ok ? { state: next, result } : { state, result };
}

function derivedClubOperatingModel(state: GameState, clubId: string): ClubOperatingModel {
  const level = footballLevelOfClub(state, clubId);
  // The new-career contract is explicitly semi-professional. Keep this as a
  // seed rule, not a permanent user-club exception: later-career migrations
  // and future professionalisation use the club's actual persisted model.
  if (state.season === 1 && level === 7 && isUserClubReference(state, clubId)) {
    return "PartTime";
  }
  return initialClubOperatingModelFor(level, clubReputation(state, clubId));
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
