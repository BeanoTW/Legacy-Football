/* Economy audit check — real seasons through the real engine.
   Run:  bun src/lib/game/__checks__/economy-audit.check.ts [--seasons=N] [--baseline] [--strict]

   Modes
     (default)   fails on BUG findings: things that are simply inconsistent.
     --strict    also fails on CALIBRATION findings: tuning targets.
     --baseline  prints everything and always exits 0. Use it to record the
                 state of a branch before patches are applied.

   Three policies are played on the same seed for N seasons:
     sim            advanceWeek only: every match auto-resolved
     watch          every match played through the interactive match flow
     sim+sponsors   auto-resolved, accepting every sponsor offer that arrives

   Nothing here changes gameplay. */
import {
  advanceWeek,
  applyHalfTimeChoice,
  commitLiveMatchAndAdvance,
  kickoff,
  newGame,
  startMatchDay,
} from "../engine";
import type { GameState } from "../types";
import { entriesFor, reconcile, seasonTotals, weeklyRevenueEstimate } from "../finance";
import { wageToRevenue } from "../sustainability";
import { acceptOffer, pendingOffers } from "../commercial";
import { tickTicketBacklash } from "../tick/world";
import { economicProfileForLevel } from "../levelEconomy";
import { footballLevelOfUser } from "../footballLevel";
import { clubSizeFactor } from "../economy";
import { projectCatalogue } from "../infrastructure";
import { groundProgression } from "../groundPresentation";
import { capacityPicture } from "../sustainability";

const arg = (name: string, fallback: number) => {
  const found = process.argv.find((v) => v.startsWith(`--${name}=`));
  return found ? Math.max(1, Number(found.split("=")[1]) || fallback) : fallback;
};
const SEASONS = arg("seasons", 3);
const STRICT = process.argv.includes("--strict");
const BASELINE = process.argv.includes("--baseline");
const SEED = "ECONOMY|AUDIT|1";
const WEEKS = 46;
const k = (n: number) => `${n < 0 ? "-" : ""}£${(Math.abs(n) / 1000).toFixed(1)}k`;

interface Finding { id: string; kind: "bug" | "calibration"; title: string; ok: boolean; detail: string }
const findings: Finding[] = [];
const record = (id: string, kind: Finding["kind"], title: string, ok: boolean, detail: string) => findings.push({ id, kind, title, ok, detail });

/* ------------------------------------------------------------------ */
/* Playing the policies                                                */
/* ------------------------------------------------------------------ */

type Policy = "sim" | "watch" | "sim+sponsors";
type Fixture = GameState["fixtures"][number];

const played = (s: GameState, f: Fixture) =>
  s.results.some(
    (r) =>
      r.week === f.week && r.opponent === f.opponent && r.home === f.home &&
      (r.dayOfWeek ?? 5) === (f.dayOfWeek ?? 5) && (r.competition ?? "league") === (f.competition ?? "league"),
  );

function playWeek(state: GameState, policy: Policy): GameState {
  let s = state;
  if (policy === "sim+sponsors") {
    for (const offer of pendingOffers(s)) {
      const res = acceptOffer(s, offer.id);
      if (res.ok) s = res.state;
    }
  }
  if (policy === "watch") {
    const due = s.fixtures
      .filter((f) => f.week === s.week)
      .sort((a, b) => (a.dayOfWeek ?? 5) - (b.dayOfWeek ?? 5) || (a.competition ?? "league").localeCompare(b.competition ?? "league") || a.opponent.localeCompare(b.opponent));
    for (const fixture of due) {
      if (played(s, fixture)) continue;
      const started = startMatchDay(s, fixture);
      if (!started.liveMatch) continue;
      s = commitLiveMatchAndAdvance(applyHalfTimeChoice(kickoff(started), "steady"));
    }
  }
  return advanceWeek(s);
}

interface SeasonRow {
  season: number;
  turnover: number;
  costs: number;
  operating: number;
  facilities: number;
  commercial: number;
  closingCash: number;
  tvAvg: number;
  opsHomeAvg: number;
  opsAwayAvg: number;
  revenueEstimateAfter: number;
  recurringWeeklyAfter: number;
}
interface Run { policy: Policy; rows: SeasonRow[]; final: GameState; minCash: number; firstNegativeWeek: number | null; reconciled: boolean }

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function seasonRow(s: GameState, season: number): SeasonRow {
  const totals = seasonTotals(s, season);
  const es = entriesFor(s, season);
  const md = es.filter((e) => e.category === "Matchday");
  const tv = md.filter((e) => e.subcategory === "Broadcast" && e.direction === "income").map((e) => e.amount);
  const ops = md.filter((e) => e.subcategory === "Operations" && e.direction === "expense");
  const recurring = totals.income - (totals.incomeByCategory["Prize Money"] ?? 0) - (totals.incomeByCategory["Transfers"] ?? 0);
  return {
    season,
    turnover: totals.income,
    costs: totals.expenditure,
    operating: totals.operatingResult,
    facilities: es.filter((e) => e.sourceSystem === "facilities" && e.direction === "expense").reduce((a, e) => a + e.amount, 0),
    commercial: es.filter((e) => e.sourceSystem === "commercial" && e.direction === "income").reduce((a, e) => a + e.amount, 0),
    closingCash: s.cash,
    tvAvg: mean(tv),
    opsHomeAvg: mean(ops.filter((e) => e.metadata?.home === true).map((e) => e.amount)),
    opsAwayAvg: mean(ops.filter((e) => e.metadata?.home === false).map((e) => e.amount)),
    revenueEstimateAfter: 0,
    recurringWeeklyAfter: recurring / WEEKS,
  };
}

function run(policy: Policy): Run {
  let s = newGame("Audit FC", "A. Auditor", SEED);
  const rows: SeasonRow[] = [];
  let minCash = s.cash;
  let firstNegativeWeek: number | null = null;
  let weekCounter = 0;
  let reconciled = true;
  for (let i = 0; i < WEEKS * SEASONS; i += 1) {
    const before = s.season;
    s = playWeek(s, policy);
    weekCounter += 1;
    minCash = Math.min(minCash, s.cash);
    if (s.cash < 0 && firstNegativeWeek === null) firstNegativeWeek = weekCounter;
    if (s.season !== before) {
      const row = seasonRow(s, before);
      row.revenueEstimateAfter = weeklyRevenueEstimate(s);
      rows.push(row);
      reconciled = reconciled && reconcile(s).ok;
    }
  }
  return { policy, rows, final: s, minCash, firstNegativeWeek, reconciled };
}

const runs = Object.fromEntries((["sim", "watch", "sim+sponsors"] as Policy[]).map((p) => [p, run(p)])) as Record<Policy, Run>;

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

console.log(`\nEconomy audit · seed ${SEED} · ${SEASONS} season(s)`);
for (const policy of ["sim", "watch", "sim+sponsors"] as Policy[]) {
  const r = runs[policy];
  console.log(`\n[${policy}]  min cash ${k(r.minCash)}${r.firstNegativeWeek ? ` · cash first negative in week ${r.firstNegativeWeek}` : ""} · ledger reconciles: ${r.reconciled}`);
  console.log("    season   turnover     costs   operating  facilities  commercial  closing cash");
  for (const row of r.rows) {
    console.log(`    ${String(row.season).padStart(4)}  ${k(row.turnover).padStart(9)} ${k(row.costs).padStart(9)} ${k(row.operating).padStart(10)} ${k(row.facilities).padStart(10)} ${k(row.commercial).padStart(11)} ${k(row.closingCash).padStart(12)}`);
  }
}

/* ------------------------------------------------------------------ */
/* BUG findings                                                        */
/* ------------------------------------------------------------------ */

const simRows = runs.sim.rows, watchRows = runs.watch.rows;
const tvSim = mean(simRows.map((r) => r.tvAvg)), tvWatch = mean(watchRows.map((r) => r.tvAvg));
record("B1", "bug", "Watched and simulated matches pay the same broadcast fee", tvSim > 0 && tvWatch / tvSim <= 4,
  `simulated ${k(tvSim)} per match, watched ${k(tvWatch)} (${(tvWatch / Math.max(1, tvSim)).toFixed(0)}x)`);

const opsHomeRatio = mean(watchRows.map((r) => r.opsHomeAvg)) / Math.max(1, mean(simRows.map((r) => r.opsHomeAvg)));
const opsAwayRatio = mean(watchRows.map((r) => r.opsAwayAvg)) / Math.max(1, mean(simRows.map((r) => r.opsAwayAvg)));
record("B2", "bug", "Watched and simulated matches cost the same to stage", opsHomeRatio <= 2 && opsAwayRatio <= 2,
  `watched/simulated operating cost: home ${opsHomeRatio.toFixed(1)}x, away ${opsAwayRatio.toFixed(1)}x`);

{
  const base = newGame("Audit FC", "A. Auditor", SEED);
  const ref = economicProfileForLevel(footballLevelOfUser(base)).ticketPriceReference * (0.85 + clubSizeFactor(base.reputation ?? 50) * 0.15);
  const delta = (multiplier: number) => {
    const s = structuredClone(base);
    for (const st of s.stands) st.ticketPrice = ref * multiplier;
    const before = s.fanHappiness;
    tickTicketBacklash(s);
    return s.fanHappiness - before;
  };
  const high = delta(1.4), near = delta(1.0);
  record("B3", "bug", "Weekly fan reaction judges prices against the same reference as the crowd model",
    high <= 0 && near <= 0,
    `crowd-model reference £${ref.toFixed(2)}; happiness change at 1.4x: ${high >= 0 ? "+" : ""}${high}, at 1.0x: ${near >= 0 ? "+" : ""}${near} (should not rise when priced at or above what fans expect)`);
}

{
  let s = newGame("Audit FC", "A. Auditor", SEED);
  const fresh = wageToRevenue(s);
  s = advanceWeek(s);
  const week1Recurring = entriesFor(s, 1, 1).filter((e) => e.direction === "income" && e.sourceSystem !== "engine.opening").reduce((a, e) => a + e.amount, 0);
  const estimate = weeklyRevenueEstimate(s);
  record("B4", "bug", "The opening cash deposit is not counted as revenue", fresh >= 25 && estimate <= Math.max(1, week1Recurring) * 3,
    `wage-to-revenue on a fresh save: ${fresh}% (a real club here runs 50-150%); revenue estimate in week 2: ${k(estimate)}/wk vs ${k(week1Recurring)} actually booked in week 1`);
}

{
  const r = runs.sim;
  const worst = Math.max(...r.rows.map((row) => row.revenueEstimateAfter / Math.max(1, row.recurringWeeklyAfter)));
  record("B5", "bug", "Season-end prize money does not inflate next season's revenue estimate (and wage budget)", worst <= 1.5,
    `revenue estimate right after rollover is up to ${worst.toFixed(1)}x the season's recurring weekly income`);
}

record("B6", "bug", "Ledger reconciles and cash stays finite in every policy",
  (["sim", "watch", "sim+sponsors"] as Policy[]).every((p) => runs[p].reconciled && Number.isFinite(runs[p].final.cash)), "cash === sum of income minus expense");

/* ------------------------------------------------------------------ */
/* CALIBRATION findings (tuning targets)                               */
/* ------------------------------------------------------------------ */

const s1 = simRows[0];
if (s1) {
  const margin = s1.operating / Math.max(1, s1.turnover);
  record("C1", "calibration", "A default club playing by simulation roughly breaks even (operating result within -15% of turnover)", margin >= -0.15,
    `season 1: turnover ${k(s1.turnover)}, operating ${k(s1.operating)} (${(margin * 100).toFixed(0)}%); cash ${k(runs.sim.rows[Math.min(2, simRows.length - 1)].closingCash)} after ${SEASONS} season(s)`);
  const share = s1.facilities / Math.max(1, s1.turnover);
  record("C2", "calibration", "Facility running costs stay under 45% of turnover", share <= 0.45,
    `facility running costs ${k(s1.facilities)} = ${(share * 100).toFixed(0)}% of turnover`);
}
if (simRows[0] && watchRows[0]) {
  const gap = (watchRows[0].operating - simRows[0].operating) / Math.max(1, simRows[0].turnover);
  record("C3", "calibration", "Watching every match changes the season result by under 10% of turnover", Math.abs(gap) <= 0.1,
    `watching every match moves the operating result by ${k(watchRows[0].operating - simRows[0].operating)} (${(gap * 100).toFixed(0)}% of turnover)`);
}
{
  const sp = runs["sim+sponsors"];
  const row = sp.rows[Math.min(1, sp.rows.length - 1)];
  const s = newGame("Audit FC", "A. Auditor", SEED);
  const profile = economicProfileForLevel(footballLevelOfUser(s));
  const benchmark = profile.commercialBaseline * clubSizeFactor(s.reputation ?? 50);
  if (row) record("C4", "calibration", "Sponsorship income stays within 1.5x the level's commercial baseline", row.commercial <= benchmark * 1.5,
    `season ${row.season}: sponsorship ${k(row.commercial)} vs level commercial baseline ${k(benchmark)} (${(row.commercial / benchmark).toFixed(1)}x)`);
}

/* ------------------------------------------------------------------ */
/* Stadium growth (report only)                                        */
/* ------------------------------------------------------------------ */

{
  const s = runs.sim.final;
  const cap = capacityPicture(s);
  const gp = groundProgression(s);
  console.log(`\n[stadium] stage ${gp.visualStage + 1}: ${gp.current.name}; usable capacity ${cap.usableCapacity.toLocaleString()}, average attendance ${cap.averageAttendance.toLocaleString()} (occupancy ${Math.round(cap.occupancy * 100)}%)`);
  if (gp.next) {
    const unmet = gp.next.requirements.filter((r) => !r.met).map((r) => `${r.label} ${r.value}`);
    console.log(`          next: ${gp.next.name}; unmet: ${unmet.join(" · ") || "none"}`);
  }
  const expansion = projectCatalogue(s, "stand-N").find((p) => p.type === "capacityExpansion");
  if (expansion) console.log(`          ${expansion.title}: ${k(expansion.cost)} for seats that fill only if demand rises (occupancy ${Math.round(cap.occupancy * 100)}%)`);
}

/* ------------------------------------------------------------------ */
/* Verdict                                                             */
/* ------------------------------------------------------------------ */

console.log("\nFindings");
for (const f of findings) console.log(`  ${f.ok ? "✓" : f.kind === "bug" ? "✗" : "△"} ${f.id} [${f.kind}] ${f.title}\n       ${f.detail}`);
const failedBugs = findings.filter((f) => f.kind === "bug" && !f.ok);
const failedCal = findings.filter((f) => f.kind === "calibration" && !f.ok);
console.log(`\neconomy-audit: ${findings.filter((f) => f.ok).length}/${findings.length} pass · ${failedBugs.length} bug(s) · ${failedCal.length} calibration target(s) missed`);
if (!BASELINE && (failedBugs.length > 0 || (STRICT && failedCal.length > 0))) process.exit(1);
