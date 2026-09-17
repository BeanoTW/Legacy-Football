import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const staffTab = readFileSync("src/components/game/StaffTab.tsx", "utf8");

assert.match(
  staffTab,
  /managerOpeningPosition\(state,candidate,terms\)/,
  "opening manager talks must load the agent's public bargaining position",
);
assert.match(
  staffTab,
  /evaluateManagerBargainingOffer\(state,candidate,terms,managerOffer,managerPosition,managerRound\)/,
  "manager offers must use the shared bargaining evaluator and current position",
);
assert.match(
  staffTab,
  /setManagerPosition\(evaluation\.counterOffer\)/,
  "a returned counter must become the explicit position the manager has committed to",
);
assert.match(
  staffTab,
  /setManagerOffer\(managerCounter\)/,
  "Use counter-offer must load the exact explicit counter rather than inventing another package",
);
assert.match(
  staffTab,
  /Meeting these terms will secure the agreement/,
  "the UI must communicate that meeting an explicit counter guarantees agreement",
);
assert.match(
  staffTab,
  /value=\{managerOfferSeasons\(offer\)\}/,
  "manager contract length must be presented in seasons rather than engine weeks",
);
assert.match(
  staffTab,
  /<option value=\{1\}>1 season<\/option><option value=\{2\}>2 seasons<\/option><option value=\{3\}>3 seasons<\/option><option value=\{4\}>4 seasons<\/option>/,
  "manager negotiations must expose the intended one-to-four-season contract range",
);
assert.doesNotMatch(
  staffTab,
  />Contract weeks</,
  "engine week storage must not leak into the player-facing manager negotiation UI",
);

console.log("\nmanager-negotiation-ui: passed");
