import { advanceWeek, newGame } from "../engine";
import { stateHash, stateHashParts } from "../diagnostics/stateHash";
import type { GameState } from "../types";

const SEED = "PHASE0|SNAPSHOT|FIXED";
const WEEKS_PER_SEASON = 46;
const SNAPSHOT_SCHEMA_BASELINE = 12;

function run(weeks: number): GameState {
  let state = newGame("Snapshot Town", "A. Baseline", SEED);
  for (let index = 0; index < weeks; index++) state = advanceWeek(state);
  return state;
}

for (const [label, weeks] of [
  ["season1-week10", 10],
  ["season1-end", WEEKS_PER_SEASON],
  ["season3-end", WEEKS_PER_SEASON * 3],
] as const) {
  const state = run(weeks);
  const normalized = { ...structuredClone(state), version: SNAPSHOT_SCHEMA_BASELINE } as GameState;
  const parts = stateHashParts(normalized);
  delete parts.version;
  console.log(
    `V18_SNAPSHOT ${label} top=${stateHash(normalized)} football=${parts.football}`,
  );
}

// Intentional diagnostic stop: this file is removed once the hashes are captured.
throw new Error("intentional v18 snapshot refresh probe");
