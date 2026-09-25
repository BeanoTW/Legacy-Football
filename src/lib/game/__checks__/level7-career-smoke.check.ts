/* Fresh-save end-to-end shippability smoke for the playable Level 7 career.
   This intentionally crosses subsystem boundaries instead of retesting each
   subsystem in isolation.
   Run with: bun src/lib/game/__checks__/level7-career-smoke.check.ts
*/
import { advanceDay, advanceWeek, migrateSave, newGame, SAVE_VERSION } from "../engine";
import { reconcile } from "../finance";
import { footballLevelOfUser } from "../footballLevel";
import { isUserClubReference } from "../clubReference";
import {
  MAX_NEGOTIATION_ROUNDS,
  arrangeUserPlayerLoanIn,
  arrangeUserPlayerLoanOut,
  canAuthorisePurchase,
  canAuthoriseWage,
  beginTransferRegistrationInPlace,
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
import { activeLoanForPlayer } from "../loans";
import { playerOwnerClubId, playerRegisteredClubId } from "../playerRegistration";
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

assert(s.version === SAVE_VERSION, `fresh save must use schema v${SAVE_VERSION}, got v${s.version}`);
assert(footballLevelOfUser(s) === 7, "fresh career must resolve to canonical Level 7");
assert(
  s.leagues.find((league) => league.id === s.playerLeagueId)?.tier === 7,
  "fresh Level 7 career must persist on canonical tier 7",
);
assert(s.cash === 220_000, `fresh Level 7 cash must be £220,000, got £${s.cash}`);
assert((s.transferBudget ?? 0) === 0, "fresh save must keep the legacy transfer pot retired");
assert(
  (s.finance?.budgets?.wages ?? 0) >= 8_500,
  `fresh Level 7 wage authority must be at least £8,500/wk, got £${s.finance?.budgets?.wages ?? 0}`,
);
assert(userSquad(s).length > 0, "fresh career must have a playable squad");
assert(
  transferMarket(s).some(
    (entry) => entry.player.currentClubId !== null && !isUserClubReference(s, entry.player.currentClubId),
  ),
  "fresh career must expose external recruitment targets",
);
assert(reconcile(s).ok, "fresh Level 7 finances must reconcile before recruitment");

const openingCash = s.cash;
const openingWages = userWageBill(s);
const openingSquad = userSquad(s).length;
const deal = reachAffordableAgreement(s);
assert(deal, "fresh Level 7 career must be able to reach one affordable contracted signing");
assert(canAuthorisePurchase(s, deal.fee + deal.proposedSigningBonus).allowed, "agreed Level 7 signing must remain affordable from club cash");
assert(canAuthoriseWage(s, deal.proposedWeeklyWage).allowed, "agreed Level 7 wage must remain within board wage authority");

const registration = beginTransferRegistrationInPlace(s, deal.id);
assert(
  registration.ok,
  `fresh Level 7 signing must enter registration: ${registration.reason ?? "unknown failure"}`,
);
assert(deal.stage === "registration", "fresh Level 7 signing must persist registration before completion");
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

// Beta shippability: drive the same career through two complete season
// rollovers, reloading at each boundary. This catches cross-system failures
// that only emerge after repeated recruitment, payroll, careers, world
// fidelity and history maintenance.
s = finalReload;

// Put one real chairman loan through the live career before the long run. The
// agreement must survive weekly systems, end on schedule and restore the
// player's parent ownership/registration without manual cleanup.
const loanCandidate = userSquad(s)
  .slice()
  .sort((a, b) => a.currentAbility - b.currentAbility || a.id.localeCompare(b.id))
  .find((player) => Boolean(player.contractId));
assert(loanCandidate, "multi-season smoke needs one contracted player available to loan out");
const loanStart = arrangeUserPlayerLoanOut(s, loanCandidate.id, {
  durationWeeks: 4,
  loanClubWageContributionPct: 20,
  playingTimeExpectation: "Backup",
});
assert(loanStart.result.ok, `career loan-out must be accepted: ${loanStart.result.reason}`);
assert(loanStart.result.loan, "career loan-out must persist an agreement");
s = loanStart.state;
const smokeLoanId = loanStart.result.loan.id;
const smokeLoanPlayerId = loanCandidate.id;
assert(
  activeLoanForPlayer(s, smokeLoanPlayerId)?.id === smokeLoanId,
  "career loan-out must be active before long-run progression",
);

// Borrow one external player through the same chairman-facing market path.
// Try deterministic external candidates until a parent club accepts maximum
// wage support and an Important playing-time commitment.
let borrowState: GameState | null = null;
let borrowPlayerId: string | null = null;
let borrowParentClubId: string | null = null;
for (const candidate of s.football.players
  .filter((player) => {
    const owner = playerOwnerClubId(player);
    const registered = playerRegisteredClubId(player);
    return (
      owner !== null &&
      registered !== null &&
      !isUserClubReference(s, owner) &&
      !isUserClubReference(s, registered) &&
      owner === registered &&
      Boolean(player.contractId)
    );
  })
  .sort((a, b) => a.currentAbility - b.currentAbility || a.id.localeCompare(b.id))) {
  const attempted = arrangeUserPlayerLoanIn(s, candidate.id, {
    durationWeeks: 4,
    loanClubWageContributionPct: 100,
    playingTimeExpectation: "Important",
  });
  if (!attempted.result.ok) continue;
  borrowState = attempted.state;
  borrowPlayerId = candidate.id;
  borrowParentClubId = playerOwnerClubId(candidate);
  break;
}
assert(borrowState && borrowPlayerId && borrowParentClubId, "career smoke must find one borrowable external player");
s = borrowState;
const smokeBorrowLoan = activeLoanForPlayer(s, borrowPlayerId);
assert(smokeBorrowLoan, "career loan-in must be active before long-run progression");
const smokeBorrowLoanId = smokeBorrowLoan.id;

// Let both four-week agreements run to their due boundary before the longer
// career simulation. Ownership/registration are asserted immediately on
// return, before later AI transfer activity is allowed to move either player.
for (let i = 0; i < 5; i++) {
  s = advanceWeek(s);
  assert(Number.isFinite(s.cash), `loan lifecycle must keep cash finite at S${s.season} W${s.week}`);
  assert(reconcile(s).ok, "finances must reconcile while short loans settle");
}
assert(
  activeLoanForPlayer(s, smokeLoanPlayerId) === undefined,
  "short outgoing career loan must end on schedule",
);
const returnedLoanPlayer = s.football.players.find((player) => player.id === smokeLoanPlayerId);
assert(returnedLoanPlayer, "loaned player must still exist immediately after return");
assert(
  isUserClubReference(s, playerOwnerClubId(returnedLoanPlayer)),
  "completed outgoing loan must restore user-club ownership",
);
assert(
  isUserClubReference(s, playerRegisteredClubId(returnedLoanPlayer)),
  "completed outgoing loan must restore user-club registration",
);
assert(
  s.football.loans?.find((loan) => loan.id === smokeLoanId)?.status === "Completed",
  "outgoing career loan agreement must finish as completed history",
);
assert(
  activeLoanForPlayer(s, borrowPlayerId) === undefined,
  "short incoming career loan must end on schedule",
);
const returnedBorrowPlayer = s.football.players.find((player) => player.id === borrowPlayerId);
assert(returnedBorrowPlayer, "borrowed player must still exist immediately after return");
assert(
  playerOwnerClubId(returnedBorrowPlayer) === borrowParentClubId,
  "completed incoming loan must preserve parent-club ownership",
);
assert(
  playerRegisteredClubId(returnedBorrowPlayer) === borrowParentClubId,
  "completed incoming loan must restore parent-club registration",
);
assert(
  s.football.loans?.find((loan) => loan.id === smokeBorrowLoanId)?.status === "Completed",
  "incoming career loan agreement must finish as completed history",
);

const targetSeason = s.season + 2;
let rolloverReloads = 0;
let safetyWeeks = 0;
while (s.season < targetSeason) {
  const beforeSeason = s.season;
  s = advanceWeek(s);
  safetyWeeks++;
  assert(safetyWeeks < 120, "two-season smoke must reach its target without stalling");
  assert(Number.isFinite(s.cash), `cash must remain finite at S${s.season} W${s.week}`);
  assert(reconcile(s).ok, `finances must reconcile at S${s.season} W${s.week}`);

  if (s.season !== beforeSeason) {
    const reloaded = reload(s);
    assert(
      reloaded.season === s.season && reloaded.week === s.week,
      "season-boundary reload must preserve the calendar exactly",
    );
    assert(reloaded.cash === s.cash, "season-boundary reload must preserve cash exactly");
    assert(reconcile(reloaded).ok, "season-boundary reload finances must reconcile");
    s = reloaded;
    rolloverReloads++;
  }
}

assert(rolloverReloads === 2, `two-season smoke expected 2 rollover reloads, got ${rolloverReloads}`);
assert(
  new Set(s.football.players.map((player) => player.id)).size === s.football.players.length,
  "two-season smoke must retain unique persistent player IDs",
);
assert(
  new Set(s.football.contracts.map((contract) => contract.id)).size === s.football.contracts.length,
  "two-season smoke must retain unique contract IDs",
);
assert(
  new Set((s.football.loans ?? []).map((loan) => loan.id)).size === (s.football.loans ?? []).length,
  "two-season smoke must retain unique loan IDs",
);
const activeLoanPlayers = (s.football.loans ?? [])
  .filter((loan) => loan.status === "Active")
  .map((loan) => loan.playerId);
assert(
  new Set(activeLoanPlayers).size === activeLoanPlayers.length,
  "a player must never finish the smoke run on multiple active loans",
);
assert(userSquad(s).length >= 16, "automatic recruitment must keep a playable squad across two seasons");
assert(
  s.football.loans?.find((loan) => loan.id === smokeLoanId)?.status === "Completed",
  "completed outgoing loan history must survive the long career run",
);
assert(
  s.football.loans?.find((loan) => loan.id === smokeBorrowLoanId)?.status === "Completed",
  "completed incoming loan history must survive the long career run",
);
assert(reconcile(s).ok, "final two-season state must reconcile");

console.log("level7-career-smoke.check.ts: PASS");
