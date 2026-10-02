import { advanceWeek, newGame } from "../engine";
import {
  ACADEMY_STATUSES,
  academyState,
  academyWeeklyCost,
  foundAcademy,
  markAcademyIntakeSeen,
  prospectAge,
  runAcademyWeek,
  setAcademyScholarships,
  signAcademyProspect,
} from "../academy";
import { userSquad } from "../recruitment";

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

console.log("\n[ACADEMY] Youth development pipeline");

const base = newGame("Academy Town", "A. Director", "ACADEMY-CHECK");
check("old/new saves begin with no active academy", academyState(base).status === 0);
check("no academy has zero weekly academy cost", academyWeeklyCost(base) === 0);

const founded = foundAcademy(base);
const academy = academyState(founded);
check("founding creates the Youth Scheme", academy.status === 1);
check("founding pays the configured setup cost", founded.cash === base.cash - ACADEMY_STATUSES[1].upgradeCost);
check("founding creates a first intake immediately", academy.prospects.length === ACADEMY_STATUSES[1].maxScholarships);
check("first intake is waiting for its reveal", academy.lastIntakeSeason === founded.season && academy.intakeSeenSeason < academy.lastIntakeSeason);
check("intake contains youth ages only", academy.prospects.every((prospect) => {
  const age = prospectAge(founded, prospect);
  return age >= 15 && age <= 17;
}));

const seen = markAcademyIntakeSeen(founded);
check("intake can be marked seen without losing prospects", academyState(seen).intakeSeenSeason === seen.season && academyState(seen).prospects.length === academy.prospects.length);

const reduced = setAcademyScholarships(seen, 2);
check("scholarship intake size is configurable", academyState(reduced).scholarships === 2);

const weekly = structuredClone(reduced);
const beforeWeeklyCash = weekly.cash;
runAcademyWeek(weekly);
const weeklyCost = academyWeeklyCost(reduced);
check("weekly academy running cost posts to cash", weekly.cash === beforeWeeklyCash - weeklyCost);
const afterFirstPost = weekly.cash;
runAcademyWeek(weekly);
check("weekly academy cost is dedupe-safe", weekly.cash === afterFirstPost);
check("academy cost is recorded in the finance ledger", weekly.financeLedger.some((entry) => entry.dedupeKey === `academy:s${weekly.season}:w${weekly.week}`));

const graduateState = structuredClone(reduced);
const graduate = academyState(graduateState).prospects[0];
graduate.dateOfBirth.year = 2000 + graduateState.season - 1 - 18;
const squadBefore = userSquad(graduateState).length;
const signed = signAcademyProspect(graduateState, graduate.id);
check("signing a scholar creates a first-team player", userSquad(signed).length === squadBefore + 1);
check("signed scholar leaves the academy pipeline", !academyState(signed).prospects.some((prospect) => prospect.id === graduate.id));
check("graduate history records the promotion", academyState(signed).graduates.some((entry) => entry.prospectId === graduate.id && entry.outcome === "promoted"));

let seasonRun = seen;
const startingSeason = seasonRun.season;
for (let i = 0; i < 60 && seasonRun.season === startingSeason; i += 1) seasonRun = advanceWeek(seasonRun);
check("academy survives a full engine season rollover", seasonRun.season > startingSeason && academyState(seasonRun).status === 1);
check("new season creates another intake", academyState(seasonRun).lastIntakeSeason === seasonRun.season);

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
