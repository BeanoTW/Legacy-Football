import { strict as assert } from "node:assert";
import { scoutedOverallPresentation } from "../scoutingPresentation";
import type { FootballPlayer, GameState } from "../types";
import { scoutingReport, type ScoutingReport } from "../scouting";
import { newGame } from "../newGame";

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


// Chief Scout quality should tighten attribute uncertainty during an open
// transfer window without changing the target's canonical attributes.
const base = newGame("Dalton Town", "Scout Tester", "chief-scout-fog-check");
base.week = 2; // pre-season transfer window
const target = base.football?.players.find((candidate) => candidate.currentClubId && candidate.currentClubId !== base.clubName);
assert.ok(target, "test world exposes a contracted transfer target");
base.football!.scouting ??= { assignments: [] };
base.football!.scouting.assignments.push({
  playerId: target.id,
  startedAtAbsoluteWeek: 0,
  weeksObserved: 4,
  lastProgressAbsoluteWeek: 0,
  status: "active",
});
const low = structuredClone(base);
const high = structuredClone(base);
const chiefTemplate = high.staffCandidates.find((staff) => staff.role === "Chief Scout");
assert.ok(chiefTemplate, "staff market exposes a Chief Scout");
low.hiredStaff = low.hiredStaff.filter((staff) => staff.role !== "Chief Scout");
high.hiredStaff = high.hiredStaff.filter((staff) => staff.role !== "Chief Scout");
high.hiredStaff.push({
  ...chiefTemplate,
  id: "elite-chief-scout",
  stats: { ...chiefTemplate.stats, scouting: 92 },
});
const lowReport = scoutingReport(low, target);
const highReport = scoutingReport(high, target);
const lowKnown = lowReport.attributes.find((attribute) => attribute.known && attribute.min !== undefined && attribute.max !== undefined);
const highKnown = highReport.attributes.find((attribute) => attribute.key === lowKnown?.key);
assert.ok(lowKnown?.min !== undefined && lowKnown.max !== undefined, "partial report exposes an attribute range");
assert.ok(highKnown?.min !== undefined && highKnown.max !== undefined, "Chief Scout report keeps the same attribute visible");
assert.ok((highKnown.max - highKnown.min) < (lowKnown.max - lowKnown.min), "elite Chief Scout narrows transfer-window attribute fog");

console.log("scouting presentation checks passed");
