import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[ADVANCE-SPEED-RESET] Continue always starts at 1x");

const hook = readFileSync("src/hooks/useGame.ts", "utf8");

assert(
  hook.includes("setContinueSpeedState(1);"),
  "starting time advance resets the active speed to 1x",
);
assert(
  hook.includes('localStorage.setItem(SPEED_KEY, "1")'),
  "the persisted continue speed is also reset to 1x",
);
assert(
  hook.indexOf("setContinueSpeedState(1);") < hook.indexOf("setIsContinuing(true);"),
  "speed resets before simulation resumes",
);

console.log("\n3 passed, 0 failed");
