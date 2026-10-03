import { readFileSync } from "node:fs";
import { newGame } from "../newGame";
import { submitTransferEnquiry, transferMarket } from "../recruitmentLegacy";
import { inboxDestination } from "../inboxNavigation";
import type { InboxItem } from "../types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[APPROACH-NAVIGATION] Successful approaches open live talks");

const browser = readFileSync("src/components/game/ScoutingBrowser.tsx", "utf8");
const flow = readFileSync("src/components/game/RecruitmentFlow.tsx", "utf8");

assert(
  browser.includes("onNegotiationStarted?: (negotiationId: string) => void"),
  "scouting browser exposes a successful-negotiation callback",
);
assert(
  browser.includes("result.result.ok && result.result.negotiation?.id"),
  "approach navigation only fires after a successful negotiation is created",
);
assert(
  flow.includes("setSelectedNegotiationId(negotiationId)") &&
    flow.includes('setView("operations")'),
  "recruitment flow opens the negotiations workspace after approach",
);
assert(
  flow.includes("initialNegotiationId={selectedNegotiationId}"),
  "the newly-created negotiation is selected automatically",
);

const state = newGame("Navigation FC", "Chairman", "APPROACH_NAV");
const target = transferMarket(state).find((entry) => entry.clubId !== null);
assert(target, "contracted market target exists for inbox deep-link check");
const started = submitTransferEnquiry(state, target.player.id, "First Team");
assert(started.result.ok && started.result.negotiation, "transfer enquiry creates a live negotiation");
const liveState = started.state;
const negotiationId = started.result.negotiation!.id;
const response: InboxItem = {
  id: "test-enquiry-response",
  generatorId: "recruitment-transfer-response",
  eventKey: `transfer-response:${negotiationId}:99:Transfer enquiry response`,
  sender: "Director of Football",
  department: "Director of Football",
  category: "transfers",
  subject: "Transfer enquiry response",
  body: "The selling club are willing to discuss a deal.",
  priority: "normal",
  week: liveState.week,
  season: liveState.season,
  status: "unread",
};
const destination = inboxDestination(liveState, response);
assert(
  destination?.tab === "recruitment" &&
    destination.view === "operations" &&
    "negotiationId" in destination &&
    destination.negotiationId === negotiationId,
  "transfer enquiry response deep-links directly to the matching negotiation",
);

console.log("\n8 passed, 0 failed");
