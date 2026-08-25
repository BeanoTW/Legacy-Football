/* Canonical club readings for UI consumers. */
import type { GameState } from "../types";
import {
  playerWageBill,
  recurringWeeklyExpenditure,
  recurringWeeklyIncome,
  staffWageBill,
} from "../finance";
import { userSquad } from "../recruitment";

const int = (n: number) => Math.round(Number.isFinite(n) ? n : 0);

export const SQUAD_RATING_DEPTH = 16;

export function canonicalSquadRating(s: GameState): number {
  const canonical = userSquad(s);
  const ratings = canonical.length
    ? canonical.map((player) => player.currentAbility)
    : (s.squad ?? []).map((player) => player.rating);
  if (!ratings.length) return 0;
  const top = [...ratings].sort((a, b) => b - a).slice(0, SQUAD_RATING_DEPTH);
  return top.reduce((total, rating) => total + rating, 0) / top.length;
}

export interface ClubKpiReading {
  cash: number;
  weeklyIncome: number;
  weeklyExpenses: number;
  weeklyNetRecurring: number;
  wageBill: number;
  rating: number;
}

export function clubKpi(s: GameState): ClubKpiReading {
  const weeklyIncome = recurringWeeklyIncome(s);
  const weeklyExpenses = recurringWeeklyExpenditure(s);
  return {
    cash: int(s.cash),
    weeklyIncome,
    weeklyExpenses,
    weeklyNetRecurring: weeklyIncome - weeklyExpenses,
    wageBill: playerWageBill(s) + staffWageBill(s),
    rating: canonicalSquadRating(s),
  };
}

export const canonicalPlayerWagesWeekly = (s: GameState): number => playerWageBill(s);

export const weeklyNetRecurring = (s: GameState): number =>
  recurringWeeklyIncome(s) - recurringWeeklyExpenditure(s);
