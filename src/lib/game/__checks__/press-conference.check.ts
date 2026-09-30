/* Runtime verification for multi-turn press conference resolution.
   Run with: bun src/lib/game/__checks__/press-conference.check.ts
*/
import { newGame } from "../engine";
import {
  handleInboxChoice,
  resolvePressConference,
  runWeeklyGenerators,
} from "../inbox";
import { RANDOM_INCIDENTS } from "../randomIncidents";
import { seededRng } from "../rng";
import { absoluteWeek, fromAbsoluteWeek } from "../time";
import type { GameState } from "../types";

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

function fixture(): GameState {
  const state = newGame("Press Town", "Chairman Test");
  state.saveSeed = "PRESS_CONFERENCE_CHECK";
  state.inbox = [];
  state.scheduledGenerators = [];
  return state;
}

function pressIncidentWeek() {
  for (let week = 5; week <= 45; week++) {
    const rng = seededRng("PRESS_CONFERENCE_CHECK", "random-incident", absoluteWeek(1, week));
    if (rng() >= 0.24) continue;
    const incident = RANDOM_INCIDENTS[Math.floor(rng() * RANDOM_INCIDENTS.length)];
    if (incident?.press) return week;
  }
  return 0;
}

console.log("\n[PC1] Atomic multi-turn resolution");
{
  const week = pressIncidentWeek();
  check("test seed finds press-enabled incident", week > 0, `week=${week}`);

  if (week > 0) {
    let state = fixture();
    state.week = week;
    state = runWeeklyGenerators(state);
    const incident = state.inbox.find((item) => item.generatorId === "random-incident");
    check("incident emitted", !!incident);

    if (incident?.choices?.length) {
      const originalChoice = incident.choices.find((choice) => choice.id === "defer") ?? incident.choices[0];
      state = handleInboxChoice(state, incident.id, originalChoice.id);
      const scheduled = state.scheduledGenerators.find((entry) => entry.generatorId === "random-incident-press");
      check("press follow-up scheduled", !!scheduled);

      if (scheduled) {
        const due = fromAbsoluteWeek(scheduled.dueAtAbsoluteWeek);
        state.season = due.season;
        state.week = due.week;
        state = runWeeklyGenerators(state);
        const press = state.inbox.find((item) => item.generatorId === "random-incident-press");
        check("press item emitted", !!press);
        check("press item has three opening responses", press?.choices?.length === 3);

        if (press?.choices?.length) {
          const beforeRep = state.reputation;
          const beforeFans = state.fanHappiness;
          const first = press.choices.find((choice) => choice.id === "transparent") ?? press.choices[0];
          const later = [
            { kind: "reputation" as const, delta: 2 },
            { kind: "fanHappiness" as const, delta: 1 },
          ];
          const resolved = resolvePressConference(state, press.id, first.id, later);
          const completed = resolved.inbox.find((item) => item.id === press.id);

          check("press item completes once", completed?.status === "completed");
          check("first response is recorded", completed?.chosenChoiceId === first.id);
          check("combined reputation reaction applies", resolved.reputation > beforeRep);
          check("combined fan reaction applies", resolved.fanHappiness > beforeFans);

          const repeated = resolvePressConference(resolved, press.id, first.id, later);
          check("repeat finish does not double-apply reputation", repeated.reputation === resolved.reputation);
          check("repeat finish does not double-apply fan reaction", repeated.fanHappiness === resolved.fanHappiness);
        }
      }
    }
  }
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
