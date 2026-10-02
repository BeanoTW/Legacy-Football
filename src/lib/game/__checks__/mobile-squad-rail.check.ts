import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[MOBILE-SQUAD-RAIL] Squad depth uses sandbox-style horizontal cards");

const source = readFileSync("src/components/game/SquadSelectionTab.tsx", "utf8");

assert(
  source.includes('className="overflow-hidden rounded-xl border bg-[#071713] text-white shadow-sm lg:hidden"'),
  "mobile squad depth renders as a dedicated compact rail",
);
assert(
  source.includes("flex snap-x gap-2 overflow-x-auto overscroll-x-contain"),
  "mobile rail uses horizontal snap scrolling",
);
assert(
  source.includes("Substitutes & squad"),
  "mobile rail clearly describes the non-XI squad group",
);
assert(
  source.includes('className="lf-squad-list hidden') &&
    source.includes("lg:flex"),
  "desktop keeps the denser vertical squad list",
);
assert(
  (source.match(/<SquadRailCardContent/g) ?? []).length >= 2,
  "regular squad and sandbox share the same compact rail-card presentation",
);
assert(
  source.includes("onClick={() => openPlayerProfile(player.id)}"),
  "tapping a mobile rail card still opens the player profile",
);

console.log("\n6 passed, 0 failed");
