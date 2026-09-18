import { strict as assert } from "node:assert";
import { FRIENDLY_WEEKS } from "../calendar";
import { weekForLeagueRound } from "../pyramid";

assert.deepEqual(
  [...FRIENDLY_WEEKS],
  [1, 2, 3, 4],
  "pre-season preparation must occupy weeks 1-4 only",
);
assert.equal(weekForLeagueRound(1), 5, "league football must not begin during pre-season");
assert.equal(FRIENDLY_WEEKS.has(25), false, "mid-season friendlies must not return");
assert.equal(FRIENDLY_WEEKS.has(27), false, "mid-season friendlies must not return");

console.log("preseason-calendar.check: ok");
