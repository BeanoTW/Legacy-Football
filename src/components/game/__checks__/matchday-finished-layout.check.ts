import { readFileSync } from "node:fs";

const overlay = readFileSync("src/components/game/MatchDayOverlay.tsx", "utf8");
const viewer = readFileSync("src/components/game/MatchPitchViewer.tsx", "utf8");

if (!overlay.includes('"min-h-0 min-w-0 flex-1 overflow-x-hidden"')) {
  throw new Error("finished matchday grid must be allowed to shrink on mobile");
}
if (!overlay.includes('min-h-0 min-w-0 w-full max-w-full flex-col justify-center')) {
  throw new Error("half-time panel must stay within the mobile viewport");
}
if (!overlay.includes('min-h-0 min-w-0 w-full max-w-full flex-col overflow-hidden border-t')) {
  throw new Error("full-time panel must stay within the mobile viewport");
}
if (!overlay.includes('min-h-0 min-w-0 w-full max-w-full flex-col overflow-x-hidden border-t bg-muted/20')) {
  throw new Error("match story column must not widen the finished-state grid");
}
if (!viewer.includes('"flex min-h-0 min-w-0 w-full max-w-full flex-col overflow-x-hidden bg-[#07130f] text-white"')) {
  throw new Error("replay viewer root must be shrinkable inside the mobile grid");
}

console.log("matchday-finished-layout.check.ts: PASS");
