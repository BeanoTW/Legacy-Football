/* =========================================================================
   Chairman profile
   -------------------------------------------------------------------------
   The chairman's look and name belong to the PLAYER, not to a save. They are
   kept in device storage so every new career starts with the same person,
   and they can be edited at any time. Saves never read or write this; a
   career only records the chairman's name at creation, as it always has.
========================================================================= */

export type ChairmanSex = "male" | "female";

export type HairStyle =
  | "bald"
  | "buzz"
  | "crop"
  | "sidePart"
  | "quiff"
  | "receding"
  | "curly"
  | "swept"
  | "bob"
  | "pixie"
  | "long"
  | "ponytail"
  | "bun"
  | "waves";

export type FacialHair = "none" | "stubble" | "moustache" | "goatee" | "short" | "full";
export type Outfit = "suit" | "openCollar" | "quarterZip" | "knit" | "overcoat";
export type Eyewear = "none" | "round" | "rectangle";

export interface ChairmanAvatar {
  sex: ChairmanSex;
  skin: string;
  hair: HairStyle;
  hairColour: string;
  facialHair: FacialHair;
  outfit: Outfit;
  outfitColour: string;
  accentColour: string;
  eyewear: Eyewear;
}

export interface ChairmanProfile {
  name: string;
  avatar: ChairmanAvatar;
}

export const SKIN_TONES = [
  "#f6d7c3", "#eec1a0", "#e0ac86", "#c98f68", "#a8704c", "#8a5638", "#6b4029", "#4b2c1d",
] as const;

export const HAIR_COLOURS = [
  { id: "#1d1715", label: "Black" },
  { id: "#3b2618", label: "Dark brown" },
  { id: "#6a4027", label: "Brown" },
  { id: "#9a6a3f", label: "Light brown" },
  { id: "#c9a063", label: "Dark blonde" },
  { id: "#e3c688", label: "Blonde" },
  { id: "#a8421f", label: "Auburn" },
  { id: "#c9621f", label: "Ginger" },
  { id: "#8c8a86", label: "Grey" },
  { id: "#d8d5cf", label: "Silver" },
] as const;

export const OUTFIT_COLOURS = [
  { id: "#1f2a44", label: "Navy" },
  { id: "#33363b", label: "Charcoal" },
  { id: "#15171a", label: "Black" },
  { id: "#6b5a44", label: "Tan" },
  { id: "#5a1f2b", label: "Burgundy" },
  { id: "#1f4a3a", label: "Racing green" },
  { id: "#8a8f98", label: "Light grey" },
] as const;

export const ACCENT_COLOURS = [
  { id: "#b8322f", label: "Red" },
  { id: "#1f5fb8", label: "Royal blue" },
  { id: "#e3b23c", label: "Gold" },
  { id: "#2f8f6b", label: "Green" },
  { id: "#6b3fa0", label: "Purple" },
  { id: "#f2f2ee", label: "White" },
  { id: "#15171a", label: "Black" },
] as const;

export const HAIR_STYLES: { id: HairStyle; label: string; for: ChairmanSex[] }[] = [
  { id: "crop", label: "Crop", for: ["male", "female"] },
  { id: "sidePart", label: "Side parting", for: ["male", "female"] },
  { id: "quiff", label: "Quiff", for: ["male"] },
  { id: "swept", label: "Swept back", for: ["male", "female"] },
  { id: "curly", label: "Curly", for: ["male", "female"] },
  { id: "buzz", label: "Buzz cut", for: ["male", "female"] },
  { id: "receding", label: "Receding", for: ["male"] },
  { id: "bald", label: "Bald", for: ["male", "female"] },
  { id: "pixie", label: "Pixie", for: ["female", "male"] },
  { id: "bob", label: "Bob", for: ["female", "male"] },
  { id: "long", label: "Long", for: ["female", "male"] },
  { id: "waves", label: "Waves", for: ["female", "male"] },
  { id: "ponytail", label: "Ponytail", for: ["female", "male"] },
  { id: "bun", label: "Bun", for: ["female", "male"] },
];

export const FACIAL_HAIR: { id: FacialHair; label: string }[] = [
  { id: "none", label: "Clean shaven" },
  { id: "stubble", label: "Stubble" },
  { id: "moustache", label: "Moustache" },
  { id: "goatee", label: "Goatee" },
  { id: "short", label: "Short beard" },
  { id: "full", label: "Full beard" },
];

export const OUTFITS: { id: Outfit; label: string }[] = [
  { id: "suit", label: "Suit & tie" },
  { id: "openCollar", label: "Blazer, open collar" },
  { id: "overcoat", label: "Overcoat & scarf" },
  { id: "quarterZip", label: "Club quarter-zip" },
  { id: "knit", label: "Knitted jumper" },
];

export const EYEWEAR: { id: Eyewear; label: string }[] = [
  { id: "none", label: "None" },
  { id: "round", label: "Round frames" },
  { id: "rectangle", label: "Rectangular frames" },
];

export const DEFAULT_AVATAR: ChairmanAvatar = {
  sex: "male",
  skin: SKIN_TONES[1],
  hair: "sidePart",
  hairColour: HAIR_COLOURS[2].id,
  facialHair: "stubble",
  outfit: "suit",
  outfitColour: OUTFIT_COLOURS[0].id,
  accentColour: ACCENT_COLOURS[0].id,
  eyewear: "none",
};

export const DEFAULT_CHAIRMAN_PROFILE: ChairmanProfile = {
  name: "N. Cahill",
  avatar: DEFAULT_AVATAR,
};

const STORAGE_KEY = "legacy-football.chairman-profile.v1";
const CHANGE_EVENT = "legacy-football:chairman-profile";

function validAvatar(value: unknown): ChairmanAvatar {
  const input = (value ?? {}) as Partial<ChairmanAvatar>;
  const pick = <T,>(candidate: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(candidate as T) ? (candidate as T) : fallback;
  const hex = (candidate: unknown, fallback: string) =>
    typeof candidate === "string" && /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
  return {
    sex: pick(input.sex, ["male", "female"] as const, DEFAULT_AVATAR.sex),
    skin: hex(input.skin, DEFAULT_AVATAR.skin),
    hair: pick(input.hair, HAIR_STYLES.map((style) => style.id), DEFAULT_AVATAR.hair),
    hairColour: hex(input.hairColour, DEFAULT_AVATAR.hairColour),
    facialHair: pick(input.facialHair, FACIAL_HAIR.map((option) => option.id), DEFAULT_AVATAR.facialHair),
    outfit: pick(input.outfit, OUTFITS.map((option) => option.id), DEFAULT_AVATAR.outfit),
    outfitColour: hex(input.outfitColour, DEFAULT_AVATAR.outfitColour),
    accentColour: hex(input.accentColour, DEFAULT_AVATAR.accentColour),
    eyewear: pick(input.eyewear, EYEWEAR.map((option) => option.id), DEFAULT_AVATAR.eyewear),
  };
}

/** Read the device profile. Safe on the server and with corrupt storage. */
export function loadChairmanProfile(): ChairmanProfile {
  if (typeof window === "undefined") return DEFAULT_CHAIRMAN_PROFILE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CHAIRMAN_PROFILE;
    const parsed = JSON.parse(raw) as Partial<ChairmanProfile>;
    const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 40) : DEFAULT_CHAIRMAN_PROFILE.name;
    return { name, avatar: validAvatar(parsed.avatar) };
  } catch {
    return DEFAULT_CHAIRMAN_PROFILE;
  }
}

export function saveChairmanProfile(profile: ChairmanProfile): void {
  if (typeof window === "undefined") return;
  try {
    const clean: ChairmanProfile = { name: profile.name.trim().slice(0, 40) || DEFAULT_CHAIRMAN_PROFILE.name, avatar: validAvatar(profile.avatar) };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // Private browsing or full storage: the look simply isn't remembered.
  }
}

/** Subscribe to profile edits made anywhere in the app. */
export function onChairmanProfileChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    if (event.type === "storage" && (event as StorageEvent).key !== STORAGE_KEY) return;
    listener();
  };
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/** Switching sex keeps the look sensible: no beard on a default female, etc. */
export function withSex(avatar: ChairmanAvatar, sex: ChairmanSex): ChairmanAvatar {
  if (avatar.sex === sex) return avatar;
  return {
    ...avatar,
    sex,
    hair: sex === "female" ? "bob" : "sidePart",
    facialHair: sex === "female" ? "none" : avatar.facialHair,
  };
}
