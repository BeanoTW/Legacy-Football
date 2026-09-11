import { strict as assert } from "node:assert";
import { scoutedOverallPresentation } from "../scoutingPresentation";
import type { FootballPlayer, GameState } from "../types";
import type { ScoutingReport } from "../scouting";

const player = {
  id: "presentation-target",
  currentAbility: 70,
  currentClubId: "other-club",
} as FootballPlayer;
const state = { clubName: "User Club" } as GameState;

const report = (knowledgePct: number, complete = false): ScoutingReport => ({
  playerId: player.id,
  knowledgePct,
  weeksObserved: 0,
  complete,
  attributes: [],
  personalityKnown: complete,
});

assert.equal(scoutedOverallPresentation(state, player, report(0)).label, "?");
assert.equal(scoutedOverallPresentation(state, player, report(20)).label, "58–82");
assert.equal(scoutedOverallPresentation(state, player, report(50)).label, "62–78");
assert.equal(scoutedOverallPresentation(state, player, report(67)).label, "65–75");
assert.deepEqual(scoutedOverallPresentation(state, player, report(100, true)), {
  label: "70",
  exact: true,
  known: true,
});

console.log("scouting presentation checks passed");
