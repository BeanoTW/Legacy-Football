/* Reusable, deterministic character portraits.
   Appearance is derived from a stable entity ID; it is never written to
   GameState and never consumes the simulation RNG. Avoid age, club, rating,
   nationality or job-specific data in the face seed: those can change during
   a career and must not silently change a person's identity. */
import { hashString } from "./rng";
import {
  ACCENT_COLOURS, HAIR_COLOURS, OUTFIT_COLOURS, SKIN_TONES,
  type ChairmanAvatar, type ChairmanSex, type HairStyle,
  type FacialHair, type Outfit,
} from "./chairmanProfile";

export type PortraitSubject = "player" | "manager" | "staff" | "board";
export interface PortraitIdentity {
  id: string;
  subject: PortraitSubject;
  /** Only pass this when explicitly known; no inference from names or nationality. */
  sex?: ChairmanSex;
  /** Optional display-only outfit colour; never alters the face itself. */
  outfitColour?: string;
  accentColour?: string;
}
const maleHair: readonly HairStyle[] = [
  "buzz", "crop", "sidePart", "swept", "curly", "receding", "bald",
];
const femaleHair: readonly HairStyle[] = [
  "pixie", "bob", "long", "waves", "ponytail", "bun", "curly",
  "crop", "sidePart", "swept", "buzz",
];
const facialHair: readonly FacialHair[] = [
  "none", "none", "none", "stubble", "stubble", "moustache", "goatee", "short", "full",
];
const outfits: Record<PortraitSubject, readonly Outfit[]> = {
  player: ["quarterZip", "quarterZip", "knit", "openCollar"],
  manager: ["quarterZip", "openCollar", "overcoat", "suit", "knit"],
  staff: ["quarterZip", "quarterZip", "knit", "openCollar", "overcoat"],
  board: ["suit", "suit", "openCollar", "overcoat", "knit"],
};
const isHex = (value: string | undefined): value is string =>
  Boolean(value && /^#[0-9a-f]{6}$/i.test(value));

/** A person's face is stable across transfers, birthdays and save reloads. */
export function generatedPortrait(identity: PortraitIdentity): ChairmanAvatar {
  // Do not seed facial features with role: a promoted coach remains the same person.
  const key = `portrait-v1|${identity.id}`;
  const pick = <T,>(salt: string, options: readonly T[]): T =>
    options[(hashString(`${key}|${salt}`) >>> 0) % options.length];
  const sex = identity.sex ?? "male";
  const hair = pick("hair", sex === "female" ? femaleHair : maleHair);
  const hairColour = pick("hair-colour", HAIR_COLOURS).id;
  const glasses = (hashString(`${key}|glasses-roll`) >>> 0) % 9 === 0;
  return {
    sex,
    skin: pick("skin", SKIN_TONES),
    hair,
    hairColour,
    facialHair: sex === "female" ? "none" : pick("facial-hair", facialHair),
    outfit: pick(`outfit|${identity.subject}`, outfits[identity.subject]),
    outfitColour: isHex(identity.outfitColour) ? identity.outfitColour : pick("outfit-colour", OUTFIT_COLOURS).id,
    accentColour: isHex(identity.accentColour) ? identity.accentColour : pick("accent-colour", ACCENT_COLOURS).id,
    eyewear: glasses ? pick("glasses", ["round", "rectangle"] as const) : "none",
  };
}

export const playerPortrait = (id: string) => generatedPortrait({ id, subject: "player" });
export const staffPortrait = (id: string, isManager = false) =>
  generatedPortrait({ id, subject: isManager ? "manager" : "staff" });
export const boardPortrait = (id: string) => generatedPortrait({ id, subject: "board" });

/** Manual portraits are a presentation preference, not part of the simulation.
 * ID-only keys survive transfers and staff role changes. */
const OVERRIDES_KEY = "legacy-football.character-portraits.v1";
const OVERRIDES_EVENT = "legacy-football:character-portraits";
function readOverrides(): Record<string, ChairmanAvatar> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OVERRIDES_KEY);
    const value: unknown = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, ChairmanAvatar>;
  } catch { return {}; }
}
export function portraitOverride(id: string): ChairmanAvatar | null {
  return readOverrides()[id] ?? null;
}
export function savePortraitOverride(id: string, avatar: ChairmanAvatar): boolean {
  if (typeof window === "undefined" || !id) return false;
  try {
    const overrides = readOverrides();
    overrides[id] = avatar;
    window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
    window.dispatchEvent(new Event(OVERRIDES_EVENT));
    return true;
  } catch { return false; }
}
export function clearPortraitOverride(id: string): boolean {
  if (typeof window === "undefined" || !id) return false;
  try {
    const overrides = readOverrides();
    delete overrides[id];
    window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
    window.dispatchEvent(new Event(OVERRIDES_EVENT));
    return true;
  } catch { return false; }
}
export function onPortraitOverrideChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === OVERRIDES_KEY || event.key === null) listener();
  };
  window.addEventListener(OVERRIDES_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(OVERRIDES_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
