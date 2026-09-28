/* Portrait identity contract: stable across saves and career changes, no RNG
   consumption or persistence requirements. Run with bun. */
import { strict as assert } from "node:assert";
import {
  ACCENT_COLOURS, FACIAL_HAIR, HAIR_COLOURS, HAIR_STYLES,
  OUTFITS, OUTFIT_COLOURS, SKIN_TONES,
} from "../chairmanProfile";
import { boardPortrait, generatedPortrait, playerPortrait, staffPortrait } from "../characterPortrait";

const first = playerPortrait("player-001");
assert.deepEqual(first, playerPortrait("player-001"), "same ID must reproduce the same avatar");
assert.deepEqual(first, structuredClone(first), "config must be serialisable");

const manager = staffPortrait("person-001", true);
const coach = staffPortrait("person-001", false);
for (const part of ["sex", "skin", "hair", "hairColour", "facialHair", "eyewear"] as const) {
  assert.equal(manager[part], coach[part], `role changes must preserve ${part}`);
}
assert.deepEqual(boardPortrait("board-001"), boardPortrait("board-001"));
assert.equal(
  generatedPortrait({ id: "same-id", subject: "player" }).hair,
  generatedPortrait({ id: "same-id", subject: "manager" }).hair,
);

const samples = Array.from({ length: 500 }, (_, index) => playerPortrait(`player-${index}`));
assert.ok(new Set(samples.map((avatar) => avatar.skin)).size >= 6, "skin tone variety");
assert.ok(new Set(samples.map((avatar) => avatar.hair)).size >= 6, "hairstyle variety");
for (const avatar of samples) assert.ok(!(["quiff", "pixie", "bob", "long", "waves", "ponytail", "bun"] as string[]).includes(avatar.hair), "default male portraits use the short-hair pool");
assert.ok(new Set(samples.map((avatar) => avatar.hairColour)).size >= 7, "hair colour variety");
assert.ok(new Set(samples.map((avatar) =>
  [avatar.skin, avatar.hair, avatar.hairColour, avatar.facialHair, avatar.eyewear].join("|")
)).size >= 400, "most sampled characters should look distinct");

for (const avatar of samples) {
  assert.ok(SKIN_TONES.includes(avatar.skin as typeof SKIN_TONES[number]));
  assert.ok(HAIR_STYLES.some((style) => style.id === avatar.hair));
  assert.ok(HAIR_COLOURS.some((colour) => colour.id === avatar.hairColour));
  assert.ok(FACIAL_HAIR.some((hair) => hair.id === avatar.facialHair));
  assert.ok(OUTFITS.some((outfit) => outfit.id === avatar.outfit));
  assert.ok(OUTFIT_COLOURS.some((colour) => colour.id === avatar.outfitColour));
  assert.ok(ACCENT_COLOURS.some((colour) => colour.id === avatar.accentColour));
}
const female = generatedPortrait({ id: "female-staff", subject: "staff", sex: "female" });
assert.equal(female.facialHair, "none");
assert.equal(generatedPortrait({ id: "theme", subject: "staff", outfitColour: "#132438" }).outfitColour, "#132438");
assert.notEqual(generatedPortrait({ id: "theme", subject: "staff", outfitColour: "red" }).outfitColour, "red");

console.log("character-portrait: determinism, stable identity, variety and valid traits passed");
