import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import {
  createScoutingBrief,
  scoutingBrief,
  scoutingCandidateSource,
} from "../scoutingDiscovery";
import {
  compactPlayerAskingPrice,
  compactPlayerCanBeApproached,
  isCompactRecruitmentTarget,
  recruitmentTargetAskingPrice,
  recruitmentTargetPlayer,
} from "../knownPlayerTransferEconomy";
import { isUserClubReference } from "../clubReference";

const base = newGame("Transfer Economy Audit FC", "Auditor", "KNOWN_TRANSFER_ECONOMY_AUDIT");
const discovered = createScoutingBrief(base, { id: "transfer-economy-audit", maxAge: 40 });
const brief = scoutingBrief(discovered, "transfer-economy-audit");
if (!brief) throw new Error("scouting brief missing");

const compactId = brief.candidateIds.find(
  (playerId) => scoutingCandidateSource(discovered, brief.id, playerId) === "fringe",
);
if (!compactId) throw new Error("compact scouting candidate missing");

const beforeDetailedCount = discovered.football?.players.length ?? 0;
const target = recruitmentTargetPlayer(discovered, compactId);
assert.ok(target, "known compact player should resolve for recruitment");
assert.equal(isCompactRecruitmentTarget(discovered, compactId), true);
assert.equal(compactPlayerCanBeApproached(discovered, target), true);
assert.equal(discovered.football?.players.some((player) => player.id === compactId), false);
assert.equal(discovered.football?.players.length ?? 0, beforeDetailedCount, "target lookup must not hydrate");

const askingA = compactPlayerAskingPrice(discovered, target);
const askingB = compactPlayerAskingPrice(discovered, target);
assert.ok(askingA !== null && askingA > 0, "compact contracted target should have a seller valuation");
assert.equal(askingA, askingB, "compact seller valuation must be deterministic");
assert.equal(
  recruitmentTargetAskingPrice(discovered, target, () => 1),
  askingA,
  "canonical price bridge should prefer compact seller valuation",
);
assert.equal(discovered.football?.players.some((player) => player.id === compactId), false);

const detailed = discovered.football?.players.find(
  (player) => player.currentClubId !== null && !isUserClubReference(discovered, player.currentClubId),
);
if (!detailed) throw new Error("detailed external player missing");
assert.equal(isCompactRecruitmentTarget(discovered, detailed.id), false);
assert.equal(compactPlayerAskingPrice(discovered, detailed), null);
assert.equal(
  recruitmentTargetAskingPrice(discovered, detailed, () => 123456),
  123456,
  "detailed players should stay on the canonical detailed asking-price path",
);

console.log("\nknown-player-transfer-economy: passed");
