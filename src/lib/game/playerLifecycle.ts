import type { FootballPlayer, GameState, Position } from "./types";

/** Simulation detail and identity persistence are separate concerns. */
export type PlayerFidelity = "detailed" | "known" | "world";

export type PlayerIdentityReason =
  | "owned"
  | "scouted"
  | "shortlisted"
  | "negotiation"
  | "formerPlayer"
  | "remembered"
  | "contractualHook";

export interface PlayerCareerLedgerEntry {
  season: number;
  clubId: string | null;
  appearances?: number;
  goals?: number;
  transferFee?: number;
  note?: string;
}

/**
 * Cheap persistent identity retained when full weekly simulation is no longer
 * justified. It intentionally omits hidden ability/potential information.
 */
export interface KnownPlayerIdentity {
  playerId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: FootballPlayer["dateOfBirth"];
  nationality: string;
  primaryPosition: Position;
  currentClubId: string | null;
  createdSeason: number;
  lastDetailedSeason: number;
  reasons: PlayerIdentityReason[];
  remembered: boolean;
  career: PlayerCareerLedgerEntry[];
}

/** Identity seed used when scouting discovers someone outside detailed simulation. */
export interface KnownPlayerSeed {
  playerId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: FootballPlayer["dateOfBirth"];
  nationality: string;
  primaryPosition: Position;
  currentClubId: string | null;
  createdSeason: number;
}

export interface PlayerLifecycleState {
  knownPlayers: KnownPlayerIdentity[];
}

declare module "./types" {
  interface RecruitmentState {
    /** Optional so historical saves remain valid without backfilling claims. */
    playerLifecycle?: PlayerLifecycleState;
  }
}

export function playerLifecycleState(state: GameState): PlayerLifecycleState {
  return state.football?.playerLifecycle ?? { knownPlayers: [] };
}

export function knownPlayerIdentity(
  state: GameState,
  playerId: string,
): KnownPlayerIdentity | null {
  return (
    playerLifecycleState(state).knownPlayers.find((player) => player.playerId === playerId) ?? null
  );
}

export function playerFidelity(state: GameState, playerId: string): PlayerFidelity {
  if (state.football?.players.some((player) => player.id === playerId)) return "detailed";
  if (knownPlayerIdentity(state, playerId)) return "known";
  return "world";
}

function mergeReasons(
  existing: PlayerIdentityReason[],
  additions: PlayerIdentityReason[],
): PlayerIdentityReason[] {
  return [...new Set([...existing, ...additions])];
}

/**
 * Persist a stable identity without requiring a detailed FootballPlayer.
 * This is the bridge that lets scouting discover people in the compact world
 * without hydrating an entire club squad.
 */
export function preserveKnownIdentityInPlace(
  state: GameState,
  seed: KnownPlayerSeed,
  reasons: PlayerIdentityReason[],
  remembered = false,
): KnownPlayerIdentity | null {
  if (!state.football) return null;
  state.football.playerLifecycle ??= { knownPlayers: [] };
  const existing = state.football.playerLifecycle.knownPlayers.find(
    (known) => known.playerId === seed.playerId,
  );
  if (existing) {
    existing.currentClubId = seed.currentClubId;
    existing.reasons = mergeReasons(existing.reasons, reasons);
    existing.remembered ||= remembered;
    return existing;
  }

  const identity: KnownPlayerIdentity = {
    playerId: seed.playerId,
    firstName: seed.firstName,
    lastName: seed.lastName,
    dateOfBirth: { ...seed.dateOfBirth },
    nationality: seed.nationality,
    primaryPosition: seed.primaryPosition,
    currentClubId: seed.currentClubId,
    createdSeason: seed.createdSeason,
    lastDetailedSeason: state.season,
    reasons: [...new Set(reasons)],
    remembered,
    career: [],
  };
  state.football.playerLifecycle.knownPlayers.push(identity);
  return identity;
}

/** Persist identity before dropping detailed simulation. Idempotent by player id. */
export function preserveKnownPlayerInPlace(
  state: GameState,
  player: FootballPlayer,
  reasons: PlayerIdentityReason[],
  remembered = false,
): KnownPlayerIdentity | null {
  const identity = preserveKnownIdentityInPlace(
    state,
    {
      playerId: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      dateOfBirth: player.dateOfBirth,
      nationality: player.nationality,
      primaryPosition: player.primaryPosition,
      currentClubId: player.currentClubId,
      createdSeason: player.createdSeason,
    },
    reasons,
    remembered,
  );
  if (identity) identity.lastDetailedSeason = state.season;
  return identity;
}

/** Toggle one relevance reason without deleting the identity or its history. */
export function setKnownPlayerReasonInPlace(
  state: GameState,
  playerId: string,
  reason: PlayerIdentityReason,
  enabled: boolean,
): boolean {
  const known = knownPlayerIdentity(state, playerId);
  if (!known) return false;
  known.reasons = enabled
    ? mergeReasons(known.reasons, [reason])
    : known.reasons.filter((existing) => existing !== reason);
  if (reason === "remembered") known.remembered = enabled;
  return true;
}

export function appendCareerLedgerInPlace(
  state: GameState,
  playerId: string,
  entry: PlayerCareerLedgerEntry,
): void {
  const known = knownPlayerIdentity(state, playerId);
  if (!known) return;
  const duplicate = known.career.some(
    (existing) =>
      existing.season === entry.season &&
      existing.clubId === entry.clubId &&
      existing.transferFee === entry.transferFee &&
      existing.note === entry.note,
  );
  if (!duplicate) known.career.push({ ...entry });
}

export function setRememberPlayer(
  state: GameState,
  playerId: string,
  remembered: boolean,
): GameState {
  const next = structuredClone(state);
  if (!next.football) return next;
  const detailed = next.football.players.find((player) => player.id === playerId);
  if (detailed) preserveKnownPlayerInPlace(next, detailed, ["remembered"], remembered);
  setKnownPlayerReasonInPlace(next, playerId, "remembered", remembered);
  return next;
}
