import type {
  GameState,
  LoanPlayingTimeExpectation,
  RecruitmentState,
} from "./types";
import {
  arrangeUserPlayerLoanIn,
  arrangeUserPlayerLoanOut,
  type LoanInOfferTerms,
  type LoanOutOfferTerms,
} from "./recruitmentLegacy";
import { hashString } from "./rng";
import {
  isTransferDeadlineDay,
  transferDeadlineHour,
} from "./calendar";
import { transferAbsoluteDay } from "./transferResponses";

export type LoanNegotiationDirection = "in" | "out";
export type LoanNegotiationStatus =
  | "awaitingClub"
  | "countered"
  | "ready"
  | "rejected"
  | "withdrawn"
  | "completed";

export type LoanNegotiationTerms = {
  durationWeeks: number;
  loanClubWageContributionPct: number;
  /** One-off fee paid by the loan club. Optional only for legacy/runtime callers. */
  loanFee?: number;
  playingTimeExpectation: LoanPlayingTimeExpectation;
};

export interface LoanNegotiation {
  id: string;
  direction: LoanNegotiationDirection;
  playerId: string;
  terms: LoanNegotiationTerms;
  counterTerms?: LoanNegotiationTerms;
  status: LoanNegotiationStatus;
  createdAtDay: number;
  updatedAtDay: number;
  pendingResponseAtDay?: number;
  pendingResponseAtHour?: number;
  responseReason?: string;
  linkedLoanId?: string;
}

declare module "./types" {
  interface RecruitmentState {
    loanNegotiations?: LoanNegotiation[];
    nextLoanNegotiationId?: number;
  }
}

export interface LoanNegotiationActionResult {
  ok: boolean;
  reason: string;
  negotiation?: LoanNegotiation;
}

const ROLE_ORDER: LoanPlayingTimeExpectation[] = [
  "Backup",
  "Rotation",
  "Regular",
  "Important",
];

function ensureLoanNegotiationsInPlace(state: GameState): void {
  state.football.loanNegotiations ??= [];
  state.football.nextLoanNegotiationId ??= 1;
}

function nextLoanNegotiationId(state: GameState): string {
  ensureLoanNegotiationsInPlace(state);
  const next = state.football.nextLoanNegotiationId!;
  state.football.nextLoanNegotiationId = next + 1;
  return `LN-${String(next).padStart(6, "0")}`;
}

function activeNegotiationForPlayer(
  state: GameState,
  playerId: string,
): LoanNegotiation | undefined {
  return (state.football.loanNegotiations ?? []).find(
    (row) =>
      row.playerId === playerId &&
      ["awaitingClub", "countered", "ready"].includes(row.status),
  );
}

function dueTiming(
  state: GameState,
  id: string,
): { day: number; hour?: number } {
  const currentDay = transferAbsoluteDay(state);
  const spread = (hashString(`${state.saveSeed}|loan-reply|${id}|${currentDay}`) >>> 0) % 2;
  if (isTransferDeadlineDay(state)) {
    return {
      day: currentDay,
      hour: Math.min(23, transferDeadlineHour(state) + 1 + spread),
    };
  }
  return { day: currentDay + 1 + spread };
}

function scheduleResponseInPlace(state: GameState, negotiation: LoanNegotiation): void {
  const due = dueTiming(state, negotiation.id);
  negotiation.pendingResponseAtDay = due.day;
  negotiation.pendingResponseAtHour = due.hour;
  negotiation.status = "awaitingClub";
  negotiation.updatedAtDay = transferAbsoluteDay(state);
  delete negotiation.responseReason;
}

function isResponseDue(state: GameState, negotiation: LoanNegotiation): boolean {
  if (negotiation.pendingResponseAtDay === undefined) return false;
  const currentDay = transferAbsoluteDay(state);
  if (negotiation.pendingResponseAtDay < currentDay) return true;
  if (negotiation.pendingResponseAtDay > currentDay) return false;
  if (negotiation.pendingResponseAtHour === undefined) return true;
  if (!isTransferDeadlineDay(state)) return true;
  return negotiation.pendingResponseAtHour <= transferDeadlineHour(state);
}

function cloneTerms(terms: LoanNegotiationTerms): LoanNegotiationTerms {
  return {
    ...terms,
    loanFee: Math.max(0, Math.round(terms.loanFee ?? 0)),
  };
}

function probe(
  state: GameState,
  direction: LoanNegotiationDirection,
  playerId: string,
  terms: LoanNegotiationTerms,
) {
  return direction === "in"
    ? arrangeUserPlayerLoanIn(state, playerId, terms as LoanInOfferTerms).result
    : arrangeUserPlayerLoanOut(state, playerId, terms as LoanOutOfferTerms).result;
}

function strongerRole(role: LoanPlayingTimeExpectation): LoanPlayingTimeExpectation {
  const index = ROLE_ORDER.indexOf(role);
  return ROLE_ORDER[Math.min(ROLE_ORDER.length - 1, index + 1)];
}

function weakerRole(role: LoanPlayingTimeExpectation): LoanPlayingTimeExpectation {
  const index = ROLE_ORDER.indexOf(role);
  return ROLE_ORDER[Math.max(0, index - 1)];
}

function counterCandidates(
  direction: LoanNegotiationDirection,
  terms: LoanNegotiationTerms,
  responseReason?: string,
): LoanNegotiationTerms[] {
  const candidates: LoanNegotiationTerms[] = [];
  const currentFee = Math.max(0, Math.round(terms.loanFee ?? 0));
  const feeMatch = responseReason?.match(/£([\d,]+) loan fee/i);
  const requestedFee = feeMatch ? Number(feeMatch[1].replace(/,/g, "")) : 0;
  if (direction === "in") {
    candidates.push(
      {
        ...terms,
        loanFee: Math.max(currentFee, requestedFee),
        loanClubWageContributionPct: Math.min(
          100,
          Math.max(terms.loanClubWageContributionPct + 15, 50),
        ),
      },
      {
        ...terms,
        loanFee: Math.max(currentFee, requestedFee),
        loanClubWageContributionPct: Math.min(
          100,
          Math.max(terms.loanClubWageContributionPct + 25, 65),
        ),
        playingTimeExpectation: strongerRole(terms.playingTimeExpectation),
      },
      {
        ...terms,
        loanFee: Math.max(currentFee, requestedFee),
        loanClubWageContributionPct: 100,
        playingTimeExpectation: "Important",
      },
    );
  } else {
    candidates.push(
      {
        ...terms,
        loanFee: Math.round(currentFee * 0.75),
        loanClubWageContributionPct: Math.max(
          0,
          terms.loanClubWageContributionPct - 15,
        ),
      },
      {
        ...terms,
        loanFee: Math.round(currentFee * 0.5),
        loanClubWageContributionPct: Math.max(
          0,
          terms.loanClubWageContributionPct - 30,
        ),
        playingTimeExpectation: weakerRole(terms.playingTimeExpectation),
      },
      {
        ...terms,
        loanFee: 0,
        loanClubWageContributionPct: 0,
        playingTimeExpectation: "Backup",
      },
    );
  }
  return candidates.filter(
    (candidate, index, all) =>
      all.findIndex(
        (other) =>
          other.durationWeeks === candidate.durationWeeks &&
          (other.loanFee ?? 0) === (candidate.loanFee ?? 0) &&
          other.loanClubWageContributionPct === candidate.loanClubWageContributionPct &&
          other.playingTimeExpectation === candidate.playingTimeExpectation,
      ) === index,
  );
}

function resolveClubResponseInPlace(
  state: GameState,
  negotiation: LoanNegotiation,
): void {
  const accepted = probe(
    state,
    negotiation.direction,
    negotiation.playerId,
    negotiation.terms,
  );
  delete negotiation.pendingResponseAtDay;
  delete negotiation.pendingResponseAtHour;
  negotiation.updatedAtDay = transferAbsoluteDay(state);

  if (accepted.ok) {
    negotiation.status = "ready";
    negotiation.responseReason = "Club accepted the proposed loan terms";
    delete negotiation.counterTerms;
    return;
  }

  for (const candidate of counterCandidates(
    negotiation.direction,
    negotiation.terms,
    accepted.reason,
  )) {
    const counter = probe(state, negotiation.direction, negotiation.playerId, candidate);
    if (!counter.ok) continue;
    negotiation.status = "countered";
    negotiation.counterTerms = candidate;
    negotiation.responseReason = accepted.reason;
    return;
  }

  negotiation.status = "rejected";
  negotiation.responseReason = accepted.reason;
  delete negotiation.counterTerms;
}

export function loanNegotiations(state: GameState): LoanNegotiation[] {
  return state.football?.loanNegotiations ?? [];
}

export function loanNegotiationById(
  state: GameState,
  negotiationId: string,
): LoanNegotiation | undefined {
  return loanNegotiations(state).find((row) => row.id === negotiationId);
}

export function openLoanNegotiation(
  state: GameState,
  direction: LoanNegotiationDirection,
  playerId: string,
  terms: LoanNegotiationTerms,
): { state: GameState; result: LoanNegotiationActionResult } {
  const next = structuredClone(state);
  ensureLoanNegotiationsInPlace(next);

  const existing = activeNegotiationForPlayer(next, playerId);
  if (existing) {
    return {
      state,
      result: {
        ok: false,
        reason: "There is already an active loan negotiation for this player",
        negotiation: existing,
      },
    };
  }

  const baseline = probe(next, direction, playerId, terms);
  const structuralFailure =
    !baseline.ok &&
    !/want at least|willing to meet those loan terms/i.test(baseline.reason);
  if (structuralFailure) {
    return { state, result: { ok: false, reason: baseline.reason } };
  }

  const now = transferAbsoluteDay(next);
  const negotiation: LoanNegotiation = {
    id: nextLoanNegotiationId(next),
    direction,
    playerId,
    terms: cloneTerms(terms),
    status: "awaitingClub",
    createdAtDay: now,
    updatedAtDay: now,
  };
  scheduleResponseInPlace(next, negotiation);
  next.football.loanNegotiations!.push(negotiation);

  return {
    state: next,
    result: {
      ok: true,
      reason: "Loan proposal sent. The club will respond in due course.",
      negotiation,
    },
  };
}

export function reviseLoanNegotiation(
  state: GameState,
  negotiationId: string,
  terms: LoanNegotiationTerms,
): { state: GameState; result: LoanNegotiationActionResult } {
  const next = structuredClone(state);
  const negotiation = loanNegotiationById(next, negotiationId);
  if (!negotiation) return { state, result: { ok: false, reason: "Loan negotiation not found" } };
  if (!["countered", "ready"].includes(negotiation.status)) {
    return {
      state,
      result: { ok: false, reason: "The club is not waiting for revised loan terms", negotiation },
    };
  }

  negotiation.terms = cloneTerms(terms);
  delete negotiation.counterTerms;
  scheduleResponseInPlace(next, negotiation);
  return {
    state: next,
    result: { ok: true, reason: "Revised loan terms sent", negotiation },
  };
}

export function acceptLoanCounter(
  state: GameState,
  negotiationId: string,
): { state: GameState; result: LoanNegotiationActionResult } {
  const next = structuredClone(state);
  const negotiation = loanNegotiationById(next, negotiationId);
  if (!negotiation) return { state, result: { ok: false, reason: "Loan negotiation not found" } };
  if (negotiation.status !== "countered" || !negotiation.counterTerms) {
    return {
      state,
      result: { ok: false, reason: "There is no club counter-offer to accept", negotiation },
    };
  }

  negotiation.terms = cloneTerms(negotiation.counterTerms);
  delete negotiation.counterTerms;
  negotiation.status = "ready";
  negotiation.responseReason = "Counter-offer accepted";
  negotiation.updatedAtDay = transferAbsoluteDay(next);
  return {
    state: next,
    result: { ok: true, reason: "Counter-offer accepted", negotiation },
  };
}

export function completeLoanNegotiation(
  state: GameState,
  negotiationId: string,
): { state: GameState; result: LoanNegotiationActionResult } {
  const negotiation = loanNegotiationById(state, negotiationId);
  if (!negotiation) return { state, result: { ok: false, reason: "Loan negotiation not found" } };
  if (negotiation.status !== "ready") {
    return {
      state,
      result: { ok: false, reason: "Loan terms are not agreed yet", negotiation },
    };
  }

  const completed =
    negotiation.direction === "in"
      ? arrangeUserPlayerLoanIn(state, negotiation.playerId, negotiation.terms)
      : arrangeUserPlayerLoanOut(state, negotiation.playerId, negotiation.terms);
  if (!completed.result.ok) {
    const next = structuredClone(state);
    const live = loanNegotiationById(next, negotiationId)!;
    live.status = "rejected";
    live.responseReason = completed.result.reason;
    live.updatedAtDay = transferAbsoluteDay(next);
    return {
      state: next,
      result: {
        ok: false,
        reason: completed.result.reason,
        negotiation: live,
      },
    };
  }

  const live = loanNegotiationById(completed.state, negotiationId)!;
  live.status = "completed";
  live.linkedLoanId = completed.result.loan?.id;
  live.responseReason = completed.result.reason;
  live.updatedAtDay = transferAbsoluteDay(completed.state);
  return {
    state: completed.state,
    result: {
      ok: true,
      reason: completed.result.reason,
      negotiation: live,
    },
  };
}

export function withdrawLoanNegotiation(
  state: GameState,
  negotiationId: string,
): { state: GameState; result: LoanNegotiationActionResult } {
  const next = structuredClone(state);
  const negotiation = loanNegotiationById(next, negotiationId);
  if (!negotiation) return { state, result: { ok: false, reason: "Loan negotiation not found" } };
  if (["completed", "rejected", "withdrawn"].includes(negotiation.status)) {
    return {
      state,
      result: { ok: false, reason: "Loan negotiation is already closed", negotiation },
    };
  }
  negotiation.status = "withdrawn";
  negotiation.updatedAtDay = transferAbsoluteDay(next);
  delete negotiation.pendingResponseAtDay;
  delete negotiation.pendingResponseAtHour;
  delete negotiation.counterTerms;
  return {
    state: next,
    result: { ok: true, reason: "Loan negotiation withdrawn", negotiation },
  };
}

export function processDueLoanNegotiationResponsesInPlace(state: GameState): number {
  if (!state.football?.loanNegotiations?.length) return 0;
  let processed = 0;
  for (const negotiation of state.football.loanNegotiations) {
    if (negotiation.status !== "awaitingClub" || !isResponseDue(state, negotiation)) continue;
    resolveClubResponseInPlace(state, negotiation);
    processed++;
  }
  return processed;
}
