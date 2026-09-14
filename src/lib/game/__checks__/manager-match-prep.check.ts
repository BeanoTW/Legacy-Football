import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { managerMatchPrep } from "../managerMatchPrep";
import { playerClubPerformanceAdjustment } from "../playerClubPerformance";
import { userClubReference } from "../clubReference";
import type { Position, Staff } from "../types";

function fresh() {
  return newGame("Match Prep Audit FC", "Match Prep Auditor", "MANAGER_MATCH_PREP_AUDIT");
}

function manager(overrides: Partial<Staff["stats"]> = {}): Staff {
  return {
    id: "ST-match-prep-manager",
    name: "T. Coach",
    role: "Manager",
    age: 46,
    rating: 74,
    wage: 3_500,
    contractWeeks: 104,
    reputation: 72,
    stats: {
      tactics: 78,
      attack: 82,
      defense: 62,
      development: 78,
      scouting: 50,
      negotiation: 50,
      medical: 45,
      motivation: 74,
      ...overrides,
    },
  };
}

function reshapeUserSquad(state: ReturnType<typeof fresh>, positions: Position[], ability = 70) {
  const user = userClubReference(state);
  const players = state.football.players.filter((player) => player.currentClubId === user);
  assert.ok(players.length >= positions.length, "audit save must expose enough user players");
  players.forEach((player, index) => {
    player.primaryPosition = positions[index % positions.length];
    player.secondaryPositions = [];
    player.currentAbility = ability;
  });
}

// No manager means a neutral caretaker rather than a hidden tactical penalty.
const caretakerState = fresh();
caretakerState.hiredStaff = caretakerState.hiredStaff.filter((staff) => staff.role !== "Manager");
const caretaker = managerMatchPrep(caretakerState);
assert.equal(caretaker.managerId, null);
assert.equal(caretaker.selectedFormation, "4-4-2");
assert.equal(caretaker.strengthAdjustment, 0);

// A well-covered squad should let a manager realise a small positive edge,
// never a replacement for player quality.
const fittedState = fresh();
reshapeUserSquad(fittedState, ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "FWD"], 74);
fittedState.hiredStaff = [manager()];
const fitted = managerMatchPrep(fittedState);
assert.equal(fitted.managerName, "T. Coach");
assert.ok(fitted.squadFitScore > 60, "strong coverage should score above the neutral fit point");
assert.ok(fitted.strengthAdjustment > 0, "good tactical fit should create a small positive matchday edge");
assert.ok(Math.abs(fitted.strengthAdjustment) <= 1.5, "tactical fit must stay tightly bounded");

// Give an adaptable 4-3-3 manager a squad with exactly one natural forward.
// That is enough to fully cover his 4-2-3-1 alternative, but leaves the
// preferred 4-3-3 two forwards short. He should therefore change shape.
const adaptableState = fresh();
reshapeUserSquad(adaptableState, ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD"], 72);
adaptableState.hiredStaff = [manager({ tactics: 90, development: 88, attack: 82, defense: 62 })];
const adaptable = managerMatchPrep(adaptableState);
assert.equal(adaptable.preferredFormation, "4-3-3", "audit manager should prefer the attacking shape");
assert.equal(adaptable.selectedFormation, "4-2-3-1", "adaptable manager should move to the better-covered alternative");
assert.ok(adaptable.summary.includes("adapting"), "match preparation summary should explain a shape change");
assert.ok(Math.abs(adaptable.strengthAdjustment) <= 1.5);

// Thin/poor positional fit should be materially worse than the well-covered
// version, while the complete player-club performance layer still obeys its
// established +/-5 safety rail.
const poorState = fresh();
reshapeUserSquad(poorState, ["GK", "DEF"], 52);
poorState.hiredStaff = [manager({ tactics: 52, development: 45, attack: 78, defense: 58 })];
const poor = managerMatchPrep(poorState);
assert.ok(poor.strengthAdjustment < fitted.strengthAdjustment, "poor tactical fit should realise less squad strength than a good fit");
assert.ok(Math.abs(poor.strengthAdjustment) <= 1.5);
assert.ok(Math.abs(playerClubPerformanceAdjustment(poorState)) <= 5, "overall management layer must remain capped at +/-5");
assert.ok(Math.abs(playerClubPerformanceAdjustment(fittedState)) <= 5, "positive tactical fit must also respect the existing +/-5 cap");

console.log("\nmanager-match-prep: passed");
