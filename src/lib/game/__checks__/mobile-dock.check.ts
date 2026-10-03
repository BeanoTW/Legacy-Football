import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[MOBILE-DOCK] Navigation and Continue share one bottom dock on phones");

const route = readFileSync("src/routes/index.tsx", "utf8");
const dock = readFileSync("src/components/game/MobileDock.tsx", "utf8");
const css = readFileSync("src/mobile-dock.css", "utf8");
const root = readFileSync("src/routes/__root.tsx", "utf8");

assert(route.includes("<MobileDock") && !route.includes("<MobileNav"), "phones render the dock instead of the compact menu bar");
assert(route.includes('<div className="hidden md:block">') && route.includes("<MobileContinueBar"), "the Continue bar remains for tablet and desktop only");
assert(dock.includes("onContinue") && dock.includes("onStop") && dock.includes("onAdvanceTo"), "the dock continues, stops and offers Advance to");
assert(dock.includes("blocking") && dock.includes("is-blocked"), "blocking decisions show on the advance button");
assert(css.includes(".lf-dock-advance") && css.includes("position: fixed"), "the dock is fixed with a raised advance button");
assert(css.includes("--lf-dock-height") && css.includes(".game-shell"), "content reserves the dock height");
assert(root.includes('import mobileDockCss from "../mobile-dock.css?url"') && !root.includes("mobileRailCss"), "the dock stylesheet replaces the old mobile navigation stylesheet");

console.log("\n7 passed, 0 failed");
