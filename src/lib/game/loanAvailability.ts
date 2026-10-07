import type { GameState, LoanPlayingTimeExpectation } from "./types";
import { absoluteWeek } from "./time";
import { transferAbsoluteDay } from "./transferResponses";
import {
  activeContract,
  arrangeUserPlayerLoanOut,
  userSquad,
} from "./recruitmentLegacy";
import { activeLoanForPlayer } from "./loans";
import { isUserClubReference } from "./clubReference";
import { playerOwnerClubId, playerRegisteredClubId } from "./playerRegistration";

export interface LoanAvailabilityTerms {
  durationWeeks: number;
  loanClubWageContributionPct: number;
  playingTimeExpectation: LoanPlayingTimeExpectation;
}

export interface LoanAvailabilityListing {
  playerId: string;
  listedAtAbsoluteWeek: number;
  listedAtDay: number;
  preferredTerms: LoanAvailabilityTerms;
  interestedClubIds: string[];
  lastInterestCheckDay?: number;
}

declare module "./types" {
  interface RecruitmentState {
    loanAvailability?: LoanAvailabilityListing[];
  }
}

const DEFAULT_TERMS: LoanAvailabilityTerms = {
  durationWeeks: 12,
  loanClubWageContributionPct: 40,
  playingTimeExpectation: "Rotation",
};

function ensureLoanAvailabilityInPlace(state: GameState): void {
  state.football.loanAvailability ??= [];
}

export function loanAvailabilityListings(state: GameState): LoanAvailabilityListing[] {
  return state.football?.loanAvailability ?? [];
}

export function loanAvailabilityForPlayer(
  state: GameState,
  playerId: string,
): LoanAvailabilityListing | undefined {
  return loanAvailabilityListings(state).find((row) => row.playerId === playerId);
}

function validateTerms(terms: LoanAvailabilityTerms): string | null {
  if (!Number.isInteger(terms.durationWeeks) || terms.durationWeeks < 1) {
    return "Loan duration must be at least one week";
  }
  if (
    !Number.isFinite(terms.loanClubWageContributionPct) ||
    terms.loanClubWageContributionPct < 0 ||
    terms.loanClubWageContributionPct > 100
  ) {
    return "Loan wage contribution must be between 0% and 100%";
  }
  return null;
}

export function setPlayerAvailableForLoan(
  state: GameState,
  playerId: string,
  preferredTerms: Partial<LoanAvailabilityTerms> = {},
): { state: GameState; ok: boolean; reason: string } {
  const next = structuredClone(state);
  ensureLoanAvailabilityInPlace(next);
  const player = next.football.players.find((row) => row.id === playerId);
  if (!player) return { state, ok: false, reason: "Player not found" };
  if (!isUserClubReference(next, playerOwnerClubId(player))) {
    return { state, ok: false, reason: "Only your own players can be made available for loan" };
  }
  if (!isUserClubReference(next, playerRegisteredClubId(player))) {
    return { state, ok: false, reason: "Player is already registered away from the club" };
  }
  if (!activeContract(next, playerId)) {
    return { state, ok: false, reason: "Player needs a live contract before being offered for loan" };
  }
  if (activeLoanForPlayer(next, playerId)) {
    return { state, ok: false, reason: "Player already has an active loan" };
  }

  const terms: LoanAvailabilityTerms = {
    ...DEFAULT_TERMS,
    ...preferredTerms,
  };
  const invalid = validateTerms(terms);
  if (invalid) return { state, ok: false, reason: invalid };

  const existing = loanAvailabilityForPlayer(next, playerId);
  if (existing) {
    existing.preferredTerms = terms;
    return { state: next, ok: true, reason: "Loan availability updated" };
  }

  next.football.loanAvailability!.push({
    playerId,
    listedAtAbsoluteWeek: absoluteWeek(next.season, next.week),
    listedAtDay: transferAbsoluteDay(next),
    preferredTerms: terms,
    interestedClubIds: [],
  });
  return { state: next, ok: true, reason: "Player made available for loan" };
}

export function removePlayerLoanAvailability(
  state: GameState,
  playerId: string,
): { state: GameState; ok: boolean; reason: string } {
  const next = structuredClone(state);
  ensureLoanAvailabilityInPlace(next);
  const before = next.football.loanAvailability!.length;
  next.football.loanAvailability = next.football.loanAvailability!.filter(
    (row) => row.playerId !== playerId,
  );
  if (next.football.loanAvailability.length === before) {
    return { state, ok: false, reason: "Player is not currently available for loan" };
  }
  return { state: next, ok: true, reason: "Player removed from the loan market" };
}

export function clearLoanAvailabilityInPlace(state: GameState, playerId: string): void {
  ensureLoanAvailabilityInPlace(state);
  state.football.loanAvailability = state.football.loanAvailability!.filter(
    (row) => row.playerId !== playerId,
  );
}

/**
 * A listing creates market visibility, not an instant move. Once per new
 * calendar day we probe the existing deterministic loan market with the
 * chairman's preferred terms. A willing destination is recorded as interest;
 * registration still requires an explicit negotiation and final approval.
 */
export function progressLoanAvailabilityInterestInPlace(state: GameState): number {
  ensureLoanAvailabilityInPlace(state);
  const today = transferAbsoluteDay(state);
  let added = 0;

  for (const listing of state.football.loanAvailability!) {
    if (listing.lastInterestCheckDay !== undefined && listing.lastInterestCheckDay >= today) continue;
    listing.lastInterestCheckDay = today;
    if (today <= listing.listedAtDay) continue;
    if (activeLoanForPlayer(state, listing.playerId)) continue;
    if (!userSquad(state).some((player) => player.id === listing.playerId)) continue;

    const probe = arrangeUserPlayerLoanOut(
      state,
      listing.playerId,
      listing.preferredTerms,
    );
    const clubId = probe.result.loan?.loanClubId;
    if (!probe.result.ok || !clubId || listing.interestedClubIds.includes(clubId)) continue;
    listing.interestedClubIds.push(clubId);
    added++;
  }

  return added;
}
