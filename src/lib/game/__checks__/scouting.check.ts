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

console.log("\n[SC2] Recruitment staff share scouting workload");
const staffed = newGame("Staffing Town", "Scout Tester", "scouting-staff-check");
const candidates = staffed.staffCandidates.filter((member) =>
  ["Scout", "Chief Scout", "Head of Transfers"].includes(member.role),
);
assert(candidates.length >= 2, "opening staff market provides recruitment staff");
const firstStaff = structuredClone(candidates[0]);
const secondStaff = structuredClone(candidates[1]);
firstStaff.id = "SCOUT-WORKLOAD-A";
secondStaff.id = "SCOUT-WORKLOAD-B";
firstStaff.rating = Math.max(firstStaff.rating, secondStaff.rating + 10);
staffed.hiredStaff.push(firstStaff, secondStaff);

const workloadTargets = freeAgents(staffed).slice(0, 3);
assert(workloadTargets.length === 3, "staffed fixture provides three scouting targets");

const firstJob = assignScout(staffed, workloadTargets[0].id);
const secondJob = assignScout(firstJob.state, workloadTargets[1].id);
const thirdJob = assignScout(secondJob.state, workloadTargets[2].id);
assert(firstJob.result.ok && secondJob.result.ok && thirdJob.result.ok, "three scouting jobs can be assigned");

const firstReport = thirdJob.state.football.scoutingReports.find((report) => report.playerId === workloadTargets[0].id);
const secondReport = thirdJob.state.football.scoutingReports.find((report) => report.playerId === workloadTargets[1].id);
const thirdReport = thirdJob.state.football.scoutingReports.find((report) => report.playerId === workloadTargets[2].id);
assert(firstReport?.scoutId === firstStaff.id, "best available recruitment staff gets the first job");
assert(secondReport?.scoutId === secondStaff.id, "second available staff member gets the next job");
assert(thirdReport?.scoutId === firstStaff.id, "higher-rated staff takes the next job once workloads are level");

console.log("\n13 passed, 0 failed");
