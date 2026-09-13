import type { GameState, TransferNegotiation } from "./types";
import {
  calendarDay,
  isTransferDeadlineDay,
  transferDeadlineHour,
} from "./calendar";
import { absoluteWeek } from "./time";
import { rngInt, seededRng } from "./rng";

export type TransferResponseKind = "enquiry" | "club" | "player";

declare module "./types" {
  interface TransferNegotiation {
    /** Absolute presentation day on which the next external reply is due. */
    pendingResponseAtDay?: number;
    /** Deadline-day hour on which the reply is due. Undefined for normal dated replies. */
    pendingResponseAtHour?: number;
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
 * Normal weeks use the existing day clock. On transfer deadline day the same
 * persisted response becomes hour-specific so negotiations can progress
 * during the final 24 hours without advancing any other daily systems.
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

  if (isTransferDeadlineDay(state)) {
    const nowHour = transferDeadlineHour(state);
    const maxHours = kind === "player" ? 3 : 4;
    const rng = seededRng(
      state.saveSeed,
      "transferResponseHour",
      negotiation.id,
      kind,
      negotiation.clubRounds,
      negotiation.playerRounds,
      nowHour,
    );
    const dueHour = Math.min(23, nowHour + rngInt(rng, 1, maxHours));
    const dueDay = transferAbsoluteDay(state);
    negotiation.pendingResponseKind = kind;
    negotiation.pendingResponseAtDay = dueDay;
    negotiation.pendingResponseAtHour = dueHour;
    return dueDay;
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
  delete negotiation.pendingResponseAtHour;
}

export function transferResponseDaysRemaining(
  state: GameState,
  negotiation: TransferNegotiation,
): number | null {
  if (negotiation.pendingResponseAtDay === undefined) return null;
  return Math.max(0, negotiation.pendingResponseAtDay - transferAbsoluteDay(state));
}

export function transferResponseHoursRemaining(
  state: GameState,
  negotiation: TransferNegotiation,
): number | null {
  if (
    negotiation.pendingResponseAtDay === undefined ||
    negotiation.pendingResponseAtHour === undefined ||
    negotiation.pendingResponseAtDay !== transferAbsoluteDay(state)
  ) {
    return null;
  }
  return Math.max(0, negotiation.pendingResponseAtHour - transferDeadlineHour(state));
}

export function transferResponseIsDue(
  state: GameState,
  negotiation: TransferNegotiation,
): boolean {
  if (negotiation.pendingResponseAtDay === undefined) return false;
  const currentDay = transferAbsoluteDay(state);
  if (negotiation.pendingResponseAtDay < currentDay) return true;
  if (negotiation.pendingResponseAtDay > currentDay) return false;
  if (negotiation.pendingResponseAtHour === undefined) return true;
  if (!isTransferDeadlineDay(state)) return true;
  return negotiation.pendingResponseAtHour <= transferDeadlineHour(state);
}
