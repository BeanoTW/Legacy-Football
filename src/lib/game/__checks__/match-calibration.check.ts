import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { simulateFixture } from "../league";
import { realisedPlayerClubStrength } from "../playerClubPerformance";
import type { Staff } from "../types";

const state = newGame("Calibration FC", "Calibration Auditor", "MATCH_CALIBRATION_CONTRACT");

interface Rates {
  aWin: number;
  draw: number;
  bWin: number;
}

/** Alternate home advantage so the measured rates describe quality, not venue. */
function sampleRates(aStrength: number, bStrength: number, samples = 4000): Rates {
  let aWins = 0;
  let draws = 0;
  let bWins = 0;
  for (let i = 0; i < samples; i += 1) {
    const aHome = i % 2 === 0;
    const home = aHome ? "Calibration A" : "Calibration B";
    const away = aHome ? "Calibration B" : "Calibration A";
    const sim = simulateFixture(state, 1, 10_000 + i, home, away, "calibration", {
      homeStrength: aHome ? aStrength : bStrength,
      awayStrength: aHome ? bStrength : aStrength,
    });
    const aGoals = aHome ? sim.homeGoals : sim.awayGoals;
    const bGoals = aHome ? sim.awayGoals : sim.homeGoals;
    if (aGoals > bGoals) aWins += 1;
    else if (aGoals < bGoals) bWins += 1;
    else draws += 1;
  }
  return { aWin: aWins / samples, draw: draws / samples, bWin: bWins / samples };
}

function between(value: number, low: number, high: number, label: string): void {
  assert.ok(value >= low && value <= high, `${label}: ${value.toFixed(4)} not in ${low}-${high}`);
}

// Equal teams should remain genuinely uncertain once venue is neutralised.
const equal = sampleRates(60, 60);
between(equal.aWin, 0.32, 0.42, "equal A win rate");
between(equal.bWin, 0.32, 0.42, "equal B win rate");
between(equal.draw, 0.22, 0.30, "equal draw rate");

// A small quality edge matters, but should not make the better team automatic.
const smallGap = sampleRates(65, 60);
between(smallGap.aWin, 0.44, 0.54, "five-point favourite win rate");
between(smallGap.bWin, 0.22, 0.31, "five-point underdog win rate");
assert.ok(smallGap.aWin > smallGap.bWin, "small quality advantage must remain meaningful");

// Excellent management can help a moderately weaker player squad punch up,
// but the performance layer is not allowed to erase the underlying gap.
const eliteManager: Staff = {
  id: "ST-calibration-manager",
  name: "C. Elite",
  role: "Manager",
  age: 45,
  rating: 95,
  stats: {
    tactics: 95,
    attack: 90,
    defense: 90,
    development: 85,
    scouting: 70,
    negotiation: 70,
    medical: 60,
    motivation: 95,
  },
  wage: 20_000,
  contractWeeks: 114,
  reputation: 95,
};
state.hiredStaff = [eliteManager];
state.playerClubPerformance = {
  schemaVersion: 1,
  cohesion: 100,
  morale: 100,
  lastSquadSignature: [],
  lastProcessedAbsoluteWeek: 0,
};
const managedStrength = realisedPlayerClubStrength(state, 60);
assert.ok(managedStrength > 60 && managedStrength <= 65, `managed strength ${managedStrength}`);
const unmanagedModerate = sampleRates(60, 68);
const managedModerate = sampleRates(managedStrength, 68);
between(managedModerate.aWin, 0.25, 0.35, "well-managed weaker team win rate");
assert.ok(
  managedModerate.aWin >= unmanagedModerate.aWin + 0.06,
  `management should be relevant: ${unmanagedModerate.aWin.toFixed(3)} -> ${managedModerate.aWin.toFixed(3)}`,
);
assert.ok(
  managedModerate.aWin < managedModerate.bWin,
  "excellent management must not make a still-weaker squad the favourite",
);

// Major quality gaps should produce clear favourites while retaining real upset risk.
const largeGap = sampleRates(60, 75);
between(largeGap.aWin, 0.06, 0.13, "fifteen-point underdog win rate");
between(largeGap.bWin, 0.68, 0.78, "fifteen-point favourite win rate");

// Extreme non-league-v-elite style mismatches: miracles exist, but are rare.
const extremeGap = sampleRates(40, 85, 6000);
between(extremeGap.aWin, 0.002, 0.018, "extreme underdog win rate");
assert.ok(extremeGap.bWin > 0.93, `extreme favourite wins ${extremeGap.bWin.toFixed(3)}`);

console.log("\nmatch-calibration: passed", {
  equal,
  smallGap,
  unmanagedModerate,
  managedModerate,
  largeGap,
  extremeGap,
});
