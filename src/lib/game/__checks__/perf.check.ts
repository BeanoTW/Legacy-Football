/* Performance baseline — Phase 0.
   Run with:  bun src/lib/game/__checks__/perf.check.ts

   Thresholds are deliberately broad envelopes; the real value is the recorded
   numbers in docs/PERF-BASELINE.md, which Phase 1 is compared against.
*/
import { newGame, advanceWeek, migrateSave } from "../engine";
import { serializeSave, parseSave } from "../storage/serialize";
import { saveBytes, formatBytes } from "../diagnostics/saveSize";
import type { GameState } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}

const SEED = "PHASE0|PERF|FIXED";

/** Median of n timed runs, one warm-up discarded. */
function timeMs(fn: () => void, runs = 5): number {
  fn();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

const report: [string, number, number][] = []; // label, ms, envelope
function bench(label: string, envelopeMs: number, fn: () => void, runs = 5) {
  const ms = timeMs(fn, runs);
  report.push([label, ms, envelopeMs]);
  check(`${label} — ${ms.toFixed(1)}ms (envelope ${envelopeMs}ms)`, ms < envelopeMs);
}

console.log("\n[P1] Core operations");
bench("newGame", 1500, () => { newGame("Perf United", "Bench Marker", SEED); });

const base = newGame("Perf United", "Bench Marker", SEED);
bench("advanceWeek (single)", 250, () => { advanceWeek(base); }, 5);

bench("full season (46 weeks)", 8000, () => {
  let s = newGame("Perf United", "Bench Marker", SEED);
  for (let i = 0; i < 46; i++) s = advanceWeek(s);
}, 3);

console.log("\n[P2] Persistence operations");
let season3: GameState = newGame("Perf United", "Bench Marker", SEED);
for (let i = 0; i < 46 * 3; i++) season3 = advanceWeek(season3);
const raw = serializeSave(season3);
bench("serializeSave (season 3)", 500, () => { serializeSave(season3); });
bench("parseSave (season 3)", 500, () => { parseSave(raw); });
bench("migrateSave (current-version save)", 1500, () => {
  migrateSave(JSON.parse(raw) as Record<string, unknown>);
});

console.log("\n[P3] Recorded sizes");
console.log(`  · season 1 save: ${formatBytes(saveBytes(base))}`);
console.log(`  · season 3 save: ${formatBytes(saveBytes(season3))}`);

console.log("\n--- baseline table (paste into docs/PERF-BASELINE.md) ---");
for (const [label, ms, env] of report) {
  console.log(`| ${label} | ${ms.toFixed(1)} ms | ${env} ms |`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
