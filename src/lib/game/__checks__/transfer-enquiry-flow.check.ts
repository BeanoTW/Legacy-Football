import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[TRANSFER-ENQUIRY-FLOW] approaches lead clearly into negotiations");

const flow = readFileSync("src/components/game/RecruitmentFlow.tsx", "utf8");
const browser = readFileSync("src/components/game/ScoutingBrowser.tsx", "utf8");
const reports = readFileSync("src/components/game/ScoutingReports.tsx", "utf8");
const profile = readFileSync("src/components/game/shared/PlayerProfileSheet.tsx", "utf8");
const desk = readFileSync("src/components/game/TransferNegotiationDesk.tsx", "utf8");
const dated = readFileSync("src/lib/game/datedRecruitment.ts", "utf8");

assert(browser.includes("onNegotiationStarted?.(result.result.negotiation.id)"), "scout-hub result approach opens its negotiation");
assert(reports.includes("onNegotiationStarted?.(result.result.negotiation.id)"), "scouting-report approach opens its negotiation");
assert(flow.includes('setView("operations")'), "recruitment flow can route directly to negotiations");
assert(flow.includes("initialNegotiationId={selectedNegotiationId}"), "the newly created deal is selected when negotiations open");
assert(profile.includes("Transfers → Negotiations"), "player-card enquiry explains where the deal continues");
assert(profile.includes("Advance time for the club and player&apos;s camp to respond."), "player-card enquiry explains the next action");
assert(desk.includes("Awaiting {clubLabel}&apos;s valuation"), "pending enquiry is presented as awaiting a club valuation");
assert(desk.includes("No transfer bid has been made yet."), "pending enquiry does not imply that £0 is a real offer");
assert(desk.includes("for valuation"), "negotiation list shows a waiting state instead of a zero fee");
assert(dated.includes("clubDisplayName(s, n.fromClubId)"), "enquiry messages use club display names rather than internal ids");

console.log("\n10 passed, 0 failed");
