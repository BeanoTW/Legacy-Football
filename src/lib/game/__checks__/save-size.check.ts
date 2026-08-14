/* Save-size instrumentation verification — Phase 0.
   Run with:  bun src/lib/game/__checks__/save-size.check.ts

   Measures growth BEFORE the world expands so Phase 1/2 regressions are
   visible. The <2MB@season-20 roadmap target is reported, not enforced;
   only the 4MB localStorage danger line is a hard failure in Phase 0.
*/
import { newGame, advanceWeek } from "../engine";
import {
  saveBytes, saveSizeBreakdown, formatBytes, warnOnSaveSize,
  SIZE_ERROR_BYTES, SIZE_TARGET_S20_BYTES, SIZE_WARN_BYTES,
} from "../diagnostics/saveSize";
import type { GameState } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}

const SEED = "PHASE0|SIZE|FIXED";
const WEEKS = 46;

console.log("\n[Z1] Instrumentation behaviour");
{
  const s = newGame("Size City", "Meter Maid", SEED);
  const bytes = saveBytes(s);
  check("saveBytes is positive", bytes > 0);
  const b = saveSizeBreakdown(s);
  check("breakdown totals are within 5% of the whole save", Math.abs(b.total - bytes) / bytes < 0.05,
    `${b.total} vs ${bytes}`);
  check("breakdown is sorted largest-first", b.entries.every((e, i) => i === 0 || b.entries[i - 1].bytes >= e.bytes));
  const warnings: string[] = [];
  warnOnSaveSize(SIZE_WARN_BYTES + 1, (m) => warnings.push(m));
  warnOnSaveSize(SIZE_ERROR_BYTES + 1, (m) => warnings.push(m));
  warnOnSaveSize(1000, (m) => warnings.push(m));
  check("thresholds fire exactly twice", warnings.length === 2, warnings.join(" | "));
}

console.log("\n[Z2] Growth over simulated seasons");
const marks: { season: number; bytes: number }[] = [];
let s: GameState = newGame("Size City", "Meter Maid", SEED);
marks.push({ season: 0, bytes: saveBytes(s) });
for (let season = 1; season <= 5; season++) {
  for (let i = 0; i < WEEKS; i++) s = advanceWeek(s);
  marks.push({ season, bytes: saveBytes(s) });
}
for (const m of marks) console.log(`  · after season ${m.season}: ${formatBytes(m.bytes)}`);

const s1 = marks[1].bytes - marks[0].bytes;
const s5 = marks[5].bytes - marks[4].bytes;
check("per-season growth is not super-linear (season 5 <= 3x season 1)", s5 <= s1 * 3,
  `${formatBytes(s1)} -> ${formatBytes(s5)}`);

const perSeason = (marks[5].bytes - marks[0].bytes) / 5;
const projected20 = marks[0].bytes + perSeason * 20;
console.log(`  · projected season 20: ${formatBytes(projected20)} (design target ${formatBytes(SIZE_TARGET_S20_BYTES)})`);
if (projected20 > SIZE_TARGET_S20_BYTES) {
  console.log("    note: above the roadmap design target — Phase 1 rollup/prune work required.");
}
check("projected season 20 stays under the localStorage danger line", projected20 < SIZE_ERROR_BYTES,
  formatBytes(projected20));

console.log("\n[Z3] Growth drivers at season 5");
for (const d of saveSizeBreakdown(s).drivers.slice(0, 6)) {
  console.log(`  · ${d.key}: ${formatBytes(d.bytes)}${d.rows != null ? ` (${d.rows} rows)` : ""}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
