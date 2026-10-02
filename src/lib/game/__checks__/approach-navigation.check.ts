import { readFileSync } from "node:fs";

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

console.log("\n4 passed, 0 failed");
