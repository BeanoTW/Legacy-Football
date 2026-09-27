import type { GameState } from "./types";
import {
  managerFootballIdentity,
  type ManagerFormation,
  type ManagerTendency,
} from "./managerIdentity";
import { managerMatchPrep } from "./managerMatchPrep";

export interface ManagerMatchStyle {
  formation: ManagerFormation;
  philosophy: string;
  possessionBias: number;
  chanceBias: number;
  attackModifier: number;
  defenseModifier: number;
  tempo: "Low" | "Medium" | "High";
  pressing: "Low" | "Medium" | "High";
  directness: "Low" | "Medium" | "High";
}

const tendency = { Low: -1, Medium: 0, High: 1 } as const;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export interface ManagerTendencies {
  philosophy: string;
  tempo: ManagerTendency;
  pressing: ManagerTendency;
  directness: ManagerTendency;
}

export function neutralMatchStyle(formation: ManagerFormation): ManagerMatchStyle {
  return {
    formation,
    philosophy: "Balanced",
    possessionBias: 0,
    chanceBias: 0,
    attackModifier: 1,
    defenseModifier: 1,
    tempo: "Medium",
    pressing: "Medium",
    directness: "Medium",
  };
}

export function matchStyleFromTendencies(
  tendencies: ManagerTendencies,
  formation: ManagerFormation,
): ManagerMatchStyle {
  const { philosophy } = tendencies;
  const possessionPhilosophy = philosophy === "Possession" ? 0.08 : philosophy === "Direct" ? -0.05 : 0;
  const frontFoot = philosophy === "Front-foot" ? 0.05 : philosophy === "Defensive" ? -0.05 : 0;
  const defensive = philosophy === "Defensive" ? 0.06 : philosophy === "Front-foot" ? -0.02 : 0;
  const tempo = tendency[tendencies.tempo];
  const pressing = tendency[tendencies.pressing];
  const directness = tendency[tendencies.directness];

  return {
    formation,
    philosophy,
    possessionBias: clamp(possessionPhilosophy + tempo * 0.015 - directness * 0.015, -0.1, 0.1),
    chanceBias: clamp(frontFoot + tempo * 0.025 + directness * 0.015, -0.08, 0.1),
    attackModifier: clamp(1 + frontFoot + tempo * 0.02 + directness * 0.01, 0.9, 1.12),
    defenseModifier: clamp(1 + defensive + pressing * 0.025, 0.92, 1.1),
    tempo: tendencies.tempo,
    pressing: tendencies.pressing,
    directness: tendencies.directness,
  };
}

export function managerMatchStyle(state: GameState): ManagerMatchStyle {
  const manager = state.hiredStaff.find((staff) => staff.role === "Manager");
  const prep = managerMatchPrep(state);
  if (!manager) return neutralMatchStyle(prep.selectedFormation);
  return matchStyleFromTendencies(managerFootballIdentity(manager), prep.selectedFormation);
}
