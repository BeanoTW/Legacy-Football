import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[MOBILE-LEFT-RAIL] Mobile navigation is structural, not decorative");

const route = readFileSync("src/routes/index.tsx", "utf8");
const nav = readFileSync("src/components/game/MobileNav.tsx", "utf8");
const css = readFileSync("src/mobile-rail.css", "utf8");
const root = readFileSync("src/routes/__root.tsx", "utf8");

assert(
  route.includes('className="lf-mobile-workspace"') &&
    route.indexOf("<MobileNav") < route.indexOf('<main className="game-main">'),
  "mobile nav and game screen share one workspace",
);
assert(
  nav.includes('className="lf-mobile-nav md:hidden"') &&
    nav.includes('className="lf-mobile-nav-grid"'),
  "mobile nav uses rail-specific semantic hooks",
);
assert(
  css.includes("--lf-mobile-rail-width: 4.05rem") &&
    css.includes("flex: 0 0 var(--lf-mobile-rail-width)") &&
    css.includes("flex-direction: column"),
  "mobile navigation is a slim fixed-width vertical rail",
);
assert(
  css.includes(".lf-mobile-workspace > .game-main") &&
    css.includes("flex: 1 1 0%"),
  "game content reflows beside the rail",
);
assert(
  css.includes(".lf-continue-bar") &&
    css.includes("left: var(--lf-mobile-rail-width)"),
  "Continue bar aligns to the content column instead of covering the rail",
);
assert(
  css.includes(".lf-mobile-nav-more") &&
    css.includes("margin-top: 0.3rem"),
  "More stays grouped with the primary rail instead of floating in dead space",
);
assert(
  root.includes('import mobileRailCss from "../mobile-rail.css?url"') &&
    root.includes('{ rel: "stylesheet", href: mobileRailCss }'),
  "left-rail stylesheet is loaded last in the presentation stack",
);

console.log("\n7 passed, 0 failed");
