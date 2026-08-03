/* Finance system audit — reconciliation, single-posting-path and replay safety.
   Run with:  bun src/lib/game/__checks__/finance.check.ts

   Invariant under test:
     Every change to club cash is exactly one permanent ledger transaction,
     and replaying, reloading or migrating state cannot apply it again.
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  newGame, advanceWeek, migrateSave, setTransferBudget,
} from "../engine";
import { approveProject } from "../infrastructure";
import {
  reconcile, entriesFor, seasonTotals, postRecurringWeek, syncWeekLedger,
  legacyIncomeBucket, legacyExpenseBucket, financeSnapshot,
} from "../finance";
import { applyEffects } from "../inbox";
import type { GameState } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}
function safe(label: string, fn: () => void) {
  try { fn(); } catch (e) { failed++; console.log(`  ✗ ${label} threw — ${(e as Error).message}`); }
}

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function fixture(seed = "FINANCE_AUDIT"): GameState {
  const g = newGame("Audit FC", "Auditor");
  g.saveSeed = seed;
  return g;
}

/** cash must always equal the sum of every signed ledger entry. */
function reconciles(s: GameState): boolean {
  const r = reconcile(s);
  return r.ok && r.expected === s.cash;
}

/* =====================================================================
   Phase 1 — static audit: no cash mutation outside the posting path
===================================================================== */
console.log("\n[P1] Cash mutation audit (static)");
{
  const ROOT = "src";
  const files: string[] = [];
  (function walk(dir: string) {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(p)) files.push(p);
    }
  })(ROOT);

  // `s.cash = ...`, `cash += ...`, `cash: s.cash - x` etc.
  // Property writes only: `x.cash = …`, `x.cash += …`, or a spread-style
  // `cash: s.cash - 100` rebuild. Local `const cash = s.cash` is a read.
  const MUTATION = /\.cash\s*(?:\+=|-=|=(?!=))|(?:^|[^\w])cash:\s*[\w.]+\s*[-+]\s/;
  const ALLOWED = new Set(["src/lib/game/finance.ts"]);
  const offenders: string[] = [];
  for (const f of files) {
    const path = f.replace(/\\/g, "/");
    if (ALLOWED.has(path) || path.includes("__checks__")) continue;
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((ln, i) => {
      if (ln.trimStart().startsWith("//") || ln.trimStart().startsWith("*")) return;
      if (MUTATION.test(ln)) offenders.push(`${f}:${i + 1} ${ln.trim()}`);
    });
  }
  check("no cash mutation outside finance.ts postEntry path",
    offenders.length === 0, offenders.join(" | "));

  const financeSrc = readFileSync("src/lib/game/finance.ts", "utf8");
  const bodies = financeSrc.split("\n").filter((l) => /s\.cash\s*=/.test(l));
  check("finance.ts writes cash in a small number of places",
    bodies.length <= 4, `${bodies.length} sites: ${bodies.map((b) => b.trim()).join(" | ")}`);
}

/* =====================================================================
   Phase 2 — reconciliation over a played season
===================================================================== */
console.log("\n[P2] Reconciliation across a full season");
safe("season simulation", () => {
  let s = fixture();
  check("new game reconciles", reconciles(s), JSON.stringify(reconcile(s)));

  let allWeeksReconcile = true;
  for (let i = 0; i < 46; i++) {
    s = advanceWeek(s);
    if (!reconciles(s)) { allWeeksReconcile = false; break; }
  }
  check("cash reconciles after every one of 46 weeks", allWeeksReconcile,
    JSON.stringify(reconcile(s)));
  check("season rollover reconciles", reconciles(s));
  check("entries were actually produced", entriesFor(s, 1).length > 50,
    `${entriesFor(s, 1).length} entries`);

  // Every ledger entry is uniquely identified.
  const ids = new Set(s.financeLedger.map((e) => e.id));
  check("entry ids unique", ids.size === s.financeLedger.length);
  const keys = s.financeLedger.map((e) => e.dedupeKey).filter(Boolean) as string[];
  check("dedupe keys unique", new Set(keys).size === keys.length,
    `${keys.length - new Set(keys).size} duplicates`);

  // Weekly projection must equal the entries it projects.
  let projOk = true;
  const detail: string[] = [];
  for (const row of s.ledger) {
    const es = entriesFor(s, row.season, row.week);
    const inc = es.filter((e) => e.direction === "income").reduce((a, e) => a + e.amount, 0);
    const exp = es.filter((e) => e.direction === "expense").reduce((a, e) => a + e.amount, 0);
    if (sum(row.income) !== inc || sum(row.expenses) !== exp || row.net !== inc - exp) {
      projOk = false;
      detail.push(`s${row.season}w${row.week}: row ${sum(row.income)}/${sum(row.expenses)} vs entries ${inc}/${exp}`);
    }
  }
  check("weekly ledger is a faithful projection of finance entries", projOk, detail.slice(0, 3).join(" | "));

  const lastRow = s.ledger[s.ledger.length - 1];
  const lastEntry = s.financeLedger[s.financeLedger.length - 1];
  check("closing balance of last row equals recorded balanceAfter",
    lastRow.balance === lastEntry.balanceAfter,
    `${lastRow.balance} vs ${lastEntry.balanceAfter}`);

  // Season totals agree with the entry stream.
  const t = seasonTotals(s, 1);
  const es1 = entriesFor(s, 1);
  check("season totals agree with entries",
    t.income === es1.filter((e) => e.direction === "income").reduce((a, e) => a + e.amount, 0) &&
    t.expenditure === es1.filter((e) => e.direction === "expense").reduce((a, e) => a + e.amount, 0));

  check("prize money awarded exactly once",
    s.financeLedger.filter((e) => e.category === "Prize Money").length <= 1 ||
    new Set(s.financeLedger.filter((e) => e.category === "Prize Money").map((e) => e.dedupeKey)).size ===
      s.financeLedger.filter((e) => e.category === "Prize Money").length);

  check("season summary archived at rollover", (s.financeHistory?.length ?? 0) >= 1);
  const snap = financeSnapshot(s);
  check("snapshot cash matches state", snap.cashBalance === s.cash && snap.reconciled);
});

/* =====================================================================
   Phase 3 — replay / reload safety
===================================================================== */
console.log("\n[P3] Replay, reload and idempotency");
safe("recurring week replay", () => {
  let s = fixture("REPLAY");
  s = advanceWeek(s);
  postRecurringWeek(s); // this week's recurring costs (advanceWeek posted the previous week's)
  const cash = s.cash;
  const n = s.financeLedger.length;
  postRecurringWeek(s);
  postRecurringWeek(s);
  check("re-posting the same week is a no-op on cash", s.cash === cash, `${s.cash} vs ${cash}`);
  check("re-posting adds no entries", s.financeLedger.length === n,
    `${s.financeLedger.length} vs ${n}`);
  check("still reconciles", reconciles(s));
});

safe("reload then continue", () => {
  let s = fixture("RELOAD");
  for (let i = 0; i < 8; i++) s = advanceWeek(s);
  const reloaded = migrateSave(clone(s) as unknown as Record<string, unknown>) as unknown as GameState;
  check("reload does not change cash", reloaded.cash === s.cash, `${reloaded.cash} vs ${s.cash}`);
  check("reload does not change entry count",
    reloaded.financeLedger.length === s.financeLedger.length);
  check("reloaded save reconciles", reconciles(reloaded));
  const advanced = advanceWeek(reloaded);
  check("advancing a reloaded save reconciles", reconciles(advanced));
});

safe("syncWeekLedger is idempotent", () => {
  let s = fixture("SYNC");
  s = advanceWeek(s);
  const before = clone(s.ledger);
  syncWeekLedger(s, s.season, s.week);
  syncWeekLedger(s, s.season, s.week);
  check("repeat sync produces identical rows",
    JSON.stringify(s.ledger) === JSON.stringify(before));
  check("repeat sync leaves cash untouched", reconciles(s));
});

/* =====================================================================
   Phase 4 — every spend surface posts a ledger entry
===================================================================== */
console.log("\n[P4] Spend surfaces post through the ledger");
function spendCheck(
  label: string,
  act: (s: GameState) => { state: GameState; ok: boolean },
  expectCost: number,
  bucket: "income" | "expense",
) {
  const s0 = fixture(label);
  const before = s0.cash;
  const n = s0.financeLedger.length;
  const { state: s1, ok } = act(s0);
  check(`${label}: action succeeded`, ok);
  check(`${label}: cash moved by exactly the cost`,
    s1.cash === before + (bucket === "expense" ? -expectCost : expectCost),
    `${s1.cash} vs ${before - expectCost}`);
  check(`${label}: exactly one new entry`, s1.financeLedger.length === n + 1,
    `${s1.financeLedger.length - n} entries`);
  check(`${label}: reconciles`, reconciles(s1));
  check(`${label}: input state untouched`, s0.cash === before);
}

// Legacy expandStand/upgradeTraining/relayPitch were retired: physical work is
// raised as a capital project, which pays in instalments rather than up front.
safe("capital project spends only through the ledger", () => {
  const s = fixture("CAPEX");
  s.cash = 5_000_000;
  const before = s.cash;
  const n = s.financeLedger.length;
  const r = approveProject(s, "pitch", "minorRepair");
  check("project approved", r.ok, r.reason);
  check("approval alone moves no cash", r.state.cash === before);
  check("approval alone writes no entry", r.state.financeLedger.length === n);
  const ticked = advanceWeek(r.state);
  check("first instalment is booked as an expense",
    ticked.financeLedger.some((e) =>
      e.sourceSystem === "facilities" && e.direction === "expense" &&
      e.linkedEntityId === r.projectId));
  check("state still reconciles after the instalment", reconciles(ticked));
  check("input state untouched", s.cash === before);
});

safe("unaffordable capital work is refused", () => {
  const s = fixture("POOR");
  s.cash = 1_000;
  const r = approveProject(s, "pitch", "replacement");
  check("refused", !r.ok);
  check("cash unchanged", r.state.cash === 1_000);
  check("no entry added", r.state.financeLedger.length === s.financeLedger.length);
});


safe("transfer budget allocation is ring-fenced and booked", () => {
  const s = fixture("BUDGET");
  const cash = s.cash;
  const pot = s.transferBudget;
  const s1 = setTransferBudget(s, pot + 500_000).state;
  check("cash reduced by allocation", s1.cash === cash - 500_000, `${s1.cash}`);
  check("budget increased by allocation", s1.transferBudget === pot + 500_000);
  check("allocation reconciles", reconciles(s1));
  const s2 = setTransferBudget(s1, pot).state;
  check("release returns cash", s2.cash === cash, `${s2.cash} vs ${cash}`);
  check("release reconciles", reconciles(s2));
  check("total club money conserved across allocation",
    s2.cash + s2.transferBudget === cash + pot);
});

safe("inbox effects post to the ledger", () => {
  const s0 = fixture("INBOX");
  const n = s0.financeLedger.length;
  const s1 = applyEffects(s0, [
    { kind: "cash", amount: -12_500, note: "Roof repair", expenseCategory: "maintenance" },
    { kind: "cash", amount: 40_000, note: "Sponsor top-up", incomeCategory: "sponsor" },
  ], { sourceItemId: "item-1", sourceEventKey: "key-1" });
  check("two new finance entries", s1.financeLedger.length === n + 2,
    `${s1.financeLedger.length - n}`);
  check("inbox spend reconciles", reconciles(s1));
  check("inbox entries tagged to source",
    s1.financeLedger.slice(-2).every((e) => e.linkedEntityId === "item-1" &&
      e.sourceSystem === "inbox"));
  const row = s1.ledger.find((l) => l.season === s1.season && l.week === s1.week)!;
  check("legacy buckets honoured in projection",
    row.expenses.maintenance === 12_500 && row.income.sponsor === 40_000,
    JSON.stringify({ m: row.expenses.maintenance, sp: row.income.sponsor }));
  check("projection balance equals cash", row.balance === s1.cash);
});

/* =====================================================================
   Phase 5 — legacy migration reconciles
===================================================================== */
console.log("\n[P5] Legacy save migration");
safe("v6 ledger-only save", () => {
  const base = fixture("LEGACY") as unknown as Record<string, unknown>;
  const legacy = clone(base);
  legacy.version = 6;
  delete legacy.finance;
  delete legacy.financeLedger;
  delete legacy.financeHistory;
  legacy.cash = 1_750_000;
  legacy.ledger = [
    {
      week: 1, season: 1,
      income: { gate: 90_000, tv: 0, sponsor: 12_000, merchandise: 4_000, prize: 0, transfers: 0, other: 0 },
      expenses: { playerWages: 60_000, staffWages: 12_000, stadiumOps: 8_000, trainingOps: 5_000, maintenance: 0, matchday: 9_000, transfers: 0, other: 0 },
      net: 12_000, balance: 1_750_000,
    },
  ];

  const m = migrateSave(legacy) as unknown as GameState;
  check("migrated to current schema", (m as unknown as { version: number }).version >= 7);
  check("cash preserved exactly", m.cash === 1_750_000, `${m.cash}`);
  check("migrated save reconciles", reconciles(m), JSON.stringify(reconcile(m)));
  check("legacy rows converted into entries", m.financeLedger.length > 0);
  check("legacy buckets round-trip",
    m.financeLedger.some((e) => legacyIncomeBucket(e) === "gate") &&
    m.financeLedger.some((e) => legacyExpenseBucket(e) === "playerWages"));

  const again = migrateSave(clone(m) as unknown as Record<string, unknown>) as unknown as GameState;
  check("migration idempotent on cash", again.cash === m.cash, `${again.cash} vs ${m.cash}`);
  check("migration idempotent on entries",
    again.financeLedger.length === m.financeLedger.length,
    `${again.financeLedger.length} vs ${m.financeLedger.length}`);
  check("re-migrated save still reconciles", reconciles(again));

  const played = advanceWeek(again);
  check("migrated save can be played on and still reconciles", reconciles(played));
});

console.log(`\n${failed === 0 ? "ALL CHECKS PASSED" : "FAILURES PRESENT"} — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
