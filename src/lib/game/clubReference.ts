import type { ClubIdentityLookupState } from "./clubIdentity";
import {
  clubIdForState,
  isOpaqueClubId,
  registeredClubDisplayName,
  userClubId,
} from "./clubIdentity";

/**
 * Compatibility gateway while persisted club references move from display names
 * to immutable IDs. New runtime code should compare through this module rather
 * than directly against state.clubName.
 */
export function userClubReference(state: ClubIdentityLookupState): string {
  return state.clubIdentity?.userClubId ?? state.clubName;
}

export function isUserClubReference(
  state: ClubIdentityLookupState,
  ref: string | null | undefined,
): boolean {
  if (!ref) return false;
  if (ref === state.clubName) return true;
  if (ref === state.clubIdentity?.userClubId) return true;
  if (isOpaqueClubId(ref)) return ref === userClubId();
  return clubIdForState(state, ref) === (state.clubIdentity?.userClubId ?? userClubId());
}

/** Resolve either a legacy name or an opaque ID to the canonical immutable ID. */
export function canonicalClubReference(state: ClubIdentityLookupState, ref: string): string {
  return isOpaqueClubId(ref) ? ref : clubIdForState(state, ref);
}

/** Presentation only. Never use this return value as a persisted identity key. */
export function clubDisplayName(state: ClubIdentityLookupState, ref: string): string {
  if (!isOpaqueClubId(ref)) return ref;
  return registeredClubDisplayName(state, ref) ?? ref;
}

export function sameClubReference(
  state: ClubIdentityLookupState,
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return a === b;
  return canonicalClubReference(state, a) === canonicalClubReference(state, b);
}
