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
  | "waves"
  | "fade"
  | "textured"
  | "slickBack"
  | "curtains"
  | "spiky"
  | "mullet"
  | "manBun"
  | "waves360"
  | "afroShort"
  | "afroFade"
  | "highTop"
  | "twists"
  | "cornrows"
  | "afroLong"
  | "locs"
  | "frenchCrop"
  | "undercut"
  | "pompadour"
  | "shag"
  | "lob"
  | "boxBraids"
  | "afroPuffs";

export type FacialHair = "none" | "stubble" | "designer" | "moustache" | "horseshoe" | "goatee" | "vandyke" | "chinstrap" | "short" | "full";
export type Outfit = "suit" | "openCollar" | "quarterZip" | "knit" | "overcoat" | "waistcoat" | "shirtTie" | "turtleneck" | "polo" | "tracksuit" | "puffer" | "doubleBreasted" | "trench" | "bomber" | "hoodie" | "gilet" | "blazerTee";
export type Eyewear = "none" | "round" | "rectangle" | "aviator" | "browline" | "wire";

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

/* Studio-only palette additions: the original four lists are frozen so
   existing deterministic portraits retain their original colours. */
export const SKIN_TONES_EXTRA = ["#fbe3d3", "#d69c78", "#b98059", "#3a2117"] as const;
export const HAIR_COLOURS_EXTRA = [
  { id: "#0e0d12", label: "Jet black" }, { id: "#d9a97a", label: "Strawberry blonde" },
  { id: "#f4efe6", label: "White" }, { id: "#f0dfb8", label: "Platinum" },
] as const;
export const OUTFIT_COLOURS_EXTRA = [
  { id: "#2b4f8a", label: "Royal" }, { id: "#7fa9d6", label: "Sky" },
  { id: "#6d2233", label: "Claret" }, { id: "#e9e3d4", label: "Cream" },
  { id: "#3f5b3a", label: "Olive" }, { id: "#a24a1f", label: "Rust" },
] as const;
export const ACCENT_COLOURS_EXTRA = [
  { id: "#e3762b", label: "Orange" }, { id: "#62b6e4", label: "Sky blue" },
  { id: "#d9608f", label: "Pink" }, { id: "#1a9a9a", label: "Teal" },
  { id: "#7a1f2c", label: "Claret" },
] as const;
export const SKIN_TONES_ALL: readonly string[] = [...SKIN_TONES.slice(0,1), SKIN_TONES_EXTRA[0], ...SKIN_TONES.slice(1,3), SKIN_TONES_EXTRA[1], SKIN_TONES[3], SKIN_TONES_EXTRA[2], ...SKIN_TONES.slice(4), SKIN_TONES_EXTRA[3]];
export const HAIR_COLOURS_ALL: readonly {id:string;label:string}[] = [HAIR_COLOURS_EXTRA[0], ...HAIR_COLOURS.slice(0,6), HAIR_COLOURS_EXTRA[1], ...HAIR_COLOURS.slice(6), HAIR_COLOURS_EXTRA[3], HAIR_COLOURS_EXTRA[2]];
export const OUTFIT_COLOURS_ALL: readonly {id:string;label:string}[] = [...OUTFIT_COLOURS, ...OUTFIT_COLOURS_EXTRA];
export const ACCENT_COLOURS_ALL: readonly {id:string;label:string}[] = [...ACCENT_COLOURS, ...ACCENT_COLOURS_EXTRA];

export type HairGroup = "Classic" | "Modern" | "Afro & textured" | "Longer";
export const HAIR_GROUPS: readonly HairGroup[] = ["Classic", "Modern", "Afro & textured", "Longer"];
export const HAIR_STYLES: { id: HairStyle; label: string; for: ChairmanSex[]; group: HairGroup }[] = [
  { id: "crop", label: "Crop", for: ["male","female"], group: "Classic" },
  { id: "sidePart", label: "Side parting", for: ["male","female"], group: "Classic" },
  { id: "quiff", label: "Quiff", for: ["male"], group: "Classic" },
  { id: "swept", label: "Swept back", for: ["male","female"], group: "Classic" },
  { id: "curly", label: "Curly", for: ["male","female"], group: "Classic" },
  { id: "buzz", label: "Buzz cut", for: ["male","female"], group: "Classic" },
  { id: "receding", label: "Receding", for: ["male"], group: "Classic" },
  { id: "bald", label: "Bald", for: ["male","female"], group: "Classic" },
  { id: "pixie", label: "Pixie", for: ["female","male"], group: "Classic" },
  { id: "bob", label: "Bob", for: ["female","male"], group: "Longer" },
  { id: "long", label: "Long", for: ["female","male"], group: "Longer" },
  { id: "waves", label: "Waves", for: ["female","male"], group: "Longer" },
  { id: "ponytail", label: "Ponytail", for: ["female","male"], group: "Longer" },
  { id: "bun", label: "Bun", for: ["female","male"], group: "Longer" },
  { id: "fade", label: "Skin fade", for: ["male","female"], group: "Modern" },
  { id: "textured", label: "Textured fringe", for: ["male","female"], group: "Modern" },
  { id: "slickBack", label: "Slicked back", for: ["male","female"], group: "Modern" },
  { id: "curtains", label: "Curtains", for: ["male","female"], group: "Modern" },
  { id: "spiky", label: "Spiky", for: ["male"], group: "Modern" },
  { id: "mullet", label: "Mullet", for: ["male","female"], group: "Modern" },
  { id: "manBun", label: "Top knot", for: ["male","female"], group: "Modern" },
  { id: "waves360", label: "360 waves", for: ["male","female"], group: "Afro & textured" },
  { id: "afroShort", label: "Short afro", for: ["male","female"], group: "Afro & textured" },
  { id: "afroFade", label: "Afro fade", for: ["male","female"], group: "Afro & textured" },
  { id: "highTop", label: "High-top", for: ["male","female"], group: "Afro & textured" },
  { id: "twists", label: "Twists", for: ["male","female"], group: "Afro & textured" },
  { id: "cornrows", label: "Cornrows", for: ["male","female"], group: "Afro & textured" },
  { id: "afroLong", label: "Big afro", for: ["female","male"], group: "Afro & textured" },
  { id: "locs", label: "Locs", for: ["male","female"], group: "Afro & textured" },
  { id: "boxBraids", label: "Box braids", for: ["female","male"], group: "Afro & textured" },
  { id: "afroPuffs", label: "Afro puffs", for: ["female","male"], group: "Afro & textured" },
  { id: "frenchCrop", label: "French crop", for: ["male","female"], group: "Modern" },
  { id: "undercut", label: "Undercut", for: ["male","female"], group: "Modern" },
  { id: "pompadour", label: "Pompadour", for: ["male","female"], group: "Classic" },
  { id: "shag", label: "Shag", for: ["female","male"], group: "Longer" },
  { id: "lob", label: "Long bob", for: ["female","male"], group: "Longer" },
];

export const FACIAL_HAIR: { id: FacialHair; label: string }[] = [
  { id: "none", label: "Clean shaven" },
  { id: "stubble", label: "Stubble" },
  { id: "designer", label: "Heavy stubble" },
  { id: "moustache", label: "Moustache" },
  { id: "horseshoe", label: "Horseshoe" },
  { id: "goatee", label: "Goatee" },
  { id: "vandyke", label: "Van Dyke" },
  { id: "chinstrap", label: "Chinstrap" },
  { id: "short", label: "Short beard" },
  { id: "full", label: "Full beard" },
];

export const OUTFITS: { id: Outfit; label: string }[] = [
  { id: "suit", label: "Suit & tie" },
  { id: "doubleBreasted", label: "Double-breasted" },
  { id: "waistcoat", label: "Three-piece" },
  { id: "openCollar", label: "Blazer, open collar" },
  { id: "turtleneck", label: "Blazer & roll-neck" },
  { id: "shirtTie", label: "Shirt & tie" },
  { id: "blazerTee", label: "Blazer & tee" },
  { id: "overcoat", label: "Overcoat & scarf" },
  { id: "trench", label: "Trench coat" },
  { id: "puffer", label: "Touchline coat" },
  { id: "quarterZip", label: "Club quarter-zip" },
  { id: "tracksuit", label: "Club tracksuit" },
  { id: "polo", label: "Club polo" },
  { id: "gilet", label: "Club gilet" },
  { id: "bomber", label: "Bomber jacket" },
  { id: "hoodie", label: "Hoodie" },
  { id: "knit", label: "Knitted jumper" },
];

export const EYEWEAR: { id: Eyewear; label: string }[] = [
  { id: "none", label: "None" },
  { id: "round", label: "Round frames" },
  { id: "rectangle", label: "Rectangular frames" },
  { id: "browline", label: "Browline" },
  { id: "wire", label: "Thin wire" },
  { id: "aviator", label: "Aviators" },
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
