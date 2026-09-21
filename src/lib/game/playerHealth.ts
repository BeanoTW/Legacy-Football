import type { FootballPlayer, GameState, InjurySeverity, MatchInjury, MatchPlayerStats, Staff } from "./types";
import { absoluteWeek } from "./time";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));


export interface MedicalSupport {
  score: number;
  recoveryPerWeek: number;
  injuryRiskMultiplier: number;
  label: "Basic" | "Developing" | "Good" | "Excellent";
}

function medicalStaff(state: GameState, role: Staff["role"]): Staff | undefined {
  return (state.hiredStaff ?? []).find((staff) => staff.role === role);
}

/**
 * Backroom medical quality has a bounded, visible effect: it cannot make
 * injuries disappear, but stronger specialists improve recovery and reduce
 * preventable soft-tissue risk.
 */
export function medicalSupport(state: GameState): MedicalSupport {
  const physio = medicalStaff(state, "Head Physio");
  const scientist = medicalStaff(state, "Sports Scientist");
  const fitnessCoach = medicalStaff(state, "Fitness Coach");
  const weighted =
    (physio?.stats.medical ?? 45) * 0.5 +
    (scientist?.stats.medical ?? 45) * 0.3 +
    (fitnessCoach?.stats.medical ?? 45) * 0.2;
  const score = Math.round(clamp(weighted, 30, 95));
  const recoveryPerWeek = Math.round(18 + ((score - 30) / 65) * 14);
  const injuryRiskMultiplier = Math.round(clamp(1.12 - ((score - 30) / 65) * 0.42, 0.7, 1.12) * 100) / 100;
  const label = score >= 80 ? "Excellent" : score >= 66 ? "Good" : score >= 52 ? "Developing" : "Basic";
  return { score, recoveryPerWeek, injuryRiskMultiplier, label };
}

export function playerInjuryRiskMultiplier(state: GameState): number {
  return medicalSupport(state).injuryRiskMultiplier;
}

export function fixtureLoadThisWeek(state: GameState): number {
  return state.fixtures.filter((fixture) => fixture.week === state.week).length;
}

export function squadAverageFitness(state: GameState): number {
  const players = state.football.players.filter((player) => player.currentClubId != null);
  if (!players.length) return 100;
  return Math.round(players.reduce((sum, player) => sum + playerFitness(player), 0) / players.length);
}

export const playerFitness = (player: FootballPlayer): number =>
  clamp(Math.round(player.fitness ?? 100), 0, 100);

export function playerIsAvailable(player: FootballPlayer, state: GameState): boolean {
  if (player.availability !== "available") return false;
  const injury = player.injury;
  return !injury || injury.returnAbsoluteWeek <= absoluteWeek(state.season, state.week);
}

export function recoverPlayerHealthWeekInPlace(state: GameState): void {
  const now = absoluteWeek(state.season, state.week);
  for (const player of state.football.players) {
    // Keep untouched players sparse: legacy/world players imply 100 fitness
    // until they actually accumulate match load or an injury.
    if (player.fitness === undefined && !player.injury) continue;
    player.fitness = clamp(playerFitness(player) + medicalSupport(state).recoveryPerWeek, 0, 100);
    if (player.injury && player.injury.returnAbsoluteWeek <= now) {
      player.injury = null;
      player.availability = "available";
    }
  }
}

export function applyMatchLoadInPlace(
  state: GameState,
  playerStats: MatchPlayerStats[],
  injuries: MatchInjury[] = [],
): void {
  const byId = new Map(state.football.players.map((player) => [player.id, player]));
  for (const stat of playerStats) {
    if (stat.minutes <= 0) continue;
    const player = byId.get(stat.playerId);
    if (!player) continue;
    const intensity = stat.minutes / 90;
    const drain = Math.round(8 + intensity * 15);
    player.fitness = clamp(playerFitness(player) - drain, 0, 100);
  }

  const now = absoluteWeek(state.season, state.week);
  for (const injury of injuries) {
    if (injury.side !== "us") continue;
    const player = byId.get(injury.playerId);
    if (!player) continue;
    const support = medicalSupport(state);
    const recoveryDiscount =
      support.score >= 82 ? 0.72 : support.score >= 68 ? 0.82 : support.score >= 54 ? 0.92 : 1;
    const adjustedWeeks = Math.max(1, Math.round(injury.weeksOut * recoveryDiscount));
    player.injury = {
      type: injury.type,
      severity: injury.severity,
      sustainedSeason: state.season,
      sustainedWeek: state.week,
      returnAbsoluteWeek: now + adjustedWeeks,
    };
    player.availability = "unavailable";
    player.fitness = Math.min(playerFitness(player), injury.severity === "serious" ? 45 : 65);
  }
}

export function injuryWeeks(severity: InjurySeverity): number {
  switch (severity) {
    case "knock":
      return 1;
    case "minor":
      return 2;
    case "moderate":
      return 4;
    case "serious":
      return 8;
  }
}

export function fitnessLabel(value: number): "Fresh" | "Good" | "Tired" | "Very tired" {
  if (value >= 88) return "Fresh";
  if (value >= 72) return "Good";
  if (value >= 55) return "Tired";
  return "Very tired";
}
