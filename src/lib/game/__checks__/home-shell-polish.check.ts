import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[HOME-SHELL-POLISH] Continuous backdrop and refined director card");

const root = readFileSync("src/routes/__root.tsx", "utf8");
const css = readFileSync("src/home-shell-polish.css", "utf8");

assert(root.includes('homeShellPolishCss') && root.indexOf('homeShellPolishCss') > root.indexOf('mobileDockCss'), "Home polish stylesheet loads after the existing presentation stack");
assert(css.includes(".game-main.lf-home-main > .game-screen") && css.includes("background: transparent !important"), "Home screen no longer exposes the pale page layer between cards");
assert(css.includes(".lf-home-bottom-pair") && css.includes(".lf-command-grid"), "major Home layout wrappers are transparent over the backdrop");
assert(
  css.includes("width: 78px !important") && css.includes("height: 94px !important"),
  "director portrait scale is reduced slightly for breathing room",
);
assert(css.includes("width: 5.25rem !important") && css.includes("height: 5.55rem !important"), "mobile director card is proportioned to the masthead");
assert(css.includes(".lf-director-reputation-stars .lf-rep-star.is-filled"), "filled reputation stars stay visibly gold");
assert(css.includes("min-height: 5.6rem"), "mobile masthead reserves enough height for the combined portrait card");

console.log("\n7 passed, 0 failed");
