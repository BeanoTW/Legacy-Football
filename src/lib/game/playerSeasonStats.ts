import type {
  GameState,
  PlayerSeasonRecord,
  PlayerSeasonSummary,
  StoredPlayerSeasonRow,
  StoredPlayerSeasonSummary,
} from "./types";

export interface LivePlayerSeasonStat extends PlayerSeasonRecord {
  yellowCards: number;
  ratingTotal: number;
}

/** Only genuine recorded matches contribute; never fabricate past appearances. */
export function playerSeasonStats(state: GameState, season = state.season): LivePlayerSeasonStat[] {
  const rows = new Map<string, LivePlayerSeasonStat>();
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
        averageRating: 0,
      };
      row.appearances++;
      if (player.started === false) row.substituteAppearances++;
      else row.starts++;
      row.minutes += player.minutes;
      row.goals += player.goals;
      row.assists += player.assists;
      row.yellowCards += player.yellowCards;
      row.ratingTotal += player.rating;
      row.averageRating = row.ratingTotal / row.appearances;
      rows.set(player.playerId, row);
    }
  }
  return [...rows.values()].sort(
    (a, b) => b.goals - a.goals || b.assists - a.assists || a.playerId.localeCompare(b.playerId),
  );
}

export interface PlayerSeasonLeaders {
  topScorer: LivePlayerSeasonStat | null;
  topAssister: LivePlayerSeasonStat | null;
  topRated: LivePlayerSeasonStat | null;
  mostUsed: LivePlayerSeasonStat | null;
}

export function playerSeasonLeaders(
  state: GameState,
  season = state.season,
): PlayerSeasonLeaders {
  const rows = playerSeasonStats(state, season);
  const by = (compare: (a: LivePlayerSeasonStat, b: LivePlayerSeasonStat) => number) =>
    rows.slice().sort(compare)[0] ?? null;
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

function publicRecord(row: LivePlayerSeasonStat): PlayerSeasonRecord {
  return {
    playerId: row.playerId,
    name: row.name,
    appearances: row.appearances,
    starts: row.starts,
    substituteAppearances: row.substituteAppearances,
    minutes: row.minutes,
    goals: row.goals,
    assists: row.assists,
    averageRating: Math.round(row.averageRating * 100) / 100,
  };
}

function storeRecord(row: PlayerSeasonRecord): StoredPlayerSeasonRow {
  return [
    row.playerId,
    row.name,
    row.appearances,
    row.starts,
    row.minutes,
    row.goals,
    row.assists,
    Math.round(row.averageRating * 100),
  ];
}

function expandRecord(row: StoredPlayerSeasonRow): PlayerSeasonRecord {
  const [playerId, name, appearances, starts, minutes, goals, assists, rating100] = row;
  return {
    playerId,
    name,
    appearances,
    starts,
    substituteAppearances: Math.max(0, appearances - starts),
    minutes,
    goals,
    assists,
    averageRating: rating100 / 100,
  };
}

function expandStored(summary: StoredPlayerSeasonSummary): PlayerSeasonSummary {
  return {
    season: summary.season,
    players: summary.players.map(expandRecord),
    topScorerId: summary.leaders[0],
    topAssisterId: summary.leaders[1],
    topRatedId: summary.leaders[2],
    mostUsedId: summary.leaders[3],
  };
}

function currentSummary(state: GameState, season: number): PlayerSeasonSummary | null {
  const rows = playerSeasonStats(state, season);
  if (!rows.length) return null;
  const leaders = playerSeasonLeaders(state, season);
  return {
    season,
    players: rows.map(publicRecord),
    topScorerId: leaders.topScorer?.playerId ?? null,
    topAssisterId: leaders.topAssister?.playerId ?? null,
    topRatedId: leaders.topRated?.playerId ?? null,
    mostUsedId: leaders.mostUsed?.playerId ?? null,
  };
}

export function closePlayerSeasonInPlace(
  state: GameState,
  season = state.season,
): PlayerSeasonSummary | null {
  const existing = (state.playerSeasonHistory ?? []).find((summary) => summary.season === season);
  if (existing) return expandStored(existing);

  const summary = currentSummary(state, season);
  if (!summary) return null;
  const stored: StoredPlayerSeasonSummary = {
    season,
    players: summary.players.map(storeRecord),
    leaders: [
      summary.topScorerId,
      summary.topAssisterId,
      summary.topRatedId,
      summary.mostUsedId,
    ],
  };
  state.playerSeasonHistory = [...(state.playerSeasonHistory ?? []), stored].sort(
    (a, b) => a.season - b.season,
  );
  return summary;
}

export function playerSeasonSummary(
  state: GameState,
  season: number,
): PlayerSeasonSummary | null {
  if (season === state.season) return currentSummary(state, season);
  const stored = (state.playerSeasonHistory ?? []).find((summary) => summary.season === season);
  return stored ? expandStored(stored) : null;
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
  averageRating: number;
}

function allPublicSummaries(state: GameState): PlayerSeasonSummary[] {
  const closed = (state.playerSeasonHistory ?? []).map(expandStored);
  const current = currentSummary(state, state.season);
  return current ? [...closed, current] : closed;
}

export function playerCareerTotals(
  state: GameState,
  playerId: string,
): PlayerCareerTotals | null {
  const rows = allPublicSummaries(state)
    .map((summary) => summary.players.find((player) => player.playerId === playerId))
    .filter((row): row is PlayerSeasonRecord => Boolean(row));
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
    averageRating: appearances > 0 ? weightedRating / appearances : 0,
  };
}

export function playerSeasonByPlayer(
  state: GameState,
  playerId: string,
): Array<{ season: number; record: PlayerSeasonRecord }> {
  return allPublicSummaries(state)
    .map((summary) => ({
      season: summary.season,
      record: summary.players.find((player) => player.playerId === playerId),
    }))
    .filter(
      (row): row is { season: number; record: PlayerSeasonRecord } => Boolean(row.record),
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
  for (const summary of allPublicSummaries(state)) {
    for (const player of summary.players) ids.add(player.playerId);
  }
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
