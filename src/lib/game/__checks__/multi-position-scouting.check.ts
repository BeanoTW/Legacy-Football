import { readFileSync } from "node:fs";
import { newGame } from "../engine";
import { createScoutingBrief, progressScoutingDiscoveryDayInPlace, scoutingSearchPlan } from "../scoutingDiscovery";
import { makeStaff } from "../staff";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[MULTI-POSITION-SCOUTING] Staff quality controls brief breadth");

const low = newGame("Low Scout FC", "Tester", "LOW-SCOUT");
low.hiredStaff = [];
low.football.department.recruitmentRating = 35;
assert(scoutingSearchPlan(low).positionCapacity === 1, "low-level recruitment team can cover one broad position");

const mid = structuredClone(low);
mid.football.department.recruitmentRating = 55;
assert(scoutingSearchPlan(mid).positionCapacity === 2, "developing recruitment team can cover two broad positions");

const strong = structuredClone(low);
strong.football.department.recruitmentRating = 70;
const strongChief = makeStaff("Chief Scout", 70, () => 0.5);
strongChief.stats.scouting = 70;
strongChief.stats.negotiation = 65;
const strongScout = makeStaff("Scout", 70, () => 0.5);
strongScout.stats.scouting = 70;
strong.hiredStaff = [strongChief, strongScout];
assert(scoutingSearchPlan(strong).positionCapacity === 3, "strong recruitment team can cover three broad positions");

const elite = structuredClone(low);
elite.football.department.recruitmentRating = 85;
const eliteChief = makeStaff("Chief Scout", 90, () => 0.8);
eliteChief.stats.scouting = 95;
eliteChief.stats.negotiation = 85;
const eliteScout = makeStaff("Scout", 90, () => 0.8);
eliteScout.stats.scouting = 95;
elite.hiredStaff = [eliteChief, eliteScout];
assert(scoutingSearchPlan(elite).positionCapacity === 4, "elite recruitment team can cover all four broad positions");

const limited = createScoutingBrief(low, {
  id: "low-multi",
  positions: ["GK", "DEF", "MID", "FWD"],
});
const lowBrief = limited.football.scoutingDiscovery?.briefs.find((brief) => brief.id === "low-multi");
assert(lowBrief?.positions?.length === 1, "engine enforces staff position capacity even if UI is bypassed");

const wide = createScoutingBrief(elite, {
  id: "elite-multi",
  positions: ["GK", "DEF", "MID", "FWD"],
});
const eliteBrief = wide.football.scoutingDiscovery?.briefs.find((brief) => brief.id === "elite-multi");
assert(eliteBrief?.positions?.length === 4, "elite brief persists all four selected positions");

const ui = readFileSync("src/components/game/ScoutingBriefBuilder.tsx", "utf8");
assert(
  ui.includes("current.length >= plan.positionCapacity") &&
    ui.includes("disabled={full}") &&
    ui.includes("You can search {plan.positionCapacity}"),
  "brief builder visibly limits multi-position selection by scouting capacity",
);

console.log("\n[REPEATABLE-SCOUTING] One active search, repeat once reported");
const blockedSearch = createScoutingBrief(limited, { id: "blocked-by-active", position: "FWD" });
assert(blockedSearch.football.scoutingDiscovery?.briefs.length === 1, "a second search cannot start before the first report returns");
const returned = structuredClone(lowBrief ? limited : low);
const dueDay = returned.football.scoutingDiscovery?.briefs[0]?.dueAtDay;
assert(typeof dueDay === "number", "first search has a delivery day");
progressScoutingDiscoveryDayInPlace(returned, dueDay);
assert(returned.football.scoutingDiscovery?.briefs[0]?.status === "complete", "first report completes");
const next = createScoutingBrief(returned, { id: "repeat-same-position", position: "GK" });
assert(next.football.scoutingDiscovery?.briefs.length === 2, "the same position may be scouted again after report");
assert(next.football.scoutingDiscovery?.briefs[1]?.status === "active", "new assignment starts normally");
const blockedThird = createScoutingBrief(next, { id: "third-while-active", position: "FWD" });
assert(blockedThird.football.scoutingDiscovery?.briefs.length === 2, "the new search must return before further searches");
console.log("\n13 passed, 0 failed");
