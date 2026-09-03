import type { GameState, LeagueRow } from "./types";
import { canonicalClubReference, sameClubReference } from "./clubReference";

export interface ClubLegacyBestFinish {
  season: number;
  leagueId: string;
  tier: number;
  position: number;
}

export interface ClubLegacyTransferRecord {
  fee: number;
  playerId: string;
  season: number;
  week: number;
  absoluteWeek: number;
}

export interface ClubLegacyAttendanceRecord {
  attendance: number;
  season: number;
  week: number;
  opponentId: string;
}

/**
 * Tiny permanent facts that should survive even if detailed historical rows are
 * compacted away later. Club ids are always opaque canonical references; this
 * accumulator never creates new persistence keyed by mutable display names.
 */
export interface ClubLegacyRecord {
  clubId: string;
  leagueTitles: number;
  promotions: number;
  relegations: number;
  bestLeagueFinish?: ClubLegacyBestFinish;
  recordTransferPaid?: ClubLegacyTransferRecord;
  recordTransferReceived?: ClubLegacyTransferRecord;
  recordAttendance?: ClubLegacyAttendanceRecord;
  /** Reserved for real cup results once a cup competition supplies them. */
  cupHonours?: { competitionId: string; season: number }[];
}

export interface ClubLegacyState {
  schemaVersion: 1;
  processedSeasons: number[];
  clubsById: Record<string, ClubLegacyRecord>;
}

declare module "./types" {
  interface GameState {
    clubLegacy?: ClubLegacyState;
  }
}

export interface CompletedLeagueLegacySummary {
  leagueId: string;
  tier: number;
  table: LeagueRow[];
  champion: string;
  promoted: string[];
  relegated: string[];
}

function newLegacyState(): ClubLegacyState {
  return { schemaVersion: 1, processedSeasons: [], clubsById: {} };
}

function recordFor(state: GameState, legacy: ClubLegacyState, ref: string): ClubLegacyRecord {
  const clubId = canonicalClubReference(state, ref);
  return (legacy.clubsById[clubId] ??= {
    clubId,
    leagueTitles: 0,
    promotions: 0,
    relegations: 0,
  });
}

function betterFinish(next: ClubLegacyBestFinish, current: ClubLegacyBestFinish | undefined): boolean {
  if (!current) return true;
  if (next.tier !== current.tier) return next.tier < current.tier;
  if (next.position !== current.position) return next.position < current.position;
  return next.season < current.season;
}

function betterTransfer(
  next: ClubLegacyTransferRecord,
  current: ClubLegacyTransferRecord | undefined,
): boolean {
  if (!current) return true;
  if (next.fee !== current.fee) return next.fee > current.fee;
  if (next.absoluteWeek !== current.absoluteWeek) return next.absoluteWeek < current.absoluteWeek;
  return next.playerId.localeCompare(current.playerId) < 0;
}

function betterAttendance(
  next: ClubLegacyAttendanceRecord,
  current: ClubLegacyAttendanceRecord | undefined,
): boolean {
  if (!current) return true;
  if (next.attendance !== current.attendance) return next.attendance > current.attendance;
  if (next.season !== current.season) return next.season < current.season;
  if (next.week !== current.week) return next.week < current.week;
  return next.opponentId.localeCompare(current.opponentId) < 0;
}

/**
 * Preserve only facts actually known at the close of a season. This is an
 * accumulator, not a second history database: no tables, match logs or player
 * careers are duplicated here, and unknown cup/attendance/transfer history is
 * never invented.
 */
export function accumulateClubLegacySeasonInPlace(
  state: GameState,
  outcomes: readonly CompletedLeagueLegacySummary[],
  season = state.season,
): ClubLegacyState {
  const legacy = state.clubLegacy ?? newLegacyState();
  if (legacy.processedSeasons.includes(season)) {
    state.clubLegacy = legacy;
    return legacy;
  }

  for (const outcome of outcomes) {
    const championId = outcome.champion ? canonicalClubReference(state, outcome.champion) : null;
    const promoted = new Set(outcome.promoted.map((club) => canonicalClubReference(state, club)));
    const relegated = new Set(outcome.relegated.map((club) => canonicalClubReference(state, club)));

    outcome.table.forEach((row, index) => {
      const record = recordFor(state, legacy, row.team);
      const finish: ClubLegacyBestFinish = {
        season,
        leagueId: outcome.leagueId,
        tier: outcome.tier,
        position: index + 1,
      };
      if (betterFinish(finish, record.bestLeagueFinish)) record.bestLeagueFinish = finish;
      if (record.clubId === championId) record.leagueTitles += 1;
      if (promoted.has(record.clubId)) record.promotions += 1;
      if (relegated.has(record.clubId)) record.relegations += 1;
    });
  }

  for (const transfer of state.football?.transferHistory ?? []) {
    if (transfer.season !== season || transfer.fee <= 0) continue;
    const candidate: ClubLegacyTransferRecord = {
      fee: transfer.fee,
      playerId: transfer.playerId,
      season: transfer.season,
      week: transfer.week,
      absoluteWeek: transfer.absoluteWeek,
    };
    if (transfer.toClubId) {
      const buyer = recordFor(state, legacy, transfer.toClubId);
      if (betterTransfer(candidate, buyer.recordTransferPaid)) buyer.recordTransferPaid = candidate;
    }
    if (transfer.fromClubId) {
      const seller = recordFor(state, legacy, transfer.fromClubId);
      if (betterTransfer(candidate, seller.recordTransferReceived)) {
        seller.recordTransferReceived = candidate;
      }
    }
  }

  // The current simulation only knows attendance for the user's own home
  // matches. Record that real information and leave every unknown AI attendance
  // unset rather than fabricating a world-wide number.
  const userRecord = recordFor(state, legacy, state.clubName);
  for (const result of state.results ?? []) {
    if (!result.home || result.attendance <= 0) continue;
    const fixture = (state.fixtures ?? []).find(
      (candidate) =>
        candidate.week === result.week &&
        candidate.home &&
        sameClubReference(state, candidate.opponent, result.opponent),
    );
    if (!fixture) continue;
    const attendance: ClubLegacyAttendanceRecord = {
      attendance: result.attendance,
      season,
      week: result.week,
      opponentId: canonicalClubReference(state, fixture.opponent),
    };
    if (betterAttendance(attendance, userRecord.recordAttendance)) {
      userRecord.recordAttendance = attendance;
    }
  }

  legacy.processedSeasons = [...legacy.processedSeasons, season].sort((a, b) => a - b);
  state.clubLegacy = legacy;
  return legacy;
}

export function clubLegacyRecord(state: GameState, clubRef: string): ClubLegacyRecord | undefined {
  return state.clubLegacy?.clubsById[canonicalClubReference(state, clubRef)];
}
