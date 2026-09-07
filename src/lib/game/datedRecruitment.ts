import type { GameState, InboxItem, SquadRole, TransferNegotiation } from "./types";
import { hashString } from "./rng";
import { absoluteWeek } from "./time";
import {
  clearTransferResponseInPlace,
  scheduleTransferResponseInPlace,
  transferResponseIsDue,
} from "./transferResponses";
import {
  counterClubOfferInPlace as legacyCounterClubOfferInPlace,
  evaluateClubResponseInPlace as legacyEvaluateClubResponseInPlace,
  evaluatePlayerResponseInPlace as legacyEvaluatePlayerResponseInPlace,
  improvePlayerTermsInPlace as legacyImprovePlayerTermsInPlace,
  openTransferEnquiryInPlace as legacyOpenTransferEnquiryInPlace,
  openTransferNegotiationInPlace as legacyOpenTransferNegotiationInPlace,
  playerName,
  submitEnquiryOfferInPlace as legacySubmitEnquiryOfferInPlace,
  withdrawNegotiationInPlace as legacyWithdrawNegotiationInPlace,
  type NegotiationResult,
} from "./recruitmentLegacy";
import {
  syncTransferTargetNegotiationInPlace,
  transferTargetPlayer,
} from "./recruitmentTargetBridge";

declare module "./types" {
  interface TransferNegotiation {
    /** Seller valuation held internally until an enquiry reply actually lands. */
    pendingEnquiryFee?: number;
  }
}

const nowAbsWeek = (s: GameState) => absoluteWeek(s.season, s.week);

function waiting(n: TransferNegotiation): NegotiationResult | null {
  return n.pendingResponseAtDay !== undefined
    ? { ok: false, reason: "A response is already due", negotiation: n }
    : null;
}

function trimResponseLog(n: TransferNegotiation, keepLength: number): void {
  if (n.log.length > keepLength) n.log = n.log.slice(0, keepLength);
}

function restorePendingClubState(
  s: GameState,
  n: TransferNegotiation,
  keepLogLength: number,
  previousCounterFee?: number,
  previousPlayerRounds = 0,
): void {
  trimResponseLog(n, keepLogLength);
  n.stage = "clubTalks";
  n.playerRounds = previousPlayerRounds;
  if (previousCounterFee === undefined) delete n.clubCounterFee;
  else n.clubCounterFee = previousCounterFee;
  delete n.playerCounterWage;
  delete n.resolvedAtAbsoluteWeek;
  syncTransferTargetNegotiationInPlace(s, n);
  scheduleTransferResponseInPlace(s, n, "club");
}

function restorePendingPlayerState(
  s: GameState,
  n: TransferNegotiation,
  keepLogLength: number,
  previousCounterWage?: number,
): void {
  trimResponseLog(n, keepLogLength);
  n.stage = "playerTalks";
  if (previousCounterWage === undefined) delete n.playerCounterWage;
  else n.playerCounterWage = previousCounterWage;
  delete n.resolvedAtAbsoluteWeek;
  syncTransferTargetNegotiationInPlace(s, n);
  scheduleTransferResponseInPlace(s, n, "player", 1, 2);
}

/**
 * Chairman-facing enquiry. The legacy engine still calculates the seller's
 * deterministic position immediately, but this adapter keeps it hidden until
 * the persisted reply day arrives.
 */
export function openTransferEnquiryInPlace(
  s: GameState,
  playerId: string,
  role: SquadRole = "First Team",
  openingWeeklyWage?: number,
): NegotiationResult {
  const player = transferTargetPlayer(s, playerId);
  const wasFreeAgent = player?.currentClubId === null;
  const result = legacyOpenTransferEnquiryInPlace(s, playerId, role, openingWeeklyWage);
  const n = result.negotiation;
  if (!result.ok || !n) return result;

  // Free agents have no selling club, so the public enquiry action is really
  // an opening personal-terms proposal. Hide the legacy immediate player reply.
  if (wasFreeAgent) {
    restorePendingPlayerState(s, n, Math.min(2, n.log.length));
    return { ...result, reason: "Terms sent to player" };
  }

  n.pendingEnquiryFee = n.clubCounterFee;
  delete n.clubCounterFee;
  if (n.log.length) {
    n.log[n.log.length - 1] = {
      ...n.log[n.log.length - 1],
      note: `${n.fromClubId} have received our enquiry.`,
    };
  }
  scheduleTransferResponseInPlace(s, n, "enquiry", 1, 3);
  syncTransferTargetNegotiationInPlace(s, n);
  return { ...result, reason: "Enquiry sent" };
}

/** Turn a returned enquiry into a bid, but do not expose the seller's answer yet. */
export function submitEnquiryOfferInPlace(
  s: GameState,
  negotiationId: string,
  fee?: number,
): NegotiationResult {
  const n = s.football?.negotiations.find((x) => x.id === negotiationId);
  if (!n) return { ok: false, reason: "Unknown negotiation" };
  const blocked = waiting(n);
  if (blocked) return blocked;
  const beforeLog = n.log.length;
  const previousCounter = n.clubCounterFee;
  const previousPlayerRounds = n.playerRounds;
  const result = legacySubmitEnquiryOfferInPlace(s, negotiationId, fee);
  if (!result.ok || !result.negotiation) return result;
  restorePendingClubState(
    s,
    result.negotiation,
    beforeLog + 1,
    previousCounter,
    previousPlayerRounds,
  );
  return { ...result, reason: "Offer sent — awaiting club response" };
}

/** Open a new bid or free-agent proposal and persist the reply date. */
export function openTransferNegotiationInPlace(
  s: GameState,
  playerId: string,
  fee: number,
  role: SquadRole = "First Team",
  openingWeeklyWage?: number,
): NegotiationResult {
  const player = transferTargetPlayer(s, playerId);
  const wasFreeAgent = player?.currentClubId === null;
  const result = legacyOpenTransferNegotiationInPlace(s, playerId, fee, role, openingWeeklyWage);
  const n = result.negotiation;
  if (!result.ok || !n) return result;

  if (wasFreeAgent) {
    restorePendingPlayerState(s, n, Math.min(2, n.log.length));
    return { ...result, reason: "Terms sent — awaiting player response" };
  }

  restorePendingClubState(s, n, Math.min(1, n.log.length));
  return { ...result, reason: "Offer sent — awaiting club response" };
}

/** Improve a transfer bid; the counterparty now answers on a future day. */
export function counterClubOfferInPlace(
  s: GameState,
  negotiationId: string,
  fee?: number,
): NegotiationResult {
  const n = s.football?.negotiations.find((x) => x.id === negotiationId);
  if (!n) return { ok: false, reason: "Unknown negotiation" };
  const blocked = waiting(n);
  if (blocked) return blocked;
  const beforeLog = n.log.length;
  const previousCounter = n.clubCounterFee;
  const previousPlayerRounds = n.playerRounds;
  const result = legacyCounterClubOfferInPlace(s, negotiationId, fee);
  if (!result.ok || !result.negotiation) return result;
  restorePendingClubState(
    s,
    result.negotiation,
    beforeLog + 1,
    previousCounter,
    previousPlayerRounds,
  );
  return { ...result, reason: "Improved offer sent — awaiting club response" };
}

/** Improve personal terms; the player/agent now answers on a future day. */
export function improvePlayerTermsInPlace(
  s: GameState,
  negotiationId: string,
  wage?: number,
  seasons?: number,
  role?: SquadRole,
): NegotiationResult {
  const n = s.football?.negotiations.find((x) => x.id === negotiationId);
  if (!n) return { ok: false, reason: "Unknown negotiation" };
  const blocked = waiting(n);
  if (blocked) return blocked;
  const beforeLog = n.log.length;
  const previousCounter = n.playerCounterWage;
  const result = legacyImprovePlayerTermsInPlace(s, negotiationId, wage, seasons, role);
  if (!result.ok || !result.negotiation) return result;
  restorePendingPlayerState(s, result.negotiation, beforeLog + 1, previousCounter);
  return { ...result, reason: "Terms sent — awaiting player response" };
}

export function withdrawNegotiationInPlace(
  s: GameState,
  negotiationId: string,
): NegotiationResult {
  const result = legacyWithdrawNegotiationInPlace(s, negotiationId);
  if (result.ok && result.negotiation) {
    clearTransferResponseInPlace(result.negotiation);
    delete result.negotiation.pendingEnquiryFee;
  }
  return result;
}

function inboxItem(
  s: GameState,
  n: TransferNegotiation,
  dueDay: number,
  subject: string,
  body: string,
  priority: "normal" | "high" = "normal",
): InboxItem {
  const eventKey = `transfer-response:${n.id}:${dueDay}:${subject}`;
  return {
    id: `inbox-${hashString(eventKey).toString(36)}`,
    generatorId: "recruitment-transfer-response",
    eventKey,
    sender: "Director of Football",
    department: "Director of Football",
    category: "transfers",
    subject,
    body,
    priority,
    week: s.week,
    season: s.season,
    status: "unread",
  };
}

function pushInboxOnce(s: GameState, item: InboxItem): void {
  if (!s.inbox.some((existing) => existing.eventKey === item.eventKey)) s.inbox.push(item);
}

function resolveEnquiryInPlace(s: GameState, n: TransferNegotiation, dueDay: number): void {
  const p = transferTargetPlayer(s, n.playerId);
  const fee = n.pendingEnquiryFee;
  clearTransferResponseInPlace(n);
  delete n.pendingEnquiryFee;
  if (!p || fee === undefined || n.stage !== "enquiry") return;
  n.clubCounterFee = fee;
  n.log.push({
    round: 0,
    party: "club",
    action: "enquiry",
    note: `${n.fromClubId} indicate they would consider offers around £${fee.toLocaleString()}.`,
    absoluteWeek: nowAbsWeek(s),
  });
  syncTransferTargetNegotiationInPlace(s, n);
  const rival = n.competingClubId
    ? ` We are aware of interest from ${n.competingClubId}.`
    : "";
  pushInboxOnce(
    s,
    inboxItem(
      s,
      n,
      dueDay,
      `Transfer enquiry response: ${playerName(p)}`,
      `${n.fromClubId} are willing to discuss a deal and value ${playerName(p)} at around £${fee.toLocaleString()}.${rival}`,
    ),
  );
}

function resolveClubReplyInPlace(s: GameState, n: TransferNegotiation, dueDay: number): void {
  const p = transferTargetPlayer(s, n.playerId);
  if (!p || n.stage !== "clubTalks") {
    clearTransferResponseInPlace(n);
    return;
  }
  const beforeLog = n.log.length;
  clearTransferResponseInPlace(n);
  legacyEvaluateClubResponseInPlace(s, n);
  const additions = n.log.slice(beforeLog);
  const acceptOffset = additions.findIndex(
    (entry) => entry.party === "club" && entry.action === "accept",
  );

  if (acceptOffset >= 0) {
    // The legacy evaluator immediately evaluates the player's pre-proposed
    // terms. Keep the seller acceptance, rewind that nested reply, then give
    // the player/agent their own persisted response date.
    trimResponseLog(n, beforeLog + acceptOffset + 1);
    n.stage = "playerTalks";
    n.playerRounds = 1;
    delete n.playerCounterWage;
    delete n.resolvedAtAbsoluteWeek;
    syncTransferTargetNegotiationInPlace(s, n);
    const playerDue = scheduleTransferResponseInPlace(s, n, "player", 1, 2);
    pushInboxOnce(
      s,
      inboxItem(
        s,
        n,
        dueDay,
        `Offer accepted: ${playerName(p)}`,
        `${n.fromClubId} have accepted £${n.fee.toLocaleString()}. Personal terms are now with ${playerName(p)}; a response is expected in ${Math.max(1, playerDue - dueDay)} day${playerDue - dueDay === 1 ? "" : "s"}.`,
        "high",
      ),
    );
    return;
  }

  if (n.stage === "rejected") {
    pushInboxOnce(
      s,
      inboxItem(
        s,
        n,
        dueDay,
        `Offer rejected: ${playerName(p)}`,
        `${n.fromClubId} have rejected our £${n.fee.toLocaleString()} approach for ${playerName(p)}.`,
        "high",
      ),
    );
    return;
  }

  pushInboxOnce(
    s,
    inboxItem(
      s,
      n,
      dueDay,
      `Counter-offer: ${playerName(p)}`,
      `${n.fromClubId} want £${(n.clubCounterFee ?? n.fee).toLocaleString()} for ${playerName(p)}.`,
    ),
  );
}

function resolvePlayerReplyInPlace(s: GameState, n: TransferNegotiation, dueDay: number): void {
  const p = transferTargetPlayer(s, n.playerId);
  if (!p || n.stage !== "playerTalks") {
    clearTransferResponseInPlace(n);
    return;
  }
  clearTransferResponseInPlace(n);
  legacyEvaluatePlayerResponseInPlace(s, n);

  if (n.stage === "agreed") {
    pushInboxOnce(
      s,
      inboxItem(
        s,
        n,
        dueDay,
        `Personal terms agreed: ${playerName(p)}`,
        `${playerName(p)} has agreed terms at £${n.proposedWeeklyWage.toLocaleString()}/wk. The deal can now move to registration.`,
        "high",
      ),
    );
    return;
  }

  if (n.stage === "rejected") {
    pushInboxOnce(
      s,
      inboxItem(
        s,
        n,
        dueDay,
        `Player declines: ${playerName(p)}`,
        `${playerName(p)} has turned down our proposed personal terms.`,
        "high",
      ),
    );
    return;
  }

  pushInboxOnce(
    s,
    inboxItem(
      s,
      n,
      dueDay,
      `Agent response: ${playerName(p)}`,
      `${playerName(p)} is asking for £${(n.playerCounterWage ?? n.proposedWeeklyWage).toLocaleString()}/wk to continue talks.`,
    ),
  );
}

/** Resolve every transfer reply whose persisted day has arrived. Idempotent. */
export function processDueTransferResponsesInPlace(s: GameState): void {
  for (const n of s.football?.negotiations ?? []) {
    if (!transferResponseIsDue(s, n) || n.pendingResponseAtDay === undefined) continue;
    const dueDay = n.pendingResponseAtDay;
    switch (n.pendingResponseKind) {
      case "enquiry":
        resolveEnquiryInPlace(s, n, dueDay);
        break;
      case "player":
        resolvePlayerReplyInPlace(s, n, dueDay);
        break;
      case "club":
      default:
        resolveClubReplyInPlace(s, n, dueDay);
        break;
    }
  }
}
