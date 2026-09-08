import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

console.log("\n[COMPETITION-SQUAD-SHOPPING] Manual player discovery route");

const source = readFileSync("src/components/game/WorldInspector.tsx", "utf8");

assert(
  source.includes("squadOf(state, canonical)"),
  "competition club drilldown reads the canonical club squad",
);
assert(
  source.includes("canonicalClubReference(state, club)"),
  "club squad browsing crosses the canonical club-reference gateway",
);
assert(
  source.includes("openPlayerProfile(player.id)"),
  "player names open the shared player profile",
);
assert(
  source.includes("select a club to browse its squad") || source.includes("Select a club to browse its squad"),
  "competition UI advertises club-first manual discovery rather than a player database",
);
assert(
  !source.includes("transferMarket(state)") && !source.includes("freeAgents(state)"),
  "competition browsing does not introduce a global player-search surface",
);
assert(
  !source.includes("state.football.players.push") && !source.includes("state.football.players ="),
  "competition browsing never mutates canonical player storage",
);

console.log("\n6 passed, 0 failed");
