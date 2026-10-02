import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[REMOVE-CHAIRMAN-PREFERENCE] Squad screen no longer exposes ownership presets");

const source = readFileSync("src/components/game/SquadSelectionTab.tsx", "utf8");

assert(!source.includes("Chairman&apos;s preference"), "chairman preference panel is removed");
assert(!source.includes("chairman.selection.preset"), "legacy preset flag is no longer written or read");
assert(!source.includes("PresetButton"), "preset controls are removed");
assert(!source.includes('preset === "youth"') && !source.includes('preset === "rested"'), "automatic XI no longer branches on ownership presets");
assert(source.includes("chooseXi(squad, state, formation)"), "automatic XI uses the normal squad selection path");

console.log("\n5 passed, 0 failed");
