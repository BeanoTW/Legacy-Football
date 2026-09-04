import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import {
  createScoutingBrief,
  scoutingBrief,
  scoutingCandidateSource,
} from "../scoutingDiscovery";
import {
  markKnownPlayerNegotiationInPlace,
  prepareKnownPlayerApproachInPlace,
  syncKnownPlayerNegotiationReasonInPlace,
} from "../knownPlayerNegotiation";
import { knownPlayerIdentity, playerFidelity } from "../playerLifecycle";
import type { TransferNegotiation } from "../types";
import { userClubReference } from "../clubReference";

const state = createScoutingBrief(
  newGame("Negotiation Audit FC", "Auditor", "KNOWN_NEGOTIATION_AUDIT"),
  { id: "known-negotiation-audit", maxAge: 40 },
);
const brief = scoutingBrief(state, "known-negotiation-audit");
if (!brief) throw new Error("scouting brief missing");
const compactId = brief.candidateIds.find(
  (playerId) => scoutingCandidateSource(state, brief.id, playerId) === "fringe",
);
if (!compactId) throw new Error("compact scouting candidate missing");

const beforeCount = state.football?.players.length ?? 0;
const approach = prepareKnownPlayerApproachInPlace(state, compactId, 123456, "First Team");
assert.ok(approach, "known compact target should be approachable");
assert.ok(approach.fromClubId, "compact target should retain seller identity");
assert.equal(approach.fee, 123456);
assert.equal(playerFidelity(state, compactId), "known");
assert.ok(knownPlayerIdentity(state, compactId)?.reasons.includes("negotiation"));
assert.equal(state.football?.players.length ?? 0, beforeCount, "approach must not hydrate player");
assert.equal(state.football?.players.some((player) => player.id === compactId), false);

const negotiation: TransferNegotiation = {
  id: "TN-AUDIT",
  playerId: compactId,
  fromClubId: approach.fromClubId,
  toClubId: userClubReference(state),
  direction: "in",
  stage: "clubTalks",
  clubRounds: 1,
  playerRounds: 0,
  fee: approach.fee,
  proposedWeeklyWage: 1000,
  proposedLengthSeasons: 3,
  proposedSigningBonus: 0,
  proposedRole: "First Team",
  createdSeason: state.season,
  createdAbsoluteWeek: 1,
  expiresAtAbsoluteWeek: 4,
  log: [],
};

syncKnownPlayerNegotiationReasonInPlace(state, negotiation);
assert.ok(knownPlayerIdentity(state, compactId)?.reasons.includes("negotiation"));

negotiation.stage = "rejected";
syncKnownPlayerNegotiationReasonInPlace(state, negotiation);
assert.ok(!knownPlayerIdentity(state, compactId)?.reasons.includes("negotiation"));
assert.ok(knownPlayerIdentity(state, compactId), "terminal talks must preserve known identity");
assert.equal(playerFidelity(state, compactId), "known");
assert.equal(state.football?.players.some((player) => player.id === compactId), false);

assert.equal(markKnownPlayerNegotiationInPlace(state, compactId, true), true);
assert.ok(knownPlayerIdentity(state, compactId)?.reasons.includes("negotiation"));
assert.equal(markKnownPlayerNegotiationInPlace(state, compactId, false), true);
assert.ok(!knownPlayerIdentity(state, compactId)?.reasons.includes("negotiation"));

console.log("\nknown-player-negotiation: passed");
