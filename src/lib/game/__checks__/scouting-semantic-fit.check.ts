import { strict as assert } from "node:assert";
import { semanticScoutingFit } from "../scoutingSemanticFit";

const benchmark = 70;
const established = { currentAbility: 70, potentialAbility: 72, age: 27 };
const prospect = { currentAbility: 60, potentialAbility: 82, age: 20 };
const veteran = { currentAbility: 74, potentialAbility: 74, age: 32 };

assert.ok(
  semanticScoutingFit(established, "firstTeam", benchmark) >
    semanticScoutingFit(prospect, "firstTeam", benchmark),
  "first-team searches should prefer current readiness",
);
assert.ok(
  semanticScoutingFit(veteran, "star", benchmark) >
    semanticScoutingFit(prospect, "star", benchmark),
  "star searches should prefer current star quality",
);
assert.ok(
  semanticScoutingFit(prospect, "firstTeamPotential", benchmark) >
    semanticScoutingFit(established, "firstTeamPotential", benchmark),
  "potential searches should prefer development upside",
);
assert.ok(
  semanticScoutingFit(prospect, "starPotential", benchmark) >
    semanticScoutingFit(veteran, "starPotential", benchmark),
  "star-potential searches should strongly reward ceiling and youth",
);
assert.ok(
  semanticScoutingFit(established, "backup", benchmark) >
    semanticScoutingFit(veteran, "backup", benchmark),
  "backup searches should prefer players close to the requested squad-depth level",
);
assert.equal(semanticScoutingFit(established, undefined, benchmark), 0);

console.log("scouting semantic fit checks passed");
