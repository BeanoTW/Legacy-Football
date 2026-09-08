import { newGame } from "../newGame";
import {
  createChairmanScoutingBrief,
  scoutingPlayerLevelBenchmark,
  scoutingPlayerLevelLabel,
} from "../chairmanScoutingBrief";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

console.log("\n[CHAIRMAN-SCOUTING-BRIEF] Football-language player levels");

const state = newGame("Dalton Town", "Chairman Scout", "chairman-scouting-levels");
if (!state.football) throw new Error("football state missing");

const backup = scoutingPlayerLevelBenchmark(state, "backup");
const firstTeam = scoutingPlayerLevelBenchmark(state, "firstTeam");
const startingXI = scoutingPlayerLevelBenchmark(state, "startingXI");
const star = scoutingPlayerLevelBenchmark(state, "star");
assert(star >= startingXI, "star benchmark is at least starting-XI quality");
assert(startingXI >= firstTeam, "starting-XI benchmark is at least first-team quality");
assert(firstTeam >= backup, "first-team benchmark is at least backup quality");
assert(scoutingPlayerLevelLabel("starPotential") === "Star potential", "chairman-facing level labels avoid hidden ability numbers");

const next = createChairmanScoutingBrief(state, {
  id: "chairman-level-check",
  position: "FWD",
  playerLevel: "firstTeamPotential",
  minAge: 18,
  maxAge: 23,
});
const brief = next.football?.scoutingDiscovery?.briefs.find((item) => item.id === "chairman-level-check");
assert(Boolean(brief), "chairman brief dispatch creates a scouting assignment");
assert(brief!.playerLevel === "firstTeamPotential", "player-level instruction persists with the scouting brief");
assert(brief!.position === "FWD" && brief!.minAge === 18 && brief!.maxAge === 23, "player level coexists with broad chairman position and age instructions");
assert(brief!.status === "active" && brief!.candidateIds.length === 0, "player-level brief still waits for scouts instead of searching instantly");
assert((brief!.minCurrentAbility ?? 0) < firstTeam, "potential brief allows development room below current first-team standard");

console.log("\n9 passed, 0 failed");
