import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[MOBILE-SQUAD-RAIL] Squad depth uses grouped horizontal cards");

const source = readFileSync("src/components/game/SquadSelectionTab.tsx", "utf8");

assert(
  source.includes("function SquadPositionRails") &&
    source.includes('className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", className)}'),
  "squad depth renders through the shared grouped rail",
);
assert(
  source.includes("flex snap-x gap-2 overflow-x-auto overscroll-x-contain"),
  "position groups and sandbox bench use horizontal snap scrolling",
);
assert(
  source.includes("Swipe each position group horizontally.") &&
    source.includes("UNIT_GROUPS.map"),
  "squad rail is split into clear positional groups",
);
assert(
  source.includes("<SquadPositionRails") &&
    source.includes('className="lg:col-start-2 lg:row-span-3 lg:row-start-1"'),
  "the same rail adapts into the desktop squad column instead of duplicating markup",
);
assert(
  source.includes("function SquadRailPlayer") &&
    source.includes('min-w-[7.2rem] snap-start rounded-xl border'),
  "regular squad depth uses compact reusable rail cards",
);
assert(
  source.includes("onClick={() => openPlayerProfile(player.id)}"),
  "tapping a squad rail card still opens the player profile",
);

console.log("\n6 passed, 0 failed");
