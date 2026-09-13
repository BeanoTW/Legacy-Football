import type { ScoutingPlayerLevel } from "./chairmanScoutingBrief";

export interface SemanticScoutingCandidate {
  currentAbility: number;
  potentialAbility: number;
  age: number;
}

/**
 * Hidden football-fit signal used by the discovery engine. The chairman asks
 * for a role in football language; this translates that role into how well a
 * candidate matches the squad-relative benchmark captured by the brief.
 */
export function semanticScoutingFit(
  candidate: SemanticScoutingCandidate,
  level: ScoutingPlayerLevel | undefined,
  benchmark: number | undefined,
): number {
  if (!level || benchmark === undefined) return 0;

  switch (level) {
    case "backup":
      return -Math.abs(candidate.currentAbility - benchmark) * 1.25;
    case "firstTeam":
      return -Math.abs(candidate.currentAbility - benchmark) + candidate.currentAbility * 0.08;
    case "startingXI":
      return -Math.abs(candidate.currentAbility - benchmark) * 1.1 + candidate.currentAbility * 0.12;
    case "star":
      return (candidate.currentAbility - benchmark) * 1.5 - Math.max(0, benchmark - candidate.currentAbility) * 2;
    case "firstTeamPotential": {
      const ageBonus = candidate.age <= 21 ? 5 : candidate.age <= 24 ? 2 : candidate.age >= 28 ? -6 : 0;
      return candidate.potentialAbility - Math.abs(candidate.potentialAbility - benchmark) * 0.45 + ageBonus;
    }
    case "starPotential": {
      const ageBonus = candidate.age <= 21 ? 7 : candidate.age <= 24 ? 3 : candidate.age >= 28 ? -8 : 0;
      return candidate.potentialAbility * 1.25 + candidate.currentAbility * 0.12 - Math.max(0, benchmark - candidate.potentialAbility) * 2.5 + ageBonus;
    }
  }
}
