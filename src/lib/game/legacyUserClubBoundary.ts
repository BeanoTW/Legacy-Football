import type { GameState } from "./types";
import { userClubReference } from "./clubReference";

/**
 * Transitional compatibility boundary for older subsystems that still read
 * `state.clubName` as if it were persisted identity.
 *
 * The public save contract remains strict: `clubName` is mutable presentation
 * metadata and persisted ownership references are opaque IDs. This helper only
 * aliases `clubName` to the canonical user-club reference for the duration of
 * one synchronous legacy operation, then restores the display name before the
 * state can leave the call boundary.
 *
 * New code must use clubReference.ts directly. Delete this adapter as the
 * remaining legacy modules are converted; never use it to store a display name
 * as identity or to span an async boundary.
 */
export function withCanonicalUserClubReference<T>(state: GameState, work: () => T): T {
  const canonical = userClubReference(state);
  if (canonical === state.clubName) return work();

  const displayName = state.clubName;
  state.clubName = canonical;
  try {
    return work();
  } finally {
    state.clubName = displayName;
  }
}
