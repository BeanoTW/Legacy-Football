import {
  contractWageForLevel,
  playerValueForLevel,
  transferFeePolicyForLevel,
  weeklyWageForLevel,
} from "../levelEconomy.ts";
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

const professionalFees = transferFeePolicyForLevel(6);
const regionalPremierFees = transferFeePolicyForLevel(7);
const regionalDivisionFees = transferFeePolicyForLevel(8);
if (professionalFees.askingFloor !== 20_000 || professionalFees.feeStep !== 5_000) {
  throw new Error("Professional transfer compatibility policy changed");
}
if (regionalPremierFees.askingFloor !== 1_000 || regionalPremierFees.feeStep !== 500) {
  throw new Error("Level 7 transfer fee policy is not semi-professional");
}
if (regionalDivisionFees.askingFloor !== 500 || regionalDivisionFees.feeStep !== 250) {
  throw new Error("Level 8 transfer fee policy is not semi-professional");
}

console.log("✓ recruitment economy adapters preserve canonical level behaviour");
