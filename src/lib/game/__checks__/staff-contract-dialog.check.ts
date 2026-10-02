import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[STAFF-CONTRACT-DIALOG] Staff contract actions use in-game confirmation UI");

const source = readFileSync("src/components/game/StaffTab.tsx", "utf8");

assert(!source.includes("confirm(`Release"), "release no longer uses browser confirm");
assert(!source.includes("confirm(`Renew"), "renewal no longer uses browser confirm");
assert(source.includes("StaffContractDialog"), "shared staff contract dialog is present");
assert(source.includes("Severance due now"), "release dialog explains severance cost");
assert(source.includes("Renewal bonus"), "renewal dialog explains renewal cost");
assert(source.includes("Release staff") && source.includes("Renew for 2 seasons"), "dialog uses explicit action labels");

console.log("\n6 passed, 0 failed");