import type { GameState } from "./types";
import { processDueTransferResponsesInPlace as processDueExternalTransferResponsesInPlace } from "./datedRecruitment";
import { processDueTransferRegistrationsInPlace } from "./transferRegistration";
import { processDueSellingClubResponsesInPlace } from "./sellingClubTransferEvents";
import { processTransferMarketDynamicsInPlace } from "./transferMarketDynamics";

/**
 * Resolve every day-scale transfer event that can mature through Advance.
 * Selling-club replies use the shared bargaining model first; the dated
 * adapter then resolves enquiry/player replies, preserving one event clock.
 * Registration can complete on the same presentation day without creating a
 * second engine orchestration path.
 */
export function processDueTransferResponsesInPlace(state: GameState): void {
  processDueSellingClubResponsesInPlace(state);
  // Let market pressure exist before today's club/player reply is evaluated,
  // so a rival package influences the response instead of appearing one frame
  // after terms were just accepted.
  processTransferMarketDynamicsInPlace(state);
  processDueExternalTransferResponsesInPlace(state);
  processDueTransferRegistrationsInPlace(state);
}
