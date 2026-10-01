/* Runtime verification for manager recruitment promises.
   Run with: bun src/lib/game/__checks__/manager-recruitment-promises.check.ts
*/
import { newGame } from "../engine";
import { handleInboxChoice, isKnownGeneratorId, runWeeklyGenerators } from "../inbox";
import {
  managerRecruitmentCommitment,
} from "../managerRecruitmentCommitment";
import {
  managerRelationship,
  recordCompletedTransferManagerReactionInPlace,
} from "../managerRelationship";
import { fromAbsoluteWeek } from "../time";
import { userClubReference } from "../clubReference";
import type { GameState, Staff } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log("  ✓ " + label);
  } else {
    failed++;
    console.log("  ✗ " + label + (extra ? " — " + extra : ""));
  }
}

function fixture(): { state: GameState; manager: Staff } {
  const state = newGame("Promise Town", "Chairman Test");
  const candidate = state.staffCandidates.find((staff) => staff.role === "Manager");
  if (!candidate) throw new Error("fixture needs manager candidate");
  const manager = structuredClone(candidate);
  manager.id = "MGR-PROMISE-CHECK";
  manager.name = "Alex Mercer";
  manager.role = "Manager";
  state.hiredStaff = state.hiredStaff.filter((staff) => staff.role !== "Manager");
  state.hiredStaff.push(manager);
  state.inbox = [];
  state.scheduledGenerators = [];
  state.week = 1;

  // Force a clear positional weakness so the manager always has a recruitment ask.
  const club = userClubReference(state);
  for (const player of state.football.players) {
    if (player.currentClubId !== club) continue;
    if (player.primaryPosition === "DEF") {
      player.currentClubId = null;
    }
  }

  return { state, manager };
}

console.log("\n[MRP1] Generator registration");
check("request generator registered", isKnownGeneratorId("manager-recruitment-request"));
check("review generator registered", isKnownGeneratorId("manager-recruitment-promise-review"));

console.log("\n[MRP2] Promise kept through canonical signing reaction");
{
  const data = fixture();
  const manager = data.manager;
  let state = data.state;
  state = runWeeklyGenerators(state);
  const request = state.inbox.find((item) => item.generatorId === "manager-recruitment-request");
  check("manager recruitment request appears", !!request);
  check("request is actionable", request?.status === "awaitingDecision" && request.choices?.length === 3);

  if (request) {
    state = handleInboxChoice(state, request.id, "promise");
    const commitment = managerRecruitmentCommitment(state, manager.id);
    check("promise becomes active", commitment?.active === true);
    check("promise has six-week deadline", !!commitment && commitment.dueAtAbsoluteWeek - commitment.acceptedAtAbsoluteWeek === 6);

    if (commitment) {
      const player =
        state.football.players.find((candidate) => candidate.primaryPosition === commitment.position) ??
        state.football.players[0];
      if (!player) throw new Error("fixture needs football player");
      const before = managerRelationship(state, manager);

      recordCompletedTransferManagerReactionInPlace(state, {
        direction: "in",
        player: { ...player, primaryPosition: commitment.position },
        playerName: "Promise Signing",
        fee: Math.max(1, player.marketValue),
      });

      const fulfilled = managerRecruitmentCommitment(state, manager.id);
      const after = managerRelationship(state, manager);
      check("matching signing fulfils promise", fulfilled?.fulfilled === true && fulfilled.active === false);
      check("fulfilled promise records player", fulfilled?.fulfilledPlayerName === "Promise Signing");
      check("delivering promise gives strong backing boost", after.backing >= before.backing + 10);

      const scheduled = state.scheduledGenerators.find(
        (entry) => entry.generatorId === "manager-recruitment-promise-review",
      );
      check("promise review remains scheduled", !!scheduled);

      if (scheduled) {
        const due = fromAbsoluteWeek(scheduled.dueAtAbsoluteWeek);
        state.season = due.season;
        state.week = due.week;
        state = runWeeklyGenerators(state);
        const praise = state.inbox.find(
          (item) =>
            item.generatorId === "manager-recruitment-promise-review" &&
            item.subject.includes("Promise kept"),
        );
        check("review recognises delivered promise", !!praise);
        check("kept-promise review is non-blocking", praise?.status === "unread" && !praise.choices?.length);
      }
    }
  }
}

console.log("\n[MRP3] Broken promise creates confrontation");
{
  const data = fixture();
  const manager = data.manager;
  let state = data.state;
  state = runWeeklyGenerators(state);
  const request = state.inbox.find((item) => item.generatorId === "manager-recruitment-request");
  if (!request) throw new Error("fixture should emit manager request");
  state = handleInboxChoice(state, request.id, "promise");
  const scheduled = state.scheduledGenerators.find(
    (entry) => entry.generatorId === "manager-recruitment-promise-review",
  );
  check("missed-promise fixture has scheduled review", !!scheduled);

  if (scheduled) {
    const due = fromAbsoluteWeek(scheduled.dueAtAbsoluteWeek);
    state.season = due.season;
    state.week = due.week;
    state = runWeeklyGenerators(state);
    const confrontation = state.inbox.find(
      (item) =>
        item.generatorId === "manager-recruitment-promise-review" &&
        item.subject.includes("broken recruitment promise"),
    );
    check("missed promise creates manager confrontation", !!confrontation);
    check("confrontation blocks for chairman response", confrontation?.status === "awaitingDecision" && confrontation.choices?.length === 3);

    if (confrontation) {
      const before = managerRelationship(state, manager);
      state = handleInboxChoice(state, confrontation.id, "withdraw");
      const after = managerRelationship(state, manager);
      check("withdrawing broken promise damages trust", after.trust < before.trust);
      check("withdrawing broken promise damages backing", after.backing < before.backing);
      check("withdrawal clears active commitment", managerRecruitmentCommitment(state, manager.id)?.active === false);
    }
  }
}

console.log("\n=== " + passed + " passed, " + failed + " failed ===");
if (failed > 0) process.exit(1);
