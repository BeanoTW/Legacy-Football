import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import {
  createScoutingBrief,
  scoutingBrief,
  scoutingCandidateSource,
} from "../scoutingDiscovery";
import {
  markKnownPlayerNegotiationInPlace,
  prepareKnownPlayerApproachInPlace,
  syncKnownPlayerNegotiationReasonInPlace,
} from "../knownPlayerNegotiation";
import { knownPlayerIdentity, playerFidelity } from "../playerLifecycle";
import type { TransferNegotiation } from "../types";
import { userClubReference } from "../clubReference";
import {
  canAuthorisePurchase,
  canAuthoriseWage,
  beginTransferRegistrationInPlace,
  improvePlayerTermsInPlace,
  openTransferEnquiryInPlace,
  openTransferNegotiationInPlace,
  submitEnquiryOfferInPlace,
  wageDemand,
} from "../recruitment";
import {
  transferTargetAskingPrice,
  transferTargetPlayer,
} from "../recruitmentTargetBridge";

const state = createScoutingBrief(
  newGame("Negotiation Audit FC", "Auditor", "KNOWN_NEGOTIATION_AUDIT"),
  { id: "known-negotiation-audit", maxAge: 40 },
);
const brief = scoutingBrief(state, "known-negotiation-audit");
if (!brief) throw new Error("scouting brief missing");
const compactId = brief.candidateIds.find(
  (playerId) => scoutingCandidateSource(state, brief.id, playerId) === "fringe",
);
if (!compactId) throw new Error("compact scouting candidate missing");

const beforeCount = state.football?.players.length ?? 0;
const approach = prepareKnownPlayerApproachInPlace(state, compactId, 123456, "First Team");
assert.ok(approach, "known compact target should be approachable");
assert.ok(approach.fromClubId, "compact target should retain seller identity");
assert.equal(approach.fee, 123456);
assert.equal(playerFidelity(state, compactId), "known");
assert.ok(knownPlayerIdentity(state, compactId)?.reasons.includes("negotiation"));
assert.equal(state.football?.players.length ?? 0, beforeCount, "approach must not hydrate player");
assert.equal(state.football?.players.some((player) => player.id === compactId), false);

const negotiation: TransferNegotiation = {
  id: "TN-AUDIT",
  playerId: compactId,
  fromClubId: approach.fromClubId,
  toClubId: userClubReference(state),
  direction: "in",
  stage: "clubTalks",
  clubRounds: 1,
  playerRounds: 0,
  fee: approach.fee,
  proposedWeeklyWage: 1000,
  proposedLengthSeasons: 3,
  proposedSigningBonus: 0,
  proposedRole: "First Team",
  createdSeason: state.season,
  createdAbsoluteWeek: 1,
  expiresAtAbsoluteWeek: 4,
  log: [],
};

syncKnownPlayerNegotiationReasonInPlace(state, negotiation);
assert.ok(knownPlayerIdentity(state, compactId)?.reasons.includes("negotiation"));

negotiation.stage = "rejected";
syncKnownPlayerNegotiationReasonInPlace(state, negotiation);
assert.ok(!knownPlayerIdentity(state, compactId)?.reasons.includes("negotiation"));
assert.ok(knownPlayerIdentity(state, compactId), "terminal talks must preserve known identity");
assert.equal(playerFidelity(state, compactId), "known");
assert.equal(state.football?.players.some((player) => player.id === compactId), false);

assert.equal(markKnownPlayerNegotiationInPlace(state, compactId, true), true);
assert.ok(knownPlayerIdentity(state, compactId)?.reasons.includes("negotiation"));
assert.equal(markKnownPlayerNegotiationInPlace(state, compactId, false), true);
assert.ok(!knownPlayerIdentity(state, compactId)?.reasons.includes("negotiation"));


const enquiryState = createScoutingBrief(
  newGame("Enquiry Audit FC", "Auditor", "TARGET_BRIDGE_INTEGRATION"),
  { id: "known-enquiry-audit", maxAge: 40 },
);
const enquiryBrief = scoutingBrief(enquiryState, "known-enquiry-audit");
if (!enquiryBrief) throw new Error("enquiry scouting brief missing");
const enquiryTarget = enquiryBrief.candidateIds
  .filter(
    (playerId) => scoutingCandidateSource(enquiryState, enquiryBrief.id, playerId) === "fringe",
  )
  .map((playerId) => {
    const player = transferTargetPlayer(enquiryState, playerId);
    if (!player) return null;
    const asking = transferTargetAskingPrice(enquiryState, player, () => 1);
    const demand = wageDemand(enquiryState, player, "First Team");
    return {
      player,
      asking,
      demand,
      affordable:
        canAuthorisePurchase(enquiryState, asking + Math.round(asking * 0.05)).allowed &&
        canAuthoriseWage(enquiryState, Math.round(demand * 0.85)).allowed,
    };
  })
  .filter(
    (
      candidate,
    ): candidate is {
      player: NonNullable<ReturnType<typeof transferTargetPlayer>>;
      asking: number;
      demand: number;
      affordable: boolean;
    } => candidate !== null,
  )
  .find((candidate) => candidate.affordable);

if (!enquiryTarget) throw new Error("affordable enquiry compact target missing");
const enquiryId = enquiryTarget.player.id;
const enquiryDemand = enquiryTarget.demand;
const enquiry = openTransferEnquiryInPlace(
  enquiryState,
  enquiryId,
  "First Team",
  Math.round(enquiryDemand * 0.85),
);
assert.ok(enquiry.ok, enquiry.reason);
if (!enquiry.negotiation) throw new Error("enquiry negotiation missing");
assert.equal(enquiry.negotiation.stage, "enquiry");
assert.equal(enquiry.negotiation.fee, 0, "enquiry must not table a transfer bid");
assert.ok(enquiry.negotiation.clubCounterFee && enquiry.negotiation.clubCounterFee > 0);
assert.ok(
  enquiry.negotiation.log.some((entry) => entry.action === "enquiry"),
  "seller position should be recorded as an enquiry, not an offer",
);
assert.ok(knownPlayerIdentity(enquiryState, enquiryId)?.reasons.includes("negotiation"));
assert.equal(playerFidelity(enquiryState, enquiryId), "known");
assert.equal(
  enquiryState.football?.players.some((player) => player.id === enquiryId),
  false,
  "club enquiry must not hydrate a compact player",
);
const firstBid = submitEnquiryOfferInPlace(
  enquiryState,
  enquiry.negotiation.id,
  enquiry.negotiation.clubCounterFee,
);
assert.ok(firstBid.ok, firstBid.reason);
assert.notEqual(
  enquiry.negotiation.stage,
  "enquiry",
  "submitting a fee must leave the enquiry stage",
);
assert.equal(enquiry.negotiation.clubRounds, 1);


// The canonical incoming-deal path must not need to seed exact hidden wage
// demand. A credible but deliberately sub-demand opening should create a real
// agent counter, then improved terms can resolve through the normal state machine.
const termsState = createScoutingBrief(
  newGame("Negotiation Terms FC", "Auditor", "TARGET_BRIDGE_INTEGRATION"),
  { id: "known-negotiation-terms", maxAge: 40 },
);
const termsBrief = scoutingBrief(termsState, "known-negotiation-terms");
if (!termsBrief) throw new Error("terms scouting brief missing");

const termsTarget = termsBrief.candidateIds
  .filter((playerId) => scoutingCandidateSource(termsState, termsBrief.id, playerId) === "fringe")
  .map((playerId) => {
    const player = transferTargetPlayer(termsState, playerId);
    if (!player) return null;
    const asking = transferTargetAskingPrice(termsState, player, () => 1);
    const demand = wageDemand(termsState, player, "First Team");
    return {
      player,
      asking,
      demand,
      affordable:
        canAuthorisePurchase(termsState, asking + Math.round(asking * 0.05)).allowed &&
        canAuthoriseWage(termsState, demand).allowed,
    };
  })
  .filter(
    (
      candidate,
    ): candidate is {
      player: NonNullable<ReturnType<typeof transferTargetPlayer>>;
      asking: number;
      demand: number;
      affordable: boolean;
    } => candidate !== null,
  )
  .find((candidate) => candidate.affordable);

if (!termsTarget) throw new Error("affordable compact terms target missing");

const openingWage = Math.round(termsTarget.demand * 0.85);
const openedTerms = openTransferNegotiationInPlace(
  termsState,
  termsTarget.player.id,
  termsTarget.asking,
  "First Team",
  openingWage,
);
assert.ok(openedTerms.ok, openedTerms.reason);
if (!openedTerms.negotiation) throw new Error("terms negotiation missing");
assert.equal(
  openedTerms.negotiation.proposedWeeklyWage < termsTarget.demand,
  true,
  "canonical talks must preserve the supplied sub-demand opening wage",
);
assert.equal(
  openedTerms.negotiation.stage,
  "playerTalks",
  "credible sub-demand terms should reach a genuine player counter rather than auto-agree",
);
assert.ok(
  openedTerms.negotiation.playerCounterWage &&
    openedTerms.negotiation.playerCounterWage > openedTerms.negotiation.proposedWeeklyWage,
  "player should return a wage counter",
);
const improvedTerms = improvePlayerTermsInPlace(
  termsState,
  openedTerms.negotiation.id,
  termsTarget.demand,
);
assert.ok(improvedTerms.ok, improvedTerms.reason);
assert.equal(
  openedTerms.negotiation.stage,
  "agreed",
  "meeting the canonical demand after a counter should resolve personal terms",
);
assert.equal(
  termsState.football?.players.some((player) => player.id === termsTarget.player.id),
  false,
  "real personal-term negotiation must still not hydrate the compact player",
);
const registrationTerms = beginTransferRegistrationInPlace(
  termsState,
  openedTerms.negotiation.id,
);
assert.ok(registrationTerms.ok, registrationTerms.reason);
assert.equal(openedTerms.negotiation.stage, "registration");
assert.equal(playerFidelity(termsState, termsTarget.player.id), "known");
assert.equal(
  termsState.football?.players.some((player) => player.id === termsTarget.player.id),
  false,
  "registration must preserve compact known fidelity until completion",
);
assert.ok(
  knownPlayerIdentity(termsState, termsTarget.player.id)?.reasons.includes("negotiation"),
  "registration remains an active temporary negotiation reason",
);

console.log("\nknown-player-negotiation: passed");
