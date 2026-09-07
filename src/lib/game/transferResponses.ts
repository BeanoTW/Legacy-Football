import type { GameState, TransferNegotiation } from "./types";
import { calendarDay } from "./calendar";
import { absoluteWeek } from "./time";
import { rngInt, seededRng } from "./rng";

export type TransferResponseKind = "enquiry" | "club" | "player";

declare module "./types" {
  interface TransferNegotiation {
    /** Absolute presentation day on which the next external reply is due. */
    pendingResponseAtDay?: number;
    /** Which party/conversation the pending reply belongs to. */
    pendingResponseKind?: TransferResponseKind;
  }
}

/** Shared day axis used by scouting, Advance and dated transfer responses. */
export function transferAbsoluteDay(state: GameState): number {
  return absoluteWeek(state.season, state.week) * 7 + calendarDay(state);
}

/**
 * Deterministically schedule a reply without creating a second random clock.
 * The saved due day is authoritative once written, so reloads never reroll it.
 */
export function scheduleTransferResponseInPlace(
  state: GameState,
  negotiation: TransferNegotiation,
  kind: TransferResponseKind,
  minDays = 1,
  maxDays = kind === "player" ? 2 : 3,
): number {
  if (negotiation.pendingResponseAtDay !== undefined) {
    return negotiation.pendingResponseAtDay;
  }
  const lo = Math.max(1, Math.round(minDays));
  const hi = Math.max(lo, Math.round(maxDays));
  const rng = seededRng(
    state.saveSeed,
    "transferResponseDay",
    negotiation.id,
    kind,
    negotiation.clubRounds,
    negotiation.playerRounds,
  );
  const due = transferAbsoluteDay(state) + rngInt(rng, lo, hi);
  negotiation.pendingResponseKind = kind;
  negotiation.pendingResponseAtDay = due;
  return due;
}

export function clearTransferResponseInPlace(negotiation: TransferNegotiation): void {
  delete negotiation.pendingResponseKind;
  delete negotiation.pendingResponseAtDay;
}

export function transferResponseDaysRemaining(
  state: GameState,
  negotiation: TransferNegotiation,
): number | null {
  if (negotiation.pendingResponseAtDay === undefined) return null;
  return Math.max(0, negotiation.pendingResponseAtDay - transferAbsoluteDay(state));
}

export function transferResponseIsDue(
  state: GameState,
  negotiation: TransferNegotiation,
): boolean {
  return (
    negotiation.pendingResponseAtDay !== undefined &&
    negotiation.pendingResponseAtDay <= transferAbsoluteDay(state)
  );
}
