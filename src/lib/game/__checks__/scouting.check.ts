import { newGame } from "../newGame";
import {
  activeScoutingAssignments,
  assignScout,
  freeAgents,
  scoutingCapacity,
  scoutingView,
} from "../recruitment";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

console.log("\n[SC1] Persistent scouting assignments");
const opening = newGame("Dalton Town", "Scout Tester", "scouting-check");
const [target, secondTarget] = freeAgents(opening);
assert(Boolean(target && secondTarget), "opening world provides scouting targets");
const unknown = scoutingView(opening, target);
assert(
  unknown.knowledge < 50 && unknown.ability.min < unknown.ability.max,
  "unknown player begins with an ability range",
);
assert(
  scoutingCapacity(opening) === 1,
  "a club without hired scouts has one department assignment",
);

const assigned = assignScout(opening, target.id);
assert(assigned.result.ok, "a player can be assigned for scouting");
assert(activeScoutingAssignments(assigned.state) === 1, "assignment occupies scouting capacity");
assert(
  assigned.state.football.shortlist.includes(target.id),
  "assignment adds the target to the shortlist",
);
const duplicate = assignScout(assigned.state, target.id);
assert(!duplicate.result.ok, "the same player cannot be assigned twice");
const overCapacity = assignScout(assigned.state, secondTarget.id);
assert(!overCapacity.result.ok, "assignment capacity is enforced");

const later = structuredClone(assigned.state);
later.week += 4;
const completed = scoutingView(later, target);
assert(
  completed.complete && completed.ability.min === completed.ability.max,
  "elapsed game weeks complete the report deterministically",
);
assert(activeScoutingAssignments(later) === 0, "completed reports release assignment capacity");

console.log("\n7 passed, 0 failed");
