/* Ground Studio: capability, per-stand looks, compatibility.
   Run with: npx tsx src/lib/game/__checks__/ground-studio.check.ts */
import { newGame } from "../engine";
import { ensureInfrastructure } from "../infrastructure";
import { buildGroundScene } from "../groundScene";
import { groundDesign, sceneLook, type GroundDesign } from "../groundIdentity";
import { cornerFormOptions, standFormOptions, updateCorner, updateFixtures, updatePerimeter, updateStand, updateStandLook } from "../groundEditor";
import type { GameState } from "../types";

let passed = 0;
let failed = 0;
const check = (label: string, ok: boolean, extra?: string) => {
  if (ok) { passed++; console.log("  ✓ " + label); } else { failed++; console.log("  ✗ " + label + (extra ? " — " + extra : "")); }
};
const fixture = (): GameState => { const s = newGame("Studio Town", "Director Test"); s.saveSeed = "STUDIO"; ensureInfrastructure(s); return s; };
const colours = { body: "#0f7a3d", secondary: "#f2c14e" };
const render = (design: GroundDesign, extra: Record<string, unknown> = {}) => buildGroundScene({ stage: 2, pitchCondition: 80, worksAt: [], width: 380, height: 300, design, ...extra });

console.log("\n[GS1] Old saves and generated grounds still render");
{
  const s = fixture();
  check("a career without a saved design derives one", !s.groundIdentity?.design && groundDesign(s).version === 1);
  const legacy: GroundDesign = { version: 1, stands: groundDesign(s).stands, corners: groundDesign(s).corners, perimeter: { style: "rail", colour: "white" }, surroundings: { carParkSurface: "gravel", carParkLocation: "SW" } };
  const scene = render(legacy, { look: sceneLook(s, colours) });
  check("a design with none of the new optional fields renders", scene.prims.length > 500);
  check("it exposes selectable components", Object.keys(scene.selectables ?? {}).length >= 12);
  const legacyStage = buildGroundScene({ stage: 2, pitchCondition: 80, worksAt: [], width: 380, height: 300 });
  check("the legacy stage renderer (no design) still works", legacyStage.prims.length > 300 && !legacyStage.selectables);
}

console.log("\n[GS2] Matchday stays compatible");
{
  const s = fixture();
  const design = groundDesign(s);
  const a = render(design, { camera: { mode: "matchday", zoom: 1 } });
  const b = render(design, { camera: { mode: "matchday", zoom: 1 }, highlight: "stand:W" });
  check("matchday pitch bounds are sane", a.pitchBounds.width > 0.3 && a.pitchBounds.width < 1 && a.pitchBounds.height > 0.3);
  check("a highlight never moves the pitch", JSON.stringify(a.pitchBounds) === JSON.stringify(b.pitchBounds));
  const z = render(design, { camera: { mode: "matchday", zoom: 2 } });
  check("matchday ignores orbit zoom (pitch stays fitted)", Math.abs(z.pitchBounds.width - a.pitchBounds.width) < 0.02);
  check("deterministic", JSON.stringify(render(design).prims) === JSON.stringify(render(design).prims));
}

console.log("\n[GS3] Progression buys capability");
{
  const s = fixture();
  const design = groundDesign(s);
  const level = design.stands.W.level;
  const options = standFormOptions(design, "W");
  check("forms above the stand's level are locked", options.filter((o) => !o.allowed).every((o) => o.reason?.startsWith("Needs")));
  const twoTier = updateStand(s, "W", { form: "twoTier" });
  check("a locked form is refused", level < 4 ? !twoTier.ok : twoTier.ok);
  const shelter = updateStand(s, "W", { form: "shelter" });
  check("an allowed form is applied and persisted", shelter.ok && shelter.state.groundIdentity?.design?.stands.W.form === "shelter");
  check("editing is free", shelter.state.cash === s.cash);
  const grown = structuredClone(shelter.state);
  const asset = grown.infrastructure!.assets.find((a) => a.type === "stand" && a.location === "W")!;
  asset.level = Math.min(5, level + 2);
  check("a stand developed in Facilities takes its new structure", groundDesign(grown).stands.W.level === asset.level && groundDesign(grown).stands.W.form !== "shelter");
  const seated = cornerFormOptions(groundDesign(s), "NW").find((o) => o.id === "seated");
  check("seated corners need Modern stands either side", design.stands.N.level >= 3 && design.stands.W.level >= 3 ? !!seated?.allowed : !seated?.allowed);
  check("open/access/pylon corners are always allowed", cornerFormOptions(design, "NE").filter((o) => ["open", "access", "pylon"].includes(o.id)).every((o) => o.allowed));
  check("a pylon corner can be chosen", updateCorner(s, "NE", { form: "pylon" }).ok);
}

console.log("\n[GS4] Per-stand looks and fixtures");
{
  const s = fixture();
  const red = updateStandLook(s, "E", { roof: "red", seats: "amber" }).state;
  const look = sceneLook(red, colours);
  check("a stand can have its own roof and seats", look.standColours?.E?.roof === "#c62828" || Boolean(look.standColours?.E?.roof));
  check("other stands keep the ground-wide look", !look.standColours?.W);
  const cleared = updateStandLook(red, "E", { roof: undefined, seats: undefined }).state;
  check("clearing a stand's look falls back to the ground", !cleared.groundIdentity?.standLooks?.E);
  const before = JSON.stringify(render(groundDesign(s), { look: sceneLook(s, colours) }).prims);
  const after = JSON.stringify(render(groundDesign(red), { look }).prims);
  check("a per-stand colour changes the picture", before !== after);
  const withFixtures = updateFixtures(updatePerimeter(s, { style: "hoardings", gates: ["E"] }).state, { dugouts: "perspex", scoreboard: "electronic" }).state;
  const d = groundDesign(withFixtures);
  check("fixtures and perimeter persist", d.perimeter.style === "hoardings" && d.fixtures?.dugouts === "perspex" && d.fixtures?.scoreboard === "electronic");
  check("they change the picture", JSON.stringify(render(d).prims) !== JSON.stringify(render(groundDesign(s)).prims));
}

console.log("\n[GS5] Every Ground Studio option is visible");
{
  const s = fixture();
  const design = groundDesign(s);
  const base = sceneLook(s, colours);
  const pic = (look: typeof base, d = design) => JSON.stringify(render(d, { look }).prims);
  const mowings = ["stripes", "wide", "vertical", "checks", "diagonal"] as const;
  check("all five mowing patterns differ", new Set(mowings.map((mowing) => pic({ ...base, mowing }))).size === 5);
  const lights = ["posts", "pylons", "masts", "gantry"] as const;
  const roofed = { ...design, stands: { ...design.stands, W: { ...design.stands.W, form: "traditional" as const, roof: "pitched" as const }, E: { ...design.stands.E, form: "traditional" as const, roof: "pitched" as const } } };
  check("all four floodlight styles differ", new Set(lights.map((floodlights) => pic({ ...base, floodlights }, roofed))).size === 4);
  const perims = ["rail", "chainLink", "barrier", "brick", "hoardings"] as const;
  check("all five perimeter styles differ", new Set(perims.map((style) => JSON.stringify(render({ ...design, perimeter: { ...design.perimeter, style } }).prims))).size === 5);
  const dug = ["wooden", "brick", "perspex"] as const;
  check("all three dugout styles differ", new Set(dug.map((dugouts) => JSON.stringify(render({ ...design, fixtures: { dugouts } }).prims))).size === 3);
  const boards = ["none", "manual", "electronic"] as const;
  check("all three scoreboard styles differ", new Set(boards.map((scoreboard) => JSON.stringify(render({ ...design, fixtures: { scoreboard } }).prims))).size === 3);
  const builds = ["portacabins", "clubhouse", "brickClubhouse", "modern"] as const;
  check("all four building styles differ", new Set(builds.map((buildings) => JSON.stringify(render({ ...design, surroundings: { ...design.surroundings, buildings } }).prims))).size === 4);
  const corners = ["open", "access", "pylon", "terrace", "seated"] as const;
  check("all five corner forms differ", new Set(corners.map((form) => JSON.stringify(render({ ...design, corners: { ...design.corners, NE: { form } } }).prims))).size === 5);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
