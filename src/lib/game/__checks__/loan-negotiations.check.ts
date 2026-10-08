import assert from "node:assert/strict";
import { newGame } from "../newGame";
import { advanceDay } from "../engine";
import {
  activeLoanForPlayer,
} from "../loans";
import {
  acceptLoanCounter,
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
import { buildWorldSimulationPlan } from "../world";
import { isUserClubReference } from "../clubReference";
import { playerOwnerClubId } from "../playerRegistration";
import { reconcile } from "../finance";

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
    loanFee: 100,
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
const cashBeforeOut = repliedOut.cash;
const completedOut = completeLoanNegotiation(repliedOut, outId);
assert.equal(completedOut.result.ok, true, completedOut.result.reason);
assert.equal(completedOut.state.cash, cashBeforeOut + 100, "outgoing fee is received once");
assert.equal(activeLoanForPlayer(completedOut.state, outgoingPlayer.id)?.loanFee, 100);
assert.equal(
  completedOut.state.financeLedger.filter(
    (entry) => entry.subcategory === "Loan fee" && entry.direction === "income",
  ).length,
  1,
  "outgoing fee posts one transfer-income ledger entry",
);
assert.equal(reconcile(completedOut.state).ok, true, "outgoing loan fee keeps finance reconciled");
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
    loanFee: 0,
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
  (countered!.counterTerms!.loanFee ?? 0) > 0 ||
    countered!.counterTerms!.loanClubWageContributionPct > 0 ||
    countered!.counterTerms!.playingTimeExpectation !== "Backup",
  "counter materially improves the borrowing offer",
);
assert.ok((countered!.counterTerms!.loanFee ?? 0) > 0, "parent club can counter with a loan fee");
assert.equal(
  activeLoanForPlayer(repliedWeak, borrowPlayer.id),
  undefined,
  "countered talks still do not alter player registration",
);

console.log("\n[LN3] Incoming agreed fees are charged once");
const acceptedWeak = acceptLoanCounter(repliedWeak, weakId);
assert.equal(acceptedWeak.result.ok, true, acceptedWeak.result.reason);
const agreedIn = loanNegotiationById(acceptedWeak.state, weakId)!;
const incomingFee = agreedIn.terms.loanFee ?? 0;
assert.ok(incomingFee > 0, "accepted counter retains the negotiated fee");
const cashBeforeIn = acceptedWeak.state.cash;
const completedIn = completeLoanNegotiation(acceptedWeak.state, weakId);
assert.equal(completedIn.result.ok, true, completedIn.result.reason);
assert.equal(completedIn.state.cash, cashBeforeIn - incomingFee, "incoming fee is paid once");
assert.equal(activeLoanForPlayer(completedIn.state, borrowPlayer.id)?.loanFee, incomingFee);
assert.equal(
  completedIn.state.financeLedger.filter(
    (entry) => entry.subcategory === "Loan fee" && entry.direction === "expense",
  ).length,
  1,
  "incoming fee posts one transfer-expense ledger entry",
);
assert.equal(reconcile(completedIn.state).ok, true, "incoming loan fee keeps finance reconciled");
const duplicateComplete = completeLoanNegotiation(completedIn.state, weakId);
assert.equal(duplicateComplete.result.ok, false, "completed loan cannot be charged twice");
assert.equal(
  duplicateComplete.state.financeLedger.filter((entry) => entry.subcategory === "Loan fee").length,
  1,
  "repeat completion adds no second fee entry",
);

console.log("\n[LN4] Due processor is idempotent");
const snapshot = structuredClone(repliedWeak);
assert.equal(processDueLoanNegotiationResponsesInPlace(snapshot), 0);
assert.equal(
  loanNegotiationById(snapshot, weakId)?.status,
  "countered",
  "settled response is not processed twice",
);

console.log("\n24 passed, 0 failed");
