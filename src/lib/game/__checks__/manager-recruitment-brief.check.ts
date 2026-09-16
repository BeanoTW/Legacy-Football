import { strict as assert } from "node:assert";
import type { Staff } from "../types";
import { newGame } from "../newGame";
import { managerRecruitmentBrief } from "../managerRecruitmentBrief";
import { MANAGER_FORMATION_SLOTS } from "../managerFormationLayout";
import { positionUnit } from "../positions";
import { userClubReference } from "../clubReference";

const state = newGame("Tactical Town", "Chairman", "manager-recruitment-brief-check");
if (!state.football) throw new Error("football state missing");

const manager: Staff = {
  id: "manager-recruitment-check",
  name: "M. Planner",
  role: "Manager",
  age: 44,
  rating: 72,
  stats: {
    tactics: 80,
    attack: 76,
    defense: 64,
    development: 60,
    scouting: 58,
    negotiation: 55,
    medical: 45,
    motivation: 70,
  },
  wage: 2_000,
  contractWeeks: 104,
  reputation: 68,
};
state.hiredStaff = [...state.hiredStaff.filter((staff) => staff.role !== "Manager"), manager];

const userClubId = userClubReference(state);
const userPlayers = state.football.players.filter((player) => player.currentClubId === userClubId);
assert.ok(userPlayers.length > 0, "fixture must contain a user squad");

// Make the fixture's recruitment need explicit instead of depending on the
// generated squad's starting quality. Keep positions intact so the role picker
// still has to evaluate the manager's actual formation slots.
state.football.players = state.football.players.map((player) =>
  player.currentClubId === userClubId ? { ...player, currentAbility: 40 } : player,
);

const first = managerRecruitmentBrief(state, manager);
const second = managerRecruitmentBrief(state, manager);
assert.deepEqual(second, first, "same squad and manager must produce the same recruitment brief");
assert.ok(first.priorities.length > 0, "an explicitly weak squad must produce recruitment priorities");

const priority = first.priorities[0];
assert.ok(priority.tacticalPosition, "manager priority must identify a tactical role, not only a broad unit");
assert.equal(
  positionUnit(priority.tacticalPosition!),
  priority.position,
  "recommended tactical role must belong to the priority's broad position unit",
);
assert.ok(
  MANAGER_FORMATION_SLOTS[first.tacticalShape as keyof typeof MANAGER_FORMATION_SLOTS].includes(priority.tacticalPosition!),
  "recommended tactical role must exist in the manager's selected shape",
);
assert.ok(
  priority.rationale.includes(first.tacticalShape),
  "recommendation rationale must explain the role in the selected shape",
);

const before = JSON.stringify(state.football.players);
managerRecruitmentBrief(state, manager);
assert.equal(JSON.stringify(state.football.players), before, "building a manager recruitment brief must not mutate the player world");

for (const item of first.priorities) {
  if (!item.tacticalPosition) continue;
  assert.equal(
    positionUnit(item.tacticalPosition),
    item.position,
    "every tactical recommendation must stay inside its broad positional unit",
  );
  assert.ok(
    MANAGER_FORMATION_SLOTS[first.tacticalShape as keyof typeof MANAGER_FORMATION_SLOTS].includes(item.tacticalPosition),
    "every tactical recommendation must be a role used by the selected shape",
  );
}

console.log("\nmanager-recruitment-brief: passed");
