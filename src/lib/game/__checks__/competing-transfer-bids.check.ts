import { strict as assert } from "node:assert";
import { migrateSave, newGame } from "../engine";
import {
  MAX_SQUAD_SIZE,
  SQUAD_TEMPLATE,
  evaluatePlayerResponseInPlace,
  negotiationById,
  openTransferEnquiryInPlace,
  squadOf,
  submitEnquiryOfferInPlace,
  transferMarket,
  wageDemand,
} from "../recruitment";
import { recruitmentTransferFeePolicyForClub, recruitmentUserNegotiationWage } from "../recruitmentEconomy";
import { buildWorldSimulationPlan } from "../world";
import { clubReputation } from "../reputation";
import { isUserClubReference, sameClubReference } from "../clubReference";
import type { FootballPlayer, GameState, TransferNegotiation } from "../types";

function reload(state: GameState): GameState {
  return migrateSave(JSON.parse(JSON.stringify(state)) as Record<string, unknown>);
}

function findCompetingEnquiry(seed: string): {
  state: GameState;
  player: FootballPlayer;
  negotiation: TransferNegotiation;
} {
  const state = newGame("Rival Bid Audit FC", "Auditor", seed);
  const candidates = transferMarket(state)
    .filter((entry) => entry.clubId !== null)
    .filter((entry) => wageDemand(state, entry.player, "First Team") >= 200)
    .sort(
      (a, b) =>
        a.askingPrice - b.askingPrice ||
        b.player.currentAbility - a.player.currentAbility ||
        a.player.id.localeCompare(b.player.id),
    );

  for (const entry of candidates.slice(0, 100)) {
    const opened = openTransferEnquiryInPlace(
      state,
      entry.player.id,
      "First Team",
      25,
    );
    if (
      opened.ok &&
      opened.negotiation?.competingClubId &&
      opened.negotiation.competingOfferFee !== undefined
    ) {
      return { state, player: entry.player, negotiation: opened.negotiation };
    }
  }

  throw new Error("expected the deterministic Level 7 market to produce a competing bid");
}

const first = findCompetingEnquiry("COMPETING_BID_AUDIT");
const second = findCompetingEnquiry("COMPETING_BID_AUDIT");

assert.equal(first.player.id, second.player.id, "same world should discover the same contested target");
assert.equal(
  first.negotiation.competingClubId,
  second.negotiation.competingClubId,
  "same world should persist the same competing club",
);
assert.equal(
  first.negotiation.competingOfferFee,
  second.negotiation.competingOfferFee,
  "same world should persist the same competing fee",
);

const rivalClubId = first.negotiation.competingClubId!;
const rivalFee = first.negotiation.competingOfferFee!;
assert.ok(rivalFee > 0, "competing bid must carry a positive transfer fee");
assert.ok(!isUserClubReference(first.state, rivalClubId), "user club cannot compete against itself");
assert.ok(
  !sameClubReference(first.state, rivalClubId, first.negotiation.fromClubId),
  "selling club cannot be its own competing bidder",
);
assert.ok(
  buildWorldSimulationPlan(first.state).focusClubIds.includes(rivalClubId),
  "competing bidder must come from the actively simulated Focus market",
);

const rivalSquad = squadOf(first.state, rivalClubId);
assert.ok(rivalSquad.length < MAX_SQUAD_SIZE, "competing bidder must have a legal squad slot");
const rivalPositionPlayers = rivalSquad.filter(
  (candidate) => candidate.primaryPosition === first.player.primaryPosition,
);
const rivalPositionCount = rivalPositionPlayers.length;
const weakestRivalAbility = rivalPositionPlayers.length
  ? Math.min(...rivalPositionPlayers.map((candidate) => candidate.currentAbility))
  : 0;
assert.ok(
  rivalPositionCount < SQUAD_TEMPLATE[first.player.primaryPosition] ||
    first.player.currentAbility - weakestRivalAbility >= 4,
  "competing bidder must have a genuine shortage or meaningful upgrade need",
);
assert.ok(
  clubReputation(first.state, rivalClubId) >= first.player.reputation - 12,
  "competing bidder must be plausible for the target's reputation",
);

const reloaded = reload(first.state);
const reloadedNegotiation = negotiationById(reloaded, first.negotiation.id);
assert.ok(reloadedNegotiation, "competing negotiation must survive save/reload");
assert.equal(reloadedNegotiation.competingClubId, rivalClubId);
assert.equal(reloadedNegotiation.competingOfferFee, rivalFee);

const sellerState = structuredClone(first.state);
const sellerNegotiation = negotiationById(sellerState, first.negotiation.id)!;
const sellerPolicy = recruitmentTransferFeePolicyForClub(
  sellerState,
  sellerNegotiation.fromClubId!,
);
assert.ok(
  rivalFee > sellerPolicy.feeStep,
  "fixture needs room to submit a genuine undercut of the rival bid",
);
const undercut = rivalFee - sellerPolicy.feeStep;
const undercutResult = submitEnquiryOfferInPlace(
  sellerState,
  sellerNegotiation.id,
  undercut,
);
assert.ok(undercutResult.ok, undercutResult.reason);
const afterUndercut = negotiationById(sellerState, sellerNegotiation.id)!;
assert.ok(
  afterUndercut.stage !== "playerTalks" &&
    afterUndercut.stage !== "agreed" &&
    afterUndercut.stage !== "registration" &&
    afterUndercut.stage !== "completed",
  "seller must not accept less than a live competing bid",
);
if (afterUndercut.stage === "clubTalks") {
  assert.ok(
    (afterUndercut.clubCounterFee ?? 0) >= rivalFee,
    "seller counter must respect the standing rival bid",
  );
}

function playerCounter(withCompetition: boolean): number {
  const state = structuredClone(first.state);
  const negotiation = negotiationById(state, first.negotiation.id)!;
  const player = state.football.players.find((candidate) => candidate.id === first.player.id)!;
  const demand = wageDemand(state, player, negotiation.proposedRole);

  negotiation.stage = "playerTalks";
  negotiation.playerRounds = 1;
  negotiation.clubRounds = Math.max(1, negotiation.clubRounds);
  negotiation.proposedWeeklyWage = recruitmentUserNegotiationWage(state, demand * 0.84);
  negotiation.playerCounterWage = undefined;
  if (!withCompetition) {
    delete negotiation.competingClubId;
    delete negotiation.competingOfferFee;
  }

  evaluatePlayerResponseInPlace(state, negotiation);
  assert.equal(
    negotiation.stage,
    "playerTalks",
    "sub-demand comparison fixture should stay in personal-term talks",
  );
  assert.ok(negotiation.playerCounterWage, "player should answer with a wage counter");
  return negotiation.playerCounterWage;
}

const normalCounter = playerCounter(false);
const competingCounter = playerCounter(true);
assert.ok(
  competingCounter > normalCounter,
  `competing interest should strengthen the agent's wage position (£${normalCounter} -> £${competingCounter})`,
);

console.log(
  `competing-transfer-bids: passed — ${rivalClubId} bid £${rivalFee.toLocaleString()} for ${first.player.id}`,
);
