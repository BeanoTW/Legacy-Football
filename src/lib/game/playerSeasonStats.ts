import type { GameState } from "./types";

/** Only genuine recorded matches contribute; never fabricate past appearances. */
export function playerSeasonStats(state: GameState, season = state.season) {
  const rows = new Map<
    string,
    {
      playerId: string;
      name: string;
      appearances: number;
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
        minutes: 0,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        ratingTotal: 0,
      };
      row.appearances++;
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
