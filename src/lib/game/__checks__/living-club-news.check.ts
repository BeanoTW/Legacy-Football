/* Runtime verification for Living Club Newsroom stories.
   Run with: bun src/lib/game/__checks__/living-club-news.check.ts
*/
import { newGame } from "../engine";
import { newsFeed } from "../newsFeed";
import type { GameState, InboxItem } from "../types";

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
  const state = newGame("News Town", "Chairman Test");
  state.inbox = [];
  state.results = [];
  state.matchRecords = [];
  return state;
}

function incident(status: InboxItem["status"]): InboxItem {
  return {
    id: "INCIDENT-1",
    generatorId: "random-incident",
    eventKey: "random-incident:storm-stand-damage:s1:abs8",
    conversationKey: "incident:storm-stand-damage:s1:abs8",
    sender: "Eddie Kerr",
    department: "Groundskeeper",
    category: "facilities",
    subject: "Storm damage found in the main stand",
    body: "Overnight wind and water have damaged roof panels and part of the concourse.\n\nThe club must decide how far to go with repairs.",
    priority: "high",
    week: 8,
    season: 1,
    status,
    choices: [
      { id: "full", label: "Authorise the full repair — £130k", effects: [] },
      { id: "defer", label: "Leave it and monitor the damage", effects: [] },
    ],
    chosenChoiceId: status === "completed" ? "full" : undefined,
  };
}

console.log("\n[LCN1] Club incidents become public only after resolution");
{
  const state = fixture();
  state.inbox.push(incident("awaitingDecision"));
  check(
    "unresolved incident does not leak into news",
    !newsFeed(state).some((article) => article.kind === "clubIncident"),
  );

  state.inbox[0] = incident("completed");
  const article = newsFeed(state).find((candidate) => candidate.kind === "clubIncident");
  check("resolved incident creates club story", !!article);
  check("club story records chairman decision", article?.standfirst.includes("full repair") === true);
  check("club story involves user", article?.involvesUser === true);
}

console.log("\n[LCN2] Completed press room uses persisted interview history");
{
  const state = fixture();
  state.inbox.push(incident("completed"));
  state.inbox.push({
    id: "PRESS-1",
    generatorId: "random-incident-press",
    eventKey: "random-incident-press:random-incident:storm-stand-damage:s1:abs8",
    conversationKey: "incident:storm-stand-damage:s1:abs8",
    sender: "Rachel Morgan",
    department: "Media",
    category: "media",
    subject: "Press conference — Storm damage found in the main stand",
    body: "Journalists want an explanation.",
    priority: "normal",
    week: 9,
    season: 1,
    status: "completed",
    choices: [{ id: "transparent", label: "Explain the decision openly", effects: [] }],
    chosenChoiceId: "transparent",
    pressConference: {
      outcome: "Open and accountable",
      exchanges: [
        { question: "Why did you spend the money?", answer: "Supporter safety comes first" },
        { question: "Why was it not fixed earlier?", answer: "We accept that criticism" },
        { question: "What happens next?", answer: "We will publish the work plan" },
      ],
    },
  });

  const article = newsFeed(state).find((candidate) => candidate.kind === "pressConference");
  check("completed press room creates follow-up story", !!article);
  check("press outcome is surfaced", article?.standfirst.includes("Open and accountable") === true);
  check("persisted questions feed article body", article?.body.some((line) => line.includes("Why did you spend")) === true);
  check("all three exchanges are retained", article?.facts?.find((fact) => fact.label === "Questions")?.value === "3");
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
