import type { GameState } from "./types";
import { managerFootballIdentity } from "./managerIdentity";
import { managerMatchPrep } from "./managerMatchPrep";

export interface ManagerMatchStyle {
  formation: string;
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

/**
 * Read-only translation from the appointed manager's football identity into
 * match-engine behaviour. The chairman never controls these values directly.
 * Keep modifiers deliberately small: player quality remains the main driver.
 */
export function managerMatchStyle(state: GameState): ManagerMatchStyle {
  const manager = state.hiredStaff.find((staff) => staff.role === "Manager");
  const prep = managerMatchPrep(state);
  if (!manager) {
    return {
      formation: prep.selectedFormation,
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

  const identity = managerFootballIdentity(manager);
  const possessionPhilosophy = identity.philosophy === "Possession" ? 0.08 : identity.philosophy === "Direct" ? -0.05 : 0;
  const frontFoot = identity.philosophy === "Front-foot" ? 0.05 : identity.philosophy === "Defensive" ? -0.05 : 0;
  const defensive = identity.philosophy === "Defensive" ? 0.06 : identity.philosophy === "Front-foot" ? -0.02 : 0;
  const tempo = tendency[identity.tempo];
  const pressing = tendency[identity.pressing];
  const directness = tendency[identity.directness];

  return {
    formation: prep.selectedFormation,
    philosophy: identity.philosophy,
    possessionBias: clamp(possessionPhilosophy + tempo * 0.015 - directness * 0.015, -0.1, 0.1),
    chanceBias: clamp(frontFoot + tempo * 0.025 + directness * 0.015, -0.08, 0.1),
    attackModifier: clamp(1 + frontFoot + tempo * 0.02 + directness * 0.01, 0.9, 1.12),
    defenseModifier: clamp(1 + defensive + pressing * 0.025, 0.92, 1.1),
    tempo: identity.tempo,
    pressing: identity.pressing,
    directness: identity.directness,
  };
}
