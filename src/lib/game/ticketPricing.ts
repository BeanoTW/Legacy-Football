import { clubSizeFactor } from "./economy";
import type { GameState } from "./types";

export interface PriceReferenceProfile {
  ticketPriceReference: number;
}

export function ticketReferencePrice(profile: PriceReferenceProfile, reputation: number): number {
  return profile.ticketPriceReference * (0.85 + clubSizeFactor(reputation) * 0.15);
}

/** Original attendance price curve, shared by simulation and forecasts. */
export function priceDemandFactor(avgPrice: number, refPrice: number): number {
  if (!(refPrice > 0)) return 1;
  return avgPrice <= refPrice
    ? Math.min(1.12, 1 + ((refPrice - avgPrice) / refPrice) * 0.28)
    : Math.max(0.18, 1 - Math.pow((avgPrice - refPrice) / refPrice, 1.25) * 0.85);
}

export function gateMaximisingPrice(unpricedDemand: number, capacity: number, refPrice: number): number {
  let best = refPrice;
  let bestGate = -1;
  for (let price = Math.max(1, refPrice * 0.4); price <= refPrice * 3; price += 0.25) {
    const attendance = Math.min(capacity, unpricedDemand * priceDemandFactor(price, refPrice));
    const gate = attendance * price;
    if (gate > bestGate + 1e-9) {
      bestGate = gate;
      best = price;
    }
  }
  return Math.round(best * 4) / 4;
}


/** Scale every stand price together for chairman/supporter decisions. */
export function scaleTicketPricesInPlace(state: GameState, multiplier: number): void {
  const factor = Number.isFinite(multiplier) ? Math.max(0.25, Math.min(2, multiplier)) : 1;
  state.stands = state.stands.map((stand) => ({
    ...stand,
    ticketPrice: Math.max(5, Math.min(120, Math.round(stand.ticketPrice * factor))),
  }));
}
