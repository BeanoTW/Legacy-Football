import assert from "node:assert/strict";
import { newGame } from "../newGame";
import {
  managerPlayerAssessment,
  managerSquadAssessments,
} from "../managerPlayerAssessment";
import {
  recruitmentMarketAwarenessPlayerIds,
  recruitmentMarketIdentity,
  searchRecruitmentMarket,
} from "../recruitmentMarketKnowledge";
import { chairmanRecruitmentPlayerIds } from "../chairmanRecruitmentView";
import { userSquad } from "../recruitmentLegacy";
import { isUserClubReference } from "../clubReference";
import { playerOwnerClubId, playerRegisteredClubId } from "../playerRegistration";

console.log("\n[MPA1] Manager player opinion is derived football information");
const state = newGame("Assessment FC", "Auditor", "MANAGER_PLAYER_ASSESSMENT");
const before = JSON.stringify(state);
const assessments = managerSquadAssessments(state);
assert.equal(assessments.length, userSquad(state).length, "every registered user player receives an assessment");
assert.equal(
  assessments.filter((row) => row.plannedUse === "Starter").length,
  11,
  "manager assessment mirrors the selected starting XI",
);
assert.ok(
  assessments.every((row) =>
    ["Key player", "Regular starter", "Rotation", "Backup", "Development", "Surplus"].includes(row.role),
  ),
  "assessment uses football-role labels rather than mood or relationship pressure",
);
const starter = assessments.find((row) => row.plannedUse === "Starter");
assert.ok(starter?.bestRole, "starter assessment includes the tactical role being used");
assert.equal(JSON.stringify(state), before, "reading manager opinion cannot mutate the save");
assert.deepEqual(
  managerPlayerAssessment(state, starter!.playerId),
  starter,
  "single-player and squad assessment surfaces agree",
);

console.log("\n[RMK1] Market search knows more identities than scouting has fully discovered");
const discovered = new Set(chairmanRecruitmentPlayerIds(state));
const aware = recruitmentMarketAwarenessPlayerIds(state);
assert.ok(aware.length > discovered.size, "public market awareness broadens the searchable pool");
assert.ok(
  aware.length < state.football.players.length,
  "market awareness does not expose every simulated player",
);
assert.ok(
  aware.every((id) => {
    const player = state.football.players.find((candidate) => candidate.id === id);
    if (!player) return true;
    return !isUserClubReference(state, playerOwnerClubId(player)) &&
      !isUserClubReference(state, playerRegisteredClubId(player));
  }),
  "market search never leaks the user's own squad into recruitment results",
);

const publicId = aware.find((id) => !discovered.has(id));
assert.ok(publicId, "fixture provides a public-but-undiscovered market identity");
const publicView = recruitmentMarketIdentity(state, publicId!);
assert.equal(publicView?.knowledge, "public");
assert.equal(publicView?.scoutingStatus, "notStarted");
assert.ok(publicView?.name, "public knowledge includes identity");
assert.ok(publicView?.position, "public knowledge includes broad position");

const searched = searchRecruitmentMarket(state, {
  query: publicView!.name.split(" ")[0],
  positions: [publicView!.position],
});
assert.ok(
  searched.some((row) => row.playerId === publicId),
  "known market identities are searchable by basic public information",
);

console.log("\n[RMK2] Free-agent registry is publicly searchable without scouting ability");
const free = searchRecruitmentMarket(state, { contractStatus: "free" });
assert.ok(free.length > 0, "free-agent registry returns public candidates");
assert.ok(free.every((row) => row.clubId === null));

console.log("\n14 passed, 0 failed");
