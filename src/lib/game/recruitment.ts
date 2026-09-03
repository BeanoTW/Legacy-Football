/* =========================================================================
   RECRUITMENT IDENTITY FACADE
   -------------------------------------------------------------------------
   The recruitment engine predates opaque club IDs and historically treated
   GameState.clubName as both presentation and identity. The implementation is
   preserved verbatim in recruitmentLegacy.ts while this facade keeps every
   public state-taking entry point on the canonical user-club reference.

   This lets persisted ownership remain opaque without duplicating or rewriting
   the large transfer engine in one risky pass. `clubName` is restored before
   control leaves every call, including clone-returning UI helpers.

   New recruitment work should be identity-native. Once the legacy engine no
   longer reads clubName as identity, this facade can collapse back to a barrel.
========================================================================= */

import type { GameState } from "./types";
import { withCanonicalUserClubReference } from "./legacyUserClubBoundary";
import * as legacy from "./recruitmentLegacy";

export * from "./recruitmentLegacy";

type StateFirst = (state: GameState, ...args: any[]) => any;

function restoreReturnedDisplayName(value: unknown, displayName: string): void {
  if (!value || typeof value !== "object") return;

  const direct = value as Partial<GameState>;
  if (typeof direct.clubName === "string" && typeof direct.saveSeed === "string") {
    direct.clubName = displayName;
  }

  const boxed = value as { state?: Partial<GameState> };
  if (
    boxed.state &&
    typeof boxed.state === "object" &&
    typeof boxed.state.clubName === "string" &&
    typeof boxed.state.saveSeed === "string"
  ) {
    boxed.state.clubName = displayName;
  }
}

function identitySafe<F extends StateFirst>(fn: F): F {
  return ((state: GameState, ...args: Parameters<F> extends [GameState, ...infer R] ? R : never) => {
    const displayName = state.clubName;
    const result = withCanonicalUserClubReference(state, () => fn(state, ...args));
    restoreReturnedDisplayName(result, displayName);
    return result;
  }) as F;
}

// World/fidelity lifecycle.
export const generateWorld: typeof legacy.generateWorld = identitySafe(legacy.generateWorld);
export const reconcileRecruitmentFidelity: typeof legacy.reconcileRecruitmentFidelity = identitySafe(
  legacy.reconcileRecruitmentFidelity,
);
export const setWorldClubTrackedInPlace: typeof legacy.setWorldClubTrackedInPlace = identitySafe(
  legacy.setWorldClubTrackedInPlace,
);
export const setWorldClubTracked: typeof legacy.setWorldClubTracked = identitySafe(
  legacy.setWorldClubTracked,
);
export const ensureRecruitment: typeof legacy.ensureRecruitment = identitySafe(legacy.ensureRecruitment);

// Read models and squad architecture.
export const playerById: typeof legacy.playerById = identitySafe(legacy.playerById);
export const scoutingView: typeof legacy.scoutingView = identitySafe(legacy.scoutingView);
export const activeScoutingAssignments: typeof legacy.activeScoutingAssignments = identitySafe(
  legacy.activeScoutingAssignments,
);
export const scoutingCapacity: typeof legacy.scoutingCapacity = identitySafe(legacy.scoutingCapacity);
export const assignScout: typeof legacy.assignScout = identitySafe(legacy.assignScout);
export const contractById: typeof legacy.contractById = identitySafe(legacy.contractById);
export const activeContract: typeof legacy.activeContract = identitySafe(legacy.activeContract);
export const squadOf: typeof legacy.squadOf = identitySafe(legacy.squadOf);
export const userSquad: typeof legacy.userSquad = identitySafe(legacy.userSquad);
export const freeAgents: typeof legacy.freeAgents = identitySafe(legacy.freeAgents);
export const weeksLeftOnContract: typeof legacy.weeksLeftOnContract = identitySafe(
  legacy.weeksLeftOnContract,
);
export const squadGroup: typeof legacy.squadGroup = identitySafe(legacy.squadGroup);
export const syncLegacySquad: typeof legacy.syncLegacySquad = identitySafe(legacy.syncLegacySquad);

// Wage/budget/market reads.
export const clubWageBill: typeof legacy.clubWageBill = identitySafe(legacy.clubWageBill);
export const userWageBill: typeof legacy.userWageBill = identitySafe(legacy.userWageBill);
export const futureWageCommitments: typeof legacy.futureWageCommitments = identitySafe(
  legacy.futureWageCommitments,
);
export const transferSpendThisSeason: typeof legacy.transferSpendThisSeason = identitySafe(
  legacy.transferSpendThisSeason,
);
export const transferIncomeThisSeason: typeof legacy.transferIncomeThisSeason = identitySafe(
  legacy.transferIncomeThisSeason,
);
export const netSpendThisSeason: typeof legacy.netSpendThisSeason = identitySafe(
  legacy.netSpendThisSeason,
);
export const remainingTransferBudget: typeof legacy.remainingTransferBudget = identitySafe(
  legacy.remainingTransferBudget,
);
export const canAuthorisePurchase: typeof legacy.canAuthorisePurchase = identitySafe(
  legacy.canAuthorisePurchase,
);
export const canAuthoriseWage: typeof legacy.canAuthoriseWage = identitySafe(legacy.canAuthoriseWage);
export const askingPrice: typeof legacy.askingPrice = identitySafe(legacy.askingPrice);
export const clubGrowthFactor: typeof legacy.clubGrowthFactor = identitySafe(legacy.clubGrowthFactor);
export const wageDemand: typeof legacy.wageDemand = identitySafe(legacy.wageDemand);
export const availabilityReason: typeof legacy.availabilityReason = identitySafe(
  legacy.availabilityReason,
);
export const playerInterestAssessment: typeof legacy.playerInterestAssessment = identitySafe(
  legacy.playerInterestAssessment,
);
export const transferMarket: typeof legacy.transferMarket = identitySafe(legacy.transferMarket);

// Negotiation and transfer mutation boundary.
export const negotiationById: typeof legacy.negotiationById = identitySafe(legacy.negotiationById);
export const openNegotiations: typeof legacy.openNegotiations = identitySafe(legacy.openNegotiations);
export const openTransferNegotiationInPlace: typeof legacy.openTransferNegotiationInPlace = identitySafe(
  legacy.openTransferNegotiationInPlace,
);
export const evaluateClubResponseInPlace: typeof legacy.evaluateClubResponseInPlace = identitySafe(
  legacy.evaluateClubResponseInPlace,
);
export const counterClubOfferInPlace: typeof legacy.counterClubOfferInPlace = identitySafe(
  legacy.counterClubOfferInPlace,
);
export const evaluatePlayerResponseInPlace: typeof legacy.evaluatePlayerResponseInPlace = identitySafe(
  legacy.evaluatePlayerResponseInPlace,
);
export const improvePlayerTermsInPlace: typeof legacy.improvePlayerTermsInPlace = identitySafe(
  legacy.improvePlayerTermsInPlace,
);
export const withdrawNegotiationInPlace: typeof legacy.withdrawNegotiationInPlace = identitySafe(
  legacy.withdrawNegotiationInPlace,
);
export const respondToIncomingOfferInPlace: typeof legacy.respondToIncomingOfferInPlace = identitySafe(
  legacy.respondToIncomingOfferInPlace,
);
export const completeTransferInPlace: typeof legacy.completeTransferInPlace = identitySafe(
  legacy.completeTransferInPlace,
);
export const renewalTerms: typeof legacy.renewalTerms = identitySafe(legacy.renewalTerms);
export const renewContractInPlace: typeof legacy.renewContractInPlace = identitySafe(
  legacy.renewContractInPlace,
);
export const releasePlayerInPlace: typeof legacy.releasePlayerInPlace = identitySafe(
  legacy.releasePlayerInPlace,
);
export const setTransferStatusInPlace: typeof legacy.setTransferStatusInPlace = identitySafe(
  legacy.setTransferStatusInPlace,
);

// Weekly/season orchestration and chairman-facing summaries.
export const runRecruitmentWeek: typeof legacy.runRecruitmentWeek = identitySafe(
  legacy.runRecruitmentWeek,
);
export const closeRecruitmentSeason: typeof legacy.closeRecruitmentSeason = identitySafe(
  legacy.closeRecruitmentSeason,
);
export const rollRecruitmentToNewSeason: typeof legacy.rollRecruitmentToNewSeason = identitySafe(
  legacy.rollRecruitmentToNewSeason,
);
export const recruitmentSnapshot: typeof legacy.recruitmentSnapshot = identitySafe(
  legacy.recruitmentSnapshot,
);
export const contractSecurityPct: typeof legacy.contractSecurityPct = identitySafe(
  legacy.contractSecurityPct,
);
export const averageSquadAge: typeof legacy.averageSquadAge = identitySafe(legacy.averageSquadAge);
export const incomingTransfersThisSeason: typeof legacy.incomingTransfersThisSeason = identitySafe(
  legacy.incomingTransfersThisSeason,
);
export const renewalsThisSeason: typeof legacy.renewalsThisSeason = identitySafe(
  legacy.renewalsThisSeason,
);
export const shortlistIds: typeof legacy.shortlistIds = identitySafe(legacy.shortlistIds);
export const toggleShortlistInPlace: typeof legacy.toggleShortlistInPlace = identitySafe(
  legacy.toggleShortlistInPlace,
);
export const toggleShortlist: typeof legacy.toggleShortlist = identitySafe(legacy.toggleShortlist);

// Clone-returning UI actions. The generic wrapper restores the display name on
// both the input and any returned cloned GameState before the caller sees it.
export const submitTransferOffer: typeof legacy.submitTransferOffer = identitySafe(
  legacy.submitTransferOffer,
);
export const improveTransferOffer: typeof legacy.improveTransferOffer = identitySafe(
  legacy.improveTransferOffer,
);
export const improvePersonalTerms: typeof legacy.improvePersonalTerms = identitySafe(
  legacy.improvePersonalTerms,
);
export const withdrawFromTalks: typeof legacy.withdrawFromTalks = identitySafe(legacy.withdrawFromTalks);
export const completeTransfer: typeof legacy.completeTransfer = identitySafe(legacy.completeTransfer);
export const respondToIncomingOffer: typeof legacy.respondToIncomingOffer = identitySafe(
  legacy.respondToIncomingOffer,
);
export const renewContract: typeof legacy.renewContract = identitySafe(legacy.renewContract);
export const releasePlayer: typeof legacy.releasePlayer = identitySafe(legacy.releasePlayer);
export const setTransferStatus: typeof legacy.setTransferStatus = identitySafe(legacy.setTransferStatus);
