import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import {
  chairmanRecruitmentPlayerIds,
  chairmanRecruitmentPlayerView,
  chairmanRecruitmentPlayers,
} from "../chairmanRecruitmentView";
import {
  createScoutingBrief,
  scoutingBrief,
  scoutingCandidateSource,
} from "../scoutingDiscovery";
import { startScouting } from "../scouting";
import { isUserClubReference } from "../clubReference";

const base = newGame("Knowledge Gate FC", "Auditor", "CHAIRMAN_VIEW_AUDIT");
const externalDetailed = base.football?.players.find(
  (player) => player.currentClubId !== null && !isUserClubReference(base, player.currentClubId),
);
if (!externalDetailed) throw new Error("external detailed player missing");
assert.equal(
  chairmanRecruitmentPlayerIds(base).includes(externalDetailed.id),
  false,
  "Focus simulation must not make an undiscovered player chairman-visible",
);
assert.equal(chairmanRecruitmentPlayerView(base, externalDetailed.id), null);

const discovered = createScoutingBrief(base, { id: "chairman-view-audit", maxAge: 40 });
const brief = scoutingBrief(discovered, "chairman-view-audit");
if (!brief) throw new Error("brief missing");
assert.ok(brief.candidateIds.length > 0);
for (const playerId of brief.candidateIds) {
  assert.ok(chairmanRecruitmentPlayerIds(discovered).includes(playerId));
  const view = chairmanRecruitmentPlayerView(discovered, playerId);
  assert.ok(view);
  assert.equal("currentAbility" in view, false, "view must not expose hidden current ability");
  assert.equal("potentialAbility" in view, false, "view must not expose hidden potential ability");
}

const compactId = brief.candidateIds.find(
  (playerId) => scoutingCandidateSource(discovered, brief.id, playerId) === "fringe",
);
if (!compactId) throw new Error("compact candidate missing");
const compact = chairmanRecruitmentPlayerView(discovered, compactId);
assert.ok(compact);
assert.equal(compact.scoutingStatus, "notStarted");
assert.equal(compact.knowledgePct, 0);
assert.ok(compact.valueRange, "discovery may show a broad report valuation range");

const scouting = startScouting(discovered, compactId);
const active = chairmanRecruitmentPlayerView(scouting, compactId);
assert.ok(active);
assert.equal(active.scoutingStatus, "active");
assert.equal(
  scouting.football?.players.some((player) => player.id === compactId),
  false,
  "chairman view and scouting must not hydrate compact targets",
);

const all = chairmanRecruitmentPlayers(scouting);
assert.deepEqual(
  all.map((player) => player.playerId),
  chairmanRecruitmentPlayerIds(scouting),
  "chairman-facing list must come exclusively from the knowledge gate",
);

console.log("\nchairman-recruitment-view: passed");
