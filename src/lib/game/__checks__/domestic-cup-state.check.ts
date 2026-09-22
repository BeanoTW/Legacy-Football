import { strict as assert } from "node:assert";
import { advanceDomesticCup, domesticCupRoundComplete, initialiseDomesticCup, resolveDomesticCupTie } from "../domesticCupState";

let cup = initialiseDomesticCup("faCup", ["Level 7", "Giant A", "Giant B", "Giant C"], "save-1");
assert.equal(cup.round, 1);
assert.equal(cup.eliminated.length, 0);

for (const tie of cup.ties) cup = resolveDomesticCupTie(cup, tie.home, tie.away, tie.home);
assert.equal(domesticCupRoundComplete(cup), true);
assert.equal(cup.eliminated.length, 2);

cup = advanceDomesticCup(cup, "save-1");
assert.equal(cup.round, 2);
assert.equal(cup.ties.length, 1);

const final = cup.ties[0];
cup = resolveDomesticCupTie(cup, final.home, final.away, final.away);
cup = advanceDomesticCup(cup, "save-1");
assert.equal(cup.champion, final.away, "final winner must persist as cup champion");

const world = {
  leagues: [
    { tier: 5, clubIds: ["L7 A", "L7 B", "L7 C", "L7 D"] },
    { tier: 4, clubIds: ["L6 A", "L6 B"] },
    { tier: 2, clubIds: ["L4 A", "L4 B"] },
    { tier: 0, clubIds: ["L2 A", "L2 B"] },
  ],
};
let national = initialiseDomesticCup("faCup", world.leagues[0].clubIds, "entry-test");
for (const tie of national.ties) national = resolveDomesticCupTie(national, tie.home, tie.away, tie.home);
national = advanceDomesticCup(national, "entry-test", world);
assert.equal(national.round, 2);
assert.ok(national.entrants.includes("L6 A") && national.entrants.includes("L6 B"), "tier-6 clubs must enter when National Cup reaches round 2");

for (const tie of national.ties) national = resolveDomesticCupTie(national, tie.home, tie.away, tie.home);
national = advanceDomesticCup(national, "entry-test", world);
assert.equal(national.round, 3);
assert.ok(national.entrants.includes("L4 A") && national.entrants.includes("L4 B"), "tier-4 clubs must enter when National Cup reaches round 3");

for (const tie of national.ties) national = resolveDomesticCupTie(national, tie.home, tie.away, tie.home);
national = advanceDomesticCup(national, "entry-test", world);
assert.equal(national.round, 4);
assert.ok(national.entrants.includes("L2 A") && national.entrants.includes("L2 B"), "tier-2 clubs must enter when National Cup reaches round 4");

console.log("domestic-cup-state.check: ok");
