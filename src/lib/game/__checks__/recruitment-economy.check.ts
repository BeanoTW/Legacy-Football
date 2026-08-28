import { contractWageForLevel, playerValueForLevel, weeklyWageForLevel } from "../levelEconomy.ts";
import {
  recruitmentContractWageForLevel,
  recruitmentPlayerValue,
  recruitmentWageForLevel,
} from "../recruitmentEconomy.ts";
import type { FootballLevel } from "../footballLevel.ts";

const levels: FootballLevel[] = [1, 2, 3, 4, 5, 6, 7, 8];

for (const level of levels) {
  const wage = recruitmentWageForLevel(level, 61, 52, 24, 68);
  const expectedWage = weeklyWageForLevel({
    ability: 61,
    level,
    clubReputation: 52,
    age: 24,
    potential: 68,
  });
  if (wage !== expectedWage) {
    throw new Error(`Recruitment wage adapter diverged at football level ${level}`);
  }

  const value = recruitmentPlayerValue(61, 68, 24, level);
  const expectedValue = playerValueForLevel(61, 68, 24, level);
  if (value !== expectedValue) {
    throw new Error(`Recruitment valuation adapter diverged at football level ${level}`);
  }

  const contract = recruitmentContractWageForLevel(level, wage, 1.07);
  const expectedContract = contractWageForLevel(wage, 1.07, level);
  if (contract !== expectedContract) {
    throw new Error(`Recruitment contract wage adapter diverged at football level ${level}`);
  }
}

const legacyFloor = recruitmentContractWageForLevel(6, 90, 1);
const semiProFloor = recruitmentContractWageForLevel(7, 90, 1);
if (legacyFloor !== 200) {
  throw new Error(`Level 6 compatibility floor changed: £${legacyFloor}`);
}
if (!(semiProFloor < legacyFloor && semiProFloor >= 25)) {
  throw new Error(`Level 7 contract floor is not semi-professional: £${semiProFloor}`);
}

console.log("✓ recruitment economy adapters preserve canonical level behaviour");
