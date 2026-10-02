import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[REMOVE-EMPLOYMENT-UI] Squad screen no longer exposes employment-model controls");

const source = readFileSync("src/components/game/SquadSelectionTab.tsx", "utf8");

assert(!source.includes("Employment model"), "employment model card is removed");
assert(!source.includes("Move to full-time football"), "full-time transition prompt is removed");
assert(!source.includes("Club operating model"), "operating-model badge is removed");
assert(!source.includes("professionaliseUserClub"), "squad screen no longer owns professionalisation action");
assert(source.includes("contractEmploymentType"), "contract rows still retain existing employment-type display logic");

console.log("\n5 passed, 0 failed");
