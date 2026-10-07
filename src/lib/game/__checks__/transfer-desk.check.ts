import assert from "node:assert/strict";
import { newGame } from "../newGame";
import { advanceDay } from "../engine";
import { userSquad } from "../recruitmentLegacy";
import { chairmanRecruitmentPlayerIds } from "../chairmanRecruitmentView";
import { recruitmentMarketAwarenessPlayerIds } from "../recruitmentMarketKnowledge";
import { managerPlayerAssessment } from "../managerPlayerAssessment";
import { loanAvailabilityForPlayer, setPlayerAvailableForLoan } from "../loanAvailability";
import { loanNegotiationById, openLoanNegotiation } from "../loanNegotiations";
import {
  squadContractRows,
  transferDealStream,
  transferMarketRows,
} from "../transferDesk";

console.log("\n[TRANSFER-DESK-INTEGRATION]");

const state = newGame("Executive Desk FC", "Director", "EXECUTIVE_TRANSFER_DESK");

const aware = recruitmentMarketAwarenessPlayerIds(state);
const discovered = new Set(chairmanRecruitmentPlayerIds(state));
const publicId = aware.find((id) => !discovered.has(id));
assert.ok(publicId, "fixture exposes at least one public-but-undiscovered player");
const publicRow = transferMarketRows(state).find((row) => row.player.id === publicId);
assert.ok(publicRow, "public market identity appears in the Transfer Desk");
assert.equal(publicRow!.overallLabel, "?", "public identity does not leak overall");
assert.equal(publicRow!.valueRange, null, "public identity does not leak valuation certainty");
assert.equal(publicRow!.knowledgePct, 0, "public identity starts with no scouting progress");

const ourPlayer = userSquad(state)[0];
assert.ok(ourPlayer, "fixture has a user player");
const assessment = managerPlayerAssessment(state, ourPlayer.id);
const squadRow = squadContractRows(state).find((row) => row.player.id === ourPlayer.id);
assert.ok(squadRow, "user player appears in Squad & Contracts");
assert.equal(squadRow!.managerAssessmentRole, assessment?.role, "desk uses manager football assessment");
assert.equal(squadRow!.managerFit, assessment?.fit, "desk exposes tactical fit");

const listed = setPlayerAvailableForLoan(state, ourPlayer.id, {
  durationWeeks: 4,
  loanClubWageContributionPct: 20,
  playingTimeExpectation: "Backup",
});
assert.equal(listed.ok, true, listed.reason);
assert.ok(loanAvailabilityForPlayer(listed.state, ourPlayer.id), "available-for-loan state persists");
const listedRow = squadContractRows(listed.state).find((row) => row.player.id === ourPlayer.id);
assert.equal(listedRow?.loanAvailable, true, "Squad & Contracts exposes loan availability");

const opened = openLoanNegotiation(
  listed.state,
  "out",
  ourPlayer.id,
  {
    durationWeeks: 4,
    loanClubWageContributionPct: 20,
    playingTimeExpectation: "Backup",
  },
);
assert.equal(opened.result.ok, true, opened.result.reason);
const negotiationId = opened.result.negotiation!.id;
let loanDeal = transferDealStream(opened.state).find(
  (deal) => deal.loanNegotiationId === negotiationId,
);
assert.ok(loanDeal, "loan negotiation appears in Live Business");
assert.equal(loanDeal!.kind, "loanOut");
assert.equal(loanDeal!.priority, "waiting");
assert.equal(loanDeal!.stages[loanDeal!.stageIndex], "Proposal sent");

let replied = opened.state;
for (let i = 0; i < 4; i++) {
  if (loanNegotiationById(replied, negotiationId)?.status !== "awaitingClub") break;
  replied = advanceDay(replied);
}
const negotiation = loanNegotiationById(replied, negotiationId);
assert.ok(negotiation, "loan negotiation survives calendar advancement");
loanDeal = transferDealStream(replied).find((deal) => deal.loanNegotiationId === negotiationId);
assert.ok(
  negotiation!.status === "ready" ||
    negotiation!.status === "countered" ||
    negotiation!.status === "rejected",
  "dated club response resolves to a real loan-talk outcome",
);
if (negotiation!.status === "ready" || negotiation!.status === "countered") {
  assert.equal(loanDeal?.priority, "action", "actionable loan response is surfaced under Needs action");
}

console.log("transfer-desk integration: passed");
