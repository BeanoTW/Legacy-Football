import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newGame, advanceDay } from "../engine";
import { createChairmanScoutingBrief } from "../chairmanScoutingBrief";
import { scoutingBrief, scoutingSearchPlan } from "../scoutingDiscovery";
import { transferMarketRows } from "../transferDesk";

console.log("\n[STAFF-LED-RECRUITMENT-MARKET]");

let state = newGame("Scout Led FC", "Director Test", "STAFF_LED_RECRUITMENT");
const plan = scoutingSearchPlan(state);
assert.ok(plan.candidateLimit >= 4 && plan.candidateLimit <= 10, "each scouting assignment returns a human-sized shortlist");
assert.ok(transferMarketRows(state).length < 50, "fresh Transfer Market is not a world database");

state = createChairmanScoutingBrief(state, {
  id: "staff-led-check",
  position: "MID",
  playerLevel: "firstTeam",
});
for (let i = 0; i < 7; i++) {
  if (scoutingBrief(state, "staff-led-check")?.status === "complete") break;
  state = advanceDay(state);
}
const brief = scoutingBrief(state, "staff-led-check");
assert.equal(brief?.status, "complete", "scouts return after the assignment delay");
assert.ok((brief?.candidateIds.length ?? 0) >= 1, "completed assignment returns actual options");
assert.ok((brief?.candidateIds.length ?? 99) <= 10, "completed assignment never dumps dozens of players");

const market = transferMarketRows(state);
const returned = new Set(brief?.candidateIds ?? []);
assert.ok(
  [...returned].every((id) => market.some((row) => row.player.id === id)),
  "returned staff recommendations appear on the Director's Market desk",
);
assert.ok(market.length < 50, "Market stays a small working set after scouts return");

const marketUi = readFileSync("src/components/game/TransferMarket.tsx", "utf8");
const delegation = readFileSync("src/lib/game/managerRecruitmentBrief.ts", "utf8");
assert.ok(marketUi.includes("New scouting assignment"), "Market makes the send-scouts action explicit");
assert.equal(marketUi.includes("Search known players or clubs"), false, "Market no longer exposes a generic player-database search box");
assert.equal(
  delegation.includes("professional department status"),
  false,
  "non-league scouting is not blocked behind professional department status",
);

console.log("staff-led recruitment market: passed");
