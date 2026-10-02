import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[SQUAD-REVAMP-HORIZONTAL] New squad presentation keeps horizontal depth");

const source = readFileSync("src/components/game/SquadSelectionTab.tsx", "utf8");

assert(source.includes('aria-label="Squad pulse"'), "squad pulse replaces the doubled overview card");
assert(source.includes("FlaskConical") && source.includes("> Sandbox"), "First XI uses the compact Sandbox control");
assert(source.includes("CharacterPortrait") && source.includes("badge shows effectiveness"), "pitch players use club-kit portraits with effectiveness badges");
assert(source.includes("useDisplayNames") && source.includes("firstName.charAt(0)"), "duplicate surnames are disambiguated");
assert(source.includes("SquadPositionRails"), "normal squad depth uses grouped position rails");
assert(source.includes("flex snap-x gap-2 overflow-x-auto overscroll-x-contain"), "position groups side-scroll horizontally");
assert(source.includes("thin (want"), "position-depth warnings are retained");
assert(source.includes('onClick={() => openPlayerProfile(row.playerId)}'), "stats rows open player profiles");
assert(!source.includes('lf-squad-list hidden'), "old desktop vertical substitutes wall is gone");
assert(source.includes("kit={kit}") && source.includes("displayName={displayName}"), "pitch and sandbox share the portrait/name presentation");

console.log("\n10 passed, 0 failed");
