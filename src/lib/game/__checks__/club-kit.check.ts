import { strict as assert } from "node:assert";
import {
  clubInitials,
  clubKitFor,
  defaultAwayKit,
  defaultClubKit,
  luminance,
  randomClubKit,
  sanitizeClubKit,
  setClubKit,
} from "../clubKit";
import type { GameState } from "../types";

const first = defaultClubKit("Dalton Town");
assert.deepEqual(first, defaultClubKit("Dalton Town"), "default identity must be deterministic per club name");
assert.notDeepEqual(first, defaultClubKit("Kinlochleven Athletic"), "different clubs should get different defaults");
assert.equal(clubInitials("Dalton Town"), "DT", "initials come from the club name");
assert.equal(clubInitials("The Railwaymen"), "RAI", "single-word names use their first letters");

// Old saves have no identity; they still render one.
const legacy = { clubName: "Dalton Town" } as unknown as GameState;
assert.deepEqual(clubKitFor(legacy), first, "saves without an identity fall back to the club default");

// Corrupt saved data is repaired field by field, never thrown away wholesale.
const repaired = sanitizeClubKit(
  { badge: { shape: "blob", primary: "red", initials: "d!t@fc99x", founded: "18a97" }, home: { body: "#ABCDEF", pattern: "zigzag" } },
  "Dalton Town",
);
assert.equal(repaired.badge.shape, first.badge.shape, "unknown shapes fall back to the default");
assert.equal(repaired.badge.primary, first.badge.primary, "invalid colours fall back to the default");
assert.equal(repaired.badge.initials, "DTFC", "initials are cleaned to four letters");
assert.equal(repaired.badge.founded, "1897", "founded year keeps digits only");
assert.equal(repaired.home.body, "#abcdef", "valid colours survive, normalised to lower case");
assert.equal(repaired.home.pattern, first.home.pattern, "unknown patterns fall back to the default");

// Saving stores a clean copy and does not touch anything else in state.
const state = { clubName: "Dalton Town", cash: 1000 } as unknown as GameState;
const design = randomClubKit("Dalton Town", () => 0.42);
const next = setClubKit(state, design);
assert.deepEqual(next.clubKit, sanitizeClubKit(design, "Dalton Town"), "saved identity is the sanitised design");
assert.equal((next as unknown as { cash: number }).cash, 1000, "saving the identity must not alter other state");
assert.equal(state.clubKit, undefined, "saving must not mutate the previous state");

// Away kits must be distinguishable from the home shirt.
for (const [body, secondary] of [["#ffffff", "#14264a"], ["#c8102e", "#ffffff"], ["#16181b", "#ffffff"], ["#fbe122", "#16181b"]]) {
  const away = defaultAwayKit(body, secondary);
  const [hi, lo] = [luminance(away.body), luminance(body)].sort((a, b) => b - a);
  assert((hi + 0.05) / (lo + 0.05) > 2.5, `away kit must contrast with a ${body} home shirt`);
}

console.log("\nclub-kit: passed");