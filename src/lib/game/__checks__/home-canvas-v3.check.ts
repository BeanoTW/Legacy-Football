import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[HOME-CANVAS-V3] Dashboard-owned backdrop and single-frame director card");

const route = readFileSync("src/routes/index.tsx", "utf8");
const css = readFileSync("src/home-shell-polish.css", "utf8");

assert(route.includes("framed={false}"), "masthead portrait no longer renders its own nested frame");
assert(route.includes("size={78}"), "portrait scale is restrained inside the combined identity card");
assert(css.includes(".game-main.lf-home-main .lf-home-dashboard {") && css.includes("min-height: 100%"), "Home dashboard itself owns the full canvas");
assert(css.includes("padding: .46rem .46rem .62rem !important"), "mobile card spacing is created inside the dark Home canvas");
assert(css.includes("background:") && css.includes("#123b40") && css.includes("#103236"), "Home canvas uses the intended dark teal backdrop");
assert(css.includes("width: 4.95rem !important") && css.includes("height: 5.35rem !important"), "mobile director card is tightened further");
assert(css.includes("border: 0 !important") && css.includes("lf-director-reputation-stars"), "star strip is simplified inside the portrait card");

console.log("\n7 passed, 0 failed");
