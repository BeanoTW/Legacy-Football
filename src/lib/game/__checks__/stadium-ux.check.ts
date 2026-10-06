/* Stadium UX contract: what Ground Studio and Facilities show the player.
   Run with: npx tsx src/lib/game/__checks__/stadium-ux.check.ts */
import { newGame } from "../engine";
import { approveProjectInPlace, assetById, ensureInfrastructure, evaluateProject, projectCatalogue, recomputeDerived, stadiumCapacity } from "../infrastructure";
import { buildGroundScene } from "../groundScene";
import { groundDesign, roofOptionsFor } from "../groundIdentity";
import {
  CORNER_LADDER,
  STAND_LADDER,
  conditionSummary,
  developmentOptions,
  facilityNeed,
  groundComponents,
  lockReason,
  maintenanceOptions,
  projectStatus,
} from "../stadiumUx";
import type { GameState } from "../types";

let passed = 0;
let failed = 0;
const check = (label: string, ok: boolean, extra?: string) => {
  if (ok) { passed++; console.log("  ✓ " + label); } else { failed++; console.log("  ✗ " + label + (extra ? " — " + extra : "")); }
};
const fixture = (): GameState => {
  const s = newGame("UX Town", "Director Test");
  s.saveSeed = "STADIUM-UX";
  ensureInfrastructure(s);
  s.cash = 2_000_000;
  if (s.finance) s.finance.minimumCashReserve = 100_000;
  return s;
};
const stand = (s: GameState, side: string) => assetById(s, `stand-${side}`)!;

console.log("\n[UX1] Condition reads as a state with a consequence");
{
  const s = fixture();
  const a = stand(s, "E");
  a.condition = 95; recomputeDerived(s);
  check("excellent stand: full capacity", conditionSummary(a).label === "Excellent" && conditionSummary(a).consequence === "Full capacity");
  a.condition = 50; recomputeDerived(s);
  check("worn stand: places and running costs from the canonical bands", conditionSummary(a).consequence === "5% of places unusable · running costs +8%", conditionSummary(a).consequence);
  a.condition = 12; recomputeDerived(s);
  check("critical stand warns of closure", /closure risk/.test(conditionSummary(a).consequence) && conditionSummary(a).urgent);
  a.status = "closed";
  check("closed stand says so", conditionSummary(a).label === "Closed" && conditionSummary(a).consequence === "Closed to supporters");
  const hosp = assetById(s, "hospitality")!;
  hosp.condition = 45;
  check("non-spectator facility talks about capacity, not places", !/places/.test(conditionSummary(hosp).consequence) && /capacity lost/.test(conditionSummary(hosp).consequence), conditionSummary(hosp).consequence);
}

console.log("\n[UX2] Every lock has one plain reason");
{
  const s = fixture();
  const w = stand(s, "W");
  const spec = projectCatalogue(s, w.id).find((p) => p.type === "capacityExpansion")!;
  s.cash = spec.cost - 74_000;
  const cash = lockReason(s, w.id, spec, evaluateProject(s, w.id, spec.type));
  check("short of cash: says by how much", cash?.kind === "cash" && cash.amount === 74_000 && cash.text === "£74k short", cash?.text);
  s.cash = spec.cost + 50_000;
  const reserve = lockReason(s, w.id, spec, evaluateProject(s, w.id, spec.type));
  check("would break the reserve: names the reserve", reserve?.kind === "reserve" && /£100k cash reserve/.test(reserve.text), reserve?.text);
  s.cash = 5_000_000;
  check("affordable and free: no lock", lockReason(s, w.id, spec, evaluateProject(s, w.id, spec.type)) === null);
  const ev = evaluateProject(s, w.id, spec.type)!;
  check("never stricter than the canonical evaluator", lockReason(s, w.id, spec, { ...ev, allowed: true }) === null);
  approveProjectInPlace(s, stand(s, "N").id, "capacityExpansion");
  const busy = lockReason(s, w.id, spec, evaluateProject(s, w.id, spec.type));
  check("another major project: names it and the time left", busy?.kind === "club" && busy.text.startsWith(stand(s, "N").name) && /wks? left/.test(busy.text), busy?.text);
  const nSpec = projectCatalogue(s, "stand-N").find((p) => p.type === "standRedevelopment")!;
  const own = lockReason(s, "stand-N", nSpec, evaluateProject(s, "stand-N", nSpec.type));
  check("same stand already being worked on", own?.kind === "asset" && own.text === "Work already under way on this stand");
  const pricier = lockReason({ ...s, infrastructure: { ...s.infrastructure, projects: [] } } as GameState, w.id, spec, evaluateProject({ ...s, infrastructure: { ...s.infrastructure, projects: [] } } as GameState, w.id, spec.type), s.cash + 1);
  check("a dearer chosen build is judged at its real price", pricier?.kind === "cash");
}

console.log("\n[UX3] Maintain and Develop never blur");
{
  const s = fixture();
  const e = stand(s, "E");
  e.condition = 38; recomputeDerived(s);
  const maintain = maintenanceOptions(s, e).map((o) => o.spec.type);
  const develop = developmentOptions(s, e);
  const developTypes = [develop.next, ...develop.others].filter(Boolean).map((o) => o!.spec.type);
  check("Maintain offers only condition work", maintain.length > 0 && maintain.every((t) => ["minorRepair", "majorRepair", "refurbishment"].includes(t)), maintain.join(","));
  check("Develop offers only physical growth", developTypes.length > 0 && developTypes.every((t) => t === "capacityExpansion" || t === "standRedevelopment" || t === "replacement"), developTypes.join(","));
  e.condition = 30; recomputeDerived(s);
  check("a stand rebuild (Replacement) is planned in Develop, never one-tap from Maintain", !maintenanceOptions(s, e).some((o) => o.spec.type === "replacement") && developmentOptions(s, e).others.some((o) => o.spec.type === "replacement" && o.choosesBuild));
  e.condition = 38; recomputeDerived(s);
  check("repairs preview the condition they restore", maintenanceOptions(s, e).find((o) => o.spec.type === "minorRepair")?.conditionAfter === 53);
  e.condition = 99; e.ageYears = 2; e.metadata.roofQuality = 95; recomputeDerived(s);
  check("a new stand in excellent condition needs nothing", maintenanceOptions(s, e).length === 0, maintenanceOptions(s, e).map((o) => o.spec.type).join(","));
  e.metadata.roofQuality = 40;
  check("roof upgrade is not sold while it has no simulated effect", !maintenanceOptions(s, e).some((o) => o.spec.type === "roofUpgrade") && !developmentOptions(s, e).others.some((o) => o.spec.type === "roofUpgrade"));
  check("the next stage is the capacity step, with the level it reaches", develop.next?.spec.type === "capacityExpansion" && develop.next.toLevel === e.level + 1 && develop.next.choosesBuild);
}

console.log("\n[UX4] Corners are their own assets");
{
  const s = fixture();
  const corner = assetById(s, "corner-NE")!;
  const empty = developmentOptions(s, corner);
  check("an empty corner's next step is Build corner stand (+500)", empty.next?.spec.type === "cornerBuild" && empty.next.addsPlaces === 500);
  check("nothing borrowed from a neighbouring stand", [empty.next, ...empty.others].every((o) => !o || o.spec.type.startsWith("corner")));
  corner.capacity = 500; corner.level = 1; recomputeDerived(s);
  const built = developmentOptions(s, corner);
  check("a built corner expands", built.next?.spec.type === "cornerExpansion" && built.next.toLevel === 2);
  const parts = groundComponents(s);
  check("ground map flags empty corners", parts["corner:NW"].empty && !parts["corner:NE"].empty);
  check("ground map capacity matches the canonical total", Object.values(parts).reduce((t, p) => t + p.capacity, 0) === stadiumCapacity(s));
}

console.log("\n[UX5] The roof is part of the structural ladder");
{
  check("one ladder step per stand level", STAND_LADDER.length === 5 && STAND_LADDER.every((step, i) => step.level === i + 1));
  check("roof progresses: cover → proper roof → cantilever → tiers → bowl", STAND_LADDER.map((s) => s.shape).join(">") === "cover>pitched>cantilever>twoTier>landmark");
  check("ladder roofs match what the build planner offers", roofOptionsFor(3).some((o) => o.id === "cantilever") && !roofOptionsFor(3).some((o) => o.id === "twoTier") && roofOptionsFor(4).some((o) => o.id === "twoTier"));
  check("corner ladder: empty plus three stages", CORNER_LADDER.length === 4 && CORNER_LADDER[0].level === 0);
}

console.log("\n[UX6] Facility dependencies read as a next step");
{
  const s = fixture();
  for (const a of s.infrastructure.assets.filter((x) => x.type === "stand")) a.level = 2;
  const hosp = assetById(s, "hospitality")!;
  hosp.level = 2;
  check("hospitality beyond Lounge needs a Modern stand", facilityNeed(s, hosp) === "Needs a Modern stand");
  approveProjectInPlace(s, "stand-N", "capacityExpansion");
  const upgrade = projectCatalogue(s, hosp.id).find((p) => p.type === "facilityUpgrade")!;
  const lock = lockReason(s, hosp.id, upgrade, evaluateProject(s, hosp.id, upgrade.type));
  check("the structural need is shown even while other works run", lock?.kind === "dependency", lock?.text);
  stand(s, "W").level = 3;
  check("met dependency returns nothing", facilityNeed(s, hosp) === null);
}

console.log("\n[UX7] Scene additions are optional and restrained");
{
  const s = fixture();
  const design = groundDesign(s);
  const base = { stage: 1, pitchCondition: 80, worksAt: [] as string[], width: 380, height: 300, design };
  const plain = JSON.stringify(buildGroundScene(base).prims);
  check("no wear input: picture unchanged", plain === JSON.stringify(buildGroundScene({ ...base, wear: {} }).prims));
  check("a healthy stand shows no wear", plain === JSON.stringify(buildGroundScene({ ...base, wear: { W: 90 } }).prims));
  check("a poor stand weathers visibly", plain !== JSON.stringify(buildGroundScene({ ...base, wear: { W: 25 } }).prims));
  const one = buildGroundScene({ ...base, worksAt: ["stand:N"] }).prims.length;
  check("works can be marked on any stand", one > buildGroundScene(base).prims.length);
  check("hotspot and studio ids for the same stand draw one crane", buildGroundScene({ ...base, worksAt: ["main", "stand:W"] }).prims.length === buildGroundScene({ ...base, worksAt: ["stand:W"] }).prims.length);
  check("an empty corner being built shows a site", buildGroundScene({ ...base, worksAt: ["corner:NE"] }).prims.length > buildGroundScene(base).prims.length);
}

console.log("\n[UX8] Live works report time left and pauses");
{
  const s = fixture();
  const r = approveProjectInPlace(s, "stand-S", "capacityExpansion");
  const p = s.infrastructure.projects.find((x) => x.id === r.projectId)!;
  const status = projectStatus(s, p);
  check("weeks left from the expected completion", status.weeksLeft === p.durationWeeks + p.delayWeeks);
  check("adds the places it will build", status.addsPlaces > 0);
  p.status = "delayed";
  check("a missed payment shows as paused", projectStatus(s, p).paused);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed) process.exit(1);
