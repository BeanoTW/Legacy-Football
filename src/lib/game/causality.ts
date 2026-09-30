import type { FixtureResult, GameState, WeekLedger } from "./types";
import { facilityModifiers } from "./infrastructure";
import { clubMatchStrength } from "./matchStrength";
import { avgTicketPrice, usableCapacity } from "./sim";
import { priceDemandFactor } from "./ticketPricing";
import { ticketPriceReference } from "./ticketForecast";

export type CausalityImpact = "positive" | "negative" | "neutral";

export interface CausalityDriver {
  id: string;
  label: string;
  detail: string;
  impact: CausalityImpact;
  weight: number;
}

const money = (value: number) => {
  const sign = value < 0 ? "−" : "";
  const amount = Math.abs(value);
  if (amount >= 1_000_000) return `${sign}£${(amount / 1_000_000).toFixed(1)}m`;
  if (amount >= 1_000) return `${sign}£${Math.round(amount / 1_000)}k`;
  return `${sign}£${Math.round(amount)}`;
};

const pct = (value: number) => `${value >= 0 ? "+" : ""}${Math.round(value * 100)}%`;

export function attendanceCausality(
  state: GameState,
  result: FixtureResult | undefined | null,
): CausalityDriver[] {
  if (!result?.home) return [];

  const drivers: CausalityDriver[] = [];
  const price = avgTicketPrice(state);
  const reference = ticketPriceReference(state);
  const priceFactor = priceDemandFactor(price, reference);
  const priceDelta = priceFactor - 1;
  drivers.push({
    id: "ticket-price",
    label: "Ticket pricing",
    detail: `£${price.toFixed(2)} average vs £${reference.toFixed(2)} level reference · demand ${pct(priceDelta)}`,
    impact: priceDelta >= 0.025 ? "positive" : priceDelta <= -0.025 ? "negative" : "neutral",
    weight: Math.abs(priceDelta),
  });

  const happiness = state.fanHappiness ?? 60;
  const happinessFactor = 0.6 + happiness / 165;
  const happinessDelta = happinessFactor - (0.6 + 60 / 165);
  drivers.push({
    id: "supporter-mood",
    label: "Supporter mood",
    detail: `Fan happiness ${Math.round(happiness)}/100 · demand ${pct(happinessDelta)} vs a 60/100 baseline`,
    impact: happiness >= 65 ? "positive" : happiness <= 50 ? "negative" : "neutral",
    weight: Math.abs(happinessDelta),
  });

  const opponentStrength = clubMatchStrength(state, result.opponent, state.season);
  const opponentDelta = (0.9 + opponentStrength / 600) - 1;
  drivers.push({
    id: "opponent-pull",
    label: "Opponent pull",
    detail: `Opponent strength ${Math.round(opponentStrength)}/100 · demand ${pct(opponentDelta)}`,
    impact: opponentStrength >= 66 ? "positive" : opponentStrength <= 54 ? "negative" : "neutral",
    weight: Math.abs(opponentDelta),
  });

  const facilities = facilityModifiers(state);
  const facilityFactor = facilities.attendanceConvenience * facilities.supporterDemand;
  const facilityDelta = facilityFactor - 1;
  drivers.push({
    id: "facilities",
    label: "Ground experience",
    detail: `Access and supporter facilities combine for ${pct(facilityDelta)} demand`,
    impact: facilityDelta >= 0.025 ? "positive" : facilityDelta <= -0.025 ? "negative" : "neutral",
    weight: Math.abs(facilityDelta),
  });

  const capacity = usableCapacity(state);
  if (capacity > 0) {
    const fill = result.attendance / capacity;
    drivers.push({
      id: "capacity",
      label: fill >= 0.95 ? "Capacity ceiling" : "Available capacity",
      detail:
        fill >= 0.95
          ? `${result.attendance.toLocaleString()} of ${capacity.toLocaleString()} saleable seats filled · the ground may be capping demand`
          : `${result.attendance.toLocaleString()} of ${capacity.toLocaleString()} saleable seats filled (${Math.round(fill * 100)}%)`,
      impact: fill >= 0.95 ? "positive" : "neutral",
      weight: fill >= 0.95 ? 0.12 : 0.01,
    });
  }

  return drivers.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
}

const INCOME_LABELS: Record<keyof WeekLedger["income"], string> = {
  gate: "Gate receipts",
  tv: "Broadcast",
  sponsor: "Sponsorship",
  merchandise: "Merchandise",
  prize: "Prize money",
  transfers: "Transfer income",
  other: "Other income",
};

const EXPENSE_LABELS: Record<keyof WeekLedger["expenses"], string> = {
  playerWages: "Player wages",
  staffWages: "Staff wages",
  stadiumOps: "Stadium operations",
  trainingOps: "Training",
  maintenance: "Maintenance",
  matchday: "Matchday costs",
  transfers: "Transfer spending",
  other: "Other spending",
};

type FinanceRow = {
  id: string;
  label: string;
  amount: number;
  previous: number;
  direction: "income" | "expense";
};

function financeRows(current: WeekLedger, previous?: WeekLedger): FinanceRow[] {
  const rows: FinanceRow[] = [];

  for (const key of Object.keys(current.income) as (keyof WeekLedger["income"])[]) {
    const amount = current.income[key] ?? 0;
    if (amount === 0 && !(previous?.income[key] ?? 0)) continue;
    rows.push({
      id: `income-${key}`,
      label: INCOME_LABELS[key],
      amount,
      previous: previous?.income[key] ?? 0,
      direction: "income",
    });
  }

  for (const key of Object.keys(current.expenses) as (keyof WeekLedger["expenses"])[]) {
    const amount = current.expenses[key] ?? 0;
    if (amount === 0 && !(previous?.expenses[key] ?? 0)) continue;
    rows.push({
      id: `expense-${key}`,
      label: EXPENSE_LABELS[key],
      amount,
      previous: previous?.expenses[key] ?? 0,
      direction: "expense",
    });
  }

  return rows;
}

export function weeklyFinanceCausality(state: GameState, limit = 4): CausalityDriver[] {
  const current = state.ledger[state.ledger.length - 1];
  if (!current) return [];
  const previous = state.ledger.length >= 2 ? state.ledger[state.ledger.length - 2] : undefined;

  const rows = financeRows(current, previous)
    .filter((row) => row.amount !== 0)
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))
    .slice(0, Math.max(1, limit));

  const drivers = rows.map((row): CausalityDriver => {
    const delta = row.amount - row.previous;
    const comparison =
      !previous
        ? "first recorded week"
        : row.previous === 0
          ? "new this week"
          : Math.abs(delta) < 1
            ? "unchanged vs last week"
            : `${money(Math.abs(delta))} ${delta > 0 ? "higher" : "lower"} vs last week`;

    return {
      id: row.id,
      label: row.label,
      detail: `${money(row.amount)} ${row.direction === "income" ? "in" : "out"} · ${comparison}`,
      impact: row.direction === "income" ? "positive" : "negative",
      weight: row.amount,
    };
  });

  if (current.inboxNotes?.length) {
    const total = current.inboxNotes.reduce((sum, note) => sum + note.amount, 0);
    drivers.push({
      id: "inbox-decisions",
      label: "Chairman decisions",
      detail: `${money(total)} net from off-cycle inbox decisions this week`,
      impact: total > 0 ? "positive" : total < 0 ? "negative" : "neutral",
      weight: Math.abs(total),
    });
  }

  return drivers
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label))
    .slice(0, Math.max(1, limit));
}
