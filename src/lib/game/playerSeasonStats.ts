import type { GameState, PlayerSeasonSummary } from "./types";

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
  const maxApps = rows.reduce((max, row) => Math.max(max, row.appearances), 0);
  const ratingMinimum = Math.max(3, Math.ceil(maxApps * 0.35));
  const ratingPool = rows.filter((row) => row.appearances >= ratingMinimum);
  return {
    topScorer: by(
      (a, b) => b.goals - a.goals || b.assists - a.assists || b.minutes - a.minutes,
    ),
    topAssister: by(
      (a, b) => b.assists - a.assists || b.goals - a.goals || b.minutes - a.minutes,
    ),
    topRated:
      ratingPool
        .slice()
        .sort(
          (a, b) =>
            b.averageRating - a.averageRating ||
            b.appearances - a.appearances ||
            a.playerId.localeCompare(b.playerId),
        )[0] ?? null,
    mostUsed: by(
      (a, b) => b.minutes - a.minutes || b.starts - a.starts || a.playerId.localeCompare(b.playerId),
    ),
  };
}


export function closePlayerSeasonInPlace(
  state: GameState,
  season = state.season,
): PlayerSeasonSummary | null {
  if ((state.playerSeasonHistory ?? []).some((summary) => summary.season === season)) {
    return state.playerSeasonHistory!.find((summary) => summary.season === season) ?? null;
  }
  const players = playerSeasonStats(state, season).map((row) => ({
    playerId: row.playerId,
    name: row.name,
    appearances: row.appearances,
    starts: row.starts,
    substituteAppearances: row.substituteAppearances,
    minutes: row.minutes,
    goals: row.goals,
    assists: row.assists,
    yellowCards: row.yellowCards,
    averageRating: Math.round(row.averageRating * 100) / 100,
  }));
  if (!players.length) return null;
  const leaders = playerSeasonLeaders(state, season);
  const summary: PlayerSeasonSummary = {
    season,
    players,
    topScorerId: leaders.topScorer?.playerId ?? null,
    topAssisterId: leaders.topAssister?.playerId ?? null,
    topRatedId: leaders.topRated?.playerId ?? null,
    mostUsedId: leaders.mostUsed?.playerId ?? null,
  };
  state.playerSeasonHistory = [...(state.playerSeasonHistory ?? []), summary].sort(
    (a, b) => a.season - b.season,
  );
  return summary;
}

export function playerSeasonSummary(
  state: GameState,
  season: number,
): PlayerSeasonSummary | null {
  if (season === state.season) {
    const players = playerSeasonStats(state, season);
    if (!players.length) return null;
    const leaders = playerSeasonLeaders(state, season);
    return {
      season,
      players: players.map((row) => ({
        playerId: row.playerId,
        name: row.name,
        appearances: row.appearances,
        starts: row.starts,
        substituteAppearances: row.substituteAppearances,
        minutes: row.minutes,
        goals: row.goals,
        assists: row.assists,
        yellowCards: row.yellowCards,
        averageRating: Math.round(row.averageRating * 100) / 100,
      })),
      topScorerId: leaders.topScorer?.playerId ?? null,
      topAssisterId: leaders.topAssister?.playerId ?? null,
      topRatedId: leaders.topRated?.playerId ?? null,
      mostUsedId: leaders.mostUsed?.playerId ?? null,
    };
  }
  return (state.playerSeasonHistory ?? []).find((summary) => summary.season === season) ?? null;
}


export interface PlayerCareerTotals {
  playerId: string;
  name: string;
  seasons: number;
  appearances: number;
  starts: number;
  substituteAppearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  averageRating: number;
}

export function playerCareerTotals(
  state: GameState,
  playerId: string,
): PlayerCareerTotals | null {
  const summaries = [
    ...(state.playerSeasonHistory ?? []),
    ...(playerSeasonSummary(state, state.season)
      ? [playerSeasonSummary(state, state.season)!]
      : []),
  ];
  const rows = summaries
    .map((summary) => summary.players.find((player) => player.playerId === playerId))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  if (!rows.length) return null;
  const appearances = rows.reduce((sum, row) => sum + row.appearances, 0);
  const weightedRating = rows.reduce(
    (sum, row) => sum + row.averageRating * row.appearances,
    0,
  );
  return {
    playerId,
    name: rows[rows.length - 1].name,
    seasons: rows.length,
    appearances,
    starts: rows.reduce((sum, row) => sum + row.starts, 0),
    substituteAppearances: rows.reduce((sum, row) => sum + row.substituteAppearances, 0),
    minutes: rows.reduce((sum, row) => sum + row.minutes, 0),
    goals: rows.reduce((sum, row) => sum + row.goals, 0),
    assists: rows.reduce((sum, row) => sum + row.assists, 0),
    yellowCards: rows.reduce((sum, row) => sum + row.yellowCards, 0),
    averageRating: appearances > 0 ? weightedRating / appearances : 0,
  };
}

export function playerSeasonByPlayer(
  state: GameState,
  playerId: string,
): Array<{
  season: number;
  record: PlayerSeasonSummary["players"][number];
}> {
  const summaries = [
    ...(state.playerSeasonHistory ?? []),
    ...(playerSeasonSummary(state, state.season)
      ? [playerSeasonSummary(state, state.season)!]
      : []),
  ];
  return summaries
    .map((summary) => ({
      season: summary.season,
      record: summary.players.find((player) => player.playerId === playerId),
    }))
    .filter(
      (row): row is { season: number; record: PlayerSeasonSummary["players"][number] } =>
        Boolean(row.record),
    )
    .sort((a, b) => b.season - a.season);
}


export interface ClubPlayerRecords {
  appearances: PlayerCareerTotals | null;
  goals: PlayerCareerTotals | null;
  assists: PlayerCareerTotals | null;
  minutes: PlayerCareerTotals | null;
}

export function clubPlayerRecords(state: GameState): ClubPlayerRecords {
  const ids = new Set<string>();
  for (const summary of state.playerSeasonHistory ?? []) {
    for (const player of summary.players) ids.add(player.playerId);
  }
  for (const player of playerSeasonStats(state)) ids.add(player.playerId);
  const careers = [...ids]
    .map((id) => playerCareerTotals(state, id))
    .filter((career): career is PlayerCareerTotals => Boolean(career));
  const best = (
    compare: (a: PlayerCareerTotals, b: PlayerCareerTotals) => number,
  ): PlayerCareerTotals | null => careers.slice().sort(compare)[0] ?? null;
  return {
    appearances: best(
      (a, b) =>
        b.appearances - a.appearances ||
        b.minutes - a.minutes ||
        a.playerId.localeCompare(b.playerId),
    ),
    goals: best(
      (a, b) =>
        b.goals - a.goals ||
        b.appearances - a.appearances ||
        a.playerId.localeCompare(b.playerId),
    ),
    assists: best(
      (a, b) =>
        b.assists - a.assists ||
        b.appearances - a.appearances ||
        a.playerId.localeCompare(b.playerId),
    ),
    minutes: best(
      (a, b) =>
        b.minutes - a.minutes ||
        b.appearances - a.appearances ||
        a.playerId.localeCompare(b.playerId),
    ),
  };
}
