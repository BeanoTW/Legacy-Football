/* Club-scoped accessors — Phase 0c containment layer.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `GameState` currently *is* the controlled club: `finance`, `board`,
 * `infrastructure`, `commercial`, `cash`, `reputation` and `fanHappiness` all
 * sit at the world root but describe exactly one club. That assumption is fine
 * today and impossible to remove safely in one pass, so 0c contains it instead:
 * every read that means "this club's X" goes through an accessor that takes an
 * explicit ClubId.
 *
 * RULES
 *  - Pure. No mutation, no `ensure*`, no lazy initialisation. Callers that need
 *    to initialise a subsystem call its own `ensure*` first, exactly as today.
 *  - No data duplication. Accessors return the SAME object references that live
 *    on GameState; they are a naming layer, not a copy.
 *  - Rich club state exists only for the controlled club. Asking for another
 *    club's finance/board/infrastructure/commercial returns `null` rather than
 *    lying — Phase 1 fills those in, and `null` is where it will plug in.
 */
import type {
  GameState,
  FinanceState,
  BoardState,
  InfrastructureState,
  CommercialDepartment,
  RecruitmentState,
  League,
  LeagueRow,
  FinanceEntry,
} from "./types";
import { type ClubId, controlledClubId, isControlledClub } from "./ids";
import { playerLeagueId, tableFor } from "./league";
import { clubReputation } from "./reputation";
import { squadOf, clubWageBill } from "./recruitment";

/** Rich club state exists for the controlled club only (Phase 1 widens this). */
export const hasRichClubState = (s: GameState, clubId: ClubId): boolean =>
  isControlledClub(s, clubId);

/** Finance state for a club. `null` for AI clubs until Phase 1. */
export function clubFinance(
  s: GameState,
  clubId: ClubId = controlledClubId(s),
): FinanceState | null {
  return hasRichClubState(s, clubId) ? s.finance : null;
}

/** Append-only cash ledger for a club. `null` for AI clubs until Phase 1. */
export function clubLedger(
  s: GameState,
  clubId: ClubId = controlledClubId(s),
): FinanceEntry[] | null {
  return hasRichClubState(s, clubId) ? s.financeLedger : null;
}

/** Board of directors for a club. `null` for AI clubs until Phase 1. */
export function clubBoard(s: GameState, clubId: ClubId = controlledClubId(s)): BoardState | null {
  return hasRichClubState(s, clubId) ? s.board : null;
}

/** Physical plant for a club. `null` for AI clubs until Phase 1. */
export function clubInfrastructure(
  s: GameState,
  clubId: ClubId = controlledClubId(s),
): InfrastructureState | null {
  return hasRichClubState(s, clubId) ? s.infrastructure : null;
}

/** Commercial department for a club. `null` for AI clubs until Phase 1. */
export function clubCommercial(
  s: GameState,
  clubId: ClubId = controlledClubId(s),
): CommercialDepartment | null {
  return hasRichClubState(s, clubId) ? s.commercial : null;
}

/**
 * The football world registry.
 *
 * Unlike the four above this is genuinely world-scoped already — players and
 * contracts for EVERY club live in `s.football`, keyed by `currentClubId` /
 * `clubId`. The accessor exists so call sites read as "the football world seen
 * from this club" rather than "the user's squad".
 */
export function clubFootball(
  s: GameState,
  _clubId: ClubId = controlledClubId(s),
): RecruitmentState {
  void _clubId;
  return s.football;
}

/** Squad (registered players) for any club — already club-keyed world data. */
export const clubSquad = (s: GameState, clubId: ClubId = controlledClubId(s)) =>
  squadOf(s, clubId as string);

/** Weekly player wage bill for any club — already club-keyed world data. */
export const clubWagesWeekly = (s: GameState, clubId: ClubId = controlledClubId(s)) =>
  clubWageBill(s, clubId as string);

/** The division a club is competing in this season. */
export function clubLeague(s: GameState, clubId: ClubId = controlledClubId(s)): League | undefined {
  if (isControlledClub(s, clubId)) {
    const own = (s.leagues ?? []).find((l) => l.id === playerLeagueId(s));
    if (own) return own;
  }
  return (s.leagues ?? []).find((l) => l.clubIds?.includes(clubId as string));
}

/** Current league table of a club's division, sorted. */
export function clubTable(s: GameState, clubId: ClubId = controlledClubId(s)): LeagueRow[] {
  const league = clubLeague(s, clubId);
  return league ? tableFor(s, league.id) : [];
}

/** A club's row in its own division's table. */
export function clubTableRow(
  s: GameState,
  clubId: ClubId = controlledClubId(s),
): LeagueRow | undefined {
  return clubTable(s, clubId).find((r) => r.team === (clubId as string));
}

/** 1-based league position, or 0 when the club is not in a table yet. */
export function clubPosition(s: GameState, clubId: ClubId = controlledClubId(s)): number {
  return clubTable(s, clubId).findIndex((r) => r.team === (clubId as string)) + 1;
}

/** Persistent 0-100 club reputation — already club-keyed world data. */
export const clubRep = (s: GameState, clubId: ClubId = controlledClubId(s)) =>
  clubReputation(s, clubId as string);

/**
 * Spendable cash for a club. Root-level today; the accessor is the seam the
 * Owner layer needs so club cash and owner cash can never be confused.
 */
export function clubCash(s: GameState, clubId: ClubId = controlledClubId(s)): number | null {
  return hasRichClubState(s, clubId) ? s.cash : null;
}

/** Supporter mood 0-100. Controlled club only until Phase 1. */
export function clubFanHappiness(
  s: GameState,
  clubId: ClubId = controlledClubId(s),
): number | null {
  return hasRichClubState(s, clubId) ? s.fanHappiness : null;
}

export { controlledClubId, isControlledClub };
export type { ClubId };
