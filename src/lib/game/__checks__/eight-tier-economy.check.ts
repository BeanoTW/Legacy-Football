/*
 * Eight-tier economy solvency audit.
 *
 * External calibration anchors (2024/25, Deloitte Annual Review 2026):
 * - Premier League: £6.8bn aggregate revenue, £4.4bn wages (~65%).
 * - Championship: £942m aggregate revenue, £903m wages (~96%).
 * - League One / League Two remain structurally loss-making in the real world,
 *   so the game must not make an average responsibly-run club automatically
 *   insolvent just to mimic owner-funded overspending.
 *
 * This check does not force every club to make a profit. It verifies that the
 * canonical economy leaves a viable path through all eight levels while still
 * allowing ambitious clubs to overspend.
 */
import {
  economicProfileForLevel,
  playerValueForLevel,
  revenueBaselineForLevel,
  staffMarketWage,
  staffWageForLevel,
  sustainableWeeklyWageBillForLevel,
  weeklyWageForLevel,
} from "../levelEconomy";
import type { FootballLevel } from "../footballLevel";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const levels: FootballLevel[] = [1,2,3,4,5,6,7,8];
const fmt = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

console.log("\n[A] External calibration anchors");
{
  const premier = revenueBaselineForLevel(1, 50).totalSeason;
  const championship = revenueBaselineForLevel(2, 50).totalSeason;
  const premierRatio = economicProfileForLevel(1).expectedWageRevenueRatio;
  const championshipRatio = economicProfileForLevel(2).expectedWageRevenueRatio;

  assert(premier >= 150_000_000 && premier <= 400_000_000,
    `Level 1 baseline revenue outside plausible non-elite PL band: ${fmt(premier)}`);
  assert(championship >= 20_000_000 && championship <= 50_000_000,
    `Level 2 baseline revenue outside plausible Championship band: ${fmt(championship)}`);
  assert(premierRatio >= 0.55 && premierRatio <= 0.75,
    `Level 1 wage/revenue target should sit near the real 65% anchor: ${premierRatio}`);
  assert(championshipRatio >= 0.75 && championshipRatio <= 1,
    `Level 2 should model the Championship's unusually high wage pressure: ${championshipRatio}`);
}

console.log("\n[B] Pyramid money curve");
{
  let previousRevenue = Infinity;
  let previousSustainable = Infinity;
  let previousPlayerWage = Infinity;
  let previousStaffWage = Infinity;
  let previousValue = Infinity;

  for (const level of levels) {
    const revenue = revenueBaselineForLevel(level, 50).totalSeason;
    const sustainable = sustainableWeeklyWageBillForLevel(level, 50);
    const playerWage = weeklyWageForLevel({
      level, ability: 65, clubReputation: 50, age: 26, potential: 67,
    });
    const staffWage = staffWageForLevel(8_500, level);
    const value = playerValueForLevel(65, 68, 25, level);

    assert(revenue < previousRevenue, `Revenue does not fall from level ${level-1} to ${level}`);
    assert(sustainable < previousSustainable,
      `Sustainable wage capacity does not fall at level ${level}`);
    assert(playerWage <= previousPlayerWage,
      `Same-ability player gets more expensive lower down at level ${level}`);
    assert(staffWage < previousStaffWage,
      `Same manager gets more expensive lower down at level ${level}`);
    assert(value <= previousValue,
      `Same player becomes more valuable lower down at level ${level}`);

    previousRevenue = revenue;
    previousSustainable = sustainable;
    previousPlayerWage = playerWage;
    previousStaffWage = staffWage;
    previousValue = value;
  }
}

console.log("\n[C] Representative squad + staff solvency");
{
  const baseAbility: Record<FootballLevel, number> = {
    1:78, 2:70, 3:62, 4:57, 5:52, 6:49, 7:46, 8:43,
  };
  const abilityOffsets = [-10,-9,-8,-7,-6,-5,-4,-4,-3,-3,-2,-2,-1,-1,0,0,1,1,2,2,3,4,5,7];
  // Leaner staffing is part of lower-league realism.
  const staffHeadcount: Record<FootballLevel, number> = {
    1:11, 2:11, 3:11, 4:9, 5:7, 6:6, 7:5, 8:4,
  };
  const levelThreeStaffWages = [8_500,4_500,4_200,3_600,2_800,2_600,2_400,2_300,2_100,2_000,1_100];

  for (const level of levels) {
    const revenue = revenueBaselineForLevel(level, 50).totalSeason;
    const playersWeekly = abilityOffsets.reduce((sum, offset) => sum + weeklyWageForLevel({
      level,
      ability: baseAbility[level] + offset,
      clubReputation: 50,
      age: 26,
      potential: baseAbility[level] + offset + 3,
    }), 0);
    const staffWeekly = levelThreeStaffWages
      .slice(0, staffHeadcount[level])
      .reduce((sum, wage) => sum + staffWageForLevel(wage, level), 0);
    const annualPayroll = (playersWeekly + staffWeekly) * 46;
    const payrollRatio = annualPayroll / revenue;
    const sustainableWeekly = sustainableWeeklyWageBillForLevel(level, 50);

    console.log(
      `  L${level}: revenue=${fmt(revenue)} players=${fmt(playersWeekly)}/wk staff=${fmt(staffWeekly)}/wk payroll=${Math.round(payrollRatio*100)}%`,
    );

    assert(playersWeekly + staffWeekly <= sustainableWeekly * 1.08,
      `Level ${level} representative football payroll exceeds sustainable capacity: ${fmt(playersWeekly + staffWeekly)}/wk vs ${fmt(sustainableWeekly)}/wk`);
    assert(payrollRatio <= 0.9,
      `Level ${level} normal football payroll leaves effectively no room for operating costs: ${Math.round(payrollRatio*100)}%`);
  }
}

console.log("\n[D] Staff market wage integrity");
{
  const eliteManager = staffMarketWage(8_500, 95);
  const eliteAssistant = staffMarketWage(4_200, 95);
  const semiProManager = staffMarketWage(8_500, 44);

  assert(eliteManager >= 140_000,
    `95-reputation manager is implausibly cheap: ${fmt(eliteManager)}/wk`);
  assert(eliteAssistant >= 60_000,
    `95-reputation assistant manager is implausibly cheap: ${fmt(eliteAssistant)}/wk`);
  assert(semiProManager <= 1_500,
    `semi-pro manager market wage is implausibly high: ${fmt(semiProManager)}/wk`);
}

console.log("\n[E] Transfer-market realism");
{
  const topFlightStar = playerValueForLevel(92, 95, 25, 1);
  const topFlightStarter = playerValueForLevel(85, 89, 25, 1);
  assert(topFlightStar >= 100_000_000 && topFlightStar <= 180_000_000,
    `92-rated top-flight star should live in the £100m-£180m market: ${fmt(topFlightStar)}`);
  assert(topFlightStarter >= 45_000_000 && topFlightStarter <= 100_000_000,
    `85-rated top-flight starter should command a major fee: ${fmt(topFlightStarter)}`);

  const starAbility: Record<FootballLevel, number> = {
    1:85, 2:77, 3:69, 4:64, 5:59, 6:56, 7:53, 8:50,
  };
  const maxRevenueShare: Record<FootballLevel, number> = {
    1:0.5, 2:0.45, 3:0.4, 4:0.4, 5:0.35, 6:0.35, 7:0.3, 8:0.3,
  };
  for (const level of levels) {
    const revenue = revenueBaselineForLevel(level, 50).totalSeason;
    const ability = starAbility[level];
    const value = playerValueForLevel(ability, ability + 5, 25, level);
    const share = value / revenue;
    assert(share <= maxRevenueShare[level],
      `Level ${level} representative star is implausibly large versus turnover: ${fmt(value)} / ${fmt(revenue)}`);
  }
}

console.log("\n✓ eight-tier economy audit passed");
