/* Runtime verification for stand builds and the ground look.
   Run with: bun src/lib/game/__checks__/ground-identity.check.ts
*/
import { advanceWeek, newGame } from "../engine";
import { reconcile } from "../finance";
import { assetById, ensureInfrastructure, projectById, projectCatalogue } from "../infrastructure";
import { stadiumAccreditation } from "../stadiumAccreditation";
import { buildGroundScene } from "../groundScene";
import { groundIdentityModifiers, sceneLook, standBuild, chosenStandBuild } from "../groundIdentity";
import { approveStandBuild, renameStand, setGroundLook } from "../groundBuild";
import type { GameState } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log("  ✓ " + label); }
  else { failed++; console.log("  ✗ " + label + (extra ? " — " + extra : "")); }
}

function fixture(): GameState {
  const s = newGame("Ground Town", "Chairman Test");
  s.saveSeed = "GROUND_CHECK";
  ensureInfrastructure(s);
  s.cash = Math.max(s.cash, 5_000_000);
  return s;
}

console.log("\n[GI1] The default look draws exactly the default ground");
{
  const s = fixture();
  const look = sceneLook(s, { body: "#0f7a3d", secondary: "#f2c14e" });
  for (const stage of [0, 2, 4, 6]) {
    const a = JSON.stringify(buildGroundScene({ stage, pitchCondition: 90, worksAt: [], width: 380, height: 300 }).prims);
    const b = JSON.stringify(buildGroundScene({ stage, pitchCondition: 90, worksAt: [], width: 380, height: 300, look }).prims);
    check(`stage ${stage}: unchanged for a club that hasn't customised`, a === b);
  }
  const custom = { ...look, mowing: "checks" as const, floodlights: "pylons" as const };
  const c1 = JSON.stringify(buildGroundScene({ stage: 3, pitchCondition: 90, worksAt: [], width: 380, height: 300, look: custom }).prims);
  const c2 = JSON.stringify(buildGroundScene({ stage: 3, pitchCondition: 90, worksAt: [], width: 380, height: 300, look: custom }).prims);
  const d = JSON.stringify(buildGroundScene({ stage: 3, pitchCondition: 90, worksAt: [], width: 380, height: 300 }).prims);
  check("a custom look is deterministic", c1 === c2);
  check("a custom look changes the picture", c1 !== d);
  const after = JSON.stringify(buildGroundScene({ stage: 3, pitchCondition: 90, worksAt: [], width: 380, height: 300 }).prims);
  check("a custom build doesn't leak into the next default build", after === d);
}

console.log("\n[GI2] Choosing a covered terrace for an expansion");
{
  const s = fixture();
  const stand = assetById(s, "stand-E")!;
  const spec = projectCatalogue(s, stand.id).find((p) => p.type === "capacityExpansion");
  check("an expansion is available on the East stand", Boolean(spec));
  if (spec) {
    const result = approveStandBuild(s, stand.id, "capacityExpansion", { standing: "terrace", roof: "pitched" });
    check("approved", result.ok, result.reason);
    const project = Object.values(result.state.infrastructure!.projects).find((p) => p.assetId === stand.id)!;
    check("covered terrace costs 10% less", project.baseCost === Math.round(spec.cost * 0.9), `${project.baseCost} vs ${spec.cost}`);
    const scheduled = project.paymentSchedule.filter((p) => p.kind === "instalment").reduce((t, p) => t + p.amount, 0);
    check("payment schedule matches the new cost exactly", scheduled === project.baseCost, `${scheduled} vs ${project.baseCost}`);
    const capacityEffect = project.effectsOnCompletion.find((e) => e.kind === "capacity") as { add: number } | undefined;
    const baseAdd = (spec.effects.find((e) => e.kind === "capacity") as { add: number }).add;
    check("terrace adds 25% more places", capacityEffect?.add === Math.round((baseAdd * 1.25) / 50) * 50, `${capacityEffect?.add} vs ${baseAdd}`);
    check("the build is pending until the work completes", !chosenStandBuild(result.state, stand.id));
    check("input state untouched", !s.groundIdentity && !s.infrastructure!.projects.some((p) => p.assetId === stand.id));

    let t = result.state;
    let guard = 0;
    while (projectById(t, project.id)?.status !== "completed" && guard++ < 60) t = advanceWeek(t);
    check("the project completes", projectById(t, project.id)?.status === "completed", `status ${projectById(t, project.id)?.status}`);
    check("the stand is now a covered terrace", standBuild(t, stand.id).standing === "terrace");
    const acc = stadiumAccreditation(t);
    const seatedWithout = t.infrastructure!.assets.filter((a) => a.type === "stand" && a.status !== "closed" && a.level >= 2 && a.id !== stand.id).reduce((n, a) => n + a.usableCapacity, 0);
    check("a covered terrace doesn't count as EFL seating", acc.seatedCapacity === seatedWithout, `${acc.seatedCapacity} vs ${seatedWithout}`);
    check("terracing lifts atmosphere", groundIdentityModifiers(t).supporterDemand > 0 && groundIdentityModifiers(t).fanHappiness > 0);
    check("ledger reconciles", reconcile(t).ok);
  }
}

console.log("\n[GI3] Paying for a new look, and free changes");
{
  const s = fixture();
  const cash = s.cash;
  const paint = setGroundLook(s, { seats: "club", roof: "club" });
  check("repainting is allowed", paint.ok, paint.reason);
  check("repainting is charged", paint.state.cash < cash);
  check("ledger reconciles after repainting", reconcile(paint.state).ok);
  const free = setGroundLook(paint.state, { mowing: "diagonal", floodlights: "gantry", homeEnd: "N", groundName: "Station Park" });
  check("pattern, lights, home end and name are free", free.ok && free.state.cash === paint.state.cash);
  check("the ground is named", free.state.groundIdentity?.groundName === "Station Park");
  const renamed = renameStand(free.state, "stand-N", "The Mamore Road End");
  check("a stand can be renamed", renamed.ok && assetById(renamed.state, "stand-N")?.name === "The Mamore Road End");
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
