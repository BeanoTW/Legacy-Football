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
  improvePlayerTermsInPlace,
  openTransferNegotiationInPlace,
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

console.log("\nknown-player-negotiation: passed");
