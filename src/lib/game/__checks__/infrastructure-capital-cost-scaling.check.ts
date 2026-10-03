import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import {
  assetById,
  ensureInfrastructure,
  projectCatalogue,
  projectCostFactorForLevel,
  recomputeDerived,
} from "../infrastructure";

const state = newGame("Capex Town", "Chairman", "CAPEX_LEVEL_CHECK");
ensureInfrastructure(state);

assert.equal(projectCostFactorForLevel(1, "standRedevelopment"), 1);
assert.equal(projectCostFactorForLevel(7, "standRedevelopment"), 0.45);
assert.equal(projectCostFactorForLevel(8, "standRedevelopment"), 0.4);
assert.equal(projectCostFactorForLevel(7, "minorRepair"), 0.65);
assert.equal(projectCostFactorForLevel(8, "refurbishment"), 0.6);

const stand = assetById(state, "stand-E");
assert.ok(stand, "expected East stand");
stand!.condition = 70;
recomputeDerived(state);

const level7Rebuild = projectCatalogue(state, stand!.id).find((spec) => spec.type === "standRedevelopment");
const level7Repair = projectCatalogue(state, stand!.id).find((spec) => spec.type === "minorRepair");
assert.ok(level7Rebuild && level7Repair, "expected rebuild and repair quotes at Level 7");

const topFlight = structuredClone(state);
topFlight.playerLeagueId = "league-1";
const level1Rebuild = projectCatalogue(topFlight, stand!.id).find((spec) => spec.type === "standRedevelopment");
const level1Repair = projectCatalogue(topFlight, stand!.id).find((spec) => spec.type === "minorRepair");
assert.ok(level1Rebuild && level1Repair, "expected top-flight comparison quotes");

assert.equal(
  level7Rebuild!.cost,
  Math.round(level1Rebuild!.cost * 0.45),
  "Level 7 rebuilds should use the non-league capital specification factor",
);
assert.equal(
  level7Repair!.cost,
  Math.round(level1Repair!.cost * 0.65),
  "Level 7 repairs should retain a higher real-world labour/material floor",
);

console.log("infrastructure-capital-cost-scaling.check.ts: PASS", {
  level7Rebuild: level7Rebuild!.cost,
  level1Rebuild: level1Rebuild!.cost,
  level7Repair: level7Repair!.cost,
  level1Repair: level1Repair!.cost,
});
