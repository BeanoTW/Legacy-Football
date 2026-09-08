import type { GameState } from "./types";
import {
  createScoutingBrief,
  scoutingCandidateProfile,
  type ScoutingBriefInput,
} from "./scoutingDiscovery";
import { userSquad } from "./recruitmentLegacy";

export type ScoutingPlayerLevel =
  | "backup"
  | "firstTeam"
  | "startingXI"
  | "star"
  | "firstTeamPotential"
  | "starPotential";

export const SCOUTING_PLAYER_LEVELS: Array<{
  value: ScoutingPlayerLevel;
  label: string;
  description: string;
}> = [
  { value: "backup", label: "Backup / squad depth", description: "Reliable cover who can support the first team." },
  { value: "firstTeam", label: "First-team player", description: "Good enough to contribute regularly at our level." },
  { value: "startingXI", label: "Starting XI player", description: "Should be capable of improving our current eleven." },
  { value: "star", label: "Star player", description: "A major signing expected to become one of our strongest players." },
  { value: "firstTeamPotential", label: "First-team potential", description: "A younger player with the ceiling to become a regular first-team option." },
  { value: "starPotential", label: "Star potential", description: "A development signing with the ceiling to become one of our best players." },
];

declare module "./scoutingDiscovery" {
  interface ScoutingBrief {
    /** Chairman-language quality target. Hidden ability numbers remain an implementation detail. */
    playerLevel?: ScoutingPlayerLevel;
  }
  interface ScoutingBriefInput {
    playerLevel?: ScoutingPlayerLevel;
  }
}

function percentileAbility(state: GameState, index: number): number {
  const abilities = userSquad(state)
    .map((player) => player.currentAbility)
    .sort((a, b) => b - a);
  if (!abilities.length) return Math.max(35, Math.round(32 + state.reputation * 0.62));
  return abilities[Math.min(abilities.length - 1, Math.max(0, index))];
}

export function scoutingPlayerLevelBenchmark(state: GameState, level: ScoutingPlayerLevel): number {
  switch (level) {
    case "star":
      return percentileAbility(state, 2);
    case "startingXI":
      return percentileAbility(state, 10);
    case "firstTeam":
      return percentileAbility(state, 15);
    case "backup":
      return percentileAbility(state, 20);
    case "starPotential":
      return percentileAbility(state, 2);
    case "firstTeamPotential":
      return percentileAbility(state, 15);
  }
}

export function scoutingPlayerLevelLabel(level: ScoutingPlayerLevel | undefined): string {
  return SCOUTING_PLAYER_LEVELS.find((item) => item.value === level)?.label ?? "Any first-team level";
}

export function createChairmanScoutingBrief(
  state: GameState,
  input: Omit<ScoutingBriefInput, "minCurrentAbility"> & { playerLevel: ScoutingPlayerLevel },
): GameState {
  const benchmark = scoutingPlayerLevelBenchmark(state, input.playerLevel);
  const potential = input.playerLevel === "firstTeamPotential" || input.playerLevel === "starPotential";
  return createScoutingBrief(state, {
    ...input,
    // The chairman never sees this number. It is only a search signal for the
    // existing recruitment engine; potential profiles use a deliberately lower
    // current-ability floor because development upside is assessed separately.
    minCurrentAbility: potential ? Math.max(35, benchmark - 10) : benchmark,
  });
}

/**
 * Hidden fit score used by recruitment staff when presenting candidates. It
 * compares the candidate against the user's actual squad rather than a global
 * ability number, so "star" means star for this club.
 */
export function chairmanScoutingFitScore(
  state: GameState,
  briefId: string,
  playerId: string,
): number {
  const brief = state.football?.scoutingDiscovery?.briefs.find((item) => item.id === briefId);
  const level = brief?.playerLevel;
  const profile = scoutingCandidateProfile(state, playerId);
  if (!level || !profile) return 0;
  const target = scoutingPlayerLevelBenchmark(state, level);
  switch (level) {
    case "backup":
      return -Math.abs(profile.currentAbility - target);
    case "firstTeam":
      return -Math.abs(profile.currentAbility - target) + profile.currentAbility * 0.08;
    case "startingXI":
      return -Math.abs(profile.currentAbility - target) + profile.currentAbility * 0.12;
    case "star":
      return profile.currentAbility - Math.max(0, target - profile.currentAbility) * 2;
    case "firstTeamPotential":
      return profile.potentialAbility - Math.abs(profile.potentialAbility - target) * 0.35 - Math.max(0, profile.currentAbility - target) * 0.15;
    case "starPotential":
      return profile.potentialAbility * 1.2 + profile.currentAbility * 0.2 - Math.max(0, target - profile.potentialAbility) * 2;
  }
}
