import assert from "node:assert/strict";
import { newGame } from "../newGame";
import { advanceDay } from "../engine";
import {
  loanAvailabilityForPlayer,
  removePlayerLoanAvailability,
  setPlayerAvailableForLoan,
} from "../loanAvailability";
import {
  completeLoanNegotiation,
  loanNegotiationById,
  openLoanNegotiation,
} from "../loanNegotiations";
import { activeLoanForPlayer } from "../loans";
import { userSquad } from "../recruitmentLegacy";

function advanceUntilReply(state: ReturnType<typeof newGame>, negotiationId: string) {
  let next = state;
  for (let i = 0; i < 4; i++) {
    const negotiation = loanNegotiationById(next, negotiationId);
    if (negotiation && negotiation.status !== "awaitingClub") return next;
    next = advanceDay(next);
  }
  return next;
}

console.log("\n[LA1] Players can be offered to the loan market without moving");
const opening = newGame("Loan Listing FC", "Auditor", "LOAN_AVAILABILITY");
const player = userSquad(opening)[0];
assert.ok(player, "fixture needs a user player");

const listed = setPlayerAvailableForLoan(opening, player.id, {
  durationWeeks: 4,
  loanClubWageContributionPct: 20,
  playingTimeExpectation: "Backup",
});
assert.equal(listed.ok, true, listed.reason);
assert.equal(activeLoanForPlayer(listed.state, player.id), undefined);
const listing = loanAvailabilityForPlayer(listed.state, player.id);
assert.ok(listing, "loan listing is persisted");
assert.equal(listing!.preferredTerms.loanClubWageContributionPct, 20);
assert.equal(listing!.interestedClubIds.length, 0, "listing does not invent instant interest");

const oneDayLater = advanceDay(listed.state);
const laterListing = loanAvailabilityForPlayer(oneDayLater, player.id);
assert.ok(laterListing, "loan listing survives calendar advancement");
assert.ok(
  laterListing!.interestedClubIds.length >= 1,
  "a willing simulated club can register interest after time passes",
);
assert.equal(activeLoanForPlayer(oneDayLater, player.id), undefined);

console.log("\n[LA2] Listing and negotiation remain separate chairman actions");
const opened = openLoanNegotiation(
  oneDayLater,
  "out",
  player.id,
  laterListing!.preferredTerms,
);
assert.equal(opened.result.ok, true, opened.result.reason);
assert.ok(
  loanAvailabilityForPlayer(opened.state, player.id),
  "opening talks does not remove the player's market status",
);
const negotiationId = opened.result.negotiation!.id;
const replied = advanceUntilReply(opened.state, negotiationId);
assert.equal(loanNegotiationById(replied, negotiationId)?.status, "ready");
const completed = completeLoanNegotiation(replied, negotiationId);
assert.equal(completed.result.ok, true, completed.result.reason);
assert.ok(activeLoanForPlayer(completed.state, player.id));
assert.equal(
  loanAvailabilityForPlayer(completed.state, player.id),
  undefined,
  "registered loan automatically clears availability",
);

console.log("\n[LA3] Chairman can withdraw a listing");
const second = newGame("Loan Delist FC", "Auditor", "LOAN_DELIST");
const secondPlayer = userSquad(second)[0];
const secondListed = setPlayerAvailableForLoan(second, secondPlayer.id);
assert.equal(secondListed.ok, true);
const removed = removePlayerLoanAvailability(secondListed.state, secondPlayer.id);
assert.equal(removed.ok, true);
assert.equal(loanAvailabilityForPlayer(removed.state, secondPlayer.id), undefined);

console.log("\n12 passed, 0 failed");
