import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import {
  createScoutingBrief,
  scoutingBrief,
  scoutingCandidateSource,
} from "../scoutingDiscovery";
import {
  materializeTransferTargetForCompletionInPlace,
  recordCompletedTransferLifecycleInPlace,
  syncTransferTargetNegotiationInPlace,
  transferTargetAskingPrice,
  transferTargetAvailabilityReason,
  transferTargetPlayer,
} from "../recruitmentTargetBridge";
import { knownPlayerIdentity, playerFidelity } from "../playerLifecycle";
import type { TransferNegotiation } from "../types";
import { isUserClubReference, userClubReference } from "../clubReference";

const state = createScoutingBrief(
  newGame("Target Bridge Audit FC", "Auditor", "TARGET_BRIDGE_AUDIT"),
  { id: "target-bridge-audit", maxAge: 40 },
);
const brief = scoutingBrief(state, "target-bridge-audit");
if (!brief) throw new Error("scouting brief missing");
const compactId = brief.candidateIds.find(
  (playerId) => scoutingCandidateSource(state, brief.id, playerId) === "fringe",
);
if (!compactId) throw new Error("compact candidate missing");

const target = transferTargetPlayer(state, compactId);
assert.ok(target);
assert.equal(playerFidelity(state, compactId), "known");
assert.equal(state.football?.players.some((player) => player.id === compactId), false);
assert.equal(
  transferTargetAvailabilityReason(state, target, () => null),
  "Scouted player — club can be approached",
);
const ask = transferTargetAskingPrice(state, target, () => 1);
assert.ok(ask > 1, "compact target should use compact seller valuation");

const negotiation: TransferNegotiation = {
  id: "TN-TARGET-BRIDGE",
  playerId: compactId,
  fromClubId: target.currentClubId,
  toClubId: userClubReference(state),
  direction: "in",
  stage: "clubTalks",
  clubRounds: 1,
  playerRounds: 0,
  fee: ask,
  proposedWeeklyWage: target.wageExpectation,
  proposedLengthSeasons: 3,
  proposedSigningBonus: 0,
  proposedRole: "First Team",
  createdSeason: state.season,
  createdAbsoluteWeek: 1,
  expiresAtAbsoluteWeek: 4,
  log: [],
};

syncTransferTargetNegotiationInPlace(state, negotiation);
assert.ok(knownPlayerIdentity(state, compactId)?.reasons.includes("negotiation"));
assert.equal(state.football?.players.some((player) => player.id === compactId), false);

negotiation.stage = "agreed";
syncTransferTargetNegotiationInPlace(state, negotiation);
assert.equal(state.football?.players.some((player) => player.id === compactId), false, "agreement must not hydrate");

const signed = materializeTransferTargetForCompletionInPlace(state, negotiation);
assert.ok(signed, "completion should materialize compact target");
assert.equal(signed.id, compactId);
assert.equal(signed.currentClubId, userClubReference(state));
assert.equal(playerFidelity(state, compactId), "detailed");
recordCompletedTransferLifecycleInPlace(state, negotiation, signed);
assert.ok(knownPlayerIdentity(state, compactId)?.reasons.includes("owned"));
assert.ok(!knownPlayerIdentity(state, compactId)?.reasons.includes("negotiation"));
assert.ok(
  knownPlayerIdentity(state, compactId)?.career.some((entry) => isUserClubReference(state, entry.clubId)),
  "completed arrival should reach persistent career ledger",
);

const detailed = state.football?.players.find(
  (player) =>
    player.id !== compactId &&
    player.currentClubId !== null &&
    !isUserClubReference(state, player.currentClubId),
);
if (!detailed) throw new Error("detailed target missing");
assert.equal(transferTargetPlayer(state, detailed.id), detailed);
assert.equal(
  transferTargetAvailabilityReason(state, detailed, () => "Detailed availability"),
  "Detailed availability",
);
assert.equal(transferTargetAskingPrice(state, detailed, () => 765432), 765432);

console.log("\nrecruitment-target-bridge: passed");
