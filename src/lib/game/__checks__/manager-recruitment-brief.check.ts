import { strict as assert } from "node:assert";
import type { FootballPlayer, Staff } from "../types";
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

const first = managerRecruitmentBrief(state, manager);
const second = managerRecruitmentBrief(state, manager);
assert.deepEqual(second, first, "same squad and manager must produce the same recruitment brief");
assert.ok(first.priorities.length > 0, "manager must identify at least one recruitment priority for the fixture squad");

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

const recommendation = priority.tacticalPosition!;
const weakened = state.football.players.map((player): FootballPlayer => {
  if (player.currentClubId !== userClubId) return player;
  if (player.primaryPosition !== priority.position && !player.secondaryPositions.includes(priority.position)) return player;
  return { ...player, currentAbility: Math.max(1, player.currentAbility - 8) };
});
state.football.players = weakened;
const afterWeakening = managerRecruitmentBrief(state, manager);
assert.ok(afterWeakening.priorities.length > 0, "weakening the priority unit must preserve a recruitment need");
assert.ok(
  afterWeakening.priorities.some((item) => item.position === priority.position),
  "weakening the recommended unit must keep that broad unit represented in recruitment priorities",
);
assert.ok(recommendation.length > 0, "fixture recommendation must remain a concrete tactical role");

console.log("\nmanager-recruitment-brief: passed");
