import assert from "node:assert/strict";
import { newGame } from "../engine";
import {
  assetById,
  ensureInfrastructure,
  projectCapacity,
  projectCatalogue,
  recomputeDerived,
  stadiumCapacity,
} from "../infrastructure";
import { buildQuote, queueStandBuild } from "../groundBuild";
import { newsFeed } from "../newsFeed";
import {
  infrastructureNarrativeIssues,
  primaryInfrastructureIssue,
} from "../infrastructureNarrative";
import { calendarPressRound } from "../pressConference";

console.log("\n[INFRASTRUCTURE-TRUTH]");

const fixture = () => {
  const state = newGame("Ground Truth FC", "Director Test");
  state.saveSeed = "INFRASTRUCTURE_TRUTH";
  ensureInfrastructure(state);
  return state;
};

{
  const state = fixture();
  const stand = state.infrastructure.assets.find((asset) => asset.type === "stand")!;
  const catalogue = projectCatalogue(state, stand.id);
  assert.equal(
    catalogue.some((spec) => spec.type === "roofUpgrade"),
    false,
    "standalone roof upgrade is no longer offered",
  );
}

{
  const state = fixture();
  const shop = assetById(state, "shop")!;
  shop.metadata.qualityUplift = 8;
  recomputeDerived(state);
  const first = shop.qualityRating;
  shop.condition = Math.max(0, shop.condition - 5);
  recomputeDerived(state);
  const expectedStructural =
    ((shop.level - 1) / Math.max(1, 4 - 1)) * 70 + shop.condition * 0.3 + 8;
  assert.equal(
    shop.qualityRating,
    Math.max(0, Math.min(100, Math.round(expectedStructural))),
    "durable project quality survives recomputation",
  );
  assert.ok(first >= shop.qualityRating, "condition can still change the derived quality around the durable uplift");
}

{
  const state = fixture();
  const stand = state.infrastructure.assets.find(
    (asset) => asset.type === "stand" && asset.level < 5,
  )!;
  const spec = projectCatalogue(state, stand.id).find(
    (candidate) => candidate.type === "capacityExpansion",
  )!;
  assert.ok(spec, "fixture exposes a stand expansion");
  const build = {
    standing: "terrace" as const,
    roof: "pitched" as const,
    variant: "longLow" as const,
  };
  const quote = buildQuote(state, spec.cost, stand.id, spec.type, build);
  assert.ok(quote.cost < spec.cost, "chosen build can legitimately undercut catalogue price");

  const reserve = state.finance?.minimumCashReserve ?? 0;
  state.cash = quote.cost + reserve + 1_000;
  assert.ok(state.cash < spec.cost + reserve, "fixture cannot afford catalogue price above reserve");

  const queued = queueStandBuild(state, stand.id, spec.type, build);
  assert.equal(queued.ok, true, queued.reason);
  const project = queued.state.infrastructure.projects.find(
    (candidate) => candidate.id === queued.state.groundIdentity?.pending?.[stand.id]?.projectId,
  )!;
  assert.equal(project.baseCost, quote.cost, "canonical project stores the chosen build price");
  assert.equal(
    project.paymentSchedule.filter((payment) => payment.kind === "instalment").reduce((sum, payment) => sum + payment.amount, 0),
    quote.cost,
    "payment schedule is built from the chosen price",
  );
}

{
  const state = fixture();
  state.reputation = 20;
  for (const stand of state.infrastructure.assets.filter((asset) => asset.type === "stand")) {
    stand.capacity = 1_000;
  }
  recomputeDerived(state);
  const small = projectCapacity(state);
  assert.equal(small.majorLimit, 1, "small club begins with one major construction lane");

  state.reputation = 60;
  const growing = projectCapacity(state);
  assert.equal(growing.majorLimit, 2, "growing club gains a second major construction lane");

  state.reputation = 85;
  const mature = projectCapacity(state);
  assert.equal(mature.majorLimit, 3, "large/mature club can coordinate three major lanes");
}

{
  const state = fixture();
  const pitch = assetById(state, "pitch")!;
  pitch.condition = 45;
  recomputeDerived(state);
  const issue = primaryInfrastructureIssue(state, "concern");
  assert.equal(issue?.assetId, "pitch", "poor pitch becomes a narrative maintenance issue");
  assert.ok(
    infrastructureNarrativeIssues(state).some((candidate) => candidate.assetId === "pitch"),
    "condition thresholds feed the shared narrative model",
  );
  assert.ok(
    newsFeed(state).some(
      (article) =>
        article.kind === "clubIncident" &&
        article.tags.includes("Maintenance") &&
        article.facts?.some((fact) => fact.label === "Facility" && fact.value === "Playing Surface"),
    ),
    "maintenance issue appears in the newsroom",
  );

  pitch.condition = 25;
  recomputeDerived(state);
  const press = calendarPressRound(state, "season-review", 3, ["reassure"]);
  assert.ok(
    press.question.toLowerCase().includes("pitch") ||
      press.question.toLowerCase().includes("playing surface"),
    "serious maintenance can become a press-conference question",
  );
  assert.equal(press.answers.length, 3, "maintenance press question keeps three response styles");
}

console.log("infrastructure truth pass: passed");
