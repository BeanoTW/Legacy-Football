import { strict as assert } from "node:assert";
import { advanceDay, newGame } from "../engine";
import { applyEffects, runWeeklyGenerators } from "../inbox";
import {
  createScoutingBrief,
  scoutingBrief,
  scoutingCandidateSource,
  scoutingSearchPlan,
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
import { fringePlayersForClub, FRINGE_SQUAD_SIZE } from "../fringePlayers";
import {
  activeContract,
  canAuthorisePurchase,
  canAuthoriseWage,
  beginTransferRegistrationInPlace,
  completeTransferInPlace,
  negotiationById,
  openTransferNegotiationInPlace,
  wageDemand,
} from "../recruitment";

function discover<T extends ReturnType<typeof newGame>>(
  state: T,
  input: Parameters<typeof createScoutingBrief>[1],
): T {
  let next = createScoutingBrief(state, input) as T;
  const days = scoutingSearchPlan(next).searchDays;
  for (let day = 0; day < days; day++) next = advanceDay(next) as T;
  return next;
}


const state = discover(
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

// Exercise the real public recruitment path. A scouted Fringe target must remain
// compact through both negotiation stages, then materialise exactly once when
// the canonical transfer engine completes the signing.
const integrationState = discover(
  newGame("Target Bridge Integration FC", "Auditor", "TARGET_BRIDGE_INTEGRATION"),
  { id: "target-bridge-integration", maxAge: 40 },
);
const integrationBrief = scoutingBrief(integrationState, "target-bridge-integration");
if (!integrationBrief) throw new Error("integration scouting brief missing");

const affordableCompactTarget = integrationBrief.candidateIds
  .filter(
    (playerId) =>
      scoutingCandidateSource(integrationState, integrationBrief.id, playerId) === "fringe",
  )
  .map((playerId) => {
    const player = transferTargetPlayer(integrationState, playerId);
    if (!player) return null;
    const asking = transferTargetAskingPrice(integrationState, player, () => 1);
    const weeklyWage = wageDemand(integrationState, player, "First Team");
    const signingBonus = Math.round(asking * 0.05);
    return {
      player,
      asking,
      weeklyWage,
      affordable:
        canAuthorisePurchase(integrationState, asking + signingBonus).allowed &&
        canAuthoriseWage(integrationState, weeklyWage).allowed,
    };
  })
  .filter(
    (
      candidate,
    ): candidate is {
      player: NonNullable<ReturnType<typeof transferTargetPlayer>>;
      asking: number;
      weeklyWage: number;
      affordable: boolean;
    } => candidate !== null,
  )
  .filter((candidate) => candidate.affordable)
  .sort((a, b) => a.asking - b.asking || a.player.id.localeCompare(b.player.id))[0];

if (!affordableCompactTarget) throw new Error("affordable compact integration target missing");

const integrationId = affordableCompactTarget.player.id;
const detailedCountBeforeOffer = integrationState.football?.players.length ?? 0;
const opened = openTransferNegotiationInPlace(
  integrationState,
  integrationId,
  affordableCompactTarget.asking,
  "First Team",
);
assert.ok(opened.ok, opened.reason);
if (!opened.negotiation) throw new Error("canonical compact negotiation missing");
assert.equal(opened.negotiation.playerId, integrationId);
assert.equal(
  integrationState.football?.players.some((player) => player.id === integrationId),
  false,
  "opening talks must not hydrate a compact target",
);
assert.equal(
  integrationState.football?.players.length ?? 0,
  detailedCountBeforeOffer,
  "negotiating with a compact target must not grow detailed simulation",
);
assert.ok(
  knownPlayerIdentity(integrationState, integrationId)?.reasons.includes("negotiation"),
  "canonical talks should retain the temporary negotiation reason",
);
assert.equal(
  opened.negotiation.stage,
  "agreed",
  "a full asking-price offer with the generated wage demand should reach agreement deterministically",
);
assert.equal(
  playerFidelity(integrationState, integrationId),
  "known",
  "agreement alone must leave the target compact",
);

// The Inbox must preserve the same compact lifecycle and may not bypass registration.
const agreedInbox = runWeeklyGenerators(integrationState);
const agreedInboxItem = agreedInbox.inbox.find(
  (item) =>
    item.generatorId === "recruitment-deal-agreed" &&
    item.eventKey === `recruitment-deal-agreed:${opened.negotiation!.id}`,
);
assert.ok(agreedInboxItem, "compact agreed target should remain visible in Inbox");
const registerChoice = agreedInboxItem.choices?.find((choice) => choice.id === "register");
assert.ok(registerChoice, "incoming agreed Inbox item should offer registration");
assert.deepEqual(
  registerChoice.effects,
  [{ kind: "recruitmentBeginRegistration", negotiationId: opened.negotiation.id }],
  "Inbox must route agreed incoming deals into registration rather than completion",
);

const legacyInboxEffectState = applyEffects(integrationState, [
  { kind: "recruitmentCompleteTransfer", negotiationId: opened.negotiation.id },
]);
assert.equal(
  negotiationById(legacyInboxEffectState, opened.negotiation.id)?.stage,
  "registration",
  "persisted pre-registration Inbox completion effects should advance to registration",
);
assert.equal(
  playerFidelity(legacyInboxEffectState, integrationId),
  "known",
  "legacy Inbox compatibility must not bypass compact materialisation",
);

const afterInboxRegistration = applyEffects(agreedInbox, registerChoice.effects);
assert.equal(
  negotiationById(afterInboxRegistration, opened.negotiation.id)?.stage,
  "registration",
  "Inbox registration action should persist the registration stage",
);
assert.equal(
  playerFidelity(afterInboxRegistration, integrationId),
  "known",
  "Inbox registration must not hydrate the compact target",
);
assert.equal(
  afterInboxRegistration.football?.players.some((player) => player.id === integrationId),
  false,
  "Inbox registration must preserve the completion materialisation boundary",
);

const registrationInbox = runWeeklyGenerators(afterInboxRegistration);
const registrationInboxItem = registrationInbox.inbox.find(
  (item) =>
    item.generatorId === "recruitment-registration-ready" &&
    item.eventKey === `recruitment-registration-ready:${opened.negotiation!.id}`,
);
assert.ok(registrationInboxItem, "registered compact target should surface a completion Inbox item");
const completeChoice = registrationInboxItem.choices?.find((choice) => choice.id === "complete");
assert.ok(completeChoice, "registration Inbox item should expose final completion");
assert.deepEqual(
  completeChoice.effects,
  [{ kind: "recruitmentCompleteTransfer", negotiationId: opened.negotiation.id }],
  "registration Inbox completion must use the canonical transfer action",
);
const afterInboxCompletion = applyEffects(registrationInbox, completeChoice.effects);
assert.equal(
  negotiationById(afterInboxCompletion, opened.negotiation.id)?.stage,
  "completed",
  "Inbox completion should finish the registered deal",
);
assert.equal(
  playerFidelity(afterInboxCompletion, integrationId),
  "detailed",
  "Inbox completion should materialize the same compact player identity",
);
assert.ok(
  afterInboxCompletion.football?.players.some((player) => player.id === integrationId),
  "Inbox completion should add the signed player to detailed simulation",
);

const registration = beginTransferRegistrationInPlace(
  integrationState,
  opened.negotiation.id,
);
assert.ok(registration.ok, registration.reason);
assert.equal(opened.negotiation.stage, "registration");
assert.equal(
  playerFidelity(integrationState, integrationId),
  "known",
  "registration alone must leave the compact target unhydrated",
);
assert.equal(
  integrationState.football?.players.some((player) => player.id === integrationId),
  false,
  "registration must not cross the materialisation boundary",
);
const completed = completeTransferInPlace(integrationState, opened.negotiation.id);
assert.ok(completed.ok, completed.reason);
assert.equal(opened.negotiation.stage, "completed");
const integratedSigning = integrationState.football?.players.find(
  (player) => player.id === integrationId,
);
assert.ok(integratedSigning, "completed compact signing should become detailed");
assert.ok(
  isUserClubReference(integrationState, integratedSigning.currentClubId),
  "completed signing should belong to the canonical user club",
);
assert.equal(playerFidelity(integrationState, integrationId), "detailed");
assert.ok(
  integrationState.fringePlayers?.[integrationId] &&
    isUserClubReference(
      integrationState,
      integrationState.fringePlayers[integrationId].currentClubId,
    ),
  "completion must move the compact ownership mirror off the selling Fringe club immediately",
);
const sellingClubId = opened.negotiation.fromClubId;
assert.ok(sellingClubId, "Fringe signing should retain its selling club identity");
const sellerCompactSquad = fringePlayersForClub(integrationState, sellingClubId);
assert.equal(
  sellerCompactSquad.length,
  FRINGE_SQUAD_SIZE,
  "selling Fringe club should refill the vacated compact squad slot",
);
assert.equal(
  sellerCompactSquad.some((player) => player.playerId === integrationId),
  false,
  "signed player must never be regenerated into the selling Fringe squad",
);
const signedContract = activeContract(integrationState, integrationId);
assert.ok(signedContract, "completed compact signing should receive a live contract");
assert.ok(isUserClubReference(integrationState, signedContract.clubId));
assert.ok(
  integrationState.football?.transferHistory.some(
    (record) =>
      record.playerId === integrationId &&
      isUserClubReference(integrationState, record.toClubId),
  ),
  "canonical completion should write transfer history",
);
assert.ok(knownPlayerIdentity(integrationState, integrationId)?.reasons.includes("owned"));
assert.ok(!knownPlayerIdentity(integrationState, integrationId)?.reasons.includes("negotiation"));
assert.ok(
  knownPlayerIdentity(integrationState, integrationId)?.career.some((entry) =>
    isUserClubReference(integrationState, entry.clubId),
  ),
  "canonical completion should write the persistent arrival ledger",
);

console.log("\nrecruitment-target-bridge: passed");
