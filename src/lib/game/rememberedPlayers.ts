import type { GameState } from "./types";
import { hashString } from "./rng";
import {
  appendCareerLedgerInPlace,
  knownPlayerIdentity,
  setRememberPlayer,
} from "./playerLifecycle";
import { scoutingCandidateProfile } from "./scoutingDiscovery";

export const REMEMBERED_PLAYER_LIMIT = 50;

export interface RememberedPlayerSeason {
  playerId: string;
  season: number;
  clubId: string | null;
  appearances: number;
  goals: number;
  estimatedValue: number;
  retired: boolean;
}

export interface RememberedPlayerTrackingState {
  seasons: RememberedPlayerSeason[];
  lastAdvancedSeason: number;
}

export interface RememberPlayerResult {
  ok: boolean;
  reason: string;
  state: GameState;
}

declare module "./types" {
  interface RecruitmentState {
    /** Richer lightweight follow-up for the chairman's explicitly remembered people. */
    rememberedPlayers?: RememberedPlayerTrackingState;
  }
}

function unsignedHash(value: string): number {
  return hashString(value) >>> 0;
}

function ageInSeason(state: GameState, playerId: string, season: number): number | null {
  const known = knownPlayerIdentity(state, playerId);
  if (!known) return null;
  return 2000 + season - 1 - known.dateOfBirth.year;
}

export function rememberedPlayerIds(state: GameState): string[] {
  return (state.football?.playerLifecycle?.knownPlayers ?? [])
    .filter((player) => player.remembered || player.reasons.includes("remembered"))
    .map((player) => player.playerId)
    .sort((a, b) => a.localeCompare(b));
}

export function canRememberAnotherPlayer(state: GameState, playerId?: string): boolean {
  const ids = rememberedPlayerIds(state);
  return (playerId !== undefined && ids.includes(playerId)) || ids.length < REMEMBERED_PLAYER_LIMIT;
}

/**
 * Bounded public toggle for the Remember Player preference. The persistent
 * identity/history is never deleted when a player is forgotten; only richer
 * future tracking is disabled.
 */
export function changeRememberPlayer(
  state: GameState,
  playerId: string,
  remembered: boolean,
): RememberPlayerResult {
  if (!remembered) {
    return { ok: true, reason: "Player forgotten", state: setRememberPlayer(state, playerId, false) };
  }
  if (!knownPlayerIdentity(state, playerId) && !state.football?.players.some((player) => player.id === playerId)) {
    return { ok: false, reason: "Unknown player", state };
  }
  if (!canRememberAnotherPlayer(state, playerId)) {
    return {
      ok: false,
      reason: `Remember Player is limited to ${REMEMBERED_PLAYER_LIMIT} players. Forget one before adding another.`,
      state,
    };
  }
  return { ok: true, reason: "Player remembered", state: setRememberPlayer(state, playerId, true) };
}

/**
 * Produce one cheap deterministic season of post-departure career colour.
 * This is intentionally not a second football simulation: appearances, goals
 * and value are broad career-history signals for players the chairman chose to
 * keep following.
 */
export function rememberedPlayerSeason(
  state: GameState,
  playerId: string,
  season: number,
): RememberedPlayerSeason | null {
  const known = knownPlayerIdentity(state, playerId);
  if (!known) return null;
  const age = ageInSeason(state, playerId, season);
  if (age === null) return null;

  const retired =
    age >= 38 ||
    (age >= 34 &&
      unsignedHash(`${state.saveSeed}|retire|${playerId}|${season}`) % 100 < (age - 33) * 17);
  if (retired) {
    return {
      playerId,
      season,
      clubId: known.currentClubId,
      appearances: 0,
      goals: 0,
      estimatedValue: 0,
      retired: true,
    };
  }

  const appearances = 12 + (unsignedHash(`${state.saveSeed}|apps|${playerId}|${season}`) % 31);
  const goalRate =
    known.primaryPosition === "FWD"
      ? 45
      : known.primaryPosition === "MID"
        ? 22
        : known.primaryPosition === "DEF"
          ? 8
          : 1;
  const goals = Math.min(
    appearances,
    Math.round(
      (appearances * goalRate) / 100 +
        (unsignedHash(`${state.saveSeed}|goals|${playerId}|${season}`) % 4),
    ),
  );
  const profile = scoutingCandidateProfile(state, playerId);
  const baseValue = profile?.marketValue ?? 0;
  const years = Math.max(0, season - known.lastDetailedSeason);
  const ageFactor =
    age <= 27
      ? 1 + Math.min(0.25, years * 0.04)
      : Math.max(0.08, 1 - Math.max(0, age - 27) * 0.12);
  const variation =
    0.9 + (unsignedHash(`${state.saveSeed}|value|${playerId}|${season}`) % 21) / 100;
  const estimatedValue = Math.max(0, Math.round(baseValue * ageFactor * variation));

  return {
    playerId,
    season,
    clubId: known.currentClubId,
    appearances,
    goals,
    estimatedValue,
    retired: false,
  };
}

/** Advance remembered careers once per season, idempotently. */
export function advanceRememberedPlayersToSeasonInPlace(state: GameState): void {
  if (!state.football) return;
  state.football.rememberedPlayers ??= { seasons: [], lastAdvancedSeason: state.season - 1 };
  const tracking = state.football.rememberedPlayers;
  const start = Math.max(1, tracking.lastAdvancedSeason + 1);

  for (let season = start; season <= state.season; season++) {
    for (const playerId of rememberedPlayerIds(state)) {
      if (
        tracking.seasons.some((entry) => entry.playerId === playerId && entry.season === season)
      )
        continue;
      const entry = rememberedPlayerSeason(state, playerId, season);
      if (!entry) continue;
      tracking.seasons.push(entry);
      appendCareerLedgerInPlace(state, playerId, {
        season,
        clubId: entry.clubId,
        appearances: entry.appearances,
        goals: entry.goals,
        note: entry.retired ? "Retired" : "Remembered career season",
      });
    }
    tracking.lastAdvancedSeason = season;
  }
}

export function rememberedPlayerHistory(
  state: GameState,
  playerId: string,
): RememberedPlayerSeason[] {
  return (state.football?.rememberedPlayers?.seasons ?? [])
    .filter((entry) => entry.playerId === playerId)
    .sort((a, b) => a.season - b.season);
}
