import { readFileSync } from "node:fs";
import { newGame } from "../engine";
import {
  aiClubAttractionGap,
  aiClubBidInterestScore,
  aiClubRecruitmentScore,
  aiClubRenewalChance,
  aiClubStrategy,
  aiClubTargetSquadSize,
  type AiClubStrategy,
} from "../aiClubStrategy";
import { canonicalClubReference, isUserClubReference } from "../clubReference";
import type { FootballPlayer } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? " — " + detail : ""}`);
  }
}

console.log("\n[WORLD EVOLUTION] AI club strategic direction");

const state = newGame("Evolution FC", "Director", "world-evolution-strategy");
const aiClub = state.leagues
  .flatMap((league) => league.clubIds)
  .find((clubId) => !isUserClubReference(state, clubId));
if (!aiClub) throw new Error("No AI club found");

const before = JSON.stringify(state);
const first = aiClubStrategy(state, aiClub);
const second = aiClubStrategy(state, aiClub);
check("strategy derivation is deterministic", JSON.stringify(first) === JSON.stringify(second));
check("strategy derivation is pure", JSON.stringify(state) === before);
check("strategy identifies the canonical club", first.clubId === canonicalClubReference(state, aiClub));

const clubId = canonicalClubReference(state, aiClub);
state.aiClubPerformance = {
  schemaVersion: 1,
  processedSeasons: [],
  clubsById: {
    [clubId]: { clubId, performance: 2, lastUpdatedSeason: state.season },
  },
};
const hot = aiClubStrategy(state, aiClub);
check(
  "strong sustained performance raises ambition",
  hot.ambition === "promotion" || hot.ambition === "challenge",
  hot.ambition,
);

state.aiClubPerformance.clubsById[clubId].performance = -2;
const struggling = aiClubStrategy(state, aiClub);
check("poor performance creates survival pressure", struggling.ambition === "survival", struggling.ambition);
check("poor performance triggers a rebuild cycle", struggling.squadCycle === "rebuild", struggling.squadCycle);

const baseStrategy: AiClubStrategy = {
  ...first,
  ambition: "consolidate",
  financialPosture: "balanced",
  squadCycle: "stable",
  financeBand: 3,
  performance: 0,
};
const push: AiClubStrategy = {
  ...baseStrategy,
  ambition: "promotion",
  financialPosture: "spend",
  squadCycle: "refresh",
};
const cut: AiClubStrategy = {
  ...baseStrategy,
  ambition: "survival",
  financialPosture: "cut",
  squadCycle: "rebuild",
};
check("promotion push carries a larger squad than cost cutting", aiClubTargetSquadSize(push) > aiClubTargetSquadSize(cut));
check("spending clubs can reach a wider reputation market", aiClubAttractionGap(push) > aiClubAttractionGap(cut));

const players = state.football.players.filter((player) => player.currentClubId === null);
if (players.length < 2) throw new Error("No free-agent sample");
const template = players[0];
const younger: FootballPlayer = {
  ...template,
  id: "strategy-young",
  dateOfBirth: { year: 2000 + state.season - 1 - 20, month: 1, day: 1 },
  currentAbility: 50,
  potentialAbility: 68,
  wageExpectation: 500,
};
const older: FootballPlayer = {
  ...template,
  id: "strategy-old",
  dateOfBirth: { year: 2000 + state.season - 1 - 30, month: 1, day: 1 },
  currentAbility: 50,
  potentialAbility: 52,
  wageExpectation: 500,
};
const develop: AiClubStrategy = { ...baseStrategy, squadCycle: "develop" };
check(
  "development clubs prefer younger upside at equal ability",
  aiClubRecruitmentScore(develop, younger, 20) > aiClubRecruitmentScore(develop, older, 30),
);
check(
  "cutting/rebuilding clubs are less willing to retain an older fringe player",
  aiClubRenewalChance(cut, older, 30, false) < aiClubRenewalChance(push, older, 30, false),
);

state.aiClubPerformance.clubsById[clubId].performance = 0;
const originalFringe = state.fringeWorld?.[clubId];
if (state.fringeWorld && originalFringe) originalFringe.financeBand = 5;
const spendScore = aiClubBidInterestScore(state, aiClub, younger);
if (state.fringeWorld && originalFringe) originalFringe.financeBand = 1;
const cautiousScore = aiClubBidInterestScore(state, aiClub, younger);
check("financial direction can change transfer-market aggression", spendScore >= cautiousScore);

const recruitmentSource = readFileSync(new URL("../recruitmentLegacy.ts", import.meta.url), "utf8");
check(
  "weekly AI recruitment consumes strategic direction",
  recruitmentSource.includes("aiClubStrategy(s, club)") &&
    recruitmentSource.includes("aiClubRecruitmentScore(strategy") &&
    recruitmentSource.includes("aiClubTargetSquadSize(strategy)"),
);
check(
  "AI renewals consume strategic direction",
  recruitmentSource.includes("aiClubRenewalChance(strategy"),
);
check(
  "incoming bidder selection consumes strategic direction",
  recruitmentSource.includes("aiClubBidInterestScore(s, clubId, p)"),
);

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed) process.exit(1);
