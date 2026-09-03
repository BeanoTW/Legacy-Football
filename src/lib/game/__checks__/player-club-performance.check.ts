import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import {
  PLAYER_COHESION_DEFAULT,
  PLAYER_MANAGER_QUALITY_DEFAULT,
  PLAYER_MORALE_DEFAULT,
  PLAYER_PERFORMANCE_MAX_ADJUSTMENT,
  advancePlayerClubPerformanceWeekInPlace,
  applyPlayerClubMatchOutcomeInPlace,
  ensurePlayerClubPerformanceInPlace,
  playerClubPerformanceAdjustment,
  playerManagerQuality,
  realisedPlayerClubStrength,
} from "../playerClubPerformance";
import type { Staff } from "../types";

function fresh() {
  return newGame("Performance Audit FC", "Performance Auditor", "PLAYER_CLUB_PERFORMANCE_AUDIT");
}

const state = fresh();
const initial = ensurePlayerClubPerformanceInPlace(state);
assert.equal(initial.cohesion, PLAYER_COHESION_DEFAULT);
assert.equal(initial.morale, PLAYER_MORALE_DEFAULT);
assert.equal(playerManagerQuality(state), PLAYER_MANAGER_QUALITY_DEFAULT);

advancePlayerClubPerformanceWeekInPlace(state);
assert.equal(state.playerClubPerformance?.cohesion, PLAYER_COHESION_DEFAULT + 0.25);
assert.equal(state.playerClubPerformance?.morale, PLAYER_MORALE_DEFAULT);
const once = JSON.stringify(state.playerClubPerformance);
advancePlayerClubPerformanceWeekInPlace(state);
assert.equal(JSON.stringify(state.playerClubPerformance), once, "same-week performance processing must be idempotent");

applyPlayerClubMatchOutcomeInPlace(state, { result: "W" });
assert.equal(state.playerClubPerformance?.morale, PLAYER_MORALE_DEFAULT + 4);
const won = JSON.stringify(state.playerClubPerformance);
applyPlayerClubMatchOutcomeInPlace(state, { result: "W" });
assert.equal(JSON.stringify(state.playerClubPerformance), won, "same result must not move morale twice");

// One player out and one player in is two changed ids: cohesion should fall,
// but a normal transfer must not destroy the dressing room in one tick.
state.week += 1;
const previousCohesion = state.playerClubPerformance!.cohesion;
state.squad = state.squad.map((player, index) =>
  index === 0 ? { ...player, id: `${player.id}-replacement` } : player,
);
advancePlayerClubPerformanceWeekInPlace(state);
assert.ok(state.playerClubPerformance!.cohesion < previousCohesion);
assert.ok(state.playerClubPerformance!.cohesion >= previousCohesion - 4);
assert.equal(state.playerClubPerformance!.morale, PLAYER_MORALE_DEFAULT + 3.5, "morale should mean-revert slowly between matches");
applyPlayerClubMatchOutcomeInPlace(state, { result: "L" });
assert.equal(state.playerClubPerformance!.morale, PLAYER_MORALE_DEFAULT - 0.5);

const manager: Staff = {
  id: "ST-manager-audit",
  name: "M. Auditor",
  role: "Manager",
  age: 44,
  rating: 80,
  stats: {
    tactics: 90,
    attack: 75,
    defense: 75,
    development: 70,
    scouting: 55,
    negotiation: 55,
    medical: 45,
    motivation: 70,
  },
  wage: 5_000,
  contractWeeks: 76,
  reputation: 80,
};
state.hiredStaff = [manager];
assert.equal(playerManagerQuality(state), 81, "manager quality must derive from the canonical staff record");

state.playerClubPerformance!.cohesion = 100;
state.playerClubPerformance!.morale = 100;
const positive = playerClubPerformanceAdjustment(state);
assert.ok(positive > 0);
assert.ok(Math.abs(positive) <= PLAYER_PERFORMANCE_MAX_ADJUSTMENT);
assert.ok(
  realisedPlayerClubStrength(state, 60) < 75,
  "perfect management must not erase a fifteen-point squad-quality gap",
);

state.playerClubPerformance!.cohesion = 0;
state.playerClubPerformance!.morale = 0;
state.hiredStaff = [{ ...manager, rating: 30, stats: { ...manager.stats, tactics: 30, motivation: 30 } }];
const negative = playerClubPerformanceAdjustment(state);
assert.ok(negative < 0);
assert.ok(Math.abs(negative) <= PLAYER_PERFORMANCE_MAX_ADJUSTMENT);
assert.ok(realisedPlayerClubStrength(state, 25) >= 25);
assert.ok(realisedPlayerClubStrength(state, 95) <= 95);

const replayA = fresh();
const replayB = fresh();
advancePlayerClubPerformanceWeekInPlace(replayA);
advancePlayerClubPerformanceWeekInPlace(replayB);
applyPlayerClubMatchOutcomeInPlace(replayA, { result: "D" });
applyPlayerClubMatchOutcomeInPlace(replayB, { result: "D" });
assert.equal(
  JSON.stringify(replayA.playerClubPerformance),
  JSON.stringify(replayB.playerClubPerformance),
  "performance state must replay deterministically",
);

console.log("\nplayer-club-performance: passed");
