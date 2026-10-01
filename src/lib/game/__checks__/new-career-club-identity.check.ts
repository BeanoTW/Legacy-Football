import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[NEW-CAREER-CLUB-IDENTITY] Pre-launch club editor");

const setup = readFileSync("src/components/game/NewGame.tsx", "utf8");
const studio = readFileSync("src/components/game/ClubIdentityStudio.tsx", "utf8");
const hook = readFileSync("src/hooks/useGame.ts", "utf8");

assert(setup.includes("Club nickname"), "new-career setup includes a nickname field");
assert(setup.includes("Design club"), "new-career setup exposes the club identity designer");
assert(
  setup.includes("<ClubBadge") && setup.includes("<ClubShirt"),
  "new-career setup previews badge, home kit and away kit",
);
assert(
  setup.includes("<ClubIdentitySetupSheet") && studio.includes("ClubIdentitySetupStudio"),
  "full badge and kit designer is available before starting the career",
);
assert(
  studio.includes("BadgeEditor") && studio.includes("KitEditor"),
  "pre-career designer reuses the full badge and kit controls",
);
assert(
  hook.includes("setClubKit(next, clubKit)") && hook.includes("setClubNickname(next, clubNickname)"),
  "selected kit and nickname are persisted into the newly-created save",
);
assert(
  setup.includes("if (!clubIdentityTouched) setClubKit(defaultClubKit"),
  "default badge and kit stay aligned when the club name changes before customisation",
);

console.log("\n7 passed, 0 failed");
