import { strict as assert } from "node:assert";

import { newGame } from "../engine";
import { buildBetaDiagnosticBundle, formatBetaDiagnosticBundle } from "../../betaDiagnostics";
import type { SaveSlotSummary } from "../engine";

const state = newGame("Diagnostic FC", "Beta Tester", "BETA|DIAGNOSTICS");
const slots: SaveSlotSummary[] = [
  { id: "slot-1", state, status: "ready", updatedAt: 1_700_000_000_000 },
  { id: "slot-2", state: null, status: "empty", updatedAt: null },
  { id: "slot-3", state: null, status: "empty", updatedAt: null },
];

const bundle = buildBetaDiagnosticBundle({
  state,
  activeSlot: "slot-1",
  slots,
  buildId: "build-abc123",
});
const text = formatBetaDiagnosticBundle(bundle);
const raw = JSON.stringify(bundle);

assert.equal(bundle.buildId, "build-abc123");
assert.equal(bundle.career.slot, "slot-1");
assert.equal(bundle.career.clubName, "Diagnostic FC");
assert.equal(bundle.career.lastSavedAt, new Date(1_700_000_000_000).toISOString());
assert(text.includes("Build: build-abc123"));
assert(text.includes("Season/week: 1/1"));

assert(!raw.includes('"email"'), "diagnostic bundle must not expose account email");
assert(!raw.includes('"players"'), "diagnostic bundle must not dump player records");
assert(!raw.includes('"contracts"'), "diagnostic bundle must not dump contract records");
assert(!raw.includes('"saveSeed"'), "diagnostic bundle must not expose save seed");
assert(!raw.includes('"inbox":['), "diagnostic bundle must not dump inbox contents");

console.log("beta-diagnostics.check.ts: PASS");
