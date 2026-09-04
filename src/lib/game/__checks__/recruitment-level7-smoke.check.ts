import { newGame } from "../engine";
import {
  MAX_NEGOTIATION_ROUNDS,
  askingPrice,
  canAuthoriseWage,
  beginTransferRegistrationInPlace,
  completeTransferInPlace,
  counterClubOfferInPlace,
  improvePlayerTermsInPlace,
  negotiationById,
  openTransferNegotiationInPlace,
  transferMarket,
  userSquad,
} from "../recruitment";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const state = newGame("Level 7 Smoke FC", "Auditor", "LEVEL7_RECRUITMENT_SMOKE");
const candidates = transferMarket(state)
  .filter(
    (entry) =>
      entry.clubId !== null &&
      entry.askingPrice > 0 &&
      entry.askingPrice <= state.cash &&
      canAuthoriseWage(state, entry.wageDemand).allowed,
  )
  .sort((a, b) => a.askingPrice - b.askingPrice || a.wageDemand - b.wageDemand);

assert(
  candidates.length > 0,
  "expected at least one contracted Level 7 target affordable on both fee and wage headroom",
);
const target = candidates[0];
const canonicalAsk = askingPrice(state, target.player);
assert(target.askingPrice === canonicalAsk, "market asking price must use the canonical selector");
assert(canonicalAsk > 0, "contracted Level 7 targets must have a positive asking price");
assert(canonicalAsk <= state.cash, "selected contracted target must be affordable from opening cash");
assert(
  canAuthoriseWage(state, target.wageDemand).allowed,
  "selected contracted target must fit the opening wage ceiling at his quoted demand",
);

const opened = openTransferNegotiationInPlace(
  state,
  target.player.id,
  Math.round(canonicalAsk * 1.2),
);
assert(opened.ok && opened.negotiation, `expected approach to open: ${opened.reason}`);
let negotiation = opened.negotiation;

for (let round = 0; round <= MAX_NEGOTIATION_ROUNDS + 1 && negotiation.stage !== "agreed"; round++) {
  if (negotiation.stage === "clubTalks") {
    const nextFee = Math.max(
      negotiation.fee + 1,
      negotiation.clubCounterFee ?? Math.round(canonicalAsk * 1.35),
    );
    const result = counterClubOfferInPlace(state, negotiation.id, nextFee);
    assert(result.ok, `club counter should remain actionable: ${result.reason}`);
  } else if (negotiation.stage === "playerTalks") {
    const requestedWage = Math.max(
      negotiation.proposedWeeklyWage + 1,
      negotiation.playerCounterWage ?? Math.round(negotiation.proposedWeeklyWage * 1.3),
    );
    const wageAuth = canAuthoriseWage(state, requestedWage);
    assert(wageAuth.allowed, `selected target should remain wage-affordable in talks: ${wageAuth.reason}`);
    const result = improvePlayerTermsInPlace(state, negotiation.id, requestedWage);
    assert(result.ok, `player counter should remain actionable: ${result.reason}`);
  } else {
    break;
  }
  negotiation = negotiationById(state, negotiation.id)!;
}

assert(negotiation.stage === "agreed", `expected a reachable Level 7 agreement, got ${negotiation.stage}`);
const finalWageAuth = canAuthoriseWage(state, negotiation.proposedWeeklyWage);
assert(finalWageAuth.allowed, `agreed Level 7 wage must fit the ceiling: ${finalWageAuth.reason}`);
const squadBefore = userSquad(state).length;
const cashBefore = state.cash;
const registration = beginTransferRegistrationInPlace(state, negotiation.id);
assert(registration.ok, `expected agreed Level 7 deal to enter registration: ${registration.reason}`);
assert(
  negotiationById(state, negotiation.id)?.stage === "registration",
  "Level 7 deal should persist registration before completion",
);
const completed = completeTransferInPlace(state, negotiation.id);
assert(completed.ok, `expected agreed Level 7 deal to complete: ${completed.reason}`);
assert(userSquad(state).length === squadBefore + 1, "completed deal must add exactly one player");
assert(
  state.cash === cashBefore - negotiation.fee - negotiation.proposedSigningBonus,
  "completed deal must debit the canonical fee and signing bonus",
);
assert((state.transferBudget ?? 0) === 0, "legacy transfer pot must remain retired after recruitment");

console.log("recruitment-level7-smoke.check.ts: PASS");
