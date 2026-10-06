/* Runtime verification for home-ground presentation on matchday.
   Run with: bun src/lib/game/__checks__/matchday-ground-presentation.check.ts
*/
import { newGame } from "../engine";
import {
  groundProgression,
  matchdayGroundPresentation,
} from "../groundPresentation";
import { infrastructureSnapshot } from "../infrastructure";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log("  ✓ " + label);
  } else {
    failed++;
    console.log("  ✗ " + label + (extra ? " — " + extra : ""));
  }
}

console.log("\n[MGP1] Home fixture uses canonical Facilities progression");
{
  const state = newGame("Ground Town", "Chairman Test");
  const progression = groundProgression(state);
  const snapshot = infrastructureSnapshot(state);
  const attendance = Math.max(1, Math.round(snapshot.usableCapacity * 0.72));
  const ground = matchdayGroundPresentation(state, true, attendance);

  check("home fixture gets ground presentation", !!ground);
  check("viewer stage matches Facilities visual stage", ground?.stage === progression.visualStage);
  check("viewer label matches Facilities stage", ground?.stageName === progression.current.name);
  check("viewer capacity uses usable infrastructure capacity", ground?.capacity === Math.max(1, snapshot.usableCapacity || snapshot.capacity || 1));
  check("attendance is preserved when below capacity", ground?.attendance === attendance);
  check("fill percentage reflects attendance", Math.abs((ground?.fillPercent ?? 0) - 72) <= 1);
}

console.log("\n[MGP2] Away fixture never shows the user's stadium");
{
  const state = newGame("Away Ground Town", "Chairman Test");
  // Since #207 away matches show a generated opponent ground, never the user's own design.
  const away = matchdayGroundPresentation(state, false, 2_000);
  const home = matchdayGroundPresentation(state, true, 2_000);
  check("away match returns a generated opponent ground", Boolean(away?.design));
  check("the away ground is not the user's stadium", JSON.stringify(away?.design) !== JSON.stringify(home?.design));
}

console.log("\n[MGP3] Crowd fill is safely bounded");
{
  const state = newGame("Capacity Town", "Chairman Test");
  const high = matchdayGroundPresentation(state, true, 999_999);
  const low = matchdayGroundPresentation(state, true, -100);
  check("over-capacity projection clamps to capacity", !!high && high.attendance === high.capacity);
  check("over-capacity fill clamps to 100%", high?.fillPercent === 100);
  check("negative attendance clamps to zero", low?.attendance === 0);
  check("negative attendance produces 0% fill", low?.fillPercent === 0);
}

console.log("\n=== " + passed + " passed, " + failed + " failed ===");
if (failed > 0) process.exit(1);
