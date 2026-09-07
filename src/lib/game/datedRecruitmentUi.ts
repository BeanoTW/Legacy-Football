import type { GameState, SquadRole } from "./types";
import {
  counterClubOfferInPlace,
  improvePlayerTermsInPlace,
  openTransferEnquiryInPlace,
  openTransferNegotiationInPlace,
  submitEnquiryOfferInPlace,
  withdrawNegotiationInPlace,
} from "./datedRecruitment";

const cloned = <T>(
  state: GameState,
  mutate: (working: GameState) => T,
): { state: GameState; result: T } => {
  const working = structuredClone(state);
  return { state: working, result: mutate(working) };
};

export const submitTransferOffer = (
  state: GameState,
  playerId: string,
  fee: number,
  role?: SquadRole,
  openingWeeklyWage?: number,
) => cloned(state, (working) => openTransferNegotiationInPlace(working, playerId, fee, role, openingWeeklyWage));

export const submitTransferEnquiry = (
  state: GameState,
  playerId: string,
  role?: SquadRole,
  openingWeeklyWage?: number,
) => cloned(state, (working) => openTransferEnquiryInPlace(working, playerId, role, openingWeeklyWage));

export const submitEnquiryOffer = (state: GameState, id: string, fee?: number) =>
  cloned(state, (working) => submitEnquiryOfferInPlace(working, id, fee));

export const improveTransferOffer = (state: GameState, id: string, fee?: number) =>
  cloned(state, (working) => counterClubOfferInPlace(working, id, fee));

export const improvePersonalTerms = (
  state: GameState,
  id: string,
  wage?: number,
  seasons?: number,
  role?: SquadRole,
) => cloned(state, (working) => improvePlayerTermsInPlace(working, id, wage, seasons, role));

export const withdrawFromTalks = (state: GameState, id: string) =>
  cloned(state, (working) => withdrawNegotiationInPlace(working, id));
