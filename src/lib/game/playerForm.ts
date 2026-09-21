import type { GameState } from "./types";

export type PlayerFormBand = "Hot" | "Good" | "Steady" | "Poor" | "No form";

export interface PlayerRecentForm {
  playerId: string;
  appearances: number;
  averageRating: number;
  goals: number;
  assists: number;
  minutes: number;
  band: PlayerFormBand;
  selectionAdjustment: number;
}

function chronology(key: string): [number, number, number, string] {
  const [season, week, day] = key.split("|");
  return [Number(season) || 0, Number(week) || 0, Number(day) || 0, key];
}

export function playerRecentForm(
  state: GameState,
  playerId: string,
  limit = 5,
): PlayerRecentForm {
  const appearances = Object.entries(state.playerMatchHistory ?? {})
    .filter(([, match]) => match.season === state.season)
    .map(([key, match]) => ({
      key,
      player: match.players.find((candidate) => candidate.playerId === playerId),
    }))
    .filter(
      (row): row is { key: string; player: NonNullable<(typeof row)["player"]> } =>
        Boolean(row.player && row.player.minutes > 0),
    )
    .sort((a, b) => {
      const ca = chronology(a.key);
      const cb = chronology(b.key);
      return (
        cb[0] - ca[0] ||
        cb[1] - ca[1] ||
        cb[2] - ca[2] ||
        String(cb[3]).localeCompare(String(ca[3]))
      );
    })
    .slice(0, Math.max(1, limit));

  if (!appearances.length) {
    return {
      playerId,
      appearances: 0,
      averageRating: 0,
      goals: 0,
      assists: 0,
      minutes: 0,
      band: "No form",
      selectionAdjustment: 0,
    };
  }

  // Recent matches carry slightly more weight without making form overpower ability.
  let weightTotal = 0;
  let ratingTotal = 0;
  appearances.forEach((row, index) => {
    const weight = Math.max(1, appearances.length - index);
    weightTotal += weight;
    ratingTotal += row.player.rating * weight;
  });
  const averageRating = ratingTotal / weightTotal;
  const goals = appearances.reduce((sum, row) => sum + row.player.goals, 0);
  const assists = appearances.reduce((sum, row) => sum + row.player.assists, 0);
  const minutes = appearances.reduce((sum, row) => sum + row.player.minutes, 0);
  const band: PlayerFormBand =
    appearances.length < 2
      ? "Steady"
      : averageRating >= 7.35
        ? "Hot"
        : averageRating >= 6.85
          ? "Good"
          : averageRating >= 6.15
            ? "Steady"
            : "Poor";
  const sample = Math.min(1, appearances.length / 4);
  const selectionAdjustment =
    Math.round(Math.max(-2.4, Math.min(2.4, (averageRating - 6.45) * 1.55 * sample)) * 100) / 100;

  return {
    playerId,
    appearances: appearances.length,
    averageRating,
    goals,
    assists,
    minutes,
    band,
    selectionAdjustment,
  };
}

export function inFormPlayers(state: GameState, limit = 3): PlayerRecentForm[] {
  const ids = new Set<string>();
  for (const match of Object.values(state.playerMatchHistory ?? {})) {
    if (match.season !== state.season) continue;
    for (const player of match.players) if (player.minutes > 0) ids.add(player.playerId);
  }
  return [...ids]
    .map((id) => playerRecentForm(state, id))
    .filter((form) => form.appearances >= 2)
    .sort(
      (a, b) =>
        b.averageRating - a.averageRating ||
        b.appearances - a.appearances ||
        a.playerId.localeCompare(b.playerId),
    )
    .slice(0, limit);
}
