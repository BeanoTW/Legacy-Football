/* Runtime verification for causality breadcrumbs.
   Run with: bun src/lib/game/__checks__/causality.check.ts
*/
import { newGame } from "../engine";
import { attendanceCausality, weeklyFinanceCausality } from "../causality";
import { usableCapacity } from "../sim";
import type { FixtureResult, GameState, WeekLedger } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`);
  }
}

function ledger(week: number, overrides?: Partial<WeekLedger>): WeekLedger {
  const base: WeekLedger = {
    week,
    season: 1,
    income: { gate: 0, tv: 0, sponsor: 0, merchandise: 0, prize: 0, transfers: 0, other: 0 },
    expenses: {
      playerWages: 0,
      staffWages: 0,
      stadiumOps: 0,
      trainingOps: 0,
      maintenance: 0,
      matchday: 0,
      transfers: 0,
      other: 0,
    },
    net: 0,
    balance: 500_000,
  };
  return { ...base, ...overrides };
}

console.log("\n[CB1] Attendance breadcrumbs");
{
  const state = newGame("Causality Town", "Chairman Test");
  state.fanHappiness = 35;
  state.stands = state.stands.map((stand) => ({ ...stand, ticketPrice: 100 }));
  const capacity = usableCapacity(state);
  const opponent = state.fixtures[0]?.opponent ?? state.league.find((row) => row.team !== state.clubName)?.team ?? "Opponent";
  const result: FixtureResult = {
    week: state.week,
    opponent,
    home: true,
    goalsFor: 1,
    goalsAgainst: 0,
    attendance: Math.max(0, capacity),
    gateReceipts: 0,
    tvIncome: 0,
    result: "W",
  };
  const drivers = attendanceCausality(state, result);
  check("includes ticket-price cause", drivers.some((driver) => driver.id === "ticket-price"));
  check("expensive tickets read as negative", drivers.find((driver) => driver.id === "ticket-price")?.impact === "negative");
  check("low supporter mood reads as negative", drivers.find((driver) => driver.id === "supporter-mood")?.impact === "negative");
  check("near-full ground exposes capacity ceiling", drivers.find((driver) => driver.id === "capacity")?.label === "Capacity ceiling");
}

console.log("\n[CB2] Finance breadcrumbs");
{
  const state: GameState = newGame("Ledger Town", "Chairman Test");
  const previous = ledger(5);
  previous.income.gate = 10_000;
  previous.expenses.playerWages = 8_000;
  previous.net = 2_000;

  const current = ledger(6);
  current.income.gate = 25_000;
  current.income.sponsor = 5_000;
  current.expenses.playerWages = 8_000;
  current.expenses.matchday = 4_000;
  current.net = 18_000;
  current.inboxNotes = [{ note: "Chairman decision", amount: -2_000 }];

  state.ledger = [previous, current];
  const drivers = weeklyFinanceCausality(state, 5);
  check("largest finance driver is visible", drivers.some((driver) => driver.id === "income-gate"));
  check("expense drivers are marked negative", drivers.find((driver) => driver.id === "expense-playerWages")?.impact === "negative");
  check("week-over-week movement is described", drivers.find((driver) => driver.id === "income-gate")?.detail.includes("higher") === true);
  check("inbox decisions feed the explanation layer", drivers.some((driver) => driver.id === "inbox-decisions"));
}

console.log("\n[CB3] Away matches do not invent attendance explanations");
{
  const state = newGame("Away Town", "Chairman Test");
  const result: FixtureResult = {
    week: 1,
    opponent: "Elsewhere FC",
    home: false,
    goalsFor: 0,
    goalsAgainst: 0,
    attendance: 0,
    gateReceipts: 0,
    tvIncome: 0,
    result: "D",
  };
  check("away result returns no crowd drivers", attendanceCausality(state, result).length === 0);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
