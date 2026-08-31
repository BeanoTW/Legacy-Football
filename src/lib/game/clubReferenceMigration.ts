import type { GameState } from "./types";
import {
  clubIdForState,
  ensureClubIdentityStateInPlace,
  isOpaqueClubId,
  type ClubId,
} from "./clubIdentity";

function toId(state: GameState, ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (isOpaqueClubId(ref)) return ref;
  return clubIdForState(state, ref);
}

function mapRequired(state: GameState, ref: string): string {
  return toId(state, ref) as ClubId;
}

function rekeyRecord<T>(
  state: GameState,
  source: Record<string, T> | undefined,
  mapValue?: (value: T, id: string) => T,
): Record<string, T> | undefined {
  if (!source) return source;
  const out: Record<string, T> = {};
  for (const [legacyKey, value] of Object.entries(source)) {
    const id = mapRequired(state, legacyKey);
    out[id] = mapValue ? mapValue(value, id) : value;
  }
  return out;
}

/**
 * Mechanical reference transformer used by the forthcoming reference schema
 * migration. It is intentionally isolated from runtime orchestration until all
 * club-name comparisons have been converted to stable-ID aware gateways.
 */
export function migrateClubReferencesToIdsInPlace(state: GameState): void {
  ensureClubIdentityStateInPlace(state);

  state.trackedClubIds = (state.trackedClubIds ?? []).map((club) => mapRequired(state, club));
  state.leagues = state.leagues.map((league) => ({
    ...league,
    clubIds: league.clubIds.map((club) => mapRequired(state, club)),
  }));
  state.fixtures = state.fixtures.map((fixture) => ({
    ...fixture,
    opponent: mapRequired(state, fixture.opponent),
  }));
  state.leagueSchedule = state.leagueSchedule.map((fixture) => ({
    ...fixture,
    home: mapRequired(state, fixture.home),
    away: mapRequired(state, fixture.away),
  }));
  state.matchRecords = (state.matchRecords ?? []).map((record) => ({
    ...record,
    home: mapRequired(state, record.home),
    away: mapRequired(state, record.away),
  }));
  state.league = state.league.map((row) => ({ ...row, team: mapRequired(state, row.team) }));
  state.results = state.results.map((result) => ({
    ...result,
    opponent: mapRequired(state, result.opponent),
  }));

  state.seasonHistory = (state.seasonHistory ?? []).map((history) => ({
    ...history,
    champion: mapRequired(state, history.champion),
    runnerUp: history.runnerUp ? mapRequired(state, history.runnerUp) : null,
    promoted: history.promoted.map((club) => mapRequired(state, club)),
    relegated: history.relegated.map((club) => mapRequired(state, club)),
    finalTable: history.finalTable.map((row) => ({ ...row, team: mapRequired(state, row.team) })),
  }));
  state.seasonPredictions = (state.seasonPredictions ?? []).map((prediction) => ({
    ...prediction,
    predictedChampion: mapRequired(state, prediction.predictedChampion),
    promotionFavourites: prediction.promotionFavourites.map((club) => mapRequired(state, club)),
    relegationFavourites: prediction.relegationFavourites.map((club) => mapRequired(state, club)),
    clubs: prediction.clubs.map((club) => ({ ...club, club: mapRequired(state, club.club) })),
  }));
  state.clubSnapshots = (state.clubSnapshots ?? []).map((snapshot) => ({
    ...snapshot,
    club: mapRequired(state, snapshot.club),
  }));

  state.clubRecords = rekeyRecord(state, state.clubRecords, (record, id) => ({
    ...record,
    club: id,
  })) ?? {};
  state.clubReputations = rekeyRecord(state, state.clubReputations) ?? {};
  state.fringeWorld = rekeyRecord(state, state.fringeWorld, (club, id) => ({
    ...club,
    clubId: id,
  }));

  if (state.liveMatch) {
    state.liveMatch = {
      ...state.liveMatch,
      fixture: {
        ...state.liveMatch.fixture,
        opponent: mapRequired(state, state.liveMatch.fixture.opponent),
      },
      homeClub: state.liveMatch.homeClub ? mapRequired(state, state.liveMatch.homeClub) : undefined,
      awayClub: state.liveMatch.awayClub ? mapRequired(state, state.liveMatch.awayClub) : undefined,
    };
  }

  if (state.commercial) {
    state.commercial.contracts = state.commercial.contracts.map((contract) => ({
      ...contract,
      clubId: mapRequired(state, contract.clubId),
    }));
  }

  if (state.football) {
    state.football.players = state.football.players.map((player) => ({
      ...player,
      currentClubId: toId(state, player.currentClubId),
    }));
    state.football.contracts = state.football.contracts.map((contract) => ({
      ...contract,
      clubId: mapRequired(state, contract.clubId),
    }));
    state.football.contractHistory = state.football.contractHistory.map((record) => ({
      ...record,
      clubId: mapRequired(state, record.clubId),
    }));
    state.football.transferHistory = state.football.transferHistory.map((transfer) => ({
      ...transfer,
      fromClubId: toId(state, transfer.fromClubId),
      toClubId: toId(state, transfer.toClubId),
    }));
    state.football.negotiations = state.football.negotiations.map((negotiation) => ({
      ...negotiation,
      fromClubId: toId(state, negotiation.fromClubId),
      toClubId: mapRequired(state, negotiation.toClubId),
    }));
    if (state.football.playerLifecycle) {
      state.football.playerLifecycle.knownPlayers = state.football.playerLifecycle.knownPlayers.map(
        (player) => ({
          ...player,
          currentClubId: toId(state, player.currentClubId),
          career: player.career.map((entry) => ({
            ...entry,
            clubId: toId(state, entry.clubId),
          })),
        }),
      );
    }
    if (state.football.rememberedPlayers) {
      state.football.rememberedPlayers.seasons = state.football.rememberedPlayers.seasons.map(
        (entry) => ({ ...entry, clubId: toId(state, entry.clubId) }),
      );
    }
  }
}

function everyRef(values: Array<string | null | undefined>): boolean {
  return values.every((value) => !value || isOpaqueClubId(value));
}

/** Coverage assertion for the persisted club-reference surfaces migrated above. */
export function persistedClubReferencesAreOpaque(state: GameState): boolean {
  const refs: Array<string | null | undefined> = [
    ...(state.trackedClubIds ?? []),
    ...state.leagues.flatMap((league) => league.clubIds),
    ...state.fixtures.map((fixture) => fixture.opponent),
    ...state.leagueSchedule.flatMap((fixture) => [fixture.home, fixture.away]),
    ...(state.matchRecords ?? []).flatMap((record) => [record.home, record.away]),
    ...state.league.map((row) => row.team),
    ...state.results.map((result) => result.opponent),
    ...(state.seasonHistory ?? []).flatMap((history) => [
      history.champion,
      history.runnerUp,
      ...history.promoted,
      ...history.relegated,
      ...history.finalTable.map((row) => row.team),
    ]),
    ...(state.seasonPredictions ?? []).flatMap((prediction) => [
      prediction.predictedChampion,
      ...prediction.promotionFavourites,
      ...prediction.relegationFavourites,
      ...prediction.clubs.map((club) => club.club),
    ]),
    ...(state.clubSnapshots ?? []).map((snapshot) => snapshot.club),
    ...Object.keys(state.clubRecords ?? {}),
    ...Object.values(state.clubRecords ?? {}).map((record) => record.club),
    ...Object.keys(state.clubReputations ?? {}),
    ...Object.keys(state.fringeWorld ?? {}),
    ...Object.values(state.fringeWorld ?? {}).map((club) => club.clubId),
    ...(state.commercial?.contracts ?? []).map((contract) => contract.clubId),
  ];

  if (state.liveMatch) {
    refs.push(state.liveMatch.fixture.opponent, state.liveMatch.homeClub, state.liveMatch.awayClub);
  }

  if (state.football) {
    refs.push(
      ...state.football.players.map((player) => player.currentClubId),
      ...state.football.contracts.map((contract) => contract.clubId),
      ...state.football.contractHistory.map((record) => record.clubId),
      ...state.football.transferHistory.flatMap((transfer) => [transfer.fromClubId, transfer.toClubId]),
      ...state.football.negotiations.flatMap((negotiation) => [
        negotiation.fromClubId,
        negotiation.toClubId,
      ]),
      ...(state.football.playerLifecycle?.knownPlayers ?? []).flatMap((player) => [
        player.currentClubId,
        ...player.career.map((entry) => entry.clubId),
      ]),
      ...(state.football.rememberedPlayers?.seasons ?? []).map((entry) => entry.clubId),
    );
  }

  return everyRef(refs);
}
