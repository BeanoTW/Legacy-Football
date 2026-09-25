import type { GameState } from "./types";
import { clubDisplayName, isUserClubReference } from "./clubReference";
import { clubPresentationName } from "./clubPresentation";

/*
 * Club identity: badge and kits.
 *
 * Presentation only. Nothing here feeds the simulation, so changing a badge
 * or a kit can never alter results or deterministic streams. Stored as an
 * optional field so existing saves load unchanged and pick up a default
 * derived from the club name until the chairman designs their own.
 */

export const BADGE_SHAPES = ["shield", "classic", "round", "roundel", "pennant", "diamond", "octagon", "square"] as const;
export const BADGE_DIVISIONS = ["plain", "perPale", "perFess", "perBend", "quarterly", "stripes", "hoops", "chevron", "cross", "saltire", "chief"] as const;
export const BADGE_EMBLEMS = ["none", "ball", "star", "crown", "castle", "anchor", "swallow", "oak", "wheel", "locomotive", "mountains", "waves", "hammers"] as const;
export const BADGE_LETTERING = ["none", "initials", "ring"] as const;
export const KIT_PATTERNS = ["plain", "stripes", "pinstripes", "hoops", "halves", "quarters", "sash", "chevron", "band"] as const;
export const KIT_COLLARS = ["crew", "vneck", "polo"] as const;

export type BadgeShape = (typeof BADGE_SHAPES)[number];
export type BadgeDivision = (typeof BADGE_DIVISIONS)[number];
export type BadgeEmblem = (typeof BADGE_EMBLEMS)[number];
export type BadgeLettering = (typeof BADGE_LETTERING)[number];
export type KitPattern = (typeof KIT_PATTERNS)[number];
export type KitCollar = (typeof KIT_COLLARS)[number];

export interface BadgeDesign {
  shape: BadgeShape;
  division: BadgeDivision;
  emblem: BadgeEmblem;
  lettering: BadgeLettering;
  primary: string;
  secondary: string;
  /** Border and lettering colour. */
  accent: string;
  emblemColour: string;
  /** Up to four letters, e.g. "DTFC". */
  initials: string;
  /** Four-digit year or empty. */
  founded: string;
}

export interface KitDesign {
  pattern: KitPattern;
  collar: KitCollar;
  body: string;
  secondary: string;
  sleeves: string;
  trim: string;
  shorts: string;
  socks: string;
  /** Front-of-shirt text, up to 14 characters. */
  sponsor: string;
}

export interface ClubKitState {
  badge: BadgeDesign;
  home: KitDesign;
  away: KitDesign;
}

declare module "./types" {
  interface GameState {
    /** Player-designed badge and kits. Absent until first designed; a default is derived from the club name. */
    clubKit?: ClubKitState;
  }
}

/** Traditional football colours, named for the picker. */
export const KIT_COLOURS: ReadonlyArray<{ name: string; hex: string }> = [
  { name: "White", hex: "#ffffff" },
  { name: "Black", hex: "#16181b" },
  { name: "Red", hex: "#c8102e" },
  { name: "Claret", hex: "#7a1631" },
  { name: "Tangerine", hex: "#f06a0f" },
  { name: "Amber", hex: "#f2b705" },
  { name: "Yellow", hex: "#fbe122" },
  { name: "Old gold", hex: "#b8913a" },
  { name: "Sky blue", hex: "#6cabdd" },
  { name: "Royal blue", hex: "#1b4fb4" },
  { name: "Navy", hex: "#14264a" },
  { name: "Teal", hex: "#0f7b7a" },
  { name: "Green", hex: "#138a3e" },
  { name: "Bottle green", hex: "#0e4a2c" },
  { name: "Purple", hex: "#5b2a86" },
  { name: "Pink", hex: "#f29bb8" },
  { name: "Silver", hex: "#a9b0b8" },
  { name: "Charcoal", hex: "#3f454d" },
];

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColour(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/** Relative luminance, used to pick legible text and outline colours. */
export function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

export function readableOn(hex: string): string {
  return luminance(hex) > 0.45 ? "#16181b" : "#ffffff";
}

/** Darker or lighter version of a colour for outlines and shading. */
export function shadeHex(hex: string, amount: number): string {
  const mix = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    const target = amount < 0 ? 0 : 255;
    return Math.round(c + (target - c) * Math.abs(amount))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${mix(0)}${mix(1)}${mix(2)}`;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function clubInitials(name: string): string {
  const words = name
    .replace(/[^A-Za-z\s&]/g, " ")
    .split(/\s+/)
    .filter((word) => word && word !== "&" && !/^(the|of|and)$/i.test(word));
  if (!words.length) return "FC";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function hashName(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Classic two-colour pairings that always look like a football club. */
const PAIRINGS: ReadonlyArray<[string, string]> = [
  ["#c8102e", "#ffffff"],
  ["#1b4fb4", "#ffffff"],
  ["#16181b", "#ffffff"],
  ["#7a1631", "#6cabdd"],
  ["#f2b705", "#16181b"],
  ["#138a3e", "#ffffff"],
  ["#14264a", "#ffffff"],
  ["#f06a0f", "#16181b"],
  ["#0f7b7a", "#ffffff"],
  ["#5b2a86", "#ffffff"],
  ["#ffffff", "#14264a"],
  ["#6cabdd", "#14264a"],
];

type AuthoredIdentitySeed = {
  primary: string;
  secondary: string;
  accent: string;
  shape: BadgeShape;
  division: BadgeDivision;
  emblem: BadgeEmblem;
  homePattern?: KitPattern;
  sleeves?: string;
  shorts?: string;
  socks?: string;
  awayBody?: string;
  awaySecondary?: string;
};

/**
 * Research-backed visual direction for the deliberately recognisable analogue
 * clubs. These are not copies of real crests: only broad football colour
 * traditions and badge families are carried across into the original builder.
 * Every other AI club still receives a stable identity from defaultClubKit().
 */
const authored = (
  primary: string,
  secondary: string,
  shape: BadgeShape,
  division: BadgeDivision,
  emblem: BadgeEmblem,
  homePattern: KitPattern = "plain",
  extra: Partial<AuthoredIdentitySeed> = {},
): AuthoredIdentitySeed => ({
  primary,
  secondary,
  accent: extra.accent ?? (primary === "#ffffff" ? secondary : "#f2c14e"),
  shape,
  division,
  emblem,
  homePattern,
  ...extra,
});

const AUTHORED_AI_IDENTITIES: Readonly<Record<string, AuthoredIdentitySeed>> = {
  // Premier Division — broad colour and badge families inspired by the real 2026/27 clubs.
  "AFC Bournemuth": authored("#c8102e", "#16181b", "shield", "stripes", "ball", "stripes", { shorts: "#16181b", socks: "#c8102e" }),
  "Arsenol": authored("#c8102e", "#ffffff", "shield", "plain", "star", "plain", { sleeves: "#ffffff", shorts: "#ffffff", socks: "#c8102e" }),
  "Aston Viller": authored("#7a1631", "#6cabdd", "shield", "chief", "crown", "plain", { sleeves: "#6cabdd", shorts: "#ffffff", socks: "#7a1631" }),
  "Brentford City": authored("#c8102e", "#ffffff", "roundel", "stripes", "star", "stripes", { shorts: "#16181b" }),
  "Brighton & Hove Athletic": authored("#1b4fb4", "#ffffff", "shield", "stripes", "swallow", "stripes", { shorts: "#ffffff" }),
  "Chelsey": authored("#1b4fb4", "#ffffff", "round", "plain", "star", "plain", { shorts: "#1b4fb4" }),
  "Coventry Town": authored("#6cabdd", "#ffffff", "shield", "plain", "ball", "plain", { shorts: "#6cabdd" }),
  "Crystal Palais": authored("#1b4fb4", "#c8102e", "shield", "stripes", "star", "stripes", { shorts: "#14264a" }),
  "Evertoon": authored("#1b4fb4", "#ffffff", "shield", "plain", "castle", "plain", { shorts: "#ffffff" }),
  "Fulhem": authored("#ffffff", "#16181b", "shield", "plain", "ball", "plain", { accent: "#c8102e", shorts: "#16181b", socks: "#ffffff" }),
  "Hull United": authored("#f2b705", "#16181b", "shield", "stripes", "castle", "stripes", { accent: "#ffffff", shorts: "#16181b", socks: "#f2b705" }),
  "Ipswich City": authored("#1b4fb4", "#ffffff", "shield", "plain", "crown", "plain", { accent: "#c8102e", shorts: "#ffffff" }),
  "Leeds City": authored("#ffffff", "#14264a", "shield", "plain", "star", "plain", { accent: "#f2b705", shorts: "#ffffff", socks: "#ffffff", awayBody: "#f2b705", awaySecondary: "#14264a" }),
  "Liverpoul": authored("#c8102e", "#ffffff", "classic", "plain", "swallow", "plain", { accent: "#f2c14e", shorts: "#c8102e", socks: "#c8102e" }),
  "Monchester City": authored("#6cabdd", "#ffffff", "roundel", "plain", "castle", "plain", { accent: "#14264a", shorts: "#ffffff", socks: "#6cabdd" }),
  "Monchester United": authored("#c8102e", "#ffffff", "shield", "chief", "castle", "plain", { accent: "#f2c14e", shorts: "#ffffff", socks: "#16181b" }),
  "Newcastle City": authored("#16181b", "#ffffff", "shield", "stripes", "castle", "stripes", { accent: "#6cabdd", shorts: "#16181b", socks: "#16181b" }),
  "Nottingham Wood": authored("#c8102e", "#ffffff", "shield", "plain", "oak", "plain", { shorts: "#ffffff", socks: "#c8102e" }),
  "Sunderland Town": authored("#c8102e", "#ffffff", "shield", "stripes", "star", "stripes", { shorts: "#16181b", socks: "#c8102e" }),
  "Tottenham Hotspurs": authored("#ffffff", "#14264a", "shield", "plain", "star", "plain", { accent: "#14264a", shorts: "#14264a", socks: "#ffffff" }),

  // Championship.
  "Birmingham United": authored("#1b4fb4", "#ffffff", "shield", "plain", "ball", "plain", { shorts: "#ffffff" }),
  "Blackburn Town": authored("#1b4fb4", "#ffffff", "shield", "perPale", "star", "halves", { accent: "#c8102e", shorts: "#ffffff" }),
  "Bolton Wanderers": authored("#ffffff", "#14264a", "roundel", "plain", "ball", "plain", { accent: "#c8102e", shorts: "#14264a" }),
  "Bristol United": authored("#c8102e", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#ffffff" }),
  "Burnley Town": authored("#7a1631", "#6cabdd", "shield", "plain", "star", "plain", { sleeves: "#6cabdd", shorts: "#ffffff" }),
  "Cardiff Town": authored("#1b4fb4", "#ffffff", "shield", "plain", "star", "plain", { accent: "#c8102e", shorts: "#1b4fb4" }),
  "Charlton United": authored("#c8102e", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#ffffff" }),
  "Derby City": authored("#ffffff", "#16181b", "roundel", "plain", "star", "plain", { accent: "#16181b", shorts: "#16181b" }),
  "Lincoln Town": authored("#c8102e", "#ffffff", "shield", "stripes", "star", "stripes", { shorts: "#16181b" }),
  "Middlesborough": authored("#c8102e", "#ffffff", "shield", "chief", "star", "band", { shorts: "#c8102e" }),
  "Millwall Town": authored("#14264a", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#ffffff" }),
  "Norwich United": authored("#fbe122", "#138a3e", "shield", "plain", "star", "plain", { accent: "#138a3e", shorts: "#138a3e", socks: "#fbe122" }),
  "Portsmouth City": authored("#1b4fb4", "#ffffff", "shield", "plain", "star", "plain", { accent: "#c8102e", shorts: "#ffffff", socks: "#c8102e" }),
  "Preston North": authored("#ffffff", "#14264a", "shield", "plain", "star", "plain", { accent: "#14264a", shorts: "#14264a" }),
  "Queens Park United": authored("#1b4fb4", "#ffffff", "roundel", "hoops", "star", "hoops", { accent: "#c8102e", shorts: "#ffffff" }),
  "Sheffield City": authored("#1b4fb4", "#ffffff", "shield", "stripes", "star", "stripes", { shorts: "#16181b" }),
  "Stoke Town": authored("#c8102e", "#ffffff", "shield", "stripes", "star", "stripes", { shorts: "#ffffff" }),
  "Swansea Town": authored("#ffffff", "#16181b", "shield", "plain", "swallow", "plain", { accent: "#16181b", shorts: "#ffffff" }),
  "Westham United": authored("#7a1631", "#6cabdd", "shield", "plain", "hammers", "plain", { sleeves: "#6cabdd", shorts: "#ffffff" }),
  "Wolverton Wanderers": authored("#f2b705", "#16181b", "shield", "plain", "star", "plain", { accent: "#16181b", shorts: "#16181b", socks: "#f2b705" }),

  // League One.
  "Leicestor City": authored("#1b4fb4", "#ffffff", "roundel", "plain", "star", "plain", { accent: "#f2c14e", shorts: "#1b4fb4" }),
  "Notts City": authored("#16181b", "#ffffff", "shield", "stripes", "star", "stripes", { shorts: "#16181b" }),
  "Oxford City": authored("#f2b705", "#14264a", "shield", "plain", "castle", "plain", { accent: "#14264a", shorts: "#14264a" }),
  "MK United": authored("#ffffff", "#c8102e", "roundel", "plain", "star", "plain", { accent: "#16181b", shorts: "#ffffff" }),
  "Reading City": authored("#1b4fb4", "#ffffff", "roundel", "hoops", "star", "hoops", { shorts: "#ffffff" }),
  "Luton City": authored("#f06a0f", "#14264a", "shield", "plain", "star", "plain", { accent: "#ffffff", shorts: "#14264a" }),
  "Barnsley City": authored("#c8102e", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#ffffff" }),
  "Bromley City": authored("#c8102e", "#16181b", "shield", "plain", "ball", "plain", { accent: "#ffffff", shorts: "#16181b" }),
  "Blackpool City": authored("#f06a0f", "#ffffff", "shield", "plain", "star", "plain", { accent: "#16181b", shorts: "#ffffff" }),
  "Wycombe United": authored("#1b4fb4", "#6cabdd", "shield", "quarterly", "star", "quarters", { accent: "#ffffff", shorts: "#14264a" }),
  "Bradford United": authored("#7a1631", "#f2b705", "shield", "stripes", "star", "stripes", { accent: "#16181b", shorts: "#16181b" }),
  "Peterborough City": authored("#1b4fb4", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#ffffff" }),
  "Burton City": authored("#f2b705", "#16181b", "shield", "plain", "star", "plain", { accent: "#16181b", shorts: "#16181b" }),
  "Stevenage City": authored("#c8102e", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#c8102e" }),
  "Cambridge City": authored("#f2b705", "#16181b", "shield", "plain", "star", "plain", { accent: "#16181b", shorts: "#16181b" }),
  "Wigan United": authored("#1b4fb4", "#ffffff", "shield", "stripes", "star", "stripes", { shorts: "#1b4fb4" }),
  "Huddersfield City": authored("#6cabdd", "#ffffff", "shield", "stripes", "star", "stripes", { accent: "#14264a", shorts: "#ffffff" }),
  "AFC Wimbeldon": authored("#1b4fb4", "#f2b705", "shield", "plain", "star", "plain", { accent: "#f2b705", shorts: "#1b4fb4" }),
  "Leyton Orion": authored("#c8102e", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#c8102e" }),
  "Sheffield Wednsday": authored("#1b4fb4", "#ffffff", "shield", "stripes", "star", "stripes", { shorts: "#16181b" }),

  // League Two / lower EFL set.
  "Chesterfield City": authored("#1b4fb4", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#ffffff" }),
  "Salford United": authored("#c8102e", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#16181b" }),
  "Grimsby City": authored("#16181b", "#ffffff", "shield", "stripes", "star", "stripes", { accent: "#c8102e", shorts: "#16181b" }),
  "Cheltenham City": authored("#c8102e", "#ffffff", "shield", "stripes", "star", "stripes", { shorts: "#c8102e" }),
  "Crewe Alexanders": authored("#c8102e", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#ffffff" }),
  "Colchester City": authored("#1b4fb4", "#ffffff", "shield", "stripes", "star", "stripes", { shorts: "#ffffff" }),
  "Fleetwood City": authored("#c8102e", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#ffffff" }),
  "Harrogate City": authored("#f2b705", "#16181b", "shield", "plain", "star", "plain", { accent: "#16181b", shorts: "#16181b" }),
  "Newport City": authored("#f2b705", "#16181b", "shield", "plain", "star", "plain", { accent: "#16181b", shorts: "#16181b" }),
  "Swindon City": authored("#c8102e", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#c8102e" }),
  "Tranmere United": authored("#ffffff", "#1b4fb4", "shield", "plain", "star", "plain", { accent: "#1b4fb4", shorts: "#1b4fb4" }),
  "Walsall City": authored("#c8102e", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#ffffff" }),
  "Accrington City": authored("#c8102e", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#c8102e" }),
  "Barrow City": authored("#1b4fb4", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#ffffff" }),
  "Crawley City": authored("#c8102e", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#c8102e" }),
  "Doncaster Town": authored("#c8102e", "#ffffff", "shield", "hoops", "star", "hoops", { shorts: "#16181b" }),
  "Gillingham City": authored("#1b4fb4", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#1b4fb4" }),
  "Morecambe City": authored("#c8102e", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#c8102e" }),
  "Port Vale City": authored("#ffffff", "#16181b", "shield", "plain", "star", "plain", { accent: "#f2b705", shorts: "#16181b" }),
  "Rotherham City": authored("#c8102e", "#ffffff", "shield", "plain", "star", "plain", { shorts: "#ffffff" }),

  // Authored living-world identities outside the legacy presentation aliases.
  "Manchester Devils": authored("#c8102e", "#ffffff", "shield", "chief", "star", "plain", { accent: "#16181b", shorts: "#ffffff", socks: "#16181b" }),
  "Manchester Sky": authored("#6cabdd", "#ffffff", "roundel", "plain", "castle", "plain", { accent: "#14264a", shorts: "#ffffff" }),
  "Mersey Reds": authored("#c8102e", "#ffffff", "classic", "plain", "swallow", "plain", { shorts: "#c8102e", socks: "#c8102e" }),
  "Highbury Cannons": authored("#c8102e", "#ffffff", "shield", "plain", "star", "plain", { sleeves: "#ffffff", shorts: "#ffffff" }),
  "Madrid Imperial": authored("#ffffff", "#14264a", "roundel", "plain", "crown", "plain", { accent: "#f2c14e", shorts: "#ffffff" }),
  "Catalonia FC": authored("#7a1631", "#1b4fb4", "shield", "stripes", "ball", "stripes", { accent: "#f2c14e", shorts: "#14264a" }),
  "Munich Adler": authored("#c8102e", "#ffffff", "round", "hoops", "star", "plain", { accent: "#14264a", shorts: "#c8102e" }),
  "Paris Étoile": authored("#14264a", "#c8102e", "roundel", "chief", "star", "band", { accent: "#ffffff", shorts: "#14264a" }),
};

function authoredAiClubKit(clubName: string): ClubKitState | null {
  const presentationName = clubPresentationName(clubName);
  const seed = AUTHORED_AI_IDENTITIES[presentationName] ?? AUTHORED_AI_IDENTITIES[clubName];
  if (!seed) return null;
  const base = defaultClubKit(presentationName);
  const home: KitDesign = {
    ...base.home,
    pattern: seed.homePattern ?? "plain",
    body: seed.primary,
    secondary: seed.secondary,
    sleeves: seed.sleeves ?? seed.primary,
    trim: seed.secondary,
    shorts: seed.shorts ?? seed.secondary,
    socks: seed.socks ?? seed.primary,
    sponsor: "",
  };
  const awayBase = defaultAwayKit(home.body, home.secondary);
  const away: KitDesign = {
    ...awayBase,
    body: seed.awayBody ?? awayBase.body,
    secondary: seed.awaySecondary ?? awayBase.secondary,
    sleeves: seed.awayBody ?? awayBase.body,
    trim: seed.awaySecondary ?? awayBase.secondary,
    shorts: seed.awayBody ?? awayBase.body,
    socks: seed.awayBody ?? awayBase.body,
  };
  return {
    badge: {
      ...base.badge,
      shape: seed.shape,
      division: seed.division,
      emblem: seed.emblem,
      lettering: seed.shape === "roundel" || seed.shape === "round" ? "ring" : "initials",
      primary: seed.primary,
      secondary: seed.secondary,
      accent: seed.accent,
      emblemColour: seed.secondary,
      initials: clubInitials(presentationName),
    },
    home,
    away,
  };
}

/** A tasteful default so every club has an identity before it is customised. */
export function defaultClubKit(clubName: string): ClubKitState {
  const hash = hashName(clubName);
  const [primary, secondary] = PAIRINGS[hash % PAIRINGS.length];
  const shapes: BadgeShape[] = ["shield", "classic", "round", "roundel"];
  const emblems: BadgeEmblem[] = ["ball", "star", "castle", "oak", "wheel", "crown"];
  const divisions: BadgeDivision[] = ["plain", "chief", "perPale", "stripes", "quarterly"];
  const patterns: KitPattern[] = ["plain", "plain", "stripes", "hoops", "halves", "band"];
  const pattern = patterns[(hash >>> 5) % patterns.length];
  const lightPrimary = luminance(primary) > 0.6;
  return {
    badge: {
      shape: shapes[(hash >>> 3) % shapes.length],
      division: divisions[(hash >>> 7) % divisions.length],
      emblem: emblems[(hash >>> 11) % emblems.length],
      lettering: "initials",
      primary,
      secondary,
      accent: lightPrimary ? secondary : "#f2c14e",
      emblemColour: secondary,
      initials: clubInitials(clubName),
      founded: String(1870 + ((hash >>> 13) % 60)),
    },
    home: {
      pattern,
      collar: KIT_COLLARS[(hash >>> 17) % KIT_COLLARS.length],
      body: primary,
      secondary,
      sleeves: primary,
      trim: secondary,
      shorts: lightPrimary ? secondary : pattern === "plain" ? secondary : "#16181b",
      socks: primary,
      sponsor: "",
    },
    away: defaultAwayKit(primary, secondary),
  };
}

/** An away kit that clearly contrasts with the home shirt. */
export function defaultAwayKit(homeBody: string, homeSecondary: string): KitDesign {
  const candidates = ["#ffffff", "#16181b", "#f2b705", "#6cabdd", "#14264a", "#f06a0f", "#a9b0b8"];
  const body =
    candidates.find((colour) => contrast(colour, homeBody) > 3 && colour !== homeSecondary) ?? "#ffffff";
  const accent = contrast(homeBody, body) > 2.5 ? homeBody : readableOn(body);
  return {
    pattern: "plain",
    collar: "vneck",
    body,
    secondary: accent,
    sleeves: body,
    trim: accent,
    shorts: body,
    socks: body,
    sponsor: "",
  };
}

function pick<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

function colour(value: unknown, fallback: string): string {
  return isHexColour(value) ? value.toLowerCase() : fallback;
}

/** Repairs anything malformed in a saved identity, field by field. */
export function sanitizeClubKit(input: unknown, clubName: string): ClubKitState {
  const fallback = defaultClubKit(clubName);
  if (!input || typeof input !== "object") return fallback;
  const raw = input as Partial<Record<keyof ClubKitState, Record<string, unknown>>>;
  const b = raw.badge ?? {};
  const badge: BadgeDesign = {
    shape: pick(b.shape, BADGE_SHAPES, fallback.badge.shape),
    division: pick(b.division, BADGE_DIVISIONS, fallback.badge.division),
    emblem: pick(b.emblem, BADGE_EMBLEMS, fallback.badge.emblem),
    lettering: pick(b.lettering, BADGE_LETTERING, fallback.badge.lettering),
    primary: colour(b.primary, fallback.badge.primary),
    secondary: colour(b.secondary, fallback.badge.secondary),
    accent: colour(b.accent, fallback.badge.accent),
    emblemColour: colour(b.emblemColour, fallback.badge.emblemColour),
    initials: typeof b.initials === "string" ? cleanInitials(b.initials) : fallback.badge.initials,
    founded: typeof b.founded === "string" ? cleanYear(b.founded) : fallback.badge.founded,
  };
  const kit = (k: Record<string, unknown> | undefined, base: KitDesign): KitDesign => ({
    pattern: pick(k?.pattern, KIT_PATTERNS, base.pattern),
    collar: pick(k?.collar, KIT_COLLARS, base.collar),
    body: colour(k?.body, base.body),
    secondary: colour(k?.secondary, base.secondary),
    sleeves: colour(k?.sleeves, base.sleeves),
    trim: colour(k?.trim, base.trim),
    shorts: colour(k?.shorts, base.shorts),
    socks: colour(k?.socks, base.socks),
    sponsor: typeof k?.sponsor === "string" ? cleanSponsor(k.sponsor) : base.sponsor,
  });
  return { badge, home: kit(raw.home, fallback.home), away: kit(raw.away, fallback.away) };
}

export function cleanInitials(value: string): string {
  return value.replace(/[^A-Za-z&]/g, "").toUpperCase().slice(0, 4);
}

export function cleanYear(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

export function cleanSponsor(value: string): string {
  return value.replace(/[^\w\s&'.-]/g, "").slice(0, 14);
}

/** The identity to display: the saved design, or the club's default. */
export function clubKitFor(state: Pick<GameState, "clubKit" | "clubName">): ClubKitState {
  return state.clubKit ? sanitizeClubKit(state.clubKit, state.clubName) : defaultClubKit(state.clubName);
}

/**
 * Identity for any club reference in the world. The user's saved design wins;
 * AI clubs use an authored analogue seed when one exists, otherwise the stable
 * name-derived builder identity. No identity data is persisted for AI clubs.
 */
export function clubKitForReference(state: GameState, clubRef: string): ClubKitState {
  if (isUserClubReference(state, clubRef)) return clubKitFor(state);
  const displayName = clubDisplayName(state, clubRef);
  const presentationName = clubPresentationName(displayName);
  return authoredAiClubKit(displayName) ?? defaultClubKit(presentationName);
}

export function setClubKit(state: GameState, kit: ClubKitState): GameState {
  return { ...state, clubKit: sanitizeClubKit(kit, state.clubName) };
}

/** Kit colours drawn from the badge, for the "use badge colours" shortcut. */
export function kitFromBadge(badge: BadgeDesign, current: KitDesign): KitDesign {
  return {
    ...current,
    body: badge.primary,
    secondary: badge.secondary,
    sleeves: badge.primary,
    trim: badge.accent,
    shorts: luminance(badge.primary) > 0.6 ? badge.secondary : "#ffffff",
    socks: badge.primary,
  };
}

/** Fresh random identity for the "Surprise me" button. */
export function randomClubKit(clubName: string, random: () => number = Math.random): ClubKitState {
  const any = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const [primary, secondary] = any(PAIRINGS);
  const flip = random() < 0.3;
  const p = flip ? secondary : primary;
  const s = flip ? primary : secondary;
  const accent = any(["#f2c14e", s, "#ffffff", "#16181b"]);
  const home: KitDesign = {
    pattern: any(KIT_PATTERNS),
    collar: any(KIT_COLLARS),
    body: p,
    secondary: s,
    sleeves: random() < 0.2 ? s : p,
    trim: s,
    shorts: any([s, "#ffffff", "#16181b"]),
    socks: any([p, s]),
    sponsor: "",
  };
  return {
    badge: {
      shape: any(BADGE_SHAPES),
      division: any(BADGE_DIVISIONS),
      emblem: any(BADGE_EMBLEMS.filter((e) => e !== "none")),
      lettering: any(BADGE_LETTERING),
      primary: p,
      secondary: s,
      accent: contrast(accent, p) > 1.6 ? accent : readableOn(p),
      emblemColour: contrast(s, p) > 1.6 ? s : readableOn(p),
      initials: clubInitials(clubName),
      founded: String(1865 + Math.floor(random() * 70)),
    },
    home,
    away: defaultAwayKit(home.body, home.secondary),
  };
}