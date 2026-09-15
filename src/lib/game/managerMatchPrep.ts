import type { GameState, Staff } from "./types";
import { managerFootballIdentity, type ManagerFormation } from "./managerIdentity";
import { managerSquadFit, type SquadFitBand } from "./managerSquadFit";

export interface ManagerMatchPrep {
  managerId: string | null;
  managerName: string;
  preferredFormation: ManagerFormation;
  selectedFormation: ManagerFormation;
  squadFitScore: number;
  squadFitBand: SquadFitBand | "Caretaker";
  style: string;
  strengthAdjustment: number;
  summary: string;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Translate the manager's football identity and the current squad into the
 * shape he would actually prepare for matchday. This is derived rather than
 * persisted so recruitment changes immediately alter the football picture.
 */
export function managerMatchPrep(state: GameState): ManagerMatchPrep {
  const manager: Staff | undefined = (state.hiredStaff ?? []).find((staff) => staff.role === "Manager");
  if (!manager) {
    return {
      managerId: null,
      managerName: "Caretaker staff",
      preferredFormation: "4-4-2",
      selectedFormation: "4-4-2",
      squadFitScore: 50,
      squadFitBand: "Caretaker",
      style: "Balanced",
      strengthAdjustment: 0,
      summary: "Caretaker staff keep the side in a neutral 4-4-2 without a specialist tactical edge.",
    };
  }

  const identity = managerFootballIdentity(manager);
  const fit = managerSquadFit(state, manager);
  const selectedFormation = fit.bestFormation;

  // Tactical fit should matter, but never overpower player quality. Excellent
  // alignment is worth a small matchday edge; forcing a poor-fit shape carries
  // a similarly bounded cost. High adaptability already influences bestFormation.
  const fitAdjustment = (fit.bestFormationScore - 60) * 0.04;
  const adaptabilityAdjustment =
    selectedFormation !== identity.preferredFormation
      ? identity.adaptability === "High"
        ? 0.25
        : identity.adaptability === "Low"
          ? -0.2
          : 0
      : 0;
  const strengthAdjustment = round2(Math.max(-1.5, Math.min(1.5, fitAdjustment + adaptabilityAdjustment)));

  const shapeLine =
    selectedFormation === identity.preferredFormation
      ? `${manager.name} is setting the side up in his preferred ${selectedFormation}.`
      : `${manager.name} is adapting from his preferred ${identity.preferredFormation} to ${selectedFormation} for this squad.`;

  return {
    managerId: manager.id,
    managerName: manager.name,
    preferredFormation: identity.preferredFormation,
    selectedFormation,
    squadFitScore: fit.bestFormationScore,
    squadFitBand: fit.band,
    style: identity.philosophy,
    strengthAdjustment,
    summary: `${shapeLine} ${fit.band} squad fit; ${identity.philosophy.toLowerCase()} approach.`,
  };
}
