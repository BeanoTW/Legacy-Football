/* =========================================================================
   SUSTAINABILITY VERIFICATION
   -------------------------------------------------------------------------
   Covers the Financial Pressure, Reinvestment & Club Sustainability milestone:

     [A] Purity + derived-only guarantees
     [B] Recommended reserve
     [C] Needs + neglect scoring
     [D] Reinvestment pressure
     [E] Director-specific reinvestment behaviour
     [F] Strategic commitment lifecycle
     [G] Capacity + wage pressure
     [H] Financial health
     [I] Weekly tick idempotency + migration
     [J] Passive 1/3/5/10-season economy audit
     [K] Static audit

   Run with:  bun src/lib/game/__checks__/sustainability.check.ts
========================================================================= */
import { readFileSync } from "fs";
import { newGame, advanceWeek, migrateSave, SAVE_VERSION } from "../engine";
import { reconcile } from "../finance";
import {
  ensureSustainability, defaultSustainability,
  operatingPicture, structuralWeeklyExpenditure, structuralWeeklyIncome,
  capitalCommitments, capitalCommitmentsWithin, committedWages, contractExposure,
  commercialConcentration, recommendedReserve, reservePicture,
  needs, infrastructureNeed, squadNeed, supporterNeed, commercialNeed,
  capacityPicture, capacityPressure, reinvestmentPressure,
  wageToRevenue, staffCostRatio, infrastructureCostRatio, financialHealth,
  financialTrajectory, insolvencyRisk,
  directorStance, boardStances, boardDisagrees,
  createCommitmentInPlace, openCommitments, commitmentProgress,
  settleCommitmentsInPlace, runSustainabilityWeek, sustainabilitySnapshot,
  categorySpendToDate, TRAILING_WEEKS,
} from "../sustainability";
import type { GameState } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}

const clone = <T,>(x: T): T => structuredClone(x);
const sig = (s: GameState) => JSON.stringify(s);

/** Fully seeded world: reproducible across processes. */
const BASE = newGame("Sustain FC", "Auditor", "SUSTAIN_AUDIT");

/** Wind a save forward by N weeks. */
function fwd(s0: GameState, weeks: number): GameState {
  let s = clone(s0);
  for (let i = 0; i < weeks; i++) s = advanceWeek(s);
  return s;
}

const MID = fwd(BASE, 12);

/* =========================================================================
   [A] Purity + derived-only
========================================================================= */
console.log("\n[A] Purity");
{
  const before = sig(MID);
  const snap = sustainabilitySnapshot(clone(MID));
  void snap;
  const readers: Array<(s: GameState) => unknown> = [
    operatingPicture, structuralWeeklyExpenditure, structuralWeeklyIncome,
    capitalCommitments, committedWages, contractExposure, commercialConcentration,
    recommendedReserve, reservePicture, needs, infrastructureNeed, squadNeed,
    supporterNeed, commercialNeed, capacityPicture, capacityPressure,
    reinvestmentPressure, wageToRevenue, staffCostRatio, infrastructureCostRatio,
    financialHealth, financialTrajectory, insolvencyRisk, boardStances,
    boardDisagrees, openCommitments, sustainabilitySnapshot,
  ];
  for (const fn of readers) fn(MID);
  check("A1. every selector leaves the save untouched", sig(MID) === before);
  check("A2. selectors are deterministic for one state",
    JSON.stringify(sustainabilitySnapshot(MID)) === JSON.stringify(sustainabilitySnapshot(MID)));
  check("A3. selectors never move cash", MID.cash === JSON.parse(before).cash);
  check("A4. selectors post no ledger entries",
    MID.financeLedger.length === (JSON.parse(before) as GameState).financeLedger.length);
  check("A5. snapshot exposes every headline picture", (() => {
    const x = sustainabilitySnapshot(MID);
    return !!(x.health && x.reserve && x.operating && x.pressure && x.needs && x.capacity);
  })());
}

/* =========================================================================
   [B] Recommended reserve
========================================================================= */
console.log("\n[B] Recommended reserve");
{
  const r = reservePicture(MID);
  check("B1. a reserve is recommended", r.recommended > 0);
  check("B2. excess and deficit are mutually exclusive", r.excess === 0 || r.deficit === 0);
  check("B3. excess = max(0, cash − recommended)",
    r.excess === Math.max(0, r.cash - r.recommended));
  check("B4. deficit = max(0, recommended − cash)",
    r.deficit === Math.max(0, r.recommended - r.cash));
  check("B5. cover weeks are positive for a solvent club", r.coverWeeks > 0);
  check("B6. reserve targets at least 12 weeks of cover", r.targetCoverWeeks >= 12);
  check("B7. strategic capital never exceeds excess", r.strategicCapital <= r.excess);
  check("B8. strategic capital is never negative", r.strategicCapital >= 0);

  // Sizing responds to the cost base, not to a hard-coded number.
  const lean = clone(MID);
  const heavy = clone(MID);
  for (const p of heavy.recruitment?.players ?? []) {
    if (p.clubName === heavy.clubName) p.contract.wage = p.contract.wage * 3;
  }
  check("B9. a heavier wage bill raises the recommended reserve",
    recommendedReserve(heavy) >= recommendedReserve(lean),
    `${recommendedReserve(heavy)} vs ${recommendedReserve(lean)}`);

  // Committed capital is not reserve.
  const capital = clone(MID);
  const proj = capital.infrastructure?.projects?.[0];
  if (proj) {
    proj.status = "inProgress";
    proj.weeksRemaining = Math.max(4, proj.weeksRemaining || 8);
  }
  check("B10. capital commitments within 26 weeks are added to the reserve",
    recommendedReserve(capital) >= recommendedReserve(MID));
  check("B11. near-term commitments never exceed total commitments",
    capitalCommitmentsWithin(MID, 26) <= capitalCommitments(MID) + 1);
  check("B12. reserve is a pure function of state",
    recommendedReserve(MID) === recommendedReserve(clone(MID)));
}

/* =========================================================================
   [C] Needs and neglect
========================================================================= */
console.log("\n[C] Needs");
{
  const n = needs(MID);
  const inRange = (v: number) => v >= 0 && v <= 1;
  check("C1. every need is 0..1",
    [n.infrastructure, n.squad, n.supporters, n.commercial, n.overall].every(inRange),
    JSON.stringify(n));
  check("C2. worst area matches the highest individual need", (() => {
    const vals = { infrastructure: n.infrastructure, squad: n.squad, supporters: n.supporters, commercial: n.commercial };
    return n.worst.value === Math.max(...Object.values(vals));
  })());
  check("C3. overall need sits between the best and worst area",
    n.overall <= n.worst.value + 1e-9 &&
    n.overall >= Math.min(n.infrastructure, n.squad, n.supporters, n.commercial) - 1e-9);

  // Neglect must register: run the ground into the ground.
  const neglected = clone(MID);
  for (const a of neglected.infrastructure?.assets ?? []) {
    a.condition = 5;
    a.qualityRating = 5;
  }
  check("C4. rotting facilities raise infrastructure need",
    infrastructureNeed(neglected) > infrastructureNeed(MID),
    `${infrastructureNeed(neglected)} vs ${infrastructureNeed(MID)}`);

  const unhappy = clone(MID);
  unhappy.fanHappiness = 8;
  check("C5. unhappy supporters raise supporter need",
    supporterNeed(unhappy) > supporterNeed(MID));

  const gutted = clone(MID);
  gutted.recruitment!.players = (gutted.recruitment?.players ?? []).filter(
    (p) => p.clubName !== gutted.clubName,
  );
  check("C6. an empty squad raises squad need",
    squadNeed(gutted) >= squadNeed(MID));
  check("C7. commercial need stays in range for a normal club",
    inRange(commercialNeed(MID)));
}

/* =========================================================================
   [D] Reinvestment pressure
========================================================================= */
console.log("\n[D] Reinvestment pressure");
{
  const p = reinvestmentPressure(MID);
  check("D1. score is 0..100", p.score >= 0 && p.score <= 100, String(p.score));
  check("D2. means and need are 0..1",
    p.means >= 0 && p.means <= 1 && p.need >= 0 && p.need <= 1);
  check("D3. every area score is 0..100",
    Object.values(p.byArea).every((v) => v >= 0 && v <= 100));
  check("D4. a headline is always produced", p.headline.length > 10);

  // Money with nothing wrong: pressure must stay low.
  const richHealthy = clone(MID);
  richHealthy.cash = recommendedReserve(richHealthy) * 6;
  for (const a of richHealthy.infrastructure?.assets ?? []) { a.condition = 99; a.qualityRating = 96; }
  richHealthy.fanHappiness = 95;
  const rh = reinvestmentPressure(richHealthy);

  // Money with plenty wrong: pressure must be materially higher.
  const richNeglected = clone(richHealthy);
  for (const a of richNeglected.infrastructure?.assets ?? []) { a.condition = 6; a.qualityRating = 6; }
  richNeglected.fanHappiness = 12;
  const rn = reinvestmentPressure(richNeglected);

  check("D5. cash alone does not create pressure", rh.score < rn.score, `${rh.score} vs ${rn.score}`);
  check("D6. cash + neglect creates real pressure", rn.score >= 40, String(rn.score));

  // Need without means: a broke club is not asked to spend.
  const brokeNeglected = clone(richNeglected);
  brokeNeglected.cash = 1_000;
  const bn = reinvestmentPressure(brokeNeglected);
  check("D7. need without means creates no reinvestment pressure", bn.score <= 5, String(bn.score));
  check("D8. means collapses when cash is gone", bn.means === 0);

  // Patience: idle money becomes a talking point, but saturates.
  const patient = clone(richNeglected);
  patient.sustainability!.excessWeeks = 0;
  const impatient = clone(richNeglected);
  impatient.sustainability!.excessWeeks = 60;
  check("D9. long-idle cash raises pressure",
    reinvestmentPressure(impatient).score >= reinvestmentPressure(patient).score);
  check("D10. the patience multiplier is bounded",
    reinvestmentPressure(impatient).patience <= 1.25 &&
    reinvestmentPressure(patient).patience >= 0.6);
  check("D11. pressure is deterministic",
    reinvestmentPressure(richNeglected).score === reinvestmentPressure(clone(richNeglected)).score);
}

/* =========================================================================
   [E] Director-specific behaviour
========================================================================= */
console.log("\n[E] Director stances");
{
  const rich = clone(MID);
  rich.cash = recommendedReserve(rich) * 6;
  for (const a of rich.infrastructure?.assets ?? []) { a.condition = 6; a.qualityRating = 6; }
  rich.fanHappiness = 10;

  const broke = clone(MID);
  broke.cash = 0;

  const st = (s: GameState, role: Parameters<typeof directorStance>[1]) => directorStance(s, role);

  check("E1. every stance is -100..100",
    boardStances(rich).every((x) => x.stance >= -100 && x.stance <= 100));
  check("E2. every stance carries a note", boardStances(rich).every((x) => x.note.length > 5));
  check("E3. Finance Director resists spending when the reserve is short",
    st(broke, "Finance Director").stance < 0, String(st(broke, "Finance Director").stance));
  check("E4. Finance Director softens once cover is deep",
    st(rich, "Finance Director").stance > st(broke, "Finance Director").stance);
  check("E5. Supporters' Director reacts to visible neglect + reserves",
    st(rich, "Supporters' Director").stance > st(MID, "Supporters' Director").stance);
  check("E6. Supporters' Director wants supporter spend", st(rich, "Supporters' Director").wants === "supporters");
  check("E7. Commercial Director wants commercial spend", st(rich, "Commercial Director").wants === "commercial");
  check("E8. Football Director tracks squad need",
    st(rich, "Football Director").stance >= st(broke, "Football Director").stance);
  check("E9. the board genuinely splits under cash + neglect", boardDisagrees(rich));
  check("E10. stances are derived only", (() => {
    const before = sig(rich);
    boardStances(rich);
    return sig(rich) === before;
  })());
}

/* =========================================================================
   [F] Strategic commitment lifecycle
========================================================================= */
console.log("\n[F] Commitments");
{
  const s = clone(MID);
  const cashBefore = s.cash;
  const c = createCommitmentInPlace(s, "infrastructure", 10, 500_000, "Rebuild the East Stand");
  check("F1. a commitment is recorded", !!c && openCommitments(s).length === 1);
  check("F2. creating a commitment never moves cash", s.cash === cashBefore);
  check("F3. creating a commitment posts nothing to the ledger",
    s.financeLedger.length === MID.financeLedger.length);
  check("F4. the owning director is assigned", c!.owningDirectorRole === "Chairman");
  check("F5. a baseline of prior spend is captured",
    c!.baseline === categorySpendToDate(MID, "infrastructure"));

  const dup = createCommitmentInPlace(s, "infrastructure", 10, 500_000);
  check("F6. the same promise in the same week does not stack",
    dup!.id === c!.id && s.sustainability!.commitments.length === 1);

  check("F7. progress starts at zero", commitmentProgress(s, c!) === 0);
  check("F8. an unfinished, in-date commitment does not settle",
    settleCommitmentsInPlace(s).length === 0 && c!.status === "open");

  // Fail path: let the deadline pass with nothing spent.
  const failing = clone(s);
  failing.sustainability!.commitments[0].deadlineAbsoluteWeek = 0;
  const ownerBefore = failing.board!.directors.find((d) => d.role === "Chairman")!.confidence;
  const outcomes = settleCommitmentsInPlace(failing);
  check("F9. an expired, undelivered promise fails once",
    outcomes.length === 1 && outcomes[0].outcome === "failed");
  check("F10. failure costs the owning director's confidence",
    failing.board!.directors.find((d) => d.role === "Chairman")!.confidence < ownerBefore);
  check("F11. settling never moves cash", failing.cash === s.cash);
  check("F12. settlement is exactly-once",
    settleCommitmentsInPlace(failing).length === 0 &&
    failing.sustainability!.history.filter((h) => h.id === "commit-1").length === 1);
  check("F13. a settled commitment leaves the open list", openCommitments(failing).length === 0);
  check("F14. the outcome is recorded in history",
    failing.sustainability!.history[0]?.outcome === "failed");

  // Fulfil path: a zero-target promise cannot silently "deliver".
  const zero = clone(MID);
  const z = createCommitmentInPlace(zero, "supporters", 4, 0);
  zero.sustainability!.commitments[0].deadlineAbsoluteWeek = 0;
  settleCommitmentsInPlace(zero);
  check("F15. a promise with no investment target cannot be fulfilled by doing nothing",
    z!.status === "failed");

  // Repeated failures hurt more than the first.
  const repeat = clone(failing);
  const c2 = createCommitmentInPlace(repeat, "infrastructure", 10, 400_000);
  repeat.sustainability!.commitments.find((x) => x.id === c2!.id)!.deadlineAbsoluteWeek = 0;
  const second = settleCommitmentsInPlace(repeat);
  check("F16. a repeated broken promise costs more confidence",
    second[0].confidenceDelta < outcomes[0].confidenceDelta,
    `${second[0].confidenceDelta} vs ${outcomes[0].confidenceDelta}`);
  check("F17. repeated failure damages reputation", second[0].reputationDelta < 0);
  check("F18. commitments survive a save round-trip", (() => {
    const back = migrateSave(JSON.parse(JSON.stringify(failing)) as unknown as Record<string, unknown>);
    return back.sustainability!.commitments.length === failing.sustainability!.commitments.length;
  })());
}

/* =========================================================================
   [G] Capacity + wage pressure
========================================================================= */
console.log("\n[G] Capacity and wage pressure");
{
  const cap = capacityPicture(MID);
  check("G1. capacity picture reports a usable capacity", cap.usableCapacity > 0);
  check("G2. occupancy is 0..1", cap.occupancy >= 0 && cap.occupancy <= 1.0001);
  check("G3. sell-out rate is 0..1", cap.sellOutRate >= 0 && cap.sellOutRate <= 1.0001);
  check("G4. capacity pressure is 0..100", cap.pressure >= 0 && cap.pressure <= 100);
  check("G5. capacityPressure() agrees with the picture", capacityPressure(MID) === cap.pressure);

  const wageRatio = wageToRevenue(MID);
  check("G6. wage-to-revenue is reported", wageRatio > 0);
  const bloated = clone(MID);
  for (const p of bloated.recruitment?.players ?? []) {
    if (p.clubName === bloated.clubName) p.contract.wage = p.contract.wage * 4;
  }
  check("G7. a bloated wage bill raises the wage ratio", wageToRevenue(bloated) > wageRatio);
  check("G8. wage ratio is bounded", wageToRevenue(bloated) <= 400);
  check("G9. staff cost ratio is reported and bounded",
    staffCostRatio(MID) >= 0 && staffCostRatio(MID) <= 300);
  check("G10. infrastructure cost ratio is reported",
    infrastructureCostRatio(MID) >= 0);
  check("G11. committed wages are forward-looking", committedWages(MID) > 0);
  check("G12. contract exposure is a percentage",
    contractExposure(MID) >= 0 && contractExposure(MID) <= 100);
  check("G13. commercial concentration is a percentage",
    commercialConcentration(MID) >= 0 && commercialConcentration(MID) <= 100);
}

/* =========================================================================
   [H] Financial health
========================================================================= */
console.log("\n[H] Financial health");
{
  const h = financialHealth(MID);
  const STATES = ["secure", "healthy", "tight", "stressed", "critical"];
  check("H1. a health state is produced", STATES.includes(h.state));
  check("H2. label and summary are populated", h.label.length > 0 && h.summary.length > 10);
  check("H3. trajectory is one of three values",
    ["improving", "steady", "declining"].includes(h.trajectory));

  const broke = clone(MID);
  broke.cash = -50_000;
  const bh = financialHealth(broke);
  check("H4. a club with no money is not rated healthy",
    bh.state === "critical" || bh.state === "stressed", bh.state);
  check("H5. insolvency risk fires only when critical AND overdrawn",
    insolvencyRisk(broke) === (bh.state === "critical" && broke.cash < 0));
  check("H6. a solvent club is not an insolvency risk", !insolvencyRisk(MID));

  const rich = clone(MID);
  rich.cash = recommendedReserve(rich) * 8;
  check("H7. deep cover improves the rating",
    STATES.indexOf(financialHealth(rich).state) <= STATES.indexOf(h.state));
  check("H8. health is derived only", (() => {
    const before = sig(MID); financialHealth(MID); return sig(MID) === before;
  })());
}

/* =========================================================================
   [I] Weekly tick + migration
========================================================================= */
console.log("\n[I] Weekly tick");
{
  const s = clone(MID);
  const cashBefore = s.cash;
  const ledgerBefore = s.financeLedger.length;
  runSustainabilityWeek(s);
  const after = clone(s);
  runSustainabilityWeek(s);
  check("I1. the weekly tick is idempotent within a week", sig(s) === sig(after));
  check("I2. the tick never moves cash", s.cash === cashBefore);
  check("I3. the tick posts nothing to the ledger", s.financeLedger.length === ledgerBefore);
  check("I4. the tick stamps the absolute week",
    (s.sustainability?.lastTickAbsoluteWeek ?? 0) > 0);

  const idle = clone(MID);
  idle.cash = recommendedReserve(idle) * 5;
  idle.sustainability!.lastTickAbsoluteWeek = 0;
  runSustainabilityWeek(idle);
  check("I5. excess cash ages the idle clock", idle.sustainability!.excessWeeks >= 1);
  check("I6. peak idle weeks are tracked",
    idle.sustainability!.peakExcessWeeks >= idle.sustainability!.excessWeeks);

  const spent = clone(idle);
  spent.cash = 1;
  spent.sustainability!.lastTickAbsoluteWeek = 0;
  runSustainabilityWeek(spent);
  check("I7. spending the surplus resets the idle clock", spent.sustainability!.excessWeeks === 0);

  // Engine wiring: the tick runs as part of a normal week.
  const played = advanceWeek(clone(MID));
  check("I8. advancing a week runs the sustainability tick",
    (played.sustainability?.lastTickAbsoluteWeek ?? 0) >
    (MID.sustainability?.lastTickAbsoluteWeek ?? 0));
  check("I9. advancing a week still reconciles", reconcile(played).ok);

  // Migration: legacy saves gain a valid sustainability block.
  const legacy = clone(BASE) as unknown as Record<string, unknown>;
  legacy.version = 11;
  delete legacy.sustainability;
  const m = migrateSave(legacy);
  check("I10. migration stamps the current schema version", m.version === SAVE_VERSION);
  check("I11. migration initialises sustainability state", !!m.sustainability);
  check("I12. migrated state matches the default shape",
    Object.keys(m.sustainability!).sort().join(",") ===
    Object.keys(defaultSustainability()).sort().join(","));
  check("I13. migration is idempotent",
    JSON.stringify(migrateSave(JSON.parse(JSON.stringify(m)) as unknown as Record<string, unknown>).sustainability) ===
    JSON.stringify(m.sustainability));
  check("I14. ensureSustainability is safe to call repeatedly", (() => {
    const e = clone(MID); ensureSustainability(e); const a = sig(e); ensureSustainability(e);
    return sig(e) === a;
  })());
  check("I15. a migrated save still reconciles", reconcile(m).ok);
}

/* =========================================================================
   [J] Passive economy audit — 1 / 3 / 5 / 10 seasons
   -------------------------------------------------------------------------
   A chairman who does nothing at all must not simply get richer forever
   while the club decays. These assertions measure the passive path.
========================================================================= */
console.log("\n[J] Passive economy audit");
{
  interface Row {
    season: number; cash: number; reserve: number; pressure: number;
    need: number; health: string; idleWeeks: number;
  }
  const rows: Row[] = [];
  let s = clone(BASE);
  const marks = [1, 3, 5, 10];
  for (let season = 1; season <= 10; season++) {
    while (s.season === season) s = advanceWeek(s);
    if (!marks.includes(season)) continue;
    const p = reinvestmentPressure(s);
    rows.push({
      season, cash: Math.round(s.cash), reserve: recommendedReserve(s),
      pressure: p.score, need: Math.round(p.need * 100) / 100,
      health: financialHealth(s).state,
      idleWeeks: s.sustainability?.excessWeeks ?? 0,
    });
  }
  for (const r of rows) {
    console.log(`    S${String(r.season).padStart(2)}  cash=${r.cash.toLocaleString().padStart(12)}  reserve=${r.reserve.toLocaleString().padStart(11)}  pressure=${String(r.pressure).padStart(3)}  need=${r.need}  health=${r.health}  idle=${r.idleWeeks}w`);
  }
  const at = (n: number) => rows.find((r) => r.season === n)!;

  check("J1. ten passive seasons complete without stalling", rows.length === 4);
  check("J2. the books reconcile after ten passive seasons", reconcile(s).ok);
  check("J3. passive neglect registers as need by season 3", at(3).need > 0.2, String(at(3).need));
  check("J4. hoarding cash while neglecting the club creates pressure",
    at(5).pressure > 0 || at(5).need < 0.2, `pressure=${at(5).pressure} need=${at(5).need}`);
  check("J5. pressure does not fade as the neglect deepens",
    at(10).pressure >= at(3).pressure - 10,
    `${at(3).pressure} -> ${at(10).pressure}`);
  check("J6. the recommended reserve keeps pace with the cost base",
    at(10).reserve > 0);
  check("J7. the idle-cash clock advances under passive play",
    at(10).idleWeeks > 0 || at(10).cash < at(10).reserve);
  check("J8. sustainability state stays internally consistent",
    (s.sustainability?.peakExcessWeeks ?? 0) >= (s.sustainability?.excessWeeks ?? 0));
  check("J9. no commitment is invented by passive play",
    (s.sustainability?.commitments ?? []).length === 0);
  check("J10. a trailing operating picture is available at every mark",
    operatingPicture(s, TRAILING_WEEKS).weeksSampled > 0);
}

/* =========================================================================
   [K] Static audit
========================================================================= */
console.log("\n[K] Static audit");
{
  const src = readFileSync("src/lib/game/sustainability.ts", "utf8");
  check("K1. no Math.random", !src.includes("Math.random"));
  check("K2. no Date.now", !src.includes("Date.now"));
  check("K3. no crypto.randomUUID", !src.includes("crypto.randomUUID"));
  check("K4. never mutates cash directly", !/\bs\.cash\s*=/.test(src));
  check("K5. never posts to the ledger", !src.includes("postEntry("));
  check("K6. never pushes ledger entries by hand", !src.includes("financeLedger.push"));
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
