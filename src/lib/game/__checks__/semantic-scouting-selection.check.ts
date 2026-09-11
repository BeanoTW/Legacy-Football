import { strict as assert } from "node:assert";
import fs from "node:fs";

const semanticSource = fs.readFileSync("src/lib/game/semanticScoutingSelection.ts", "utf8");
const scoutingSource = fs.readFileSync("src/lib/game/scouting.ts", "utf8");

assert.match(semanticSource, /case "firstTeamPotential"/);
assert.match(semanticSource, /candidate\.potentialAbility/);
assert.match(semanticSource, /case "starPotential"/);
assert.match(semanticSource, /brief\.playerLevel/);
assert.match(semanticSource, /brief\.candidateIds = candidateIds/);
assert.match(semanticSource, /preserveKnownIdentityInPlace/);
assert.match(semanticSource, /preserveKnownPlayerInPlace/);
assert.match(scoutingSource, /progressSemanticScoutingDiscoveryDayInPlace\(state, targetDay\)/);
assert.doesNotMatch(scoutingSource, /progressScoutingDiscoveryDayInPlace\(state, targetDay\)/);

console.log("semantic scouting selection checks passed");
