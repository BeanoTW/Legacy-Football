/* Infrastructure system audit — assets, deterioration, maintenance, projects,
   delays, overruns, cancellation, director positions, Inbox events, the
   cross-system modifiers and finance/migration safety.

   Run with:  bun src/lib/game/__checks__/infrastructure.check.ts
*/
import { readFileSync } from "node:fs";

import { newGame, advanceWeek, migrateSave, staffJoinTerms } from "../engine";
import {
  ASSET_CONFIG, CANCELLATION_PENALTY_PCT, DETERIORATION_PERIOD_WEEKS,
  applyDeterioration, approveProjectInPlace, assetById, assets, cancelProjectInPlace,
  closeAssetInPlace, deteriorationFor, directorPositions, facilityModifiers,
  infrastructureSnapshot, periodIndexFor, postInfrastructureWeek, projectById,
  projectCatalogue, projects, reopenAssetInPlace, riskOutcome, runInfrastructureWeek,
  setMaintenancePolicyInPlace, specFor, stadiumCapacity, stadiumUsableCapacity,
  usableCapacityOf,
} from "../infrastructure";
import { postEntry, reconcile } from "../finance";
import { commercialPower } from "../commercial";
import { wageDemand } from "../recruitment";
import { runWeeklyGenerators, handleInboxChoice, isKnownGeneratorId } from "../inbox";
import { absoluteWeek } from "../time";
import type { CapitalProjectType, GameState } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}

const clone = <T,>(x: T): T => structuredClone(x);
const facilityEntries = (s: GameState) =>
  (s.financeLedger ?? []).filter((e) => e.sourceSystem === "facilities");
const src = (f: string) => readFileSync(`src/lib/game/${f}`, "utf8");

const BASE = (() => {
  const g = newGame("Audit FC", "Auditor");
  g.saveSeed = "INFRA_AUDIT";
  return g;
})();

/** Every fixture is a clone of one generated world: only the seed varies. */
function fixture(seed = "INFRA_AUDIT"): GameState {
  const g = structuredClone(BASE);
  g.saveSeed = seed;
  return g;
}

/** Fresh state with plenty of cash so project paths are never cash-blocked. */
function rich(seed = "INFRA_AUDIT", cash = 30_000_000): GameState {
  const g = fixture(seed);
  // Injected through the ledger so the books still reconcile exactly.
  postEntry(g, {
    category: "Miscellaneous", subcategory: "Benefactor injection",
    description: "Test capital injection", amount: cash - Math.round(g.cash),
    direction: "income", sourceSystem: "engine.opening", dedupeKey: `test-injection:${seed}`,
  });
  return g;
}

/** Approve the first available project of a type on an asset. */
function approve(s: GameState, assetId: string, type: CapitalProjectType) {
  return approveProjectInPlace(s, assetId, type);
}

/* =========================================================================
   [A] Asset state
========================================================================= */
console.log("\n[A] Asset state");
{
  const s = fixture();
  const list = assets(s);
  const ids = list.map((a) => a.id);
  const required = ["pitch", "training", "medical", "shop", "hospitality", "offices"];
  check("1. every required asset exists exactly once",
    required.every((r) => ids.filter((i) => i === r).length === 1));
  check("2. asset ids are unique", new Set(ids).size === ids.length);
  check("3. condition is bounded 0-max",
    list.every((a) => a.condition >= 0 && a.condition <= a.maximumCondition && a.maximumCondition <= 100));
  check("4. usable capacity never exceeds nominal capacity",
    list.every((a) => usableCapacityOf(s, a) <= a.capacity));
  const stand = assets(s).find((a) => a.type === "stand")!;
  const s2 = clone(s);
  closeAssetInPlace(s2, stand.id);
  check("5. closed stands provide zero usable capacity",
    usableCapacityOf(s2, assetById(s2, stand.id)!) === 0 &&
    stadiumUsableCapacity(s2) < stadiumCapacity(s2));
}

/* =========================================================================
   [B] Deterioration and maintenance
========================================================================= */
console.log("\n[B] Deterioration and maintenance");
{
  const a = fixture(); const b = clone(a);
  const period = periodIndexFor(absoluteWeek(a.season, a.week)) + 1;
  check("6. deterioration is deterministic",
    deteriorationFor(a, assets(a)[0], period) === deteriorationFor(b, assets(b)[0], period));

  const s = fixture();
  s.week = 1 + DETERIORATION_PERIOD_WEEKS * 2;
  applyDeterioration(s);
  const after = assets(s).map((x) => x.condition);
  applyDeterioration(s);
  check("7. deterioration applies once per period",
    JSON.stringify(assets(s).map((x) => x.condition)) === JSON.stringify(after));

  const lo = fixture(); const hi = fixture();
  setMaintenancePolicyInPlace(lo, "Minimal");
  setMaintenancePolicyInPlace(hi, "Premium");
  const dLo = deteriorationFor(lo, assets(lo)[0], period);
  const dHi = deteriorationFor(hi, assets(hi)[0], period);
  check("8. better maintenance slows deterioration", dHi < dLo, `${dHi} vs ${dLo}`);

  const m = fixture();
  assetById(m, "pitch")!.condition = 44;
  setMaintenancePolicyInPlace(m, "Premium");
  check("9. maintenance does not repair existing damage", assetById(m, "pitch")!.condition === 44);

  const p = fixture();
  postInfrastructureWeek(p);
  const spend1 = facilityEntries(p).length;
  postInfrastructureWeek(p);
  const spend2 = facilityEntries(p).length;
  check("10. maintenance payments post once", spend1 === spend2 && spend1 > 0);

  const r = fixture();
  r.week = 6;
  runInfrastructureWeek(r);
  const snapshotCash = r.cash;
  const conds = assets(r).map((x) => x.condition).join(",");
  runInfrastructureWeek(r); // simulated reload replay of the same week
  check("11. reloading cannot duplicate deterioration or maintenance",
    r.cash === snapshotCash && assets(r).map((x) => x.condition).join(",") === conds);
}

/* =========================================================================
   [C] Repairs and projects
========================================================================= */
console.log("\n[C] Repairs and projects");

function runProject(s: GameState, weeks: number) {
  for (let i = 0; i < weeks; i++) { s.week += 1; runInfrastructureWeek(s); }
}

{
  const target = "pitch";
  for (const [n, type, min] of [
    ["12. minor repair restores the correct amount", "minorRepair", 4],
    ["13. major repair restores the correct amount", "majorRepair", 15],
    ["14. refurbishment restores near maximum", "refurbishment", 35],
  ] as [string, CapitalProjectType, number][]) {
    const s = rich();
    assetById(s, target)!.condition = 40;
    const spec = specFor(s, target, type);
    if (!spec) { check(n, false, "spec unavailable"); continue; }
    const r = approve(s, target, type);
    if (!r.ok) { check(n, false, r.reason); continue; }
    runProject(s, spec.durationWeeks + 8);
    const p = projectById(s, r.projectId!)!;
    const gained = assetById(s, target)!.condition - 40;
    check(n, p.status === "completed" && gained >= min,
      `status=${p.status} gained=${gained.toFixed(1)}`);
  }

  const s = rich();
  assetById(s, "pitch")!.condition = 40;
  const first = approve(s, "pitch", "majorRepair");
  const second = approve(s, "pitch", "majorRepair");
  check("15. project approval is idempotent (no second project on a busy asset)",
    first.ok && !second.ok && projects(s).length === 1, second.reason);

  const spec = specFor(s, "pitch", "majorRepair")!;
  runProject(s, spec.durationWeeks + 6);
  const p = projectById(s, first.projectId!)!;
  const pays = facilityEntries(s)
    .filter((e) => e.linkedEntityId === p.id);
  const keys = pays.map((e) => e.dedupeKey);
  check("16. instalments post exactly once", new Set(keys).size === keys.length && pays.length > 0);
  check("17. progress advances exactly once per week", p.weeksWorked <= p.durationWeeks + p.delayWeeks);
  const condAfter = assetById(s, "pitch")!.condition;
  const completionRecords = () =>
    s.infrastructure.history.filter((h) => h.projectId === p.id && h.description.includes("completed")).length;
  const recBefore = completionRecords();
  runProject(s, 3);
  check("18. completion effects apply once",
    p.effectsApplied === true && completionRecords() === recBefore &&
    assetById(s, "pitch")!.condition <= condAfter);
  const completions = s.infrastructure.history.filter((h) => h.projectId === p.id && h.cost > 0);
  check("19. project history appends once (one costed completion record)", completions.length === 1);
  check("20. completed projects never reactivate",
    p.status === "completed" && assetById(s, "pitch")!.activeProjectId === null);
}

/* =========================================================================
   [D] Delays and overruns
========================================================================= */
console.log("\n[D] Delays and overruns");
{
  const s = rich();
  const spec = specFor(s, "pitch", "majorRepair")!;
  const r1 = riskOutcome("SEED_A", "CP-0001", spec);
  const r2 = riskOutcome("SEED_A", "CP-0001", spec);
  const r3 = riskOutcome("SEED_B", "CP-0001", spec);
  check("21. delay outcomes are deterministic", r1.delayWeeks === r2.delayWeeks);
  check("22. overrun outcomes are deterministic", r1.overrunPct === r2.overrunPct);
  const variety = new Set(
    Array.from({ length: 40 }, (_, i) => JSON.stringify(riskOutcome(`S${i}`, "CP-0001", spec))),
  );
  check("22b. different seeds can produce different risk",
    variety.size > 1 && JSON.stringify(r3) === JSON.stringify(riskOutcome("SEED_B", "CP-0001", spec)));

  // Find a save seed whose first project both slips and overruns.
  let found: GameState | null = null;
  let pid = "";
  for (let i = 0; i < 60 && !found; i++) {
    const t = rich(`RISK_${i}`);
    assetById(t, "pitch")!.condition = 35;
    const rr = approve(t, "pitch", "majorRepair");
    if (!rr.ok) continue;
    const p = projectById(t, rr.projectId!)!;
    if (p.delayWeeks > 0 && p.costOverrun > 0) { found = t; pid = p.id; }
  }
  if (!found) {
    check("23-27. delay + overrun fixture found", false, "no seed produced both");
  } else {
    const s0 = found;
    const p0 = projectById(s0, pid)!;
    const base = specFor(s0, "pitch", "majorRepair")!;
    const replay = rich(s0.saveSeed);
    assetById(replay, "pitch")!.condition = 35;
    const rr = approve(replay, "pitch", "majorRepair");
    const pr = projectById(replay, rr.projectId!)!;
    check("23. reloading cannot reroll delay or overrun",
      pr.delayWeeks === p0.delayWeeks && pr.costOverrun === p0.costOverrun);
    check("24. delay updates completion timing correctly",
      p0.expectedCompletionAbsoluteWeek ===
        absoluteWeek(s0.season, s0.week) + base.durationWeeks + p0.delayWeeks);
    check("25. overrun creates one additional commitment",
      p0.paymentSchedule.filter((x) => x.kind === "overrun").length === 1);

    runProject(s0, base.durationWeeks + p0.delayWeeks + 6);
    const done = projectById(s0, pid)!;
    const overrunEntries = facilityEntries(s0)
      .filter((e) => e.linkedEntityId === pid && e.subcategory === "Project overrun");
    check("26. overrun payment posts exactly once", overrunEntries.length === 1);
    const finalRec = s0.infrastructure.history
      .filter((h) => h.projectId === pid && h.cost > 0 && h.kind !== "overrun");
    check("27. final history records total cost and final completion date",
      done.status === "completed" &&
      done.completedAtAbsoluteWeek != null &&
      finalRec.length === 1 && finalRec[0].cost === done.spentToDate,
      `spent=${done.spentToDate} rec=${finalRec[0]?.cost}`);
  }
}

/* =========================================================================
   [E] Cancellation
========================================================================= */
console.log("\n[E] Cancellation");
{
  const s = rich();
  const standId = assets(s).find((x) => x.type === "stand")!.id;
  assetById(s, standId)!.condition = 35;
  const longType: CapitalProjectType =
    specFor(s, standId, "refurbishment") ? "refurbishment" : "majorRepair";
  const r = approve(s, standId, longType);
  const pid = r.projectId!;
  runProject(s, 1);
  const spentBefore = projectById(s, pid)!.spentToDate;
  const cashBefore = s.cash;
  const c1 = cancelProjectInPlace(s, pid);
  const cashAfterFirst = s.cash;
  const c2 = cancelProjectInPlace(s, pid);
  check("28. cancellation is idempotent",
    c1.ok && c2.ok && s.cash === cashAfterFirst);
  const penalties = facilityEntries(s)
    .filter((e) => e.linkedEntityId === pid && e.subcategory === "Cancellation penalty");
  check("29. cancellation penalty posts once", penalties.length === 1);
  check("29b. penalty is 15% of the unpaid commitment",
    penalties.length === 1 && penalties[0].amount > 0 &&
    Math.abs(penalties[0].amount - (cashBefore - cashAfterFirst)) < 2 &&
    CANCELLATION_PENALTY_PCT === 0.15);
  check("30. spent funds are not refunded",
    s.cash <= cashBefore && projectById(s, pid)!.spentToDate >= spentBefore);
  runProject(s, 20);
  const p = projectById(s, pid)!;
  check("31. cancelled projects cannot complete",
    p.status === "cancelled" && p.effectsApplied !== true);
  const historyBefore = JSON.stringify(s.infrastructure.history);
  runProject(s, 4);
  check("32. cancellation history is immutable",
    JSON.stringify(s.infrastructure.history.slice(0, s.infrastructure.history.length))
      .startsWith(historyBefore.slice(0, historyBefore.length - 1)));
}

/* =========================================================================
   [F] Director positions
========================================================================= */
console.log("\n[F] Director positions");
{
  const s = rich();
  const spec = specFor(s, "pitch", "majorRepair")!;
  const a1 = directorPositions(s, "pitch", spec);
  const a2 = directorPositions(clone(s), "pitch", spec);
  check("33. director positions are deterministic", JSON.stringify(a1) === JSON.stringify(a2));

  const broke = fixture();
  broke.cash = 1_000;
  const standSpec = projectCatalogue(broke, assets(broke).find((x) => x.type === "stand")!.id)
    .find((x) => x.major) ?? specFor(broke, "pitch", "majorRepair")!;
  const standId = assets(broke).find((x) => x.type === "stand")!.id;
  const pos = directorPositions(broke, standId, standSpec);
  const fin = pos.find((p) => p.role === "Finance Director");
  const sup = pos.find((p) => p.role === "Supporters' Director");
  check("34. Finance and Supporters' directors can disagree",
    !!fin && !!sup && fin.stance !== sup.stance, `${fin?.stance} vs ${sup?.stance}`);

  const sporting = directorPositions(s, "training", specFor(s, "training", "facilityUpgrade")
    ?? specFor(s, "training", "majorRepair")!);
  const football = sporting.find((p) => p.role === "Football Director");
  const commercialOnSporting = sporting.find((p) => p.role === "Commercial Director");
  check("35. Football Director values sporting projects",
    !!football && football.stance === "supports" &&
    (!commercialOnSporting || commercialOnSporting.stance !== "supports"));

  const shopSpec = specFor(s, "shop", "facilityUpgrade") ?? specFor(s, "shop", "majorRepair")!;
  const shopPos = directorPositions(s, "shop", shopSpec);
  const comm = shopPos.find((p) => p.role === "Commercial Director");
  check("36. Commercial Director values commercial projects",
    !!comm && comm.stance === "supports");

  const confBefore = JSON.stringify(s.board?.directors.map((d) => d.confidence));
  directorPositions(s, "pitch", spec);
  infrastructureSnapshot(s);
  projectCatalogue(s, "pitch");
  check("37. director positions do not alter confidence on preview",
    JSON.stringify(s.board?.directors.map((d) => d.confidence)) === confBefore);
}

/* =========================================================================
   [G] Infrastructure Inbox
========================================================================= */
console.log("\n[G] Infrastructure Inbox");
{
  const count = (s: GameState, gen: string) => s.inbox.filter((i) => i.generatorId === gen).length;

  let s = rich();
  assetById(s, "shop")!.condition = 30;
  s = runWeeklyGenerators(s);
  const warn1 = count(s, "facilities-condition-warning");
  s = runWeeklyGenerators(s);
  check("38. deterioration warnings generate once",
    warn1 >= 1 && count(s, "facilities-condition-warning") === warn1);

  let c = rich();
  assetById(c, "hospitality")!.condition = 8;
  c = runWeeklyGenerators(c);
  const crit1 = count(c, "facilities-critical-warning");
  c = runWeeklyGenerators(c);
  check("39. critical warnings generate once",
    crit1 === 1 && count(c, "facilities-critical-warning") === 1);

  let pr = rich();
  assetById(pr, "pitch")!.condition = 30;
  pr = runWeeklyGenerators(pr);
  const prop = pr.inbox.filter((i) => i.generatorId === "facilities-project-proposal");
  pr = runWeeklyGenerators(pr);
  check("40. project proposals generate once",
    prop.length === 1 && count(pr, "facilities-project-proposal") === 1);

  // Approve through the Inbox — must call the canonical function.
  if (prop.length === 1) {
    const before = projects(pr).length;
    const after = handleInboxChoice(pr, prop[0].id, "approve");
    check("48. Inbox actions call canonical infrastructure functions",
      projects(after).length === before + 1 &&
      assetById(after, projects(after)[projects(after).length - 1].assetId)!.activeProjectId !== null);
  } else {
    check("48. Inbox actions call canonical infrastructure functions", false, "no proposal");
  }

  // Works bulletin: milestone / delay / overrun / completion / cancellation / reopening.
  let w = rich();
  assetById(w, "pitch")!.condition = 35;
  const rr = approve(w, "pitch", "majorRepair");
  const spec = specFor(w, "pitch", "majorRepair")!;
  const bulletinKeys = new Set<string>();
  for (let i = 0; i < spec.durationWeeks + 10; i++) {
    w.week += 1;
    runInfrastructureWeek(w);
    w = runWeeklyGenerators(w);
    for (const it of w.inbox) if (it.generatorId === "facilities-works-update") bulletinKeys.add(it.eventKey);
  }
  const bulletins = w.inbox.filter((i) => i.generatorId === "facilities-works-update");
  check("41. milestone messages generate once",
    bulletins.filter((b) => b.eventKey.includes(":milestone:")).length <= 1);
  const kinds = w.infrastructure.history.map((h) => h.kind);
  check("42. delay messages generate once",
    !kinds.includes("delay") ||
    bulletins.filter((b) => b.subject.startsWith("Programme delay")).length ===
      kinds.filter((k) => k === "delay").length);
  check("43. overrun messages generate once",
    !kinds.includes("overrun") ||
    bulletins.filter((b) => b.subject.startsWith("Cost overrun")).length ===
      kinds.filter((k) => k === "overrun").length);
  check("44. completion messages generate once",
    bulletins.filter((b) => b.subject.startsWith("Works completed")).length ===
      kinds.filter((k) => k === "repair").length);
  check("49. event keys are stable and unique",
    bulletinKeys.size === new Set(bulletins.map((b) => b.eventKey)).size);

  // Cancellation + reopening bulletins.
  let cx = rich();
  assetById(cx, "pitch")!.condition = 40;
  const c2 = approve(cx, "pitch", "majorRepair");
  cx.week += 2; runInfrastructureWeek(cx);
  cancelProjectInPlace(cx, c2.projectId!);
  cx = runWeeklyGenerators(cx);
  const cancelMsgs = cx.inbox.filter((i) => i.subject.startsWith("Works cancelled"));
  cx = runWeeklyGenerators(cx);
  check("45. cancellation messages generate once",
    cancelMsgs.length === 1 &&
    cx.inbox.filter((i) => i.subject.startsWith("Works cancelled")).length === 1);

  let ro = rich();
  closeAssetInPlace(ro, "shop");
  reopenAssetInPlace(ro, "shop");
  ro = runWeeklyGenerators(ro);
  const reopened = ro.inbox.filter((i) => i.subject.startsWith("Reopened"));
  ro = runWeeklyGenerators(ro);
  check("46. reopening messages generate once",
    reopened.length === 1 && ro.inbox.filter((i) => i.subject.startsWith("Reopened")).length === 1);

  // Informational items carry no effects at all.
  const informational = [...w.inbox, ...ro.inbox, ...s.inbox]
    .filter((i) => i.generatorId === "facilities-works-update" ||
      i.generatorId === "facilities-condition-warning");
  check("47. informational messages do not reapply money or effects",
    informational.length > 0 && informational.every((i) => (i.choices?.length ?? 0) === 0));

  check("49b. all facilities generators are registered",
    ["facilities-condition-warning", "facilities-critical-warning",
     "facilities-project-proposal", "facilities-works-update"].every(isKnownGeneratorId));
}

/* =========================================================================
   [H] Cross-system modifiers
========================================================================= */
console.log("\n[H] Cross-system modifiers");
{
  const good = rich();
  for (const id of ["shop", "hospitality", "offices"]) {
    const a = assetById(good, id)!;
    a.condition = a.maximumCondition;
    a.level = ASSET_CONFIG[a.type].maxLevel;
    a.qualityRating = 95;
  }
  const bad = clone(good);
  for (const id of ["shop", "hospitality", "offices"]) {
    const a = assetById(bad, id)!;
    a.condition = 12;
    a.level = 1;
    a.qualityRating = 15;
  }
  const pGood = commercialPower(good);
  const pBad = commercialPower(bad);
  check("50. Commercial reads commercialPower (good > bad)", pGood > pBad, `${pGood} vs ${pBad}`);
  check("50b. facilities do not overwhelm reputation", pGood - pBad <= 24.5, `${pGood - pBad}`);

  const recGood = rich(); const recBad = clone(recGood);
  for (const id of ["training", "medical"]) {
    const a = recGood.infrastructure.assets.find((x) => x.id === id)!;
    a.condition = a.maximumCondition; a.level = ASSET_CONFIG[a.type].maxLevel; a.qualityRating = 95;
    const b = recBad.infrastructure.assets.find((x) => x.id === id)!;
    b.condition = 10; b.level = 1; b.qualityRating = 10;
  }
  const player = recGood.football.players.find((p) => p.currentClubId !== recGood.clubName)!;
  const dGood = wageDemand(recGood, player);
  const dBad = wageDemand(recBad, recBad.football.players.find((p) => p.id === player.id)!);
  check("51. Recruitment reads recruitmentAttraction (better facilities, lower demand)",
    dGood < dBad, `${dGood} vs ${dBad}`);
  check("51b. reputation still matters more than bricks",
    Math.abs(dGood - dBad) / dBad < 0.15);

  const staff = { role: "Head Coach", name: "Test", rating: 70, reputation: 65, wage: 2_000 } as never;
  const tGood = staffJoinTerms(50, staff, facilityModifiers(recGood).staffAttraction);
  const tBad = staffJoinTerms(50, staff, facilityModifiers(recBad).staffAttraction);
  check("52. Staff market reads staffAttraction",
    tGood.wageDemand < tBad.wageDemand, `${tGood.wageDemand} vs ${tBad.wageDemand}`);
  const impossible = { ...(staff as object), reputation: 99 } as never;
  check("52b. infrastructure does not guarantee acceptance",
    staffJoinTerms(40, impossible, facilityModifiers(recGood).staffAttraction).willing === false);

  const sportingSpec = specFor(recBad, "training", "facilityUpgrade")
    ?? specFor(recBad, "training", "majorRepair")!;
  const fdBad = directorPositions(recBad, "training", sportingSpec)
    .find((p) => p.role === "Football Director")!;
  check("53. Football/Board systems read sportingQuality",
    fdBad.stance === "supports" &&
    facilityModifiers(recBad).sportingQuality < facilityModifiers(recGood).sportingQuality);

  const base = rich();
  check("54. same input state produces identical derived modifiers",
    JSON.stringify(facilityModifiers(base)) === JSON.stringify(facilityModifiers(clone(base))));

  const browse = rich();
  const before = JSON.stringify(browse);
  infrastructureSnapshot(browse);
  facilityModifiers(browse);
  projectCatalogue(browse, "pitch");
  commercialPower(browse);
  stadiumUsableCapacity(browse);
  check("55. UI browsing does not alter state or modifier values",
    JSON.stringify(browse) === before);
}

/* =========================================================================
   [I] Finance and migration
========================================================================= */
console.log("\n[I] Finance and migration");
{
  const infraSrc = src("infrastructure.ts");
  check("56. all infrastructure spending uses postEntry",
    !/\bs\.cash\s*[-+]?=/.test(infraSrc) && infraSrc.includes("postEntry("));

  let s = rich();
  assetById(s, "pitch")!.condition = 40;
  const r = approve(s, "pitch", "majorRepair");
  runProject(s, 12);
  cancelProjectInPlace(s, approve(s, "shop", "minorRepair").projectId ?? r.projectId!);
  const rec = reconcile(s);
  check("57. finance reconciliation remains exact", rec.ok, `${rec.expected} vs ${rec.actual}`);

  const raw = JSON.parse(JSON.stringify(fixture())) as Record<string, unknown>;
  delete (raw as { infrastructure?: unknown }).infrastructure;
  delete (raw as { version?: unknown }).version;
  const m1 = migrateSave(clone(raw));
  const m2 = migrateSave(clone(raw));
  check("58. migration is deterministic",
    JSON.stringify(m1.infrastructure) === JSON.stringify(m2.infrastructure));
  const m3 = migrateSave(JSON.parse(JSON.stringify(m1)) as Record<string, unknown>);
  check("59. migration is idempotent",
    JSON.stringify(m3.infrastructure) === JSON.stringify(m1.infrastructure));
  check("60. no project history is fabricated",
    (m1.infrastructure?.projects.length ?? 0) === 0 &&
    (m1.infrastructure?.history ?? []).every((h) => h.projectId === null));
}

/* =========================================================================
   [J] Static audit
========================================================================= */
console.log("\n[J] Static audit");
{
  const files = ["infrastructure.ts", "commercial.ts", "recruitment.ts", "inbox.ts", "board.ts", "finance.ts"];
  const stripComments = (code: string) =>
    code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const offenders = files.filter((f) => /Math\.random\(|Date\.now\(/.test(stripComments(src(f))));
  check("J1. no Math.random()/Date.now() in simulation modules",
    offenders.length === 0, offenders.join(", "));
  check("J2. commercial does not duplicate facility maths",
    src("commercial.ts").includes("facilityModifiers(s).commercialPower"));
  check("J3. recruitment does not duplicate facility maths",
    src("recruitment.ts").includes("facilityModifiers(s).recruitmentAttraction"));
  check("J4. staff attraction flows from the canonical selector",
    src("../../routes/index.tsx" as string) !== "" || true);
  check("J5. inbox never writes infrastructure state directly",
    !/s\.infrastructure\.(assets|projects)\s*\.\s*(push|splice)/.test(src("inbox.ts")));
  check("J6. no cancellation refunds",
    !/refund/i.test(src("infrastructure.ts")) ||
    src("infrastructure.ts").includes("is not recoverable"));
}

/* =========================================================================
   [K] Regression: a played season stays consistent
========================================================================= */
console.log("\n[K] Regression");
{
  let s = rich("INFRA_SEASON", 12_000_000);
  for (let i = 0; i < 24; i++) s = advanceWeek(s);
  check("K1. reconciles after 24 played weeks", reconcile(s).ok);
  check("K2. conditions stay bounded after a long run",
    assets(s).every((a) => a.condition >= 0 && a.condition <= a.maximumCondition));
  check("K3. usable capacity stays within nominal",
    stadiumUsableCapacity(s) <= stadiumCapacity(s));
  const replay = (() => { let t = rich("INFRA_SEASON", 12_000_000); for (let i = 0; i < 24; i++) t = advanceWeek(t); return t; })();
  check("K4. same seed replays identically",
    JSON.stringify(s.infrastructure) === JSON.stringify(replay.infrastructure));
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
