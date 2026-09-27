import type { Staff } from "../types";
import { managerFootballIdentity } from "../managerIdentity";
import { openingStaffPool } from "../staff";

let passed = 0;
function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`manager-football-identity: ${message}`);
  passed += 1;
}

function manager(overrides: Partial<Staff["stats"]> = {}): Staff {
  return {
    id: "manager-check",
    name: "A. Manager",
    role: "Manager",
    age: 44,
    rating: 70,
    wage: 1_000,
    contractWeeks: 104,
    reputation: 70,
    stats: {
      tactics: 70,
      attack: 68,
      defense: 68,
      development: 65,
      scouting: 50,
      negotiation: 50,
      medical: 50,
      motivation: 70,
      ...overrides,
    },
  };
}

const attacking = managerFootballIdentity(manager({ attack: 84, defense: 62, tactics: 78 }));
check(attacking.preferredFormation === "4-3-3", "strong attacking manager should prefer 4-3-3");
check(attacking.philosophy === "Possession", "technical attacking manager should have possession identity");
check(attacking.alternativeFormations.length === 2, "high tactical rating should expose two alternatives");

const defensive = managerFootballIdentity(manager({ attack: 55, defense: 82, tactics: 74 }));
check(defensive.preferredFormation === "5-3-2", "strong defensive manager should prefer 5-3-2");
check(defensive.philosophy === "Defensive", "defense-first manager should expose defensive philosophy");


const attackingBackThree = managerFootballIdentity(
  manager({ attack: 78, defense: 70, tactics: 76, development: 74, motivation: 72 }),
);
check(
  ["3-4-3", "3-5-2", "4-3-3"].includes(attackingBackThree.preferredFormation),
  "modern attacking profiles should be able to land on a three-back shape",
);

const adaptable = managerFootballIdentity(manager({ tactics: 88, development: 82 }));
check(adaptable.adaptability === "High", "elite tactical/development profile should be highly adaptable");
check(adaptable.summary.includes(adaptable.preferredFormation), "summary should include preferred formation");

const direct = managerFootballIdentity(manager({ tactics: 48, attack: 70, defense: 65, motivation: 65 }));
check(direct.philosophy === "Direct", "lower-tactics attacking manager should expose direct philosophy");



const openingManagers = openingStaffPool("MANAGER_FORMATION_VARIETY")
  .filter((staff) => staff.role === "Manager")
  .map((staff) => managerFootballIdentity(staff).preferredFormation);
const openingShapes = new Set(openingManagers);
const fourFourTwoCount = openingManagers.filter((formation) => formation === "4-4-2").length;
check(openingShapes.size >= 4, "opening manager market should offer at least four distinct formations");
check(openingShapes.has("3-5-2"), "opening manager market should include a 3-5-2 option");
check(openingShapes.has("3-4-3"), "opening manager market should include a 3-4-3 option");
check(
  fourFourTwoCount <= Math.ceil(openingManagers.length * 0.45),
  "4-4-2 should not dominate the opening manager market",
);

console.log(`manager-football-identity.check: ${passed} checks passed`);
