import type { FootballPlayer, GameState, InjurySeverity, MatchInjury, MatchPlayerStats } from "./types";
import { absoluteWeek } from "./time";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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
    player.fitness = clamp(playerFitness(player) + 24, 0, 100);
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
    player.injury = {
      type: injury.type,
      severity: injury.severity,
      sustainedSeason: state.season,
      sustainedWeek: state.week,
      returnAbsoluteWeek: now + Math.max(1, injury.weeksOut),
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
