import type { GameState, Staff } from "./types";
import type { JoinTerms, ManagerOffer, SpendResult } from "./staff";
import { postEntry } from "./finance";
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

/** Public opening position. The agent asks above the hidden minimum. */
export function managerOpeningPosition(s: GameState, staff: Staff, terms: JoinTerms): ManagerOffer {
  const profile = negotiationProfile(s.saveSeed, `manager-agent:${staff.id}`);
  const floor = managerReservationPackage(terms);
  return {
    wage: roundWage(statedAsk(floor.wage, profile)),
    signingBonus: roundBonus(statedAsk(floor.signingBonus, profile)),
    contractWeeks: floor.contractWeeks,
  };
}

/** Counter stays above the hidden reservation package and concedes by round. */
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

/** Weighted package value allows wage, bonus and security to trade off. */
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

/** Stateless engine evaluation; the modal owns current position and round. */
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

  return {
    outcome: "counter",
    message: "The manager is interested. His agent has moved, but is still pushing for a stronger package.",
    counterOffer: managerCounterPosition(s, staff, terms, currentPosition, Math.max(1, round)),
  };
}

/**
 * Complete a deal already accepted by the bargaining evaluator. Keeping this
 * separate avoids re-running the legacy threshold evaluator at signature time.
 */
export function completeAcceptedManagerDeal(s: GameState, id: string, offer: ManagerOffer): SpendResult {
  const candidate = s.staffCandidates.find((item) => item.id === id);
  if (!candidate) return { state: s, ok: false, reason: "Candidate no longer available" };
  if (candidate.role !== "Manager") return { state: s, ok: false, reason: "This negotiation is for managers only." };
  if (s.hiredStaff.some((item) => item.role === "Manager")) {
    return { state: s, ok: false, reason: "You already employ a Manager. Sack them first." };
  }
  if (s.cash < offer.signingBonus) return { state: s, ok: false, reason: "Not enough cash for the signing bonus." };

  const next: GameState = structuredClone(s);
  next.hiredStaff = [...next.hiredStaff, {
    ...candidate,
    wage: roundWage(offer.wage),
    contractWeeks: Math.max(52, Math.round(offer.contractWeeks / 52) * 52),
  }];
  next.staffCandidates = next.staffCandidates.filter((item) => item.id !== id);
  postEntry(next, {
    category: "Staff",
    subcategory: "Signing bonus",
    description: `Signing bonus — ${candidate.name} (Manager)`,
    amount: roundBonus(offer.signingBonus),
    direction: "expense",
    sourceSystem: "staff",
    linkedEntityId: candidate.id,
    dedupeKey: `staff-hire:${candidate.id}`,
  });
  return { state: next, ok: true };
}

export function managerNegotiatorPatience(s: GameState, staff: Staff): number {
  return negotiationProfile(s.saveSeed, `manager-agent:${staff.id}`).patience;
}

export function managerOfferSeasons(offer: ManagerOffer): number {
  return seasons(offer.contractWeeks);
}
