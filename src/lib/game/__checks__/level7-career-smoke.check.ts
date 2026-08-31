/* Fresh-save end-to-end shippability smoke for the playable Level 7 career.
   This intentionally crosses subsystem boundaries instead of retesting each
   subsystem in isolation.
   Run with: bun src/lib/game/__checks__/level7-career-smoke.check.ts
*/
import { advanceDay, advanceWeek, migrateSave, newGame } from "../engine";
import { reconcile } from "../finance";
import { footballLevelOfUser } from "../footballLevel";
import {
  MAX_NEGOTIATION_ROUNDS,
  canAuthorisePurchase,
  canAuthoriseWage,
  completeTransferInPlace,
  counterClubOfferInPlace,
  ensureRecruitment,
  improvePlayerTermsInPlace,
  negotiationById,
  openTransferNegotiationInPlace,
  transferMarket,
  userSquad,
  userWageBill,
} from "../recruitment";
import type { GameState, TransferNegotiation } from "../types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function reload(s: GameState): GameState {
  return migrateSave(JSON.parse(JSON.stringify(s)) as Record<string, unknown>);
}

function reachAffordableAgreement(s: GameState): TransferNegotiation | null {
  const targets = transferMarket(s)
    .filter((m) => m.clubId !== null)
    .filter((m) => canAuthorisePurchase(s, Math.round(m.askingPrice * 1.2)).allowed)
    .filter((m) => canAuthoriseWage(s, m.wageDemand).allowed)
    .sort((a, b) => a.askingPrice - b.askingPrice);

  for (const target of targets.slice(0, 80)) {
    const opened = openTransferNegotiationInPlace(
      s,
      target.player.id,
      Math.round(target.askingPrice * 1.2),
    );
    if (!opened.ok || !opened.negotiation) continue;

    let negotiation = opened.negotiation;
    for (let round = 0; round < MAX_NEGOTIATION_ROUNDS + 1; round++) {
      if (negotiation.stage === "agreed") return negotiation;
      if (negotiation.stage === "clubTalks") {
        const result = counterClubOfferInPlace(
          s,
          negotiation.id,
          Math.round(negotiation.fee * 1.3),
        );
        if (!result.ok) break;
      } else if (negotiation.stage === "playerTalks") {
        const requested = Math.round(
          negotiation.playerCounterWage ?? negotiation.proposedWeeklyWage * 1.25,
        );
        if (!canAuthoriseWage(s, requested).allowed) break;
        const result = improvePlayerTermsInPlace(s, negotiation.id, requested);
        if (!result.ok) break;
      } else {
        break;
      }
      negotiation = negotiationById(s, negotiation.id)!;
    }
  }
  return null;
}

let s = newGame("Shippability FC", "Test Chairman", "LEVEL7_CAREER_SMOKE");
ensureRecruitment(s);

assert(s.version === 15, `fresh save must use schema v15, got v${s.version}`);
assert(footballLevelOfUser(s) === 7, "fresh career must resolve to canonical Level 7");
assert(
  s.leagues.find((league) => league.id === s.playerLeagueId)?.tier === 5,
  "fresh Level 7 career must persist on tier 5",
);
assert(s.cash === 220_000, `fresh Level 7 cash must be £220,000, got £${s.cash}`);
assert((s.transferBudget ?? 0) === 0, "fresh save must keep the legacy transfer pot retired");
assert(
  (s.finance?.budgets?.wages ?? 0) >= 8_500,
  `fresh Level 7 wage authority must be at least £8,500/wk, got £${s.finance?.budgets?.wages ?? 0}`,
);
assert(userSquad(s).length > 0, "fresh career must have a playable squad");
assert(transferMarket(s).some((entry) => entry.player.currentClubId !== s.clubName), "fresh career must expose external recruitment targets");
assert(reconcile(s).ok, "fresh Level 7 finances must reconcile before recruitment");

const openingCash = s.cash;
const openingWages = userWageBill(s);
const openingSquad = userSquad(s).length;
const deal = reachAffordableAgreement(s);
assert(deal, "fresh Level 7 career must be able to reach one affordable contracted signing");
assert(canAuthorisePurchase(s, deal.fee + deal.proposedSigningBonus).allowed, "agreed Level 7 signing must remain affordable from club cash");
assert(canAuthoriseWage(s, deal.proposedWeeklyWage).allowed, "agreed Level 7 wage must remain within board wage authority");

const completed = completeTransferInPlace(s, deal.id);
assert(completed.ok, `fresh Level 7 signing must complete: ${completed.reason ?? "unknown failure"}`);
assert(userSquad(s).length === openingSquad + 1, "completed signing must add exactly one player to the squad");
assert(userWageBill(s) === openingWages + deal.proposedWeeklyWage, "completed signing must add the agreed wage to the weekly bill");
assert(
  s.cash === openingCash - deal.fee - deal.proposedSigningBonus,
  "completed signing must debit exactly fee plus signing bonus",
);
assert((s.transferBudget ?? 0) === 0, "signing must not recreate the retired transfer pot");
assert(reconcile(s).ok, "finances must reconcile immediately after the signing");

const afterSigning = reload(s);
assert(afterSigning.cash === s.cash, "save/reload must preserve post-signing cash exactly");
assert(userSquad(afterSigning).length === userSquad(s).length, "save/reload must preserve the signed squad");
assert(
  afterSigning.football.transferHistory.length === s.football.transferHistory.length,
  "save/reload must preserve transfer history without duplication",
);
assert(reconcile(afterSigning).ok, "reloaded post-signing finances must reconcile");

// Exercise both daily and direct-week progression because the playable UI can
// reach the weekly settlement through either route.
s = afterSigning;
for (let day = 0; day < 3; day++) s = advanceDay(s);
const cashBeforeWeek = s.cash;
s = advanceWeek(s);
assert(s.week >= 1, "fresh career must progress through the calendar after recruitment");
assert(Number.isFinite(s.cash), "calendar progression must keep cash finite");
assert(reconcile(s).ok, "finances must reconcile after mixed daily/weekly progression");
assert(
  s.financeLedger.length > 0 && s.cash !== cashBeforeWeek,
  "weekly settlement must leave an auditable financial effect",
);

const finalReload = reload(s);
assert(finalReload.week === s.week && finalReload.season === s.season, "save/reload must preserve progressed calendar state");
assert(finalReload.cash === s.cash && reconcile(finalReload).ok, "save/reload must preserve progressed finances exactly");
assert(footballLevelOfUser(finalReload) === 7, "early career progression must remain on Level 7 before promotion");

console.log("level7-career-smoke.check.ts: PASS");
