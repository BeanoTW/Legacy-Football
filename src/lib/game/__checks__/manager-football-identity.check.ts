import type { Staff } from "../types";
import { managerFootballIdentity } from "../managerIdentity";

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

const adaptable = managerFootballIdentity(manager({ tactics: 88, development: 82 }));
check(adaptable.adaptability === "High", "elite tactical/development profile should be highly adaptable");
check(adaptable.summary.includes(adaptable.preferredFormation), "summary should include preferred formation");

const direct = managerFootballIdentity(manager({ tactics: 48, attack: 70, defense: 65, motivation: 65 }));
check(direct.philosophy === "Direct", "lower-tactics attacking manager should expose direct philosophy");

console.log(`manager-football-identity.check: ${passed} checks passed`);
