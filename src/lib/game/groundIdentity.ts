/* =========================================================================
   Ground identity: how the club's ground is built and how it looks
   -------------------------------------------------------------------------
   - Stand builds: when a stand's level is raised (expansion, replacement or
     redevelopment) the club chooses how: covered terrace, safe standing or
     all-seater, and (from Modern stand up) the roof. Each has authentic
     trade-offs in cost, capacity and atmosphere.
   - Aesthetics: ground name, seat colours, roof and cladding, floodlights,
     mowing pattern and a home end.

   Pure and dependency-light: imports types only, so infrastructure.ts and
   stadiumAccreditation.ts can both read it without import cycles. A build
   only takes effect when the project it was chosen with has completed.
========================================================================= */

import type { GameState } from "./types";

export type Standing = "terrace" | "safeStanding" | "seated";
export type RoofStyle = "pitched" | "cantilever" | "twoTier";
export type SeatScheme = "club" | "twoTone" | "classic" | "mono" | "red" | "blue" | "navy" | "black" | "white" | "amber" | "purple";
export type RoofColour = "slate" | "club" | "white" | "charcoal" | "black" | "red" | "blue" | "green" | "cream" | "silver";
export type Cladding = "brick" | "modern" | "white" | "darkBrick" | "black" | "club" | "blue" | "green" | "cream";
export type FloodlightStyle = "auto" | "posts" | "pylons" | "masts" | "gantry";
export type Mowing = "stripes" | "checks" | "diagonal" | "wide" | "vertical";
export type StandSide = "N" | "E" | "S" | "W";
export type CornerSlot = "NW" | "NE" | "SW" | "SE";
export type StandForm = "open" | "shelter" | "terrace" | "traditional" | "cantilever" | "twoTier";
export type CornerForm = "open" | "access" | "pylon" | "terrace" | "seated";
export type PerimeterStyle = "rail" | "chainLink" | "barrier" | "brick" | "hoardings";
export type PerimeterColour = "white" | "club" | "green" | "galvanized";
export type CarParkSurface = "gravel" | "tarmac";
export type CarParkLocation = "NW" | "NE" | "SW" | "SE";
export type GroundCameraMode = "orbit" | "matchday";
export type StandMaterial = "brick" | "cladding" | "timber" | "concrete";
export type CornerSize = "small" | "large";
export type CornerShape = "angled" | "rounded";
export type DugoutStyle = "auto" | "wooden" | "brick" | "perspex";
export type ScoreboardStyle = "auto" | "none" | "manual" | "electronic";
export type GroundBuildings = "auto" | "portacabins" | "clubhouse" | "brickClubhouse" | "modern";

/** Per-stand cosmetic overrides. Anything unset falls back to the ground-wide look. */
export interface StandLook {
  seats?: SeatScheme;
  roof?: RoofColour;
  cladding?: Cladding;
}

export interface GroundStandDesign {
  form: StandForm;
  /** Capacity/quality progression stays independent from architectural form. */
  level: number;
  span: number;
  depth: number;
  setback: number;
  standing: Standing;
  roof: RoofStyle | "open";
  /** Structural style of the stand's back and ends. Optional: derived from form when unset. */
  material?: StandMaterial;
}

export interface GroundCornerDesign {
  form: CornerForm;
  /** Cosmetic access tunnel through an existing corner stand. */
  accessTunnel?: boolean;
  /** Optional: corner infill footprint. Defaults to small. */
  size?: CornerSize;
  /** Infill geometry. Angled chamfers the pitch-facing edge; rounded uses a faceted curve. */
  shape?: CornerShape;
}

/**
 * Canonical slot-based design. Every field added after #194 is optional with a
 * renderer default, so old saves, generated away grounds and matchday keep working.
 */
export interface GroundDesign {
  version: 1;
  stands: Record<StandSide, GroundStandDesign>;
  corners: Record<CornerSlot, GroundCornerDesign>;
  perimeter: {
    style: PerimeterStyle;
    colour: PerimeterColour;
    /** Sides with an opening in the perimeter (gates). Default: both ends. */
    gates?: StandSide[];
  };
  surroundings: {
    carParkSurface: CarParkSurface;
    carParkLocation: CarParkLocation;
    /** Clubhouse/office buildings by the car park. Default derives from the ground's size. */
    buildings?: GroundBuildings;
    /** Coach bay in the car park. Default: from Seated stand level up. */
    coachBay?: boolean;
  };
  /** Pitch-side fixtures. Optional: "auto" derives from the ground's size. */
  fixtures?: {
    dugouts?: DugoutStyle;
    scoreboard?: ScoreboardStyle;
  };
}

export interface StandBuild {
  standing: Standing;
  roof: RoofStyle;
}

export interface GroundIdentityState {
  groundName?: string;
  seats: SeatScheme;
  roof: RoofColour;
  cladding: Cladding;
  floodlights: FloodlightStyle;
  mowing: Mowing;
  /** Which end is the home end (the Kop), if any. */
  homeEnd: "N" | "S" | null;
  /** Builds in force, by stand asset id. */
  stands: Record<string, StandBuild>;
  /** Builds chosen with a project that has not completed yet. */
  pending: Record<string, StandBuild & { projectId: string }>;
  /** Canonical slot-based ground design. Optional on old saves and derived deterministically. */
  design?: GroundDesign;
  /** Per-stand cosmetics (seats, roof, cladding). Global seats/roof/cladding are the fallback. */
  standLooks?: Partial<Record<StandSide, StandLook>>;
  /** Number of paid cosmetic changes (keeps finance dedupe keys unique). */
  changes: number;
}

declare module "./types" {
  interface GameState {
    /** Optional: saves without it use the default look. */
    groundIdentity?: GroundIdentityState;
  }
}

export const DEFAULT_GROUND_IDENTITY: GroundIdentityState = {
  seats: "classic",
  roof: "slate",
  cladding: "brick",
  floodlights: "auto",
  mowing: "stripes",
  homeEnd: null,
  stands: {},
  pending: {},
  changes: 0,
};

export function groundIdentity(s: GameState): GroundIdentityState {
  return { ...DEFAULT_GROUND_IDENTITY, ...(s.groundIdentity ?? {}) };
}


const SIDE_DEFAULT: Record<StandSide, GroundStandDesign> = {
  N: { form: "open", level: 1, span: 28, depth: 7, setback: 4, standing: "terrace", roof: "open" },
  E: { form: "shelter", level: 1, span: 28, depth: 7, setback: 4, standing: "terrace", roof: "pitched" },
  S: { form: "open", level: 1, span: 28, depth: 7, setback: 4, standing: "terrace", roof: "open" },
  W: { form: "traditional", level: 1, span: 36, depth: 9, setback: 4, standing: "terrace", roof: "pitched" },
};

function standFormFor(level: number, build: StandBuild): StandForm {
  if (level <= 0) return "open";
  if (level === 1) return build.standing === "terrace" ? "shelter" : "traditional";
  if (level === 2) return build.standing === "terrace" ? "terrace" : "traditional";
  if (build.roof === "twoTier" || level >= 5) return "twoTier";
  return build.roof === "cantilever" ? "cantilever" : "traditional";
}

/** Deterministic adapter for pre-slot saves. Nothing is persisted merely by reading it. */
export function groundDesign(s: GameState): GroundDesign {
  const identity = groundIdentity(s);
  const derived = derivedGroundDesign(s);
  const saved = identity.design;
  if (saved?.version !== 1) return derived;
  // A saved design keeps the club's choices, but levels always come from the real stands:
  // when Facilities work raises a stand above the level it was designed at, that side
  // takes the new structure (keeping its material), so progression stays visible.
  const stands = { ...saved.stands };
  for (const side of ["N", "E", "S", "W"] as StandSide[]) {
    const live = derived.stands[side];
    const mine = saved.stands[side];
    if (!mine) { stands[side] = live; continue; }
    // Saved design owns presentation; purchased capacity owns dimensions.
    stands[side] = live.level > mine.level
      ? { ...live, material: mine.material }
      : { ...mine, level: live.level, span: live.span, depth: live.depth };
  }
  return { ...saved, stands };
}

/** The design implied by the club's real stands, used for old saves and as the live structure. */
function derivedGroundDesign(s: GameState): GroundDesign {
  const stands = structuredClone(SIDE_DEFAULT);
  for (const asset of (s.infrastructure?.assets ?? []).filter((a) => a.type === "stand")) {
    const side = asset.location as StandSide;
    if (!(side in stands)) continue;
    const level = Math.max(0, Math.min(5, asset.level));
    // A stand the club never rebuilt keeps the character its name implies:
    // terraces, ends, kops, banks and sheds are standing; the Main Stand is seated.
    const chosen = chosenStandBuild(s, asset.id);
    const terraceByName = !chosen && level <= 2 && /terrace|\bend\b|kop|bank|shed/i.test(asset.name ?? "") && !/main/i.test(asset.name ?? "");
    const base = standBuild(s, asset.id, asset.level);
    const build: StandBuild = terraceByName ? { ...base, standing: "terrace" } : base;
    // Size follows the stand's real capacity, so grounds are asymmetric like real ones.
    const capacity = Math.max(0, asset.capacity ?? 0);
    const maxSpan = side === "N" || side === "S" ? 58 : 96;
    stands[side] = {
      form: standFormFor(level, build),
      level,
      span: capacity > 0 ? Math.round(Math.max(18, Math.min(maxSpan, 18 + capacity * 0.04))) : Math.min(maxSpan, 28 + level * 12),
      // Fill the available length first. Once full, extra places make the
      // stand deeper; later level/form progression provides the height.
      depth: capacity > 0
        ? Math.round(Math.max(4, Math.min(24, 4 + Math.max(0, capacity - Math.max(0, (maxSpan - 18) / 0.04)) / 450)))
        : 6 + level * 3,
      setback: level >= 3 ? 6 : 4,
      standing: build.standing,
      roof: level === 0 ? "open" : build.roof,
    };
  }
  return {
    version: 1,
    stands,
    corners: {
      NW: { form: "open" }, NE: { form: "open" },
      SW: { form: "open" }, SE: { form: "open" },
    },
    perimeter: { style: "rail", colour: "white" },
    surroundings: { carParkSurface: "gravel", carParkLocation: "SW" },
  };
}

/** Persist the deterministic legacy adapter when a write path wants canonical data. */
export function ensureGroundDesign(s: GameState): GroundDesign {
  const design = groundDesign(s);
  s.groundIdentity = { ...groundIdentity(s), design: structuredClone(design) };
  return s.groundIdentity.design!;
}

/* ------------------------------------------------------------------ */
/* Build options                                                       */
/* ------------------------------------------------------------------ */

export interface BuildOption<T extends string> {
  id: T;
  label: string;
  blurb: string;
  /** Multiplier on the project cost. */
  cost: number;
  /** Multiplier on any capacity the project adds. */
  capacity: number;
  pros: string;
  cons: string;
}

export const STANDING_OPTIONS: readonly BuildOption<Standing>[] = [
  {
    id: "terrace",
    label: "Covered terrace",
    blurb: "Standing room under a roof. Loud, packed, proper football.",
    cost: 0.9,
    capacity: 1.25,
    pros: "Most capacity per pound · best atmosphere",
    cons: "Doesn't count as seating for EFL ground grading",
  },
  {
    id: "safeStanding",
    label: "Safe standing",
    blurb: "Rail seats: a seat for every place, standing allowed.",
    cost: 1.1,
    capacity: 1.1,
    pros: "Counts as seating · strong atmosphere",
    cons: "Costs more than a plain all-seater",
  },
  {
    id: "seated",
    label: "All-seater",
    blurb: "Conventional seating throughout.",
    cost: 1,
    capacity: 1,
    pros: "Counts as seating · standard cost",
    cons: "Quietest of the three",
  },
];

export const ROOF_OPTIONS: readonly BuildOption<RoofStyle>[] = [
  {
    id: "pitched",
    label: "Traditional roof",
    blurb: "Pitched roof on columns, like the grounds of old.",
    cost: 0.9,
    capacity: 1,
    pros: "Cheaper · heritage feel",
    cons: "Columns block some views",
  },
  {
    id: "cantilever",
    label: "Cantilever roof",
    blurb: "No columns, a clear view from every seat.",
    cost: 1.15,
    capacity: 1,
    pros: "Clear views lift demand",
    cons: "15% dearer",
  },
  {
    id: "twoTier",
    label: "Two tiers + hospitality",
    blurb: "An upper tier over a glazed hospitality band.",
    cost: 1.25,
    capacity: 1.05,
    pros: "+150 hospitality places · bigger stand",
    cons: "25% dearer",
  },
];

/** Projects that raise a stand's level, where the build is chosen. */
export const LEVEL_RAISING_TYPES = ["capacityExpansion", "replacement", "standRedevelopment"] as const;

export function levelAfterProject(type: string, currentLevel: number): number {
  return Math.min(5, currentLevel + (type === "standRedevelopment" ? 2 : 1));
}

/** Roof choices open up as stands get bigger. */
export function roofOptionsFor(resultingLevel: number): BuildOption<RoofStyle>[] {
  if (resultingLevel < 3) return [];
  return ROOF_OPTIONS.filter((option) => option.id !== "twoTier" || resultingLevel >= 4);
}

export function buildCostMultiplier(build: StandBuild, resultingLevel: number): number {
  const standing = STANDING_OPTIONS.find((o) => o.id === build.standing)?.cost ?? 1;
  const roof = resultingLevel >= 3 ? ROOF_OPTIONS.find((o) => o.id === build.roof)?.cost ?? 1 : 1;
  return Math.round(standing * roof * 1000) / 1000;
}

export function buildCapacityMultiplier(build: StandBuild, resultingLevel: number): number {
  const standing = STANDING_OPTIONS.find((o) => o.id === build.standing)?.capacity ?? 1;
  const roof = resultingLevel >= 3 ? ROOF_OPTIONS.find((o) => o.id === build.roof)?.capacity ?? 1 : 1;
  return standing * roof;
}

/** The build in force for a stand (pending builds count once their project completes). */
export function standBuild(s: GameState, assetId: string, level?: number): StandBuild {
  const identity = groundIdentity(s);
  const pending = identity.pending[assetId];
  if (pending) {
    const project = s.infrastructure?.projects?.find((p) => p.id === pending.projectId);
    if (project?.status === "completed") return { standing: pending.standing, roof: pending.roof };
  }
  const applied = identity.stands[assetId];
  if (applied) return applied;
  const lvl = level ?? s.infrastructure?.assets?.find((a) => a.id === assetId)?.level ?? 1;
  // Defaults match how the ground has always been drawn.
  return { standing: lvl <= 1 ? "terrace" : "seated", roof: lvl >= 4 ? "twoTier" : "pitched" };
}

/** A build the club actually chose (applied, or pending with a completed project). */
export function chosenStandBuild(s: GameState, assetId: string): StandBuild | undefined {
  const identity = groundIdentity(s);
  const pending = identity.pending[assetId];
  if (pending) {
    const project = s.infrastructure?.projects?.find((p) => p.id === pending.projectId);
    if (project?.status === "completed") return { standing: pending.standing, roof: pending.roof };
  }
  return identity.stands[assetId];
}

/** Covered terraces don't count as seating for ground grading. */
export function standCountsAsSeating(s: GameState, assetId: string, level: number): boolean {
  if (level < 2) return false;
  return standBuild(s, assetId, level).standing !== "terrace";
}

/* ------------------------------------------------------------------ */
/* Atmosphere: feeds infrastructure.facilityModifiers                  */
/* ------------------------------------------------------------------ */

export interface GroundIdentityModifiers {
  /** Additive to the supporter-demand multiplier. */
  supporterDemand: number;
  /** Additive fan-happiness points. */
  fanHappiness: number;
}

export function groundIdentityModifiers(s: GameState): GroundIdentityModifiers {
  const standAssets = (s.infrastructure?.assets ?? []).filter((a) => a.type === "stand" && a.status !== "closed");
  let demand = 0;
  let fans = 0;
  for (const stand of standAssets) {
    if (stand.level < 2) continue; // basic terraces are the baseline
    const build = standBuild(s, stand.id, stand.level);
    if (build.standing === "terrace") { demand += 0.012; fans += 0.4; }
    if (build.standing === "safeStanding") { demand += 0.008; fans += 0.3; }
    if (stand.level >= 3) {
      if (build.roof === "cantilever") demand += 0.006;
      if (build.roof === "pitched") { demand -= 0.004; fans += 0.1; }
    }
  }
  const identity = groundIdentity(s);
  if (identity.homeEnd && standAssets.some((a) => a.location === identity.homeEnd && a.level >= 2)) {
    demand += 0.01;
    fans += 0.5;
  }
  if (identity.groundName) fans += 0.1;
  return {
    supporterDemand: Math.max(-0.02, Math.min(0.06, Math.round(demand * 1000) / 1000)),
    fanHappiness: Math.max(-1, Math.min(2.5, Math.round(fans * 10) / 10)),
  };
}

/* ------------------------------------------------------------------ */
/* Looks                                                               */
/* ------------------------------------------------------------------ */

export const SEAT_SCHEMES: { id: SeatScheme; label: string; colours?: [string, string] }[] = [
  { id: "club", label: "Club colour" },
  { id: "twoTone", label: "Two-tone" },
  { id: "classic", label: "Classic teal", colours: ["#1f6f69", "#185a55"] },
  { id: "mono", label: "Grey", colours: ["#7d858b", "#6c7379"] },
  { id: "red", label: "Red", colours: ["#c62828", "#8e1b1b"] },
  { id: "blue", label: "Royal blue", colours: ["#2463b4", "#17427d"] },
  { id: "navy", label: "Navy", colours: ["#243b63", "#172641"] },
  { id: "black", label: "Black", colours: ["#25282b", "#111315"] },
  { id: "white", label: "White", colours: ["#e8e9e7", "#cfd2d2"] },
  { id: "amber", label: "Amber", colours: ["#d99a19", "#a66f0d"] },
  { id: "purple", label: "Purple", colours: ["#7047a8", "#4c2d78"] },
];
export const ROOF_COLOURS: { id: RoofColour; label: string; hex: string; dark: string }[] = [
  { id: "slate", label: "Slate", hex: "#56616c", dark: "#3e4852" },
  { id: "club", label: "Club colour", hex: "", dark: "" },
  { id: "white", label: "White", hex: "#dfe3e6", dark: "#b9c0c6" },
  { id: "charcoal", label: "Charcoal", hex: "#33383d", dark: "#24282c" },
  { id: "black", label: "Black", hex: "#202326", dark: "#101214" },
  { id: "red", label: "Red", hex: "#a92f31", dark: "#712022" },
  { id: "blue", label: "Blue", hex: "#315d91", dark: "#203e62" },
  { id: "green", label: "Green", hex: "#2f6848", dark: "#204831" },
  { id: "cream", label: "Cream", hex: "#d8d0ba", dark: "#aaa18a" },
  { id: "silver", label: "Silver", hex: "#aab0b5", dark: "#737a80" },
];
export const CLADDINGS: { id: Cladding; label: string; hex: string }[] = [
  { id: "brick", label: "Red brick", hex: "#9a5d42" },
  { id: "darkBrick", label: "Dark brick", hex: "#68463d" },
  { id: "modern", label: "Grey cladding", hex: "#c9ccd0" },
  { id: "white", label: "White render", hex: "#eceae4" },
  { id: "black", label: "Black panels", hex: "#35393c" },
  { id: "club", label: "Club colour", hex: "" },
  { id: "blue", label: "Blue panels", hex: "#496b8f" },
  { id: "green", label: "Green panels", hex: "#4d725b" },
  { id: "cream", label: "Cream render", hex: "#d8d0ba" },
];
export const FLOODLIGHT_STYLES: { id: FloodlightStyle; label: string }[] = [
  { id: "auto", label: "Match the ground" },
  { id: "posts", label: "Pitch-side posts" },
  { id: "masts", label: "Side masts" },
  { id: "pylons", label: "Corner pylons" },
  { id: "gantry", label: "Roof gantries" },
];
export const MOWING_PATTERNS: { id: Mowing; label: string }[] = [
  { id: "stripes", label: "Stripes" },
  { id: "wide", label: "Wide stripes" },
  { id: "vertical", label: "Lengthways" },
  { id: "checks", label: "Checks" },
  { id: "diagonal", label: "Diagonal" },
];

/** What the 3D scene needs. Colours come from the club kit where asked. */
export interface SceneLook {
  seat: string;
  seatAlt: string;
  twoTone: boolean;
  roof: string;
  roofDark: string;
  cladding: string;
  floodlights: FloodlightStyle;
  mowing: Mowing;
  homeEnd: "N" | "S" | null;
  stands: Partial<Record<StandSide, { terrace: boolean; roof: RoofStyle | "open" }>>;
  /** Per-stand resolved colours. Optional: sides without an entry use the ground-wide colours. */
  standColours?: Partial<Record<StandSide, StandColours>>;
}

export interface StandColours {
  seat: string;
  seatAlt: string;
  roof: string;
  roofDark: string;
  cladding: string;
}

function darken(hex: string, f: number): string {
  const h = hex.replace("#", "");
  const c = (i: number) => Math.max(0, Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) * f)));
  return `#${[c(0), c(2), c(4)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function resolveColours(
  seatsId: SeatScheme,
  roofId: RoofColour,
  claddingId: Cladding,
  clubColours: { body: string; secondary: string },
): StandColours & { twoTone: boolean } {
  const seatScheme = SEAT_SCHEMES.find((option) => option.id === seatsId);
  const seats =
    seatsId === "club"
      ? [clubColours.body, darken(clubColours.body, 0.8)]
      : seatsId === "twoTone"
        ? [clubColours.body, clubColours.secondary]
        : seatScheme?.colours ?? ["#1f6f69", "#185a55"];
  const roof = ROOF_COLOURS.find((r) => r.id === roofId) ?? ROOF_COLOURS[0];
  return {
    seat: seats[0],
    seatAlt: seats[1],
    twoTone: seatsId === "twoTone",
    roof: roof.id === "club" ? darken(clubColours.body, 0.85) : roof.hex,
    roofDark: roof.id === "club" ? darken(clubColours.body, 0.62) : roof.dark,
    cladding: claddingId === "club" ? clubColours.body : (CLADDINGS.find((c) => c.id === claddingId) ?? CLADDINGS[0]).hex,
  };
}

export function sceneLook(s: GameState, clubColours: { body: string; secondary: string }): SceneLook {
  const identity = groundIdentity(s);
  const ground = resolveColours(identity.seats, identity.roof, identity.cladding, clubColours);
  const stands: SceneLook["stands"] = {};
  for (const stand of (s.infrastructure?.assets ?? []).filter((a) => a.type === "stand")) {
    const side = stand.location as StandSide;
    if (!["N", "E", "S", "W"].includes(side)) continue;
    // Only stands the club has built its own way change the drawing.
    const build = chosenStandBuild(s, stand.id);
    if (!build) continue;
    stands[side] = { terrace: build.standing === "terrace", roof: stand.level >= 3 ? build.roof : "pitched" };
  }
  const standColours: SceneLook["standColours"] = {};
  for (const [side, own] of Object.entries(identity.standLooks ?? {}) as [StandSide, StandLook | undefined][]) {
    if (!own || (!own.seats && !own.roof && !own.cladding)) continue;
    const { twoTone: _ignored, ...colours } = resolveColours(own.seats ?? identity.seats, own.roof ?? identity.roof, own.cladding ?? identity.cladding, clubColours);
    standColours[side] = colours;
  }
  return {
    seat: ground.seat,
    seatAlt: ground.seatAlt,
    twoTone: ground.twoTone,
    roof: ground.roof,
    roofDark: ground.roofDark,
    cladding: ground.cladding,
    floodlights: identity.floodlights,
    mowing: identity.mowing,
    homeEnd: identity.homeEnd,
    stands,
    ...(Object.keys(standColours).length ? { standColours } : {}),
  };
}

/** Repainting seats costs per place; recolouring roofs or re-cladding per stand. */
export function cosmeticCost(_s: GameState, _change: Partial<GroundIdentityState>): number {
  // Cosmetic identity is player expression, not a capital project. Structural
  // upgrades still cost money through the Facilities project system.
  return 0;
}

/* ------------------------------------------------------------------ */
/* Ground Studio option lists (cosmetic: free)                         */
/* ------------------------------------------------------------------ */

export const STAND_MATERIALS: { id: StandMaterial; label: string }[] = [
  { id: "brick", label: "Brick" },
  { id: "timber", label: "Timber" },
  { id: "concrete", label: "Concrete" },
  { id: "cladding", label: "Steel cladding" },
];
export const DUGOUT_STYLES: { id: DugoutStyle; label: string }[] = [
  { id: "auto", label: "Match the ground" },
  { id: "wooden", label: "Wooden" },
  { id: "brick", label: "Brick" },
  { id: "perspex", label: "Perspex" },
];
export const SCOREBOARD_STYLES: { id: ScoreboardStyle; label: string }[] = [
  { id: "auto", label: "Match the ground" },
  { id: "none", label: "None" },
  { id: "manual", label: "Hand-turned" },
  { id: "electronic", label: "Electronic" },
];
export const BUILDING_STYLES: { id: GroundBuildings; label: string }[] = [
  { id: "auto", label: "Match the ground" },
  { id: "portacabins", label: "Portacabins" },
  { id: "clubhouse", label: "Timber clubhouse" },
  { id: "brickClubhouse", label: "Brick clubhouse" },
  { id: "modern", label: "Modern offices" },
];
export const PERIMETER_STYLES: { id: PerimeterStyle; label: string }[] = [
  { id: "rail", label: "Pitch-side rail" },
  { id: "chainLink", label: "Chain-link fence" },
  { id: "barrier", label: "Crush barriers" },
  { id: "brick", label: "Brick wall" },
  { id: "hoardings", label: "Advertising hoardings" },
];
export const PERIMETER_COLOURS: { id: PerimeterColour; label: string; hex: string }[] = [
  { id: "white", label: "White", hex: "#f1f3f0" },
  { id: "club", label: "Club colour", hex: "" },
  { id: "green", label: "Green", hex: "#2f6b3c" },
  { id: "galvanized", label: "Galvanised", hex: "#a8b0b5" },
];
