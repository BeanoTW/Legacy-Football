/* =========================================================================
   RECRUITMENT PUBLIC SURFACE
   -------------------------------------------------------------------------
   The canonical mutation engine remains synchronous and deterministic.
   Chairman-facing actions are explicitly wrapped by the dated adapter so UI
   interactions wait for their scheduled club/player response.
========================================================================= */

export * from "./transferResponses";
export * from "./recruitmentLegacy";
export { processDueTransferResponsesInPlace } from "./transferEvents";
export {
  beginTransferRegistration,
  completeTransfer,
  processDueTransferRegistrationsInPlace,
} from "./transferRegistration";
export {
  improvePersonalTerms,
  improveTransferOffer,
  submitEnquiryOffer,
  submitTransferEnquiry,
  submitTransferOffer,
  withdrawFromTalks,
} from "./datedRecruitmentUi";
