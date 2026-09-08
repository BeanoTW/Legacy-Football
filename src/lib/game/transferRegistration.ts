import type { GameState, TransferNegotiation } from "./types";
import { hashString } from "./rng";
import {
  beginTransferRegistrationInPlace,
  completeTransferInPlace,
  playerName,
  type NegotiationResult,
} from "./recruitmentLegacy";
import { transferAbsoluteDay } from "./transferResponses";
import { transferTargetPlayer } from "./recruitmentTargetBridge";

declare module "./types" {
  interface TransferNegotiation {
    /** Absolute presentation day when an opened incoming registration completes. */
    registrationDueAtDay?: number;
  }
}

const cloned = <T>(
  state: GameState,
  mutate: (working: GameState) => T,
): { state: GameState; result: T } => {
  const working = structuredClone(state);
  return { state: working, result: mutate(working) };
};

export function beginDatedTransferRegistrationInPlace(
  state: GameState,
  negotiationId: string,
): NegotiationResult {
  const result = beginTransferRegistrationInPlace(state, negotiationId);
  const negotiation = result.negotiation;
  if (!result.ok || !negotiation) return result;
  if (negotiation.registrationDueAtDay === undefined) {
    negotiation.registrationDueAtDay = transferAbsoluteDay(state) + 1;
  }
  return { ...result, reason: "Medical and registration opened — completion due tomorrow" };
}

/** Chairman-facing registration action. Completion now belongs to Advance. */
export const beginTransferRegistration = (state: GameState, negotiationId: string) =>
  cloned(state, (working) => beginDatedTransferRegistrationInPlace(working, negotiationId));

/**
 * Compatibility wrapper for callers that still expose a completion action.
 * New incoming registrations with a dated clock cannot be completed manually;
 * older saves without that clock retain the previous completion path.
 */
export const completeTransfer = (state: GameState, negotiationId: string) =>
  cloned(state, (working) => {
    const negotiation = working.football?.negotiations.find((item) => item.id === negotiationId);
    if (
      negotiation?.direction === "in" &&
      negotiation.stage === "registration" &&
      negotiation.registrationDueAtDay !== undefined
    ) {
      return {
        ok: false,
        reason: "Registration is in progress and will complete through Advance",
        negotiation,
      } satisfies NegotiationResult;
    }
    return completeTransferInPlace(working, negotiationId);
  });

function pushCompletionInbox(state: GameState, negotiation: TransferNegotiation, dueDay: number): void {
  const player = transferTargetPlayer(state, negotiation.playerId);
  const name = player ? playerName(player) : "New signing";
  const eventKey = `transfer-registration:${negotiation.id}:${dueDay}`;
  if (state.inbox.some((item) => item.eventKey === eventKey)) return;
  state.inbox.push({
    id: `inbox-${hashString(eventKey).toString(36)}`,
    generatorId: "recruitment-transfer-registration",
    eventKey,
    sender: "Director of Football",
    department: "Director of Football",
    category: "transfers",
    subject: `Transfer completed: ${name}`,
    body: `${name}'s medical and registration paperwork is complete. The transfer has been registered and the player has joined the club.`,
    priority: "high",
    week: state.week,
    season: state.season,
    status: "unread",
  });
}

export function processDueTransferRegistrationsInPlace(state: GameState): void {
  const now = transferAbsoluteDay(state);
  for (const negotiation of state.football?.negotiations ?? []) {
    const dueDay = negotiation.registrationDueAtDay;
    if (negotiation.stage !== "registration" || dueDay === undefined || dueDay > now) continue;
    const result = completeTransferInPlace(state, negotiation.id);
    if (!result.ok) continue;
    delete negotiation.registrationDueAtDay;
    pushCompletionInbox(state, negotiation, dueDay);
  }
}
