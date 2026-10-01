import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

console.log("\n[PLAYER-KIT-PORTRAITS] Club identity on generated player portraits");

const portrait = readFileSync("src/components/game/CharacterPortrait.tsx", "utf8");
const profile = readFileSync("src/components/game/shared/PlayerProfileSheet.tsx", "utf8");
const route = readFileSync("src/routes/index.tsx", "utf8");

assert(
  portrait.includes("PortraitKitProvider") && portrait.includes("clubKitForReference"),
  "portrait provider resolves shirts through the canonical club identity system",
);
assert(
  portrait.includes('identity?.subject === "player"'),
  "automatic kit application is limited to player portraits",
);
assert(
  portrait.includes("if (!clubId) return undefined"),
  "free agents keep their normal portrait clothes",
);
assert(
  portrait.includes('case "stripes"') &&
    portrait.includes('case "pinstripes"') &&
    portrait.includes('case "hoops"') &&
    portrait.includes('case "halves"') &&
    portrait.includes('case "quarters"') &&
    portrait.includes('case "sash"') &&
    portrait.includes('case "chevron"') &&
    portrait.includes('case "band"'),
  "all supported club shirt patterns render in portraits",
);
assert(
  portrait.includes('kit.collar === "vneck"') && portrait.includes('kit.collar === "polo"'),
  "portrait shirts preserve club collar design",
);
assert(
  profile.includes("clubKitForReference(state, player.currentClubId)") &&
    profile.includes("kit={shirt}"),
  "player profile passes the registered club shirt explicitly",
);
assert(
  route.includes("<PortraitKitProvider state={state}>") &&
    route.includes("</PortraitKitProvider>"),
  "the game screen provides kits to player portraits globally",
);
assert(
  !portrait.includes("generatedPortrait({") && portrait.includes("generatedPortrait(identity)"),
  "club identity never enters the deterministic face generator",
);

const studio = readFileSync("src/components/game/CharacterPortraitStudio.tsx", "utf8");
const chairmanStudio = readFileSync("src/components/game/ChairmanStudio.tsx", "utf8");

assert(
  studio.includes('hideOutfit={identity.subject === "player"}'),
  "player appearance editor hides outfit controls",
);
assert(
  studio.includes('kit={identity.subject === "player" ? kit ?? null : undefined}'),
  "player appearance preview keeps the club shirt on while editing",
);
assert(
  chairmanStudio.includes("hideOutfit = false") && chairmanStudio.includes("!hideOutfit"),
  "outfit editing remains available for non-player portraits",
);

console.log("\n11 passed, 0 failed");
