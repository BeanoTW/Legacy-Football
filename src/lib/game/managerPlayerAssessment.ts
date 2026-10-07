import type {
  FootballPlayer,
  GameState,
  Staff,
  TacticalPosition,
} from "./types";
import { managerMatchPrep } from "./managerMatchPrep";
import { MANAGER_FORMATION_SLOTS } from "./managerFormationLayout";
import { userMatchBench, userMatchLineup } from "./matchLineup";
import {
  POSITION_EFFECTIVENESS,
  positionFamiliarity,
  positionUnit,
} from "./positions";
import { ageOf } from "./recruitmentLegacy";
import { isUserClubReference } from "./clubReference";
import { playerRegisteredClubId } from "./playerRegistration";

export type ManagerPlayerRole =
  | "Key player"
  | "Regular starter"
  | "Rotation"
  | "Backup"
  | "Development"
  | "Surplus";

export type ManagerPlayerFit =
  | "Natural fit"
  | "Good fit"
  | "Workable fit"
  | "Awkward fit";

export type ManagerPlannedUse = "Starter" | "Bench" | "Outside squad";

export interface ManagerPlayerAssessment {
  playerId: string;
  managerId: string | null;
  managerName: string;
  role: ManagerPlayerRole;
  plannedUse: ManagerPlannedUse;
  fit: ManagerPlayerFit;
  bestRole?: TacticalPosition;
  developmentPlayer: boolean;
  summary: string;
}

function userPlayers(state: GameState): FootballPlayer[] {
  return state.football.players.filter((player) =>
    isUserClubReference(state, playerRegisteredClubId(player)),
  );
}

function bestRoleForPlayer(
  player: FootballPlayer,
  roles: readonly TacticalPosition[],
): { role?: TacticalPosition; effectiveness: number } {
  const candidates = roles
    .filter((role) => role === "GK" ? player.primaryPosition === "GK" : player.primaryPosition !== "GK")
    .map((role) => ({
      role,
      effectiveness:
        positionUnit(role) === player.primaryPosition ||
        player.secondaryPositions.includes(positionUnit(role))
          ? POSITION_EFFECTIVENESS[positionFamiliarity(player, role)]
          : Math.min(0.72, POSITION_EFFECTIVENESS[positionFamiliarity(player, role)]),
    }))
    .sort(
      (a, b) =>
        b.effectiveness - a.effectiveness ||
        a.role.localeCompare(b.role),
    );
  return candidates[0] ?? { effectiveness: 0.5 };
}

function fitLabel(effectiveness: number): ManagerPlayerFit {
  if (effectiveness >= 0.98) return "Natural fit";
  if (effectiveness >= 0.9) return "Good fit";
  if (effectiveness >= 0.78) return "Workable fit";
  return "Awkward fit";
}

function developmentCandidate(state: GameState, player: FootballPlayer): boolean {
  const age = ageOf(player, state.season);
  return age <= 22 && player.potentialAbility >= player.currentAbility + 7;
}

function roleFor(
  plannedUse: ManagerPlannedUse,
  development: boolean,
  fit: ManagerPlayerFit,
  abilityRank: number,
): ManagerPlayerRole {
  if (plannedUse === "Starter") {
    return abilityRank <= 3 ? "Key player" : "Regular starter";
  }
  if (plannedUse === "Bench") {
    return development ? "Development" : "Rotation";
  }
  if (development) return "Development";
  if (fit === "Awkward fit" && abilityRank > 18) return "Surplus";
  return abilityRank > 20 ? "Surplus" : "Backup";
}

/**
 * Pure football assessment. This is deliberately not a relationship or mood
 * system: the manager provides selection/use/fit information, but gains no
 * authority and applies no pressure when the director chooses differently.
 */
export function managerPlayerAssessment(
  state: GameState,
  playerId: string,
): ManagerPlayerAssessment | null {
  const players = userPlayers(state);
  const player = players.find((candidate) => candidate.id === playerId);
  if (!player) return null;

  const manager: Staff | undefined = state.hiredStaff.find((member) => member.role === "Manager");
  const prep = managerMatchPrep(state);
  const roles = MANAGER_FORMATION_SLOTS[prep.selectedFormation];
  const lineup = userMatchLineup(state, prep.selectedFormation);
  const bench = userMatchBench(state, lineup);
  const startingSlot = lineup.find((row) => row.playerId === playerId);
  const benchSlot = bench.find((row) => row.playerId === playerId);
  const plannedUse: ManagerPlannedUse = startingSlot
    ? "Starter"
    : benchSlot
      ? "Bench"
      : "Outside squad";

  const fitResult = startingSlot
    ? {
        role: startingSlot.role,
        effectiveness: POSITION_EFFECTIVENESS[positionFamiliarity(player, startingSlot.role)],
      }
    : bestRoleForPlayer(player, roles);
  const fit = fitLabel(fitResult.effectiveness);
  const development = developmentCandidate(state, player);
  const abilityRank =
    players
      .slice()
      .sort((a, b) => b.currentAbility - a.currentAbility || a.id.localeCompare(b.id))
      .findIndex((candidate) => candidate.id === playerId) + 1;
  const role = roleFor(plannedUse, development, fit, abilityRank);

  const shape = prep.selectedFormation;
  const roleText = fitResult.role ? " as " + fitResult.role : "";
  const summary =
    role === "Development"
      ? prep.managerName + " sees " + plannedUse.toLowerCase() + " use now with development upside in " + shape + roleText + "."
      : role === "Surplus"
        ? prep.managerName + " does not currently have the player in the matchday group; " + fit.toLowerCase() + " for " + shape + roleText + "."
        : prep.managerName + " currently sees the player as " + role.toLowerCase() + " in " + shape + roleText + "; " + fit.toLowerCase() + ".";

  return {
    playerId,
    managerId: manager?.id ?? null,
    managerName: prep.managerName,
    role,
    plannedUse,
    fit,
    bestRole: fitResult.role,
    developmentPlayer: development,
    summary,
  };
}

export function managerSquadAssessments(state: GameState): ManagerPlayerAssessment[] {
  return userPlayers(state)
    .map((player) => managerPlayerAssessment(state, player.id))
    .filter((assessment): assessment is ManagerPlayerAssessment => Boolean(assessment))
    .sort((a, b) => {
      const useRank: Record<ManagerPlannedUse, number> = {
        Starter: 0,
        Bench: 1,
        "Outside squad": 2,
      };
      return useRank[a.plannedUse] - useRank[b.plannedUse] || a.playerId.localeCompare(b.playerId);
    });
}
