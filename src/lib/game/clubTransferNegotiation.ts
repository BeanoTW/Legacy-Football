import type { GameState } from "./types";
import { counterPosition, negotiationProfile, statedAsk } from "./negotiationProfile";
import { recruitmentNormaliseTransferFeeForClub, recruitmentTransferFeePolicyForClub } from "./recruitmentEconomy";

export interface SellingClubBargainingPosition {
  reservationFee: number;
  statedFee: number;
  counterFee: number;
  patience: number;
}

/**
 * Stable seller economics for one transfer negotiation.
 *
 * `reservationFee` is the hidden minimum the selling club will accept.
 * `statedFee` is its negotiating position and may contain headroom.
 * `counterFee` concedes toward the reservation value without ever crossing it.
 * A rival bid is a hard floor: a rational seller will not accept less than
 * the alternative already on the table.
 */
export function sellingClubBargainingPosition(
  s: GameState,
  sellerClubId: string,
  negotiationId: string,
  economicFloor: number,
  competingOfferFee: number | undefined,
  round: number,
): SellingClubBargainingPosition {
  const profile = negotiationProfile(s.saveSeed, `selling-club:${sellerClubId}`);
  const policy = recruitmentTransferFeePolicyForClub(s, sellerClubId);
  const reservationFee = Math.max(
    policy.askingFloor,
    competingOfferFee ?? 0,
    recruitmentNormaliseTransferFeeForClub(s, sellerClubId, Math.max(0, economicFloor)),
  );
  const statedFee = Math.max(
    reservationFee,
    recruitmentNormaliseTransferFeeForClub(
      s,
      sellerClubId,
      statedAsk(reservationFee, profile),
      "asking",
    ),
  );
  const previousPosition = Math.max(statedFee, reservationFee);
  const counterFee = Math.max(
    reservationFee,
    recruitmentNormaliseTransferFeeForClub(
      s,
      sellerClubId,
      counterPosition(reservationFee, previousPosition, profile, Math.max(1, round)),
    ),
  );

  return {
    reservationFee,
    statedFee,
    counterFee,
    patience: profile.patience,
  };
}

/** Explicit invariant used by the live evaluator and regression checks. */
export function sellingClubAcceptsFee(fee: number, position: SellingClubBargainingPosition): boolean {
  return Math.max(0, Math.round(fee)) >= position.reservationFee;
}
