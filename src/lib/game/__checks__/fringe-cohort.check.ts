import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import {
  advanceFringeWorldToSeason,
  ensureFringeWorldState,
  fringeWorldSignature,
} from "../fringe";

const base = newGame("Fringe Cohort Audit FC", "Auditor", "FRINGE_COHORT_AUDIT");
const opening = ensureFringeWorldState(base);
const clubId = Object.keys(opening).sort()[0];
if (!clubId) throw new Error("fringe club missing");
const start = opening[clubId];
assert.ok(start.squadMeanAge !== undefined);
assert.ok(start.cohortSeason !== undefined);
assert.ok(start.playerGeneration !== undefined);
assert.ok(start.squadMeanAge! >= 22 && start.squadMeanAge! <= 31);

const jumped = structuredClone(base);
jumped.season += 10;
const jumpedWorld = advanceFringeWorldToSeason(jumped);
const after = jumpedWorld[clubId];
assert.ok(after, "fringe club should remain represented after season jump");
assert.equal(after.lastSimulatedSeason, jumped.season);
assert.ok(after.squadMeanAge !== undefined && after.squadMeanAge >= 22 && after.squadMeanAge <= 31);
assert.ok((after.playerGeneration ?? 0) > (start.playerGeneration ?? 0), "long jump should force cohort turnover");
assert.ok((after.cohortSeason ?? 0) > (start.cohortSeason ?? 0));

const replay = structuredClone(base);
for (let season = base.season + 1; season <= jumped.season; season++) {
  replay.season = season;
  advanceFringeWorldToSeason(replay);
}
assert.equal(
  fringeWorldSignature(replay.fringeWorld ?? {}),
  fringeWorldSignature(jumpedWorld),
  "season-by-season and jumped compact ageing must be replay-equivalent",
);

const legacy = structuredClone(base);
for (const club of Object.values(legacy.fringeWorld ?? {})) {
  delete club.squadMeanAge;
  delete club.cohortSeason;
  delete club.playerGeneration;
}
const backfilled = ensureFringeWorldState(legacy);
const restored = backfilled[clubId];
assert.ok(restored.squadMeanAge !== undefined);
assert.ok(restored.cohortSeason !== undefined);
assert.ok(restored.playerGeneration !== undefined);

console.log("\nfringe-cohort: passed");
