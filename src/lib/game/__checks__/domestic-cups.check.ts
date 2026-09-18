import { strict as assert } from "node:assert";
import { domesticCupsForTier, faCupEntryRound, DOMESTIC_CUPS } from "../domesticCups";

assert.deepEqual(domesticCupsForTier(7).map((c) => c.id), ["faCup"]);
assert.deepEqual(domesticCupsForTier(4).map((c) => c.id), ["leagueCup", "faCup"]);
assert.equal(faCupEntryRound(7), 1);
assert.equal(faCupEntryRound(1), 4);

const national = DOMESTIC_CUPS.find((c) => c.id === "faCup")!;
assert.ok(national.finalPrize > national.prizeByRound[0], "deep National Cup runs must carry transformative upside");

console.log("domestic-cups.check: ok");
