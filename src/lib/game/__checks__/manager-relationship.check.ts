/* Runtime verification for manager personality + chairman relationship memory.
   Run with: bun src/lib/game/__checks__/manager-relationship.check.ts
*/
import { newGame } from "../engine";
import { handleInboxChoice, runWeeklyGenerators } from "../inbox";
import {
  adjustManagerRelationshipInPlace,
  currentManager,
  managerPersonality,
  managerRelationship,
  managerRelationshipClimate,
  managerReplacementExpectation,
  recordCompletedTransferManagerReactionInPlace,
} from "../managerRelationship";
import type { GameState, Staff } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`);
  }
}

function fixture(): { state: GameState; manager: Staff } {
  const state = newGame("Relationship Town", "Chairman Test");
  const candidate = state.staffCandidates.find((staff) => staff.role === "Manager");
  if (!candidate) throw new Error("fixture needs a manager candidate");
  const manager = structuredClone(candidate);
  manager.id = "MGR-REL-CHECK";
  manager.name = "Morgan Vale";
  manager.role = "Manager";
  manager.stats.motivation = 84;
  manager.stats.tactics = 76;
  manager.stats.negotiation = 68;
  state.hiredStaff = state.hiredStaff.filter((staff) => staff.role !== "Manager");
  state.hiredStaff.push(manager);
  state.inbox = [];
  state.scheduledGenerators = [];
  return { state, manager };
}

console.log("\n[MR1] Persistent relationship defaults and adjustment");
{
  const { state, manager } = fixture();
  const initial = managerRelationship(state, manager);
  check("relationship starts neutral-positive", initial.trust === 60 && initial.backing === 60 && initial.autonomy === 60);
  check("relationship overall starts at 60", initial.overall === 60);

  adjustManagerRelationshipInPlace(state, manager.id, { trust: 12, backing: -8, autonomy: 50 });
  const changed = managerRelationship(state, manager);
  check("relationship deltas persist", changed.trust === 72 && changed.backing === 52);
  check("relationship values clamp at 100", changed.autonomy === 100);
}

console.log("\n[MR2] Personality is deterministic");
{
  const { manager } = fixture();
  const a = managerPersonality(manager);
  const b = managerPersonality(structuredClone(manager));
  check("same manager gets same personality", JSON.stringify(a) === JSON.stringify(b));
  check("personality exposes control style", ["Flexible", "Collaborative", "Hands-on"].includes(a.controlStyle));
}

console.log("\n[MR3] Selling a key player creates remembered tension");
{
  const { state, manager } = fixture();
  const player = state.football.players.find((candidate) => candidate.currentClubId === state.clubName)
    ?? state.football.players[0];
  if (!player) throw new Error("fixture needs a football player");

  const before = managerRelationship(state, manager);
  recordCompletedTransferManagerReactionInPlace(state, {
    direction: "out",
    player,
    playerName: `${player.firstName} ${player.lastName}`,
    fee: Math.max(1, Math.round(player.marketValue * 0.9)),
    previousRole: "Key Player",
  });
  const after = managerRelationship(state, manager);

  check("key-player sale reduces backing", after.backing < before.backing, `${before.backing} -> ${after.backing}`);
  check("key-player sale reduces trust", after.trust < before.trust, `${before.trust} -> ${after.trust}`);

  const withReaction = runWeeklyGenerators(state);
  const meeting = withReaction.inbox.find((item) => item.generatorId === "manager-relationship-reaction");
  check("negative transfer creates private manager meeting", !!meeting);
  check("private meeting is actionable", meeting?.status === "awaitingDecision" && (meeting.choices?.length ?? 0) === 3);

  if (meeting) {
    const trustBeforeMeeting = managerRelationship(withReaction, manager).trust;
    const resolved = handleInboxChoice(withReaction, meeting.id, "hear-him-out");
    const trustAfterMeeting = managerRelationship(resolved, manager).trust;
    check("hearing manager out repairs some trust", trustAfterMeeting > trustBeforeMeeting);
    const repeated = handleInboxChoice(resolved, meeting.id, "hear-him-out");
    check("meeting cannot double-apply", managerRelationship(repeated, manager).trust === trustAfterMeeting);
  }

  check("major sale creates a persistent replacement expectation", managerReplacementExpectation(withReaction, manager).active);

  let pressureState = structuredClone(withReaction);
  pressureState.week += 1;
  pressureState = runWeeklyGenerators(pressureState);
  pressureState.week += 1;
  pressureState = runWeeklyGenerators(pressureState);
  const replacementPressure = managerReplacementExpectation(pressureState, manager);
  check("unreplaced key-player sale escalates after two weeks", replacementPressure.stage === 1);
  const replacementItem = pressureState.inbox.find(
    (item) => item.generatorId === "manager-replacement-expectation" && item.subject.includes("gap replaced"),
  );
  check("replacement pressure becomes an actionable manager issue", !!replacementItem && replacementItem.status === "awaitingDecision");

  const backingBeforeReplacement = managerRelationship(pressureState, manager).backing;
  recordCompletedTransferManagerReactionInPlace(pressureState, {
    direction: "in",
    player,
    playerName: `Replacement ${player.lastName}`,
    fee: Math.max(1, player.marketValue),
  });
  check("same-position signing clears replacement expectation", !managerReplacementExpectation(pressureState, manager).active);
  check("delivering the replacement repairs backing", managerRelationship(pressureState, manager).backing > backingBeforeReplacement);
}

console.log("\n[MR4] Sustained strain escalates into club-level consequences");
{
  const { state, manager } = fixture();
  adjustManagerRelationshipInPlace(state, manager.id, { trust: -45, backing: -45, autonomy: -45 });

  let next = runWeeklyGenerators(state);
  check("first strained week does not immediately manufacture a crisis", managerRelationshipClimate(next, manager).stage === 0);

  next.week += 1;
  next = runWeeklyGenerators(next);
  const stageOne = managerRelationshipClimate(next, manager);
  check("fiery manager escalates after sustained strain", stageOne.stage === 1 && stageOne.strainedWeeks === 2);
  const warning = next.inbox.find((item) => item.generatorId === "manager-relationship-climate" && item.subject.includes("deteriorating"));
  check("sustained strain creates an actionable working-relationship warning", !!warning && warning.status === "awaitingDecision");

  next.week += 1;
  next = runWeeklyGenerators(next);
  next.week += 1;
  next = runWeeklyGenerators(next);
  const crisis = managerRelationshipClimate(next, manager);
  check("continued strain escalates into a relationship crisis", crisis.stage === 2 && crisis.strainedWeeks === 4);
  const publicCrisis = next.inbox.find((item) => item.generatorId === "manager-relationship-climate" && item.subject.includes("Relationship crisis"));
  check("relationship crisis reaches the club/media layer", !!publicCrisis && publicCrisis.priority === "urgent");

  const sameWeek = runWeeklyGenerators(next);
  check("climate advancement is idempotent within a week", managerRelationshipClimate(sameWeek, manager).strainedWeeks === crisis.strainedWeeks);
}

console.log("\n[MR5] Current-manager lookup");
{
  const { state, manager } = fixture();
  check("current manager resolves hired manager", currentManager(state)?.id === manager.id);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
