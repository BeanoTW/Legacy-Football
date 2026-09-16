import type { GameState, Staff } from "./types";
import type { JoinTerms, ManagerOffer } from "./staff";
import { counterPosition, negotiationProfile, statedAsk } from "./negotiationProfile";

export interface ManagerNegotiationPosition extends ManagerOffer {
  seasons: number;
}

export interface ManagerBargainingEvaluation {
  outcome: "accepted" | "counter" | "rejected" | "unavailable";
  message: string;
  counterOffer?: ManagerOffer;
}

const roundWage = (value: number) => Math.max(200, Math.round(value / 50) * 50);
const roundBonus = (value: number) => Math.max(0, Math.round(value / 100) * 100);
const seasons = (weeks: number) => Math.max(1, Math.round(weeks / 52));

/** Hidden reservation package: the point at which this manager will actually sign. */
export function managerReservationPackage(terms: JoinTerms): ManagerOffer {
  return {
    wage: terms.wageDemand,
    signingBonus: terms.signingBonus,
    contractWeeks: Math.max(52, seasons(terms.contractWeeks) * 52),
  };
}

/**
 * Public opening position. Agents deliberately ask above their hidden minimum;
 * temperament controls how much negotiating room they leave themselves.
 */
export function managerOpeningPosition(s: GameState, staff: Staff, terms: JoinTerms): ManagerOffer {
  const profile = negotiationProfile(s.saveSeed, `manager-agent:${staff.id}`);
  const floor = managerReservationPackage(terms);
  return {
    wage: roundWage(statedAsk(floor.wage, profile)),
    signingBonus: roundBonus(statedAsk(floor.signingBonus, profile)),
    contractWeeks: floor.contractWeeks,
  };
}

/**
 * Agent counter after a viable offer. The counter remains above the hidden
 * reservation package but concedes toward it as talks progress.
 */
export function managerCounterPosition(
  s: GameState,
  staff: Staff,
  terms: JoinTerms,
  previousCounter: ManagerOffer,
  round: number,
): ManagerOffer {
  const profile = negotiationProfile(s.saveSeed, `manager-agent:${staff.id}`);
  const floor = managerReservationPackage(terms);
  return {
    wage: roundWage(counterPosition(floor.wage, previousCounter.wage, profile, round)),
    signingBonus: roundBonus(counterPosition(floor.signingBonus, previousCounter.signingBonus, profile, round)),
    contractWeeks: Math.max(floor.contractWeeks, Math.round(previousCounter.contractWeeks / 52) * 52),
  };
}

/** Matching every component of a stated counter is never allowed to fail. */
export function meetsManagerPosition(offer: ManagerOffer, position: ManagerOffer): boolean {
  return offer.wage >= position.wage
    && offer.signingBonus >= position.signingBonus
    && offer.contractWeeks >= position.contractWeeks;
}

/**
 * Packages below the stated counter can still be accepted when their combined
 * value reaches the hidden reservation point. This creates genuine bargaining
 * room and lets chairmen trade wage against bonus/security rather than solving
 * three independent thresholds.
 */
export function managerPackageValue(offer: ManagerOffer, reservation: ManagerOffer): number {
  const wage = offer.wage / Math.max(1, reservation.wage);
  const bonus = offer.signingBonus / Math.max(1, reservation.signingBonus);
  const security = offer.contractWeeks / Math.max(52, reservation.contractWeeks);
  return wage * 0.55 + bonus * 0.25 + security * 0.2;
}

export function managerOfferMeetsReservation(offer: ManagerOffer, terms: JoinTerms): boolean {
  const reservation = managerReservationPackage(terms);
  return offer.wage >= reservation.wage * 0.8
    && offer.signingBonus >= reservation.signingBonus * 0.5
    && managerPackageValue(offer, reservation) >= 1;
}

/**
 * Stateless engine evaluation with explicit UI negotiation context. The UI owns
 * the current stated position and round, so no save migration is required.
 */
export function evaluateManagerBargainingOffer(
  s: GameState,
  staff: Staff,
  terms: JoinTerms,
  offer: ManagerOffer,
  currentPosition: ManagerOffer,
  round: number,
): ManagerBargainingEvaluation {
  if (!terms.willing || staff.role !== "Manager") {
    return { outcome: "unavailable", message: terms.note };
  }

  // The central contract: accepting the agent's explicit position always works.
  if (meetsManagerPosition(offer, currentPosition)) {
    return { outcome: "accepted", message: "Terms accepted. The manager is ready to sign." };
  }

  if (managerOfferMeetsReservation(offer, terms)) {
    return { outcome: "accepted", message: "The agent accepts the compromise. The manager is ready to sign." };
  }

  const reservation = managerReservationPackage(terms);
  const value = managerPackageValue(offer, reservation);
  const wageRatio = offer.wage / Math.max(1, reservation.wage);
  const profile = negotiationProfile(s.saveSeed, `manager-agent:${staff.id}`);

  if (value < 0.78 || wageRatio < 0.68) {
    return {
      outcome: "rejected",
      message: round >= profile.patience
        ? "The agent considers that too far from a serious package. Talks are close to breaking down."
        : "That package is too far below expectations. The agent wants a serious improvement.",
    };
  }

  const counterOffer = managerCounterPosition(s, staff, terms, currentPosition, Math.max(1, round));
  return {
    outcome: "counter",
    message: "The manager is interested. His agent has moved, but is still pushing for a stronger package.",
    counterOffer,
  };
}

export function managerNegotiatorPatience(s: GameState, staff: Staff): number {
  return negotiationProfile(s.saveSeed, `manager-agent:${staff.id}`).patience;
}

export function managerOfferSeasons(offer: ManagerOffer): number {
  return seasons(offer.contractWeeks);
}
