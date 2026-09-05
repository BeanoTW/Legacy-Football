import type {
  GameState,
  LoanPlayingTimeExpectation,
  PlayerLoanAgreement,
} from "./types";
import { absoluteWeek } from "./time";
import { sameClubReference } from "./clubReference";
import {
  playerOwnerClubId,
  playerRegisteredClubId,
  setPlayerClubIdentityInPlace,
} from "./playerRegistration";

export interface LoanActionResult {
  ok: boolean;
  reason: string;
  loan?: PlayerLoanAgreement;
}

export function ensureLoanStateInPlace(state: GameState): void {
  state.football.loans ??= [];
  state.football.nextLoanId ??= 1;
}

export function activeLoanForPlayer(
  state: GameState,
  playerId: string,
): PlayerLoanAgreement | undefined {
  return (state.football.loans ?? []).find(
    (loan) => loan.playerId === playerId && loan.status === "Active",
  );
}

/**
 * Net weekly payroll adjustment created by active loan wage-sharing for one
 * club. Negative = parent-club relief; positive = loan-club contribution.
 * The underlying player contract remains owned and stored only by the parent.
 */
export function loanWageAdjustmentForClub(state: GameState, clubId: string): number {
  let adjustment = 0;
  const liveContracts = state.football?.contracts ?? [];

  for (const loan of state.football?.loans ?? []) {
    if (loan.status !== "Active") continue;
    const contract = liveContracts.find(
      (row) =>
        row.playerId === loan.playerId &&
        (row.status === "Active" || row.status === "Expiring") &&
        sameClubReference(state, row.clubId, loan.parentClubId),
    );
    if (!contract) continue;

    const contribution = Math.round(
      (contract.weeklyWage * loan.loanClubWageContributionPct) / 100,
    );
    if (sameClubReference(state, clubId, loan.parentClubId)) adjustment -= contribution;
    if (sameClubReference(state, clubId, loan.loanClubId)) adjustment += contribution;
  }

  return adjustment;
}

function nextLoanId(state: GameState): string {
  ensureLoanStateInPlace(state);
  const next = state.football.nextLoanId!;
  state.football.nextLoanId = next + 1;
  return `PL-${String(next).padStart(6, "0")}`;
}

/**
 * Low-level canonical loan start. It changes playing registration only;
 * ownership and the existing parent-club contract remain untouched.
 */
export function startPlayerLoanInPlace(
  state: GameState,
  playerId: string,
  loanClubId: string,
  durationWeeks: number,
  loanClubWageContributionPct: number,
  playingTimeExpectation: LoanPlayingTimeExpectation,
): LoanActionResult {
  ensureLoanStateInPlace(state);
  const player = state.football.players.find((row) => row.id === playerId);
  if (!player) return { ok: false, reason: "Player not found" };

  const parentClubId = playerOwnerClubId(player);
  const registeredClubId = playerRegisteredClubId(player);
  if (!parentClubId) return { ok: false, reason: "Free agents cannot be loaned" };
  if (registeredClubId !== parentClubId)
    return { ok: false, reason: "Player is already registered away from his parent club" };
  if (loanClubId === parentClubId)
    return { ok: false, reason: "Loan club must differ from the parent club" };
  if (!Number.isInteger(durationWeeks) || durationWeeks < 1)
    return { ok: false, reason: "Loan duration must be at least one week" };
  if (
    !Number.isFinite(loanClubWageContributionPct) ||
    loanClubWageContributionPct < 0 ||
    loanClubWageContributionPct > 100
  ) {
    return { ok: false, reason: "Loan wage contribution must be between 0% and 100%" };
  }
  if (activeLoanForPlayer(state, playerId))
    return { ok: false, reason: "Player already has an active loan" };

  const parentContract = state.football.contracts.find(
    (contract) =>
      contract.playerId === playerId &&
      contract.clubId === parentClubId &&
      (contract.status === "Active" || contract.status === "Expiring"),
  );
  if (!parentContract)
    return { ok: false, reason: "Player needs a live parent-club contract before a loan" };

  const startAbsoluteWeek = absoluteWeek(state.season, state.week);
  const endAbsoluteWeek = startAbsoluteWeek + durationWeeks;
  const parentContractEnd = absoluteWeek(parentContract.expirySeason, parentContract.expiryWeek);
  if (endAbsoluteWeek > parentContractEnd) {
    return { ok: false, reason: "Loan cannot run beyond the parent-club contract" };
  }

  const loan: PlayerLoanAgreement = {
    id: nextLoanId(state),
    playerId,
    parentClubId,
    loanClubId,
    startAbsoluteWeek,
    endAbsoluteWeek,
    loanClubWageContributionPct: Math.round(loanClubWageContributionPct),
    playingTimeExpectation,
    status: "Active",
  };

  state.football.loans!.push(loan);
  setPlayerClubIdentityInPlace(player, parentClubId, loanClubId);
  return { ok: true, reason: "Loan started", loan };
}

export function endPlayerLoanInPlace(
  state: GameState,
  loanId: string,
  outcome: "Completed" | "Terminated" = "Completed",
): LoanActionResult {
  ensureLoanStateInPlace(state);
  const loan = state.football.loans!.find((row) => row.id === loanId);
  if (!loan) return { ok: false, reason: "Loan not found" };
  if (loan.status !== "Active") return { ok: false, reason: "Loan is no longer active", loan };

  const player = state.football.players.find((row) => row.id === loan.playerId);
  if (!player) return { ok: false, reason: "Loan player not found", loan };

  if (playerOwnerClubId(player) !== loan.parentClubId)
    return { ok: false, reason: "Player ownership no longer matches the loan agreement", loan };

  loan.status = outcome;
  loan.endedAbsoluteWeek = absoluteWeek(state.season, state.week);
  setPlayerClubIdentityInPlace(player, loan.parentClubId);
  return { ok: true, reason: outcome === "Completed" ? "Loan completed" : "Loan terminated", loan };
}

/** Complete every due loan exactly once and return the players to their parent clubs. */
export function processDuePlayerLoansInPlace(state: GameState): number {
  ensureLoanStateInPlace(state);
  const now = absoluteWeek(state.season, state.week);
  let completed = 0;
  for (const loan of state.football.loans!) {
    if (loan.status !== "Active" || loan.endAbsoluteWeek > now) continue;
    const result = endPlayerLoanInPlace(state, loan.id, "Completed");
    if (result.ok) completed++;
  }
  return completed;
}
