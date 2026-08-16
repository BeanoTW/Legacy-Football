/* Persistent identity — Phase 0c.
 *
 * The game has always keyed clubs by their canonical name string: contracts
 * store `clubId: s.clubName`, league membership is `clubIds: string[]`, and
 * `clubRecords` / `clubReputations` are keyed by the same value. That is a real
 * identity, it is stable across season rollover and migration, and every
 * persisted history row already references it.
 *
 * Phase 0c does NOT re-key the save. It gives that identity a NAME and a TYPE
 * so later phases can migrate it in one place instead of nineteen thousand
 * lines. Branded types are erased at runtime, so introducing them cannot move
 * a single byte of a save or a snapshot hash.
 */
import type { GameState } from "./types";

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]?: B };

/** Canonical club identity. Today this is the club's canonical name string. */
export type ClubId = Brand<string, "ClubId">;
/** Canonical division identity (`League.id`). */
export type LeagueId = Brand<string, "LeagueId">;
/** Canonical football-player identity (`FootballPlayer.id`). */
export type PlayerId = Brand<string, "PlayerId">;
/** Canonical staff identity (`Staff.id`). */
export type StaffId = Brand<string, "StaffId">;
/** Canonical fixture identity — see `league.fixtureId()`. */
export type FixtureId = Brand<string, "FixtureId">;

/* ---------- Constructors ----------
 * Explicit, greppable widening points. Every place that turns an untyped
 * string into an identity should go through one of these, so the Phase 7
 * re-keying has a finite list of call sites.
 */
export const asClubId = (v: string): ClubId => v as ClubId;
export const asLeagueId = (v: string): LeagueId => v as LeagueId;
export const asPlayerId = (v: string): PlayerId => v as PlayerId;
export const asStaffId = (v: string): StaffId => v as StaffId;
export const asFixtureId = (v: string): FixtureId => v as FixtureId;

/**
 * Club identity for a canonical club name.
 *
 * Deliberately the identity function today: the name IS the key in every
 * persisted structure. Routing every lookup through here means the day the key
 * becomes a slug or a uuid, exactly one function changes.
 */
export const clubIdForName = (name: string): ClubId => asClubId(name);

/** Display name for a club identity. Inverse of `clubIdForName`. */
export const clubNameForId = (id: ClubId): string => id as string;

/**
 * The club the player currently controls.
 *
 * This is THE containment point for the single-club assumption. Code must ask
 * this question rather than reading `s.clubName` and hoping. When OwnerState
 * arrives it becomes `s.owner.controlledClubId` and nothing else changes.
 *
 * Not persisted in 0c: deriving it keeps the save (and every snapshot hash)
 * byte-identical while still making the assumption explicit and searchable.
 */
export const controlledClubId = (s: GameState): ClubId => clubIdForName(s.clubName);

/** Is `clubId` the club the player controls? */
export const isControlledClub = (s: GameState, clubId: string): boolean =>
  clubId === controlledClubId(s);
