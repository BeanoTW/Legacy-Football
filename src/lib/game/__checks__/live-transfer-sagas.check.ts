import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import {
  negotiationById,
  openTransferEnquiryInPlace as legacyOpenTransferEnquiryInPlace,
  transferMarket,
} from "../recruitmentLegacy";
import {
  initialisePlayerTransferInterestInPlace,
  playerInterestWageMultiplier,
  playerTransferInterest,
  processTransferMarketDynamicsInPlace,
} from "../transferMarketDynamics";
import { transferAbsoluteDay } from "../transferResponses";

console.log("\n[LIVE-TRANSFER-SAGAS] player interest and rival pressure");

const state = newGame("Saga FC", "Director", "TRANSFER-SAGA-CHECK");
const market = transferMarket(state).filter((entry) => entry.clubId !== null);
assert.ok(market.length > 0, "contracted transfer market has candidates");

const target = market[0].player;
const first = playerTransferInterest(state, target.id, "First Team");
const second = playerTransferInterest(state, target.id, "First Team");
assert.ok(first, "player interest can be assessed");
assert.deepEqual(first, second, "player interest is deterministic for a stable save");
assert.ok(["keen", "open", "needsConvincing", "notInterested"].includes(first!.band), "interest uses a supported band");

const keyInterest = playerTransferInterest(state, target.id, "Key Player");
const prospectInterest = playerTransferInterest(state, target.id, "Prospect");
assert.ok(keyInterest && prospectInterest, "role-sensitive interest readings exist");
assert.ok(keyInterest!.score >= prospectInterest!.score, "a more important role never hurts initial interest");

const opened = legacyOpenTransferEnquiryInPlace(state, target.id, "First Team");
assert.ok(opened.ok && opened.negotiation, "fixture can open a transfer enquiry");
const negotiation = opened.negotiation!;
const savedInterest = initialisePlayerTransferInterestInPlace(state, negotiation);
assert.ok(savedInterest && negotiation.playerInterestScore !== undefined, "interest is persisted onto the negotiation");
assert.equal(
  playerInterestWageMultiplier({ ...negotiation, playerInterest: "keen" }),
  0.96,
  "keen players are slightly easier to settle with",
);
assert.equal(
  playerInterestWageMultiplier({ ...negotiation, playerInterest: "needsConvincing" }),
  1.1,
  "reluctant players demand a stronger package",
);

const detailedTarget = state.football.players.find(
  (player) => player.currentClubId && player.currentClubId !== state.clubName,
);
if (detailedTarget) {
  const originalRep = detailedTarget.reputation;
  detailedTarget.reputation = 100;
  const refusal = playerTransferInterest(state, detailedTarget.id, "Rotation");
  assert.equal(refusal?.band, "notInterested", "elite-reputation player can refuse a clearly unattractive move");
  detailedTarget.reputation = originalRep;
}

const sagaState = structuredClone(state);
const saga = negotiationById(sagaState, negotiation.id)!;
saga.stage = "agreed";
saga.pendingResponseAtDay = undefined;
saga.pendingResponseAtHour = undefined;
saga.pendingResponseKind = undefined;
saga.playerInterest = "open";
saga.playerInterestRevealed = true;
saga.competingClubId =
  (sagaState.leagues ?? [])
    .flatMap((league) => league.clubIds)
    .find((clubId) => clubId !== saga.fromClubId && clubId !== saga.toClubId) ?? "rival-club";
saga.competingOfferFee = Math.max(1, saga.fee);
saga.competingWeeklyWage = Math.max(100, Math.round(saga.proposedWeeklyWage * 1.2));
saga.competitionStatus = "playerTerms";
saga.lastCompetitionUpdateDay = transferAbsoluteDay(sagaState) - 1;

processTransferMarketDynamicsInPlace(sagaState);
assert.equal(saga.stage, "playerTalks", "stronger rival personal terms can reopen an agreed player deal");
assert.equal(saga.renegotiationRequested, true, "renegotiation request is persisted");
assert.ok(
  (saga.playerCounterWage ?? 0) >= (saga.competingWeeklyWage ?? 0),
  "reopened terms reflect the rival package",
);
assert.ok(
  sagaState.inbox.some((item) => item.subject.includes("Terms reopened")),
  "rival-triggered renegotiation is surfaced in the inbox",
);

console.log("live-transfer-sagas: passed");
