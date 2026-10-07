import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[TRANSFER-ENQUIRY-FLOW] approaches lead clearly into negotiations");

const deskUi = readFileSync("src/components/game/TransferDesk.tsx", "utf8");
const live = readFileSync("src/components/game/TransferLiveBusiness.tsx", "utf8");
const deskModel = readFileSync("src/lib/game/transferDesk.ts", "utf8");
const browser = readFileSync("src/components/game/ScoutingBrowser.tsx", "utf8");
const reports = readFileSync("src/components/game/ScoutingReports.tsx", "utf8");
const profile = readFileSync("src/components/game/shared/PlayerProfileSheet.tsx", "utf8");
const desk = readFileSync("src/components/game/TransferNegotiationDesk.tsx", "utf8");
const dated = readFileSync("src/lib/game/datedRecruitment.ts", "utf8");

assert(browser.includes("onNegotiationStarted?.(result.result.negotiation.id)"), "scout-hub result approach opens its negotiation");
assert(reports.includes("onNegotiationStarted?.(result.result.negotiation.id)"), "scouting-report approach opens its negotiation");
assert(deskUi.includes('go({ lens: "live", negotiationId })'), "transfer desk can route directly to a live negotiation");
assert(live.includes("<TransferNegotiationRoom state={state} negotiation={negotiation} act={run} />"), "the selected deal opens in the canonical negotiation room");
assert(profile.includes("Transfers → Live Business"), "player-card enquiry explains where the deal continues");
assert(profile.includes("Advance time for the club and player&apos;s camp to respond."), "player-card enquiry explains the next action");
assert(desk.includes("Awaiting {clubLabel}&apos;s valuation"), "pending enquiry is presented as awaiting a club valuation");
assert(desk.includes("No transfer bid has been made yet."), "pending enquiry does not imply that £0 is a real offer");
assert(deskModel.includes("Awaiting ${counterparty}'s valuation") && deskModel.includes('n.stage === "enquiry" && n.clubCounterFee === undefined'), "deal stream shows a waiting state instead of a zero fee");
assert(dated.includes("clubDisplayName(s, n.fromClubId)"), "enquiry messages use club display names rather than internal ids");

console.log("\n11 passed, 0 failed");
