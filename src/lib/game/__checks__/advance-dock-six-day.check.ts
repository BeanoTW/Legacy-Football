import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[ADVANCE-DOCK] Simple caption and rolling six-day rail");

const dock = readFileSync("src/components/game/MobileDock.tsx", "utf8");
const overlay = readFileSync("src/components/game/AdvanceOverlay.tsx", "utf8");
const route = readFileSync("src/routes/index.tsx", "utf8");

assert(dock.includes(': "Advance";'), "dock caption defaults to Advance");
assert(!dock.includes('matchDay ?') && !dock.includes('matchDay ='), "dock no longer labels the button by fixture weekday");
assert(overlay.includes("const horizonEndDay = startDay + 6"), "advance rail uses a rolling six-day look-ahead");
assert(overlay.includes("Math.min(horizonEndDay"), "nearer explicit stop targets shorten the rail");
assert(overlay.includes(".slice(0, 7)"), "rail is capped at today plus six days");
assert(!overlay.includes("6 - (startState ? calendarDay(startState) : day)"), "rail is no longer tied to Sunday");
assert(overlay.includes("cell.absoluteDay === targetEndDay"), "explicit target markers remain accurate inside the rolling window");
assert(route.includes("onContinue={() => openAdvancePreview()}"), "centre Advance opens the preview instead of progressing time");
assert(route.includes("onAdvanceTo={openAdvancePreview}"), "dock stop choices also preview before progressing time");
assert(overlay.includes("<Play /> Advance"), "preview requires an explicit second action to move time");

console.log("\n10 passed, 0 failed");
