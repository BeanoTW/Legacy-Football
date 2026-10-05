import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[HOME-BACKDROP-DIRECTOR] Home canvas and combined director identity");

const route = readFileSync("src/routes/index.tsx", "utf8");
const css = readFileSync("src/home-concept.css", "utf8");

assert(route.includes('tab === "hub" && "lf-home-main"'), "home tab marks the main canvas without affecting other screens");
assert(css.includes(".game-main.lf-home-main"), "home canvas has a dedicated backdrop");
assert(css.includes("repeating-linear-gradient") && css.includes("radial-gradient"), "backdrop includes subtle pitch/stadium texture");
assert(route.includes('className="lf-director-card"'), "masthead uses one combined director identity card");
assert(route.includes("lf-director-reputation-value") && route.includes("lf-director-reputation-stars"), "reputation number and stars live inside the portrait card");
const portraitSize = Number(route.match(/<CharacterPortrait avatar=\{chairmanProfile\.avatar\} size=\{(\d+)\}/)?.[1] ?? 0);
assert(portraitSize >= 72, "director portrait remains prominent in the combined masthead card");
assert(!route.includes('className="lf-chairman-badge"'), "separate reputation badge has been removed from the masthead");

console.log("\n7 passed, 0 failed");
