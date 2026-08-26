import { readFileSync } from "node:fs";

const source = readFileSync("src/components/game/ClubHub.tsx", "utf8");

if (!source.includes("const matchReady = !!nextFixture && isMatchday(state)")) {
  throw new Error("ClubHub must gate Match launch to the actual matchday");
}
if (!source.includes("matchReady ? <button")) {
  throw new Error("ClubHub must only render the Match button when matchReady");
}

console.log("hub-matchday-contract.check.ts: PASS");
