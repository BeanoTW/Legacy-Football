import { readFileSync } from "node:fs";
import { newGame } from "../engine";
import {
  createChairmanMultiScoutingBrief,
} from "../chairmanScoutingBrief";
import {
  discoveredCandidateViews,
  progressScoutingDiscoveryDayInPlace,
  scoutingSearchPlan,
} from "../scoutingDiscovery";
import { makeStaff } from "../staff";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log("  ✓ " + name);
    passed += 1;
  } else {
    console.error("  ✗ " + name);
    failed += 1;
  }
}

console.log("\n[TAILORED-MULTI-SCOUTING] Each position keeps its own requirements");

const elite = newGame("Tailored Scouts", "Director", "TAILORED-SCOUT");
elite.hiredStaff = [];
elite.football.department.recruitmentRating = 90;
const eliteChief = makeStaff("Chief Scout", 90, () => 0.8);
eliteChief.stats.scouting = 95;
eliteChief.stats.negotiation = 85;
const eliteScout = makeStaff("Scout", 90, () => 0.8);
eliteScout.stats.scouting = 95;
elite.hiredStaff = [eliteChief, eliteScout];
check("elite department can run four position briefs", scoutingSearchPlan(elite).positionCapacity === 4);

const configured = createChairmanMultiScoutingBrief(elite, {
  id: "tailored-brief",
  positionBriefs: [
    {
      position: "DEF",
      tacticalPosition: "CB",
      playerLevel: "startingXI",
      minAge: 21,
      maxAge: 29,
      clubStatus: "contracted",
      maxMarketValue: 2_000_000,
    },
    {
      position: "MID",
      tacticalPosition: "CAM",
      playerLevel: "starPotential",
      minAge: 18,
      maxAge: 23,
    },
    {
      position: "FWD",
      tacticalPosition: "ST",
      playerLevel: "firstTeam",
      minAge: 20,
      maxAge: 30,
      maxWeeklyWage: 8_000,
    },
  ],
});

const stored = configured.football.scoutingDiscovery?.briefs.find((brief) => brief.id === "tailored-brief");
check("three independent position briefs are persisted", stored?.positionBriefs?.length === 3);
check(
  "defender requirements remain independent",
  stored?.positionBriefs?.[0]?.position === "DEF" &&
    stored.positionBriefs[0].tacticalPosition === "CB" &&
    stored.positionBriefs[0].playerLevel === "startingXI" &&
    stored.positionBriefs[0].minAge === 21 &&
    stored.positionBriefs[0].clubStatus === "contracted",
);
check(
  "midfielder can target a different level and age",
  stored?.positionBriefs?.[1]?.position === "MID" &&
    stored.positionBriefs[1].tacticalPosition === "CAM" &&
    stored.positionBriefs[1].playerLevel === "starPotential" &&
    stored.positionBriefs[1].maxAge === 23,
);
check(
  "forward keeps its own wage ceiling",
  stored?.positionBriefs?.[2]?.position === "FWD" &&
    stored.positionBriefs[2].maxWeeklyWage === 8_000,
);
check("tailored brief no longer relies on one shared player level", stored?.playerLevel === undefined);

const completed = structuredClone(configured);
progressScoutingDiscoveryDayInPlace(completed, 999999);
const views = discoveredCandidateViews(completed, "tailored-brief");
const requirements = new Map(stored?.positionBriefs?.map((target) => [target.position, target]) ?? []);
check(
  "returned candidates obey the age band for their own position brief",
  views.every((view) => {
    const target = requirements.get(view.position);
    return Boolean(target) &&
      (target?.minAge === undefined || view.age >= target.minAge) &&
      (target?.maxAge === undefined || view.age <= target.maxAge);
  }),
);
check(
  "results come only from explicitly requested broad positions",
  views.every((view) => requirements.has(view.position)),
);

const low = newGame("Small Scout FC", "Director", "TAILORED-LOW");
low.hiredStaff = [];
low.football.department.recruitmentRating = 30;
const limited = createChairmanMultiScoutingBrief(low, {
  id: "limited-tailored",
  positionBriefs: [
    { position: "GK", playerLevel: "backup" },
    { position: "DEF", playerLevel: "firstTeam" },
    { position: "MID", playerLevel: "startingXI" },
  ],
});
const limitedBrief = limited.football.scoutingDiscovery?.briefs.find((brief) => brief.id === "limited-tailored");
check("engine still enforces staff capacity on tailored briefs", limitedBrief?.positionBriefs?.length === 1);

const ui = readFileSync("src/components/game/ScoutingBriefBuilder.tsx", "utf8");
check(
  "UI edits one selected position at a time",
  ui.includes("These requirements only apply to") &&
    ui.includes("positionBriefs: positions.map"),
);
check(
  "footer summarizes separate searches instead of one shared filter",
  ui.includes("searches") && ui.includes("up to {plan.candidateLimit} total"),
);

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
