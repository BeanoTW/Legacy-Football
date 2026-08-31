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

export function clubIdForState(state: GameState, legacyClubReference: string): ClubId {
  return clubIdForLegacyName(legacyClubReference, state.clubName);
}

/** IDs must stay opaque: association/country are separate mutable metadata. */
export function isOpaqueClubId(value: string): value is ClubId {
  return /^c_[0-9a-z]{14}$/.test(value);
}
