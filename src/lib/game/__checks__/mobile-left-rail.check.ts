import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[MOBILE-COMPACT-NAV] Mobile navigation collapses into bottom controls");

const route = readFileSync("src/routes/index.tsx", "utf8");
const nav = readFileSync("src/components/game/MobileNav.tsx", "utf8");
const continueBar = readFileSync("src/components/game/MobileContinueBar.tsx", "utf8");
const css = readFileSync("src/mobile-rail.css", "utf8");

assert(
  !route.includes('className="lf-mobile-workspace"'),
  "mobile game content is full width again",
);
assert(
  nav.includes('className="lf-mobile-menu-button"') &&
    nav.includes("ALL_TABS.filter(([id]) => id !== \"hub\")"),
  "primary navigation is collapsed into one menu button",
);
assert(
  continueBar.indexOf("lf-mobile-home-button") < continueBar.indexOf("{menuControl}") &&
    continueBar.indexOf("{menuControl}") < continueBar.indexOf('className="lf-continue-button'),
  "Home and menu controls sit together before Continue",
);
assert(
  route.includes('homeActive={tab === "hub"}') &&
    route.includes('setTab("hub")') &&
    route.includes("menuControl={<MobileNav"),
  "route wires the exposed Home control and compact menu",
);
assert(
  css.includes(".lf-mobile-menu-button") &&
    css.includes(".lf-mobile-home-button") &&
    !css.includes("--lf-mobile-rail-width"),
  "left-rail geometry is removed from mobile presentation",
);
assert(
  css.includes(".lf-continue-more") &&
    css.includes("width: 2.9rem"),
  "advance chooser remains a compact control beside Continue",
);
assert(
  nav.includes("lf-mobile-menu-badge") &&
    nav.includes("blocking > 0"),
  "menu preserves unread and blocking attention badges",
);

console.log("\n7 passed, 0 failed");
