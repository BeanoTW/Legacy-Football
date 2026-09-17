import type { GameState, InboxItem, TransferNegotiation } from "./types";
import { hashString } from "./rng";
import { absoluteWeek } from "./time";
import { askingPrice, playerName } from "./recruitmentLegacy";
import {
  clearTransferResponseInPlace,
  scheduleTransferResponseInPlace,
  transferResponseIsDue,
} from "./transferResponses";
import {
  syncTransferTargetNegotiationInPlace,
  transferTargetAskingPrice,
  transferTargetPlayer,
} from "./recruitmentTargetBridge";
import { recruitmentTransferFeePolicyForClub } from "./recruitmentEconomy";
import {
  sellingClubAcceptsFee,
  sellingClubBargainingPosition,
} from "./clubTransferNegotiation";

const nowAbsWeek = (state: GameState) => absoluteWeek(state.season, state.week);

function pushInboxOnce(state: GameState, negotiation: TransferNegotiation, dueDay: number, subject: string, body: string, priority: "normal" | "high" = "normal"): void {
  const eventKey = `transfer-response:${negotiation.id}:${dueDay}:${subject}`;
  if (state.inbox.some((item) => item.eventKey === eventKey)) return;
  const item: InboxItem = {
    id: `inbox-${hashString(eventKey).toString(36)}`,
    generatorId: "recruitment-transfer-response",
    eventKey,
    sender: "Director of Football",
    department: "Director of Football",
    category: "transfers",
    subject,
    body,
    priority,
    week: state.week,
    season: state.season,
    status: "unread",
  };
  state.inbox.push(item);
}

function acceptClubOffer(state: GameState, negotiation: TransferNegotiation, dueDay: number, playerLabel: string): void {
  negotiation.stage = "playerTalks";
  negotiation.playerRounds = 1;
  delete negotiation.clubCounterFee;
  delete negotiation.playerCounterWage;
  delete negotiation.resolvedAtAbsoluteWeek;
  negotiation.log.push({
    round: negotiation.clubRounds,
    party: "club",
    action: "accept",
    note: `${negotiation.fromClubId} accept £${negotiation.fee.toLocaleString()}. Personal terms next.`,
    absoluteWeek: nowAbsWeek(state),
  });
  syncTransferTargetNegotiationInPlace(state, negotiation);
  const playerDue = scheduleTransferResponseInPlace(state, negotiation, "player", 1, 2);
  pushInboxOnce(
    state,
    negotiation,
    dueDay,
    `Offer accepted: ${playerLabel}`,
    `${negotiation.fromClubId} have accepted £${negotiation.fee.toLocaleString()}. Personal terms are now with ${playerLabel}; a response is expected in ${Math.max(1, playerDue - dueDay)} day${playerDue - dueDay === 1 ? "" : "s"}.`,
    "high",
  );
}

/**
 * Resolve due selling-club replies before the legacy dated adapter sees them.
 * This preserves the existing Advance/inbox timing while replacing the old
 * round-seeded threshold with a stable reservation value and real counters.
 */
export function processDueSellingClubResponsesInPlace(state: GameState): void {
  for (const negotiation of state.football?.negotiations ?? []) {
    if (negotiation.pendingResponseKind !== "club" || !transferResponseIsDue(state, negotiation) || negotiation.pendingResponseAtDay === undefined) continue;
    const dueDay = negotiation.pendingResponseAtDay;
    const player = transferTargetPlayer(state, negotiation.playerId);
    clearTransferResponseInPlace(negotiation);
    if (!player || negotiation.stage !== "clubTalks") continue;

    const sellerClubId = negotiation.fromClubId ?? player.currentClubId;
    if (!sellerClubId) continue;
    const label = playerName(player);
    const ask = transferTargetAskingPrice(state, player, askingPrice);
    const departmentEdge = Math.min(0.12, Math.max(0, (state.football?.department?.negotiationRating ?? 50) / 650));
    const economicFloor = ask * (1 - departmentEdge);
    const position = sellingClubBargainingPosition(
      state,
      sellerClubId,
      negotiation.id,
      economicFloor,
      negotiation.competingOfferFee,
      negotiation.clubRounds,
    );

    // A club's explicit counter is a commitment. Meeting it cannot be rerolled away.
    const metExplicitCounter = negotiation.clubCounterFee !== undefined && negotiation.fee >= negotiation.clubCounterFee;
    if (metExplicitCounter || sellingClubAcceptsFee(negotiation.fee, position)) {
      acceptClubOffer(state, negotiation, dueDay, label);
      continue;
    }

    const insultFloor = position.reservationFee * 0.7;
    if (negotiation.clubRounds >= position.patience || negotiation.fee < insultFloor) {
      negotiation.stage = "rejected";
      negotiation.resolvedAtAbsoluteWeek = nowAbsWeek(state);
      negotiation.log.push({
        round: negotiation.clubRounds,
        party: "club",
        action: "reject",
        note: `${sellerClubId} reject the approach.`,
        absoluteWeek: negotiation.resolvedAtAbsoluteWeek,
      });
      syncTransferTargetNegotiationInPlace(state, negotiation);
      pushInboxOnce(
        state,
        negotiation,
        dueDay,
        `Offer rejected: ${label}`,
        `${sellerClubId} have rejected our £${negotiation.fee.toLocaleString()} approach for ${label}.`,
        "high",
      );
      continue;
    }

    const feeStep = recruitmentTransferFeePolicyForClub(state, sellerClubId).feeStep;
    negotiation.clubCounterFee = Math.max(position.reservationFee, position.counterFee, negotiation.fee + feeStep);
    negotiation.log.push({
      round: negotiation.clubRounds,
      party: "club",
      action: "counter",
      note: `${sellerClubId} want £${negotiation.clubCounterFee.toLocaleString()}.`,
      absoluteWeek: nowAbsWeek(state),
    });
    syncTransferTargetNegotiationInPlace(state, negotiation);
    pushInboxOnce(
      state,
      negotiation,
      dueDay,
      `Counter-offer: ${label}`,
      `${sellerClubId} want £${negotiation.clubCounterFee.toLocaleString()} for ${label}.`,
    );
  }
}
