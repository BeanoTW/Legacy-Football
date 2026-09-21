import type { GameState } from "./types";

/** Only genuine recorded matches contribute; never fabricate past appearances. */
export function playerSeasonStats(state: GameState, season = state.season) {
  const rows = new Map<
    string,
    {
      playerId: string;
      name: string;
      appearances: number;
      starts: number;
      substituteAppearances: number;
      minutes: number;
      goals: number;
      assists: number;
      yellowCards: number;
      ratingTotal: number;
    }
  >();
  for (const match of Object.values(state.playerMatchHistory ?? {})) {
    if (match.season !== season) continue;
    for (const player of match.players) {
      if (player.minutes <= 0) continue;
      const row = rows.get(player.playerId) ?? {
        playerId: player.playerId,
        name: player.name,
        appearances: 0,
        starts: 0,
        substituteAppearances: 0,
        minutes: 0,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        ratingTotal: 0,
      };
      row.appearances++;
      if (player.started === false) row.substituteAppearances++;
      else row.starts++;
      row.minutes += player.minutes;
      row.goals += player.goals;
      row.assists += player.assists;
      row.yellowCards += player.yellowCards;
      row.ratingTotal += player.rating;
      rows.set(player.playerId, row);
    }
  }
  return [...rows.values()]
    .map((row) => ({ ...row, averageRating: row.ratingTotal / row.appearances }))
    .sort(
      (a, b) => b.goals - a.goals || b.assists - a.assists || a.playerId.localeCompare(b.playerId),
    );
}


export interface PlayerSeasonLeaders {
  topScorer: ReturnType<typeof playerSeasonStats>[number] | null;
  topAssister: ReturnType<typeof playerSeasonStats>[number] | null;
  topRated: ReturnType<typeof playerSeasonStats>[number] | null;
  mostUsed: ReturnType<typeof playerSeasonStats>[number] | null;
}

export function playerSeasonLeaders(
  state: GameState,
  season = state.season,
): PlayerSeasonLeaders {
  const rows = playerSeasonStats(state, season);
  const by = (
    compare: (a: (typeof rows)[number], b: (typeof rows)[number]) => number,
  ) => rows.slice().sort(compare)[0] ?? null;
  return {
    topScorer: by(
      (a, b) => b.goals - a.goals || b.assists - a.assists || b.minutes - a.minutes,
    ),
    topAssister: by(
      (a, b) => b.assists - a.assists || b.goals - a.goals || b.minutes - a.minutes,
    ),
    topRated: by(
      (a, b) =>
        b.averageRating - a.averageRating ||
        b.appearances - a.appearances ||
        a.playerId.localeCompare(b.playerId),
    ),
    mostUsed: by(
      (a, b) => b.minutes - a.minutes || b.starts - a.starts || a.playerId.localeCompare(b.playerId),
    ),
  };
}
