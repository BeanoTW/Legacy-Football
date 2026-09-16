import { hashString } from "./rng";

export type NegotiatorTemperament = "Accommodating" | "Pragmatic" | "Firm" | "Aggressive";

export interface NegotiationProfile {
  temperament: NegotiatorTemperament;
  /** How far the stated position can sit above the hidden reservation value. */
  openingHeadroom: number;
  /** Share of remaining headroom normally conceded after each serious round. */
  concessionRate: number;
  /** Number of materially poor offers tolerated before talks can collapse. */
  patience: number;
}

const PROFILES: Record<NegotiatorTemperament, Omit<NegotiationProfile, "temperament">> = {
  Accommodating: { openingHeadroom: 0.04, concessionRate: 0.6, patience: 3 },
  Pragmatic: { openingHeadroom: 0.08, concessionRate: 0.45, patience: 3 },
  Firm: { openingHeadroom: 0.13, concessionRate: 0.32, patience: 2 },
  Aggressive: { openingHeadroom: 0.2, concessionRate: 0.22, patience: 2 },
};

/**
 * Stable hidden negotiating personality. The same person/club in the same save
 * negotiates consistently without storing another persisted field.
 */
export function negotiationProfile(saveSeed: string, negotiatorId: string): NegotiationProfile {
  const roll = hashString(`negotiator|${saveSeed}|${negotiatorId}`) % 100;
  const temperament: NegotiatorTemperament =
    roll < 18 ? "Accommodating" : roll < 62 ? "Pragmatic" : roll < 88 ? "Firm" : "Aggressive";
  return { temperament, ...PROFILES[temperament] };
}

export function statedAsk(reservationValue: number, profile: NegotiationProfile): number {
  return Math.max(0, reservationValue * (1 + profile.openingHeadroom));
}

/**
 * A counter starts above the hidden minimum and moves toward it over rounds.
 * Matching the returned counter should therefore always be safe to accept;
 * callers remain responsible for enforcing that invariant explicitly.
 */
export function counterPosition(
  reservationValue: number,
  previousPosition: number,
  profile: NegotiationProfile,
  round: number,
): number {
  const floor = Math.max(0, reservationValue);
  const previous = Math.max(floor, previousPosition);
  const rounds = Math.max(1, round);
  const remainingShare = Math.pow(1 - profile.concessionRate, rounds);
  return floor + (previous - floor) * remainingShare;
}
