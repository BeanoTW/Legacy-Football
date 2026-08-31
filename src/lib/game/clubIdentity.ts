import type { GameState } from "./types";
import { CLUBS } from "./clubs";
import { hashString } from "./rng";

/**
 * Immutable opaque club identity. Country, association, league and display
 * name are deliberately not encoded into this value.
 */
export type ClubId = string & { readonly __clubId: unique symbol };

export interface ClubIdentity {
  id: ClubId;
  displayName: string;
}

export interface ClubIdentityState {
  userClubId: ClubId;
  clubsById: Record<string, ClubIdentity>;
}

declare module "./types" {
  interface GameState {
    /** Stable identity registry introduced before club references are migrated. */
    clubIdentity?: ClubIdentityState;
  }
}

const USER_SLOT_KEY = "legacy-football:user-club";

function opaqueClubId(key: string): ClubId {
  const a = (hashString(`club-id:a|${key}`) >>> 0).toString(36).padStart(7, "0");
  const b = (hashString(`club-id:b|${key}`) >>> 0).toString(36).padStart(7, "0");
  return `c_${a}${b}` as ClubId;
}

/**
 * Built-in clubs are tied to their append-only source slot, not their name.
 * Renaming a club therefore never changes its immutable identity.
 */
export const BUILTIN_CLUB_IDENTITIES: readonly ClubIdentity[] = CLUBS.map((displayName, index) => ({
  id: opaqueClubId(`builtin-slot:${index}`),
  displayName,
}));

const BUILTIN_BY_NAME = new Map(BUILTIN_CLUB_IDENTITIES.map((club) => [club.displayName, club]));
const BUILTIN_BY_ID = new Map(BUILTIN_CLUB_IDENTITIES.map((club) => [club.id, club]));

/** Stable identity reserved for the save's player-created club slot. */
export function userClubId(): ClubId {
  return opaqueClubId(USER_SLOT_KEY);
}

/** Deterministic legacy-name migration resolver. No country metadata is used. */
export function clubIdForLegacyName(displayName: string, userDisplayName?: string): ClubId {
  if (userDisplayName !== undefined && displayName === userDisplayName) return userClubId();
  const builtin = BUILTIN_BY_NAME.get(displayName);
  if (builtin) return builtin.id;
  // Historical/custom saves may contain names outside the current built-in pool.
  // This fallback is deterministic but opaque; callers persist the result once migrated.
  return opaqueClubId(`legacy-custom:${displayName}`);
}

export function clubDisplayNameForId(id: string, userDisplayName?: string): string | null {
  if (id === userClubId()) return userDisplayName ?? null;
  return BUILTIN_BY_ID.get(id as ClubId)?.displayName ?? null;
}

function collectLegacyClubNames(state: GameState): string[] {
  const names = new Set<string>([state.clubName]);
  for (const league of state.leagues ?? []) for (const club of league.clubIds) names.add(club);
  for (const player of state.football?.players ?? []) if (player.currentClubId) names.add(player.currentClubId);
  for (const contract of state.football?.contracts ?? []) names.add(contract.clubId);
  for (const transfer of state.football?.transferHistory ?? []) {
    if (transfer.fromClubId) names.add(transfer.fromClubId);
    if (transfer.toClubId) names.add(transfer.toClubId);
  }
  for (const known of state.football?.playerLifecycle?.knownPlayers ?? []) {
    if (known.currentClubId) names.add(known.currentClubId);
    for (const entry of known.career) if (entry.clubId) names.add(entry.clubId);
  }
  for (const club of Object.keys(state.clubRecords ?? {})) names.add(club);
  for (const club of Object.keys(state.clubReputations ?? {})) names.add(club);
  for (const snapshot of state.clubSnapshots ?? []) names.add(snapshot.club);
  for (const club of Object.keys(state.fringeWorld ?? {})) names.add(club);
  return [...names];
}

/**
 * Seed/preserve the ID registry without changing existing reference fields yet.
 * This is deliberately the first migration seam: once IDs are persisted, later
 * passes can mechanically replace display-name references without re-deriving identity.
 */
export function ensureClubIdentityStateInPlace(state: GameState): ClubIdentityState {
  const existing = state.clubIdentity;
  if (existing) return existing;

  const clubsById: Record<string, ClubIdentity> = {};
  for (const displayName of collectLegacyClubNames(state)) {
    const id = clubIdForLegacyName(displayName, state.clubName);
    clubsById[id] = { id, displayName };
  }
  const userId = userClubId();
  clubsById[userId] = { id: userId, displayName: state.clubName };
  state.clubIdentity = { userClubId: userId, clubsById };
  return state.clubIdentity;
}

export function clubIdForState(state: GameState, legacyClubReference: string): ClubId {
  const registry = state.clubIdentity;
  if (registry) {
    const found = Object.values(registry.clubsById).find(
      (club) => club.displayName === legacyClubReference,
    );
    if (found) return found.id;
  }
  return clubIdForLegacyName(legacyClubReference, state.clubName);
}

export function registeredClubDisplayName(state: GameState, id: string): string | null {
  return state.clubIdentity?.clubsById[id]?.displayName ?? clubDisplayNameForId(id, state.clubName);
}

/** Update presentation metadata without changing immutable identity. */
export function renameRegisteredClubInPlace(state: GameState, id: string, displayName: string): boolean {
  const registry = ensureClubIdentityStateInPlace(state);
  const club = registry.clubsById[id];
  if (!club) return false;
  club.displayName = displayName;
  if (id === registry.userClubId) state.clubName = displayName;
  return true;
}

/** IDs must stay opaque: association/country are separate mutable metadata. */
export function isOpaqueClubId(value: string): value is ClubId {
  return /^c_[0-9a-z]{14}$/.test(value);
}
