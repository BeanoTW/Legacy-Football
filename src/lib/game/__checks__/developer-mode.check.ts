import { readFileSync } from "node:fs";
import { newGame } from "../engine";
import {
  developerBoostClub,
  developerBoostSquad,
  developerHealSquad,
  developerMaxFacilities,
  developerSetInfiniteMoney,
  developerTriggerPressConference,
} from "../developerMode";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[DEVELOPER-MODE] God-mode controls");

const initial = newGame("Dev Town", "Tester");
const money = developerSetInfiniteMoney(initial);
assert(money.cash === 999_999_999, "infinite-money control raises cash to the developer target");
assert(
  money.financeLedger.some((entry) => entry.sourceSystem === "developer-mode"),
  "developer cash still goes through the finance ledger",
);

const boosted = developerBoostClub(initial);
assert(boosted.reputation === 100 && boosted.fanHappiness === 100, "club boost maxes reputation and supporter mood");
assert(boosted.football.department.recruitmentRating === 100, "club boost maxes recruitment department");

const squad = developerBoostSquad(initial);
const userPlayers = squad.football.players.filter((player) => player.currentClubId === squad.clubName || player.ownerClubId === squad.clubName);
assert(userPlayers.every((player) => player.currentAbility >= 88 && player.fitness === 100), "squad boost raises ability and fitness");

const healed = developerHealSquad(initial);
assert(
  healed.football.players.filter((player) => player.currentClubId === healed.clubName || player.ownerClubId === healed.clubName).every((player) => player.availability === "available" && !player.injury),
  "heal control clears injuries and availability blocks",
);

const facilities = developerMaxFacilities(initial);
assert(facilities.infrastructure.assets.every((asset) => asset.condition === 100), "max facilities restores every asset to perfect condition");
assert(
  facilities.infrastructure.assets.filter((asset) => asset.type === "stand").every((asset) => asset.capacity >= 25_000),
  "max facilities creates a large test stadium",
);

const press = developerTriggerPressConference(initial);
assert(
  press.inbox.some((item) => item.generatorId === "calendar-press" && item.status === "awaitingDecision"),
  "developer mode can inject a live press-conference interaction",
);

const settings = readFileSync("src/components/game/SettingsTab.tsx", "utf8");
const panel = readFileSync("src/components/game/DeveloperModePanel.tsx", "utf8");
assert(settings.includes("Developer mode") && settings.includes("<DeveloperModePanel"), "Settings exposes an opt-in developer mode");
assert(panel.includes("Infinite money") && panel.includes("Trigger a specific incident"), "God-mode panel exposes cheats and interaction triggers");

console.log("\n9 passed, 0 failed");
