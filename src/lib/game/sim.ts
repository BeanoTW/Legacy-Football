/* Derived club readings + raw match maths — extracted from engine.ts (Phase 0c).
 *
 * Everything here is a pure read of GameState (or of explicit arguments). No
 * mutation, no ledger posting, no clock movement. `advanceWeek` and the live
 * match both consume these, which is why they live outside the tick modules.
 */
import type { GameState } from "./types";
import { clubSizeFactor } from "./economy";
import { economicProfileForLevel } from "./levelEconomy";
import { footballLevelOfUser } from "./footballLevel";
import { detailedSquadStrength } from "./footballStrength";
import { stadiumCapacity, stadiumUsableCapacity, facilityModifiers } from "./infrastructure";

/**
 * Nominal stadium capacity. Read from the canonical infrastructure assets;
 * the legacy `stands` array is only a fallback for saves mid-migration.
 */
export const totalCapacity = (s: GameState) =>
  stadiumCapacity(s) || s.stands.reduce((a, b) => a + b.capacity, 0);

/**
 * Capacity actually saleable this week (condition + construction aware).
 *
 * The legacy-save fallback keys off whether the infrastructure model has any
 * stands at all — NOT off a zero result. A stadium closed by ruinous condition
 * legitimately returns 0, and must not silently fall back to full capacity.
 */
export const usableCapacity = (s: GameState) =>
  stadiumCapacity(s) > 0 ? stadiumUsableCapacity(s) : totalCapacity(s);

export const avgTicketPrice = (s: GameState) => {
  const totalCap = s.stands.reduce((a, b) => a + b.capacity, 0);
  if (totalCap <= 0) return 0;
  return s.stands.reduce((a, b) => a + b.ticketPrice * b.capacity, 0) / totalCap;
};

export const playerWagesWeekly = (s: GameState) => s.squad.reduce((a, p) => a + p.wage, 0);

/** Legacy-facing squad rating now delegates to the canonical football scale. */
export const squadRating = (s: GameState) =>
  detailedSquadStrength(s.squad.map((player) => player.rating)) ?? 0;

export const totalWeeklyExpenses = (s: GameState) =>
  playerWagesWeekly(s) +
  s.staffWagesWeekly +
  s.utilitiesWeekly +
  s.maintenanceWeekly +
  s.trainingWeeklyCost;

export const weeklySponsorIncome = (s: GameState) =>
  s.sponsors.reduce((a, sp) => a + (sp.weeksLeft > 0 ? sp.weekly : 0), 0);

/* ---------- Match simulation primitives ---------- */

export function simAttendance(
  s: GameState,
  isHome: boolean,
  opponentStrength: number,
  rng: () => number = Math.random,
): number {
  if (!isHome) return 0;
  // Attendance is DEMAND-led, then capped by what the club can open. A big
  // stadium does not create supporters: the level of football and the size of
  // the club set the crowd, and the ground only limits it.
  const cap = usableCapacity(s);
  const profile = economicProfileForLevel(footballLevelOfUser(s));
  const demandBase = profile.typicalAttendance * clubSizeFactor(s.reputation ?? 50);

  const avgPrice = avgTicketPrice(s);
  // Supporters judge the price against what the level normally charges.
  const refPrice =
    profile.ticketPriceReference * (0.85 + clubSizeFactor(s.reputation ?? 50) * 0.15);
  const priceFactor =
    avgPrice <= refPrice
      ? Math.min(1.12, 1 + ((refPrice - avgPrice) / refPrice) * 0.28)
      : Math.max(0.18, 1 - Math.pow((avgPrice - refPrice) / refPrice, 1.25) * 0.85);

  const happinessFactor = 0.6 + (s.fanHappiness ?? 60) / 165; // 0.6 - 1.21
  const opponentFactor = 0.9 + opponentStrength / 600;
  const noise = 0.93 + rng() * 0.12;
  // Parking and fan-zone quality make coming to the ground easier.
  const convenience = facilityModifiers(s).attendanceConvenience;
  const raw = demandBase * priceFactor * happinessFactor * opponentFactor * noise * convenience;
  return Math.max(0, Math.min(cap, Math.round(raw)));
}

/**
 * Poisson-ish goal draw. Callers pass their own seeded generator so results
 * are replay-safe; `Math.random` is only the fallback for legacy call sites.
 */
export function simGoals(
  strength: number,
  oppStrength: number,
  rand: () => number = Math.random,
): number {
  const diff = strength - oppStrength;
  const lambda = Math.max(0.2, 1.3 + diff / 20);
  let g = 0;
  let p = Math.exp(-lambda);
  let cum = p;
  const r = rand();
  let k = 0;
  while (r > cum && k < 8) {
    k++;
    p = (p * lambda) / k;
    cum += p;
    g = k;
  }
  return g;
}
