import { newGame } from "../newGame";
import { managerJoinTerms, staffJoinTermsForState } from "../staff";
import { ensureAttainableStaffMarket } from "../staffMarketAttainability";

let passed = 0;
function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`staff-market-attainability: ${message}`);
  passed += 1;
}

function willingManagers(state: ReturnType<typeof newGame>): number {
  return state.staffCandidates.filter(
    (staff) => staff.role === "Manager" && managerJoinTerms(state, staff).willing,
  ).length;
}

function willingHeadCoaches(state: ReturnType<typeof newGame>): number {
  return state.staffCandidates.filter(
    (staff) => staff.role === "Head Coach" && staffJoinTermsForState(state, staff).willing,
  ).length;
}

const fresh = newGame("Dalton Town", "Chairman", "staff-market-opening-check");
check(willingManagers(fresh) >= 5, "fresh Level 7 career must expose at least five willing managers");
check(
  willingHeadCoaches(fresh) >= 5,
  "fresh Level 7 career must expose at least five willing head coaches",
);

const broadManagerCount = fresh.staffCandidates.filter((staff) => staff.role === "Manager").length;
check(broadManagerCount >= 22, "attainability guard must preserve the broad manager market");

const emptied = structuredClone(fresh);
emptied.week = 9;
emptied.staffCandidates = emptied.staffCandidates.filter(
  (staff) => staff.role !== "Manager" && staff.role !== "Head Coach",
);
const repaired = ensureAttainableStaffMarket(emptied, emptied.staffCandidates);
const repairedState = { ...emptied, staffCandidates: repaired };
check(willingManagers(repairedState) >= 5, "rolling market repair must restore willing managers");
check(
  willingHeadCoaches(repairedState) >= 5,
  "rolling market repair must restore willing head coaches",
);

const again = ensureAttainableStaffMarket(repairedState, repaired);
check(again.length === repaired.length, "guard must be idempotent once minimum availability is met");

console.log(`staff-market-attainability.check: ${passed} checks passed`);
