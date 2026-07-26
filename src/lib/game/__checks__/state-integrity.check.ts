/* Runtime verification for Inbox Stabilisation Pass 2 — State Integrity.
   Run with:  bun src/lib/game/__checks__/state-integrity.check.ts
*/
import { newGame } from "../engine";
import {
  applyEffects,
  runWeeklyGenerators,
  handleInboxChoice,
  evaluateChoice,
} from "../inbox";
import { absoluteWeek } from "../time";
import type { GameState, InboxItem, WeekLedger } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

function fixture(): GameState {
  const g = newGame("Testville FC", "Test Manager");
  g.saveSeed = "TEST_SEED_P2";
  return g;
}

function expiringItem(s: GameState, cost: number): InboxItem {
  return {
    id: "test-expiry-1",
    generatorId: "board-welcome",
    eventKey: "test-expiry-1",
    sender: "Test",
    department: "Finance",
    category: "decision",
    subject: "Expiring decision",
    body: "…",
    priority: "normal",
    week: s.week,
    season: s.season,
    status: "awaitingDecision",
    expiresAtAbsoluteWeek: absoluteWeek(s.season, s.week),
    choices: [{ id: "pay", label: "Pay", effects: [{ kind: "cash", amount: -cost }] }],
    consequenceOnExpire: [
      { kind: "cash", amount: -cost, note: "Missed deadline penalty", expenseCategory: "other" },
    ],
  };
}

console.log("\n[1] Expiry consequence applies exactly once (£40,000)");
{
  let s = fixture();
  s.inbox.push(expiringItem(s, 40_000));
  const cashBefore = s.cash;
  const rowsBefore = s.ledger.length;

  s = runWeeklyGenerators(s);
  const item = s.inbox.find((i) => i.id === "test-expiry-1")!;
  const row = s.ledger.find((l) => l.season === s.season && l.week === s.week)!;

  check("cash reduced once", s.cash === cashBefore - 40_000, `cash=${s.cash}`);
  check("item expired", item.status === "expired");
  check("consequenceApplied flag set", item.consequenceApplied === true);
  check("a ledger row exists for the week", !!row);
  check("expense booked once", row.expenses.other === 40_000, `other=${row.expenses.other}`);
  check("note recorded with source", row.inboxNotes?.[0]?.sourceItemId === "test-expiry-1");
  check("row created synthetically when absent", rowsBefore === 0 ? row.synthetic === true : true);

  // Re-run the weekly processor twice more — nothing may change.
  const cashAfterFirst = s.cash;
  s = runWeeklyGenerators(s);
  s = runWeeklyGenerators(s);
  const row2 = s.ledger.find((l) => l.season === s.season && l.week === s.week)!;
  check("re-running weekly processor does not repeat cash", s.cash === cashAfterFirst, `cash=${s.cash}`);
  check("re-running does not repeat ledger", row2.expenses.other === 40_000);
  check("still exactly one expired copy",
    s.inbox.filter((i) => i.id === "test-expiry-1").length === 1);

  // Simulate a reload: serialise / deserialise, then re-run.
  const reloaded: GameState = JSON.parse(JSON.stringify(s));
  const after = runWeeklyGenerators(reloaded);
  check("survives reload without repeating", after.cash === cashAfterFirst);
}

console.log("\n[2] Player choice applies exactly once");
{
  let s = fixture();
  s.inbox.push(expiringItem(s, 10_000));
  // Give it slack so the runner doesn't expire it.
  s.inbox[s.inbox.length - 1].expiresAtAbsoluteWeek = absoluteWeek(s.season, s.week) + 5;
  const before = s.cash;

  s = handleInboxChoice(s, "test-expiry-1", "pay");
  check("first apply moves cash", s.cash === before - 10_000);
  const afterOnce = s.cash;

  s = handleInboxChoice(s, "test-expiry-1", "pay");
  check("second apply is a no-op", s.cash === afterOnce);

  const reloaded: GameState = JSON.parse(JSON.stringify(s));
  const again = handleInboxChoice(reloaded, "test-expiry-1", "pay");
  check("no-op after reload", again.cash === afterOnce);

  const weekly = runWeeklyGenerators(s);
  check("weekly run does not re-apply completed choice", weekly.cash === afterOnce);
  check("status is completed", s.inbox.find((i) => i.id === "test-expiry-1")!.status === "completed");
}

console.log("\n[3] Ledger integrity — opening + income - expenditure = closing");
{
  let s = fixture();
  const opening = s.cash;
  s = applyEffects(
    s,
    [
      { kind: "cash", amount: 25_000, note: "Sponsor bonus", incomeCategory: "sponsor" },
      { kind: "cash", amount: -7_500, note: "Repairs", expenseCategory: "maintenance" },
    ],
    { sourceItemId: "x1", sourceEventKey: "k1" },
  );
  const row = s.ledger.find((l) => l.season === s.season && l.week === s.week) as WeekLedger;
  check("row created", !!row);
  check("income bucket honoured", row.income.sponsor === 25_000);
  check("expense bucket honoured", row.expenses.maintenance === 7_500);
  check("no redundant 'other' fallback used", row.income.other === 0 && row.expenses.other === 0);
  check("net correct", row.net === sum(row.income) - sum(row.expenses));
  check("closing balance equals cash", row.balance === s.cash);
  check("opening + income - expenditure = closing",
    opening + sum(row.income) - sum(row.expenses) === row.balance,
    `${opening} + ${sum(row.income)} - ${sum(row.expenses)} !== ${row.balance}`);
  check("two notes recorded", row.inboxNotes?.length === 2);
  check("notes carry event key", row.inboxNotes?.every((n) => n.sourceEventKey === "k1") === true);
}

console.log("\n[4] Effects apply sequentially to one working state");
{
  const s0 = fixture();
  const s1 = applyEffects(s0, [
    { kind: "cash", amount: -1_000 },
    { kind: "cash", amount: -1_000 },
    { kind: "cash", amount: 500 },
    { kind: "fanHappiness", delta: -5 },
    { kind: "fanHappiness", delta: -5 },
  ]);
  check("all cash effects accumulate", s1.cash === s0.cash - 1_500);
  check("all deltas accumulate", s1.fanHappiness === Math.max(0, s0.fanHappiness - 10));
  check("input state untouched", s0.cash !== s1.cash && s0.ledger.length === 0);
  const row = s1.ledger[0];
  check("single row for the week", s1.ledger.length === 1);
  check("balance still agrees", row.balance === s1.cash);
}

console.log("\n[5] Choice affordability — no debt or overdraft");
{
  const s = fixture();
  s.cash = 30_000;
  const cheap = { id: "a", label: "Cheap", effects: [{ kind: "cash" as const, amount: -10_000 }] };
  const dear = { id: "b", label: "Dear", effects: [{ kind: "cash" as const, amount: -100_000 }] };
  const mixed = {
    id: "c",
    label: "Mixed",
    effects: [
      { kind: "cash" as const, amount: -50_000 },
      { kind: "cash" as const, amount: 45_000 },
    ],
  };
  check("affordable choice available", evaluateChoice(s, cheap).available);
  check("unaffordable choice blocked", !evaluateChoice(s, dear).available);
  check("blocked choice explains why", evaluateChoice(s, dear).reasons[0].includes("Not enough cash"));
  check("net cost used, not gross", evaluateChoice(s, mixed).available);
  check("cashRequired reported", evaluateChoice(s, dear).cashRequired === 100_000);

  const gated = {
    id: "d",
    label: "Gated",
    effects: [],
    requirements: [
      { kind: "reputation" as const, min: 99 },
      { kind: "staffRole" as const, role: "Nonexistent Role" },
    ],
  };
  const ev = evaluateChoice(s, gated);
  check("structured requirements enforced", !ev.available && ev.reasons.length === 2);

  // Engine must refuse to apply an unaffordable choice.
  const s2 = fixture();
  s2.cash = 5_000;
  s2.inbox.push({
    ...expiringItem(s2, 40_000),
    expiresAtAbsoluteWeek: absoluteWeek(s2.season, s2.week) + 5,
  });
  const s3 = handleInboxChoice(s2, "test-expiry-1", "pay");
  check("handleInboxChoice refuses unaffordable choice", s3.cash === 5_000);
  check("cash never goes negative via inbox", s3.cash >= 0);
}

console.log(`\n${failed === 0 ? "ALL CHECKS PASSED" : "FAILURES PRESENT"} — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
