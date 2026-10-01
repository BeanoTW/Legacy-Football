/* Runtime verification for persistent press relationships + social reaction.
   Run with: bun src/lib/game/__checks__/media-social.check.ts
*/
import { newGame } from "../engine";
import { resolvePressConference } from "../inbox";
import {
  adjustMediaRelationshipInPlace,
  journalistForConversation,
  JOURNALISTS,
  mediaRelationship,
} from "../mediaRelations";
import { newsFeed } from "../newsFeed";
import { pressRoundTwo } from "../pressConference";
import { RANDOM_INCIDENTS } from "../randomIncidents";
import { socialFeed } from "../socialFeed";
import type { GameState, InboxItem } from "../types";

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

function pressItem(): InboxItem {
  return {
    id: "PRESS-MEDIA-CHECK",
    generatorId: "random-incident-press",
    eventKey: "random-incident-press:media-check",
    conversationKey: "incident:storm-stand-damage:s1:abs8",
    sender: "Media",
    department: "Media",
    category: "media",
    priority: "normal",
    subject: "Press conference — Storm damage found in the main stand",
    body: "Journalists want an explanation.",
    week: 9,
    season: 1,
    status: "awaitingDecision",
    choices: [
      { id: "transparent", label: "Explain openly", effects: [] },
      { id: "reassure", label: "Reassure supporters", effects: [] },
      { id: "dismiss", label: "Reject the premise", effects: [] },
    ],
  };
}

console.log("\n[MS1] Journalist identity and relationship are persistent");
{
  const state = newGame("Media Town", "Chairman Test");
  const a = journalistForConversation(state, "incident:one");
  const b = journalistForConversation(state, "incident:one");
  check("same conversation gets same reporter", a.id === b.id);
  check("default reporter relationship is professional", mediaRelationship(state, a.id).score === 55);

  adjustMediaRelationshipInPlace(state, a.id, -30);
  check("relationship adjustment persists", mediaRelationship(state, a.id).score === 25);
  adjustMediaRelationshipInPlace(state, a.id, 500);
  check("media relationship clamps at 100", mediaRelationship(state, a.id).score === 100);
}

console.log("\n[MS2] Reporter relationship changes follow-up pressure");
{
  const incident = RANDOM_INCIDENTS.find((item) => item.press);
  const reporter = JOURNALISTS.find((item) => item.style === "balanced") ?? JOURNALISTS[0];
  if (!incident || !reporter) throw new Error("fixture needs press incident and reporter");

  const cold = newGame("Cold Press FC", "Chairman Test");
  adjustMediaRelationshipInPlace(cold, reporter.id, -30);
  const hard = pressRoundTwo(cold, incident, "defer", "reassure", reporter).question;

  const warm = newGame("Warm Press FC", "Chairman Test");
  adjustMediaRelationshipInPlace(warm, reporter.id, 30);
  const soft = pressRoundTwo(warm, incident, "defer", "reassure", reporter).question;

  check("cold relationship produces harder follow-up", hard !== soft);
  check("warm relationship acknowledges established trust", soft.includes("built some trust"));
}

console.log("\n[MS3] Press outcome updates media relationship atomically");
{
  const state: GameState = newGame("Interview Town", "Chairman Test");
  state.inbox = [pressItem()];
  const reporter = JOURNALISTS[0];
  if (!reporter) throw new Error("fixture needs reporter");
  const before = mediaRelationship(state, reporter.id).score;

  const resolved = resolvePressConference(
    state,
    "PRESS-MEDIA-CHECK",
    "transparent",
    [],
    {
      outcome: "Open and accountable",
      exchanges: [
        { question: "Why?", answer: "We accept responsibility" },
        { question: "What next?", answer: "We will publish the plan" },
        { question: "Final word?", answer: "Judge us on delivery" },
      ],
      journalistId: reporter.id,
      journalistName: reporter.name,
      journalistOutlet: reporter.outlet,
      journalistStyle: reporter.style,
    },
  );
  check("open interview improves reporter relationship", mediaRelationship(resolved, reporter.id).score > before);
  check(
    "journalist identity persists with conference",
    resolved.inbox[0]?.pressConference?.journalistName === reporter.name,
  );

  const repeated = resolvePressConference(
    resolved,
    "PRESS-MEDIA-CHECK",
    "transparent",
    [],
    {
      outcome: "Open and accountable",
      exchanges: [],
      journalistId: reporter.id,
      journalistName: reporter.name,
      journalistOutlet: reporter.outlet,
      journalistStyle: reporter.style,
    },
  );
  check(
    "repeat resolution cannot double-apply media goodwill",
    mediaRelationship(repeated, reporter.id).score === mediaRelationship(resolved, reporter.id).score,
  );
}

console.log("\n[MS4] Persisted press coverage drives supporter social sentiment");
{
  const state = newGame("Social Town", "Chairman Test");
  const reporter = JOURNALISTS[1] ?? JOURNALISTS[0];
  if (!reporter) throw new Error("fixture needs reporter");
  state.inbox = [
    {
      ...pressItem(),
      id: "PRESS-OPEN",
      eventKey: "random-incident-press:open-story",
      conversationKey: "incident:open-story:s1:abs8",
      status: "completed",
      chosenChoiceId: "transparent",
      pressConference: {
        outcome: "Open and accountable",
        exchanges: [
          { question: "Why?", answer: "We accept responsibility" },
          { question: "What next?", answer: "We have a plan" },
          { question: "Promise?", answer: "Judge us on delivery" },
        ],
        journalistId: reporter.id,
        journalistName: reporter.name,
        journalistOutlet: reporter.outlet,
        journalistStyle: reporter.style,
      },
    },
  ];

  const article = newsFeed(state).find((item) => item.kind === "pressConference");
  check("Newsroom uses persisted reporter byline", article?.byline === reporter.name);

  const posts = socialFeed(state).filter((post) => post.sourceArticleId === article?.id);
  check("press story produces supporter social posts", posts.length === 2);
  check("open press approach produces positive social sentiment", posts.every((post) => post.sentiment === "positive"));

  const combativeState = structuredClone(state);
  const press = combativeState.inbox[0];
  if (!press?.pressConference) throw new Error("fixture press summary missing");
  press.eventKey = "random-incident-press:combative-story";
  press.pressConference.outcome = "Combative";
  const negative = socialFeed(combativeState).filter((post) => post.sentiment === "negative");
  check("combative press approach creates negative supporter reaction", negative.length >= 2);
}

console.log("\n=== " + passed + " passed, " + failed + " failed ===");
if (failed > 0) process.exit(1);
