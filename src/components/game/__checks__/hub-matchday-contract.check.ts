import { readFileSync } from "node:fs";

const source = readFileSync("src/components/game/ClubHub.tsx", "utf8");

if (!source.includes("const matchReady = !!nextFixture && nextFixture.week === state.week && (nextFixture.dayOfWeek ?? 5) === calendarDay(state)")) {
  throw new Error("ClubHub must gate Match launch to the fixture's actual calendar date");
}
if (!source.includes("matchReady ? <>")) {
  throw new Error("ClubHub must only render match actions when matchReady");
}
if (!source.includes("simulateFixtureToday(current)")) {
  throw new Error("ClubHub must offer an explicit simulate action on matchday");
}

console.log("hub-matchday-contract.check.ts: PASS");
