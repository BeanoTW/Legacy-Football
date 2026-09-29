import type { GameState } from "./types";
import { clubSizeFactor } from "./economy";
import { economicProfileForLevel } from "./levelEconomy";
import { footballLevelOfUser } from "./footballLevel";
import { avgTicketPrice, usableCapacity } from "./sim";
import { facilityModifiers } from "./infrastructure";
import { gateMaximisingPrice, priceDemandFactor, ticketReferencePrice } from "./ticketPricing";

const NEUTRAL_NOISE = 0.93 + 0.5 * 0.12;

export const ticketPriceReference = (s: GameState): number =>
  ticketReferencePrice(economicProfileForLevel(footballLevelOfUser(s)), s.reputation ?? 50);

export function unpricedDemand(s: GameState, opponentStrength = 60): number {
  const profile = economicProfileForLevel(footballLevelOfUser(s));
  const base = profile.typicalAttendance * clubSizeFactor(s.reputation ?? 50);
  const mood = 0.6 + (s.fanHappiness ?? 60) / 165;
  const opposition = 0.9 + opponentStrength / 600;
  return base * mood * opposition * NEUTRAL_NOISE * facilityModifiers(s).attendanceConvenience;
}

export function expectedAttendanceAt(s: GameState, averagePrice: number, opponentStrength = 60): number {
  const attendance = unpricedDemand(s, opponentStrength) * priceDemandFactor(averagePrice, ticketPriceReference(s));
  return Math.max(0, Math.min(usableCapacity(s), Math.round(attendance)));
}

export const expectedHomeAttendance = (s: GameState, opponentStrength = 60): number =>
  expectedAttendanceAt(s, avgTicketPrice(s), opponentStrength);

export const recommendedAveragePrice = (s: GameState): number =>
  gateMaximisingPrice(unpricedDemand(s), usableCapacity(s), ticketPriceReference(s));
}
