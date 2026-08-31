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

/** Persist identity before dropping detailed simulation. Idempotent by player id. */
export function preserveKnownPlayerInPlace(
  state: GameState,
  player: FootballPlayer,
  reasons: PlayerIdentityReason[],
  remembered = false,
): KnownPlayerIdentity | null {
  if (!state.football) return null;
  state.football.playerLifecycle ??= { knownPlayers: [] };
  const existing = state.football.playerLifecycle.knownPlayers.find(
    (known) => known.playerId === player.id,
  );
  if (existing) {
    existing.currentClubId = player.currentClubId;
    existing.lastDetailedSeason = state.season;
    existing.reasons = mergeReasons(existing.reasons, reasons);
    existing.remembered ||= remembered;
    return existing;
  }

  const identity: KnownPlayerIdentity = {
    playerId: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    dateOfBirth: { ...player.dateOfBirth },
    nationality: player.nationality,
    primaryPosition: player.primaryPosition,
    currentClubId: player.currentClubId,
    createdSeason: player.createdSeason,
    lastDetailedSeason: state.season,
    reasons: [...new Set(reasons)],
    remembered,
    career: [],
  };
  state.football.playerLifecycle.knownPlayers.push(identity);
  return identity;
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
  const known = knownPlayerIdentity(next, playerId);
  if (known) {
    known.remembered = remembered;
    known.reasons = remembered
      ? mergeReasons(known.reasons, ["remembered"])
      : known.reasons.filter((reason) => reason !== "remembered");
  }
  return next;
}
