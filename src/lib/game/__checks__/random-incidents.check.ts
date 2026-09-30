/* Runtime verification for reusable random chairman incidents.
   Run with: bun src/lib/game/__checks__/random-incidents.check.ts
*/
import { newGame } from "../engine";
import { handleInboxChoice, isKnownGeneratorId, runWeeklyGenerators } from "../inbox";
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
  const state = newGame("Incident Town", "Casey Chairman");
  state.saveSeed = "RANDOM_INCIDENT_CHECK";
  state.inbox = [];
  state.scheduledGenerators = [];
  return state;
}

console.log("\n[RI1] Scenario library");
check("starter library has at least 10 incidents", RANDOM_INCIDENTS.length >= 10);
check("scenario ids are unique", new Set(RANDOM_INCIDENTS.map((item) => item.id)).size === RANDOM_INCIDENTS.length);
check("every incident presents three chairman choices", RANDOM_INCIDENTS.every((item) => item.choices(fixture()).length === 3));
check("most incidents can escalate to the press", RANDOM_INCIDENTS.filter((item) => item.press).length >= 7);

console.log("\n[RI2] Generator registration");
check("random incident generator registered", isKnownGeneratorId("random-incident"));
check("press follow-up generator registered", isKnownGeneratorId("random-incident-press"));

console.log("\n[RI3] Deterministic incident + press chain");
{
  let targetWeek = 0;
  let expectedIncidentId = "";
  for (let week = 5; week <= 45; week++) {
    const rng = seededRng("RANDOM_INCIDENT_CHECK", "random-incident", absoluteWeek(1, week));
    if (rng() >= 0.24) continue;
    const incident = RANDOM_INCIDENTS[Math.floor(rng() * RANDOM_INCIDENTS.length)];
    if (!incident?.press) continue;
    targetWeek = week;
    expectedIncidentId = incident.id;
    break;
  }

  check("test seed finds a press-enabled incident week", targetWeek > 0, `week=${targetWeek}`);

  if (targetWeek > 0) {
    let state = fixture();
    state.week = targetWeek;
    state = runWeeklyGenerators(state);
    const incident = state.inbox.find((item) => item.generatorId === "random-incident");

    check("random incident emitted", !!incident, expectedIncidentId);
    check("selected incident is deterministic", !!incident?.eventKey.includes(`:${expectedIncidentId}:`), incident?.eventKey);
    check("incident blocks Continue with a decision", incident?.status === "awaitingDecision");
    check("incident has exactly three choices", incident?.choices?.length === 3);

    if (incident?.choices?.length) {
      const defer = incident.choices.find((choice) => choice.id === "defer") ?? incident.choices[0];
      state = handleInboxChoice(state, incident.id, defer.id);
      const scheduled = state.scheduledGenerators.find((entry) => entry.generatorId === "random-incident-press");
      check("chairman decision schedules press follow-up", !!scheduled);
      check(
        "press follow-up carries incident identity",
        String(scheduled?.payload?.incidentId ?? "") === expectedIncidentId,
      );

      if (scheduled) {
        const next = fromAbsoluteWeek(scheduled.dueAtAbsoluteWeek);
        state.season = next.season;
        state.week = next.week;
        state = runWeeklyGenerators(state);
        const press = state.inbox.find((item) => item.generatorId === "random-incident-press");
        check("press conference appears when due", !!press);
        check("press conference is a Media decision", press?.department === "Media" && press.status === "awaitingDecision");
        check("press conference offers three responses", press?.choices?.length === 3);
      }
    }
  }
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
