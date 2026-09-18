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

console.log("domestic-cup-state.check: ok");
