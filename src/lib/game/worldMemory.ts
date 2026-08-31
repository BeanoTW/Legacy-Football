import type { GameState, TransferRecord } from "./types";

/**
 * Living-world retention policy.
 *
 * England is the authoritative simulated football world. The user's club gets
 * the richest memory; domestic AI clubs keep season/competition identity; the
 * future foreign ecosystem is deliberately external and does not pretend that
 * unseen domestic leagues were simulated.
 */
export type WorldMemoryScope = "user" | "domestic" | "external";
export type HistoricalProvenance = "SIMULATED" | "GENERATED_EXTERNAL";

export type LegacyEventKind =
  | "promotion"
  | "relegation"
  | "honour"
  | "record"
  | "stadium"
  | "manager"
  | "academy"
  | "transfer"
  | "financialMilestone"
  | "europeanMilestone";

export interface LegacyEvent {
  id: string;
  season: number;
  week?: number;
  clubId: string;
  kind: LegacyEventKind;
  headline: string;
  playerId?: string;
  relatedClubId?: string;
  amount?: number;
  provenance: HistoricalProvenance;
}

export interface PlayerOrigin {
  kind: "academy" | "generatedWorld" | "generatedExternal";
  clubId: string | null;
  joinedSeason?: number;
  joinedAge?: number;
  seniorDebutSeason?: number;
  homegrown?: boolean;
  provenance: HistoricalProvenance;
}

/**
 * Significance is contextual rather than a fixed money threshold. A transfer
 * that is ordinary in the Premier League can be transformative in non-league.
 */
export interface TransferMemoryContext {
  userClubId: string;
  transfer: TransferRecord;
  fromClubTypicalValue?: number;
  toClubTypicalValue?: number;
  playerReputation?: number;
  recordTransfer?: boolean;
}

export function memoryScopeForClub(state: GameState, clubId: string): WorldMemoryScope {
  if (clubId === state.clubName) return "user";
  if (state.leagues.some((league) => league.clubIds.includes(clubId))) return "domestic";
  return "external";
}

/**
 * Permanent transfer memory is intentionally selective for AI clubs.
 * All user-club movements survive. Domestic/world transfers survive when they
 * are exceptional relative to the clubs involved or involve a notable player.
 */
export function shouldKeepTransferAsLegacy(context: TransferMemoryContext): boolean {
  const { transfer, userClubId } = context;
  if (transfer.fromClubId === userClubId || transfer.toClubId === userClubId) return true;
  if (context.recordTransfer) return true;
  if ((context.playerReputation ?? 0) >= 72) return true;

  const baseline = Math.max(
    1,
    context.fromClubTypicalValue ?? 0,
    context.toClubTypicalValue ?? 0,
  );
  return transfer.fee > 0 && transfer.fee >= baseline * 2.5;
}

/** External clubs retain real interactions with our world, never invented league history. */
export function shouldKeepExternalClubEvent(event: LegacyEvent): boolean {
  return (
    event.provenance === "SIMULATED" &&
    (event.kind === "transfer" || event.kind === "europeanMilestone" || event.kind === "record")
  );
}
