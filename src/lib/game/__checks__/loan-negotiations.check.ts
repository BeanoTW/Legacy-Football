import assert from "node:assert/strict";
import { newGame } from "../newGame";
import { advanceDay } from "../engine";
import {
  activeLoanForPlayer,
} from "../loans";
import {
  completeLoanNegotiation,
  loanNegotiationById,
  openLoanNegotiation,
  processDueLoanNegotiationResponsesInPlace,
} from "../loanNegotiations";
import {
  activeContract,
  squadOf,
  userSquad,
} from "../recruitmentLegacy";
import { buildWorldSimulationPlan } from "../worldFocusPolicy";
import { isUserClubReference } from "../clubReference";
import { playerOwnerClubId } from "../playerRegistration";

function advanceUntilReply(state: ReturnType<typeof newGame>, negotiationId: string) {
  let next = state;
  for (let i = 0; i < 4; i++) {
    const negotiation = loanNegotiationById(next, negotiationId);
    if (negotiation && negotiation.status !== "awaitingClub") return next;
    next = advanceDay(next);
  }
  return next;
}

console.log("\n[LN1] Outgoing loans use dated negotiation");
const outgoing = newGame("Loan Talks FC", "Auditor", "LOAN_NEGOTIATION_OUT");
const outgoingPlayer = userSquad(outgoing)[0];
assert.ok(outgoingPlayer, "outgoing fixture needs a user player");

const openedOut = openLoanNegotiation(
  outgoing,
  "out",
  outgoingPlayer.id,
  {
    durationWeeks: 4,
    loanClubWageContributionPct: 20,
    playingTimeExpectation: "Backup",
  },
);
assert.equal(openedOut.result.ok, true, openedOut.result.reason);
const outId = openedOut.result.negotiation!.id;
assert.equal(
  activeLoanForPlayer(openedOut.state, outgoingPlayer.id),
  undefined,
  "submitting loan terms must not register the player immediately",
);
assert.equal(
  loanNegotiationById(openedOut.state, outId)?.status,
  "awaitingClub",
  "new proposal waits for the external club",
);

const repliedOut = advanceUntilReply(openedOut.state, outId);
assert.equal(
  loanNegotiationById(repliedOut, outId)?.status,
  "ready",
  "acceptable outgoing terms become ready only after a dated reply",
);
const completedOut = completeLoanNegotiation(repliedOut, outId);
assert.equal(completedOut.result.ok, true, completedOut.result.reason);
assert.ok(
  activeLoanForPlayer(completedOut.state, outgoingPlayer.id),
  "agreed outgoing loan registers only after chairman completion",
);
assert.equal(
  loanNegotiationById(completedOut.state, outId)?.status,
  "completed",
  "completed negotiation remains in history",
);

console.log("\n[LN2] Weak incoming loan offers can be countered");
const incoming = newGame("Borrow Talks FC", "Auditor", "LOAN_NEGOTIATION_IN");
const focus = buildWorldSimulationPlan(incoming).focusClubIds;
const borrowPlayer = incoming.football.players.find((candidate) => {
  const owner = playerOwnerClubId(candidate);
  return (
    owner &&
    !isUserClubReference(incoming, owner) &&
    focus.includes(owner) &&
    squadOf(incoming, owner).length > 16 &&
    Boolean(activeContract(incoming, candidate.id))
  );
});
assert.ok(borrowPlayer, "incoming fixture needs a contracted external player");

const weak = openLoanNegotiation(
  incoming,
  "in",
  borrowPlayer.id,
  {
    durationWeeks: 4,
    loanClubWageContributionPct: 0,
    playingTimeExpectation: "Backup",
  },
);
assert.equal(weak.result.ok, true, weak.result.reason);
const weakId = weak.result.negotiation!.id;

const repliedWeak = advanceUntilReply(weak.state, weakId);
const countered = loanNegotiationById(repliedWeak, weakId);
assert.equal(countered?.status, "countered", "weak terms produce a counter rather than an instant loan");
assert.ok(countered?.counterTerms, "club counter contains concrete revised terms");
assert.ok(
  countered!.counterTerms!.loanClubWageContributionPct > 0 ||
    countered!.counterTerms!.playingTimeExpectation !== "Backup",
  "counter materially improves the borrowing offer",
);
assert.equal(
  activeLoanForPlayer(repliedWeak, borrowPlayer.id),
  undefined,
  "countered talks still do not alter player registration",
);

console.log("\n[LN3] Due processor is idempotent");
const snapshot = structuredClone(repliedWeak);
assert.equal(processDueLoanNegotiationResponsesInPlace(snapshot), 0);
assert.equal(
  loanNegotiationById(snapshot, weakId)?.status,
  "countered",
  "settled response is not processed twice",
);

console.log("\n12 passed, 0 failed");
