import type { GameState } from "./types";
import { processDueTransferResponsesInPlace as processDueExternalTransferResponsesInPlace } from "./datedRecruitment";
import { processDueTransferRegistrationsInPlace } from "./transferRegistration";

/**
 * Resolve every day-scale transfer event that can mature through Advance.
 * External replies resolve first; registration can then complete on the same
 * presentation day without creating a second engine orchestration path.
 */
export function processDueTransferResponsesInPlace(state: GameState): void {
  processDueExternalTransferResponsesInPlace(state);
  processDueTransferRegistrationsInPlace(state);
}
