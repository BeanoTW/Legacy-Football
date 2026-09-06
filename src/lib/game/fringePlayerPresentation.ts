import type { PlayerPersonality, Position, PreferredFoot } from "./types";
import { hashString } from "./rng";

const FIRST_NAMES = [
  "Adam",
  "Ben",
  "Callum",
  "Daniel",
  "Elliot",
  "Finlay",
  "Harry",
  "Jamie",
  "Lewis",
  "Nathan",
  "Owen",
  "Ryan",
  "Sam",
  "Theo",
  "Tom",
  "Aaron",
  "Dylan",
  "Jack",
  "Luke",
  "Max",
];
const LAST_NAMES = [
  "Bennett",
  "Campbell",
  "Davies",
  "Evans",
  "Fraser",
  "Graham",
  "Hughes",
  "Kelly",
  "Martin",
  "McLean",
  "Murray",
  "Parker",
  "Reid",
  "Roberts",
  "Stewart",
  "Taylor",
  "Walker",
  "Ward",
  "Wilson",
  "Young",
];
const NATIONS = ["England", "Scotland", "Wales", "Ireland"];
const FEET: PreferredFoot[] = ["Right", "Right", "Right", "Left", "Both"];
const PERSONALITIES: PlayerPersonality[] = [
  "Balanced",
  "Ambitious",
  "Loyal",
  "Professional",
  "Mercenary",
  "Temperamental",
];
const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

function unsignedHash(value: string): number {
  return hashString(value) >>> 0;
}

function pick<T>(items: readonly T[], key: string): T {
  return items[unsignedHash(key) % items.length];
}

export interface FringePlayerPresentation {
  firstName: string;
  lastName: string;
  nationality: string;
  preferredFoot: PreferredFoot;
  personality: PlayerPersonality;
  secondaryPositions: Position[];
}

/**
 * Stable human-facing identity for a compact player. Presentation is derived
 * only from save identity + player id, so scouting and later Focus hydration
 * cannot rename the same person.
 */
export function fringePlayerPresentation(
  saveSeed: string,
  playerId: string,
  primaryPosition: Position,
): FringePlayerPresentation {
  const key = `${saveSeed}|fringe-player-presentation|${playerId}`;
  const secondaryCandidates = POSITIONS.filter((position) => position !== primaryPosition);
  const hasSecondary = unsignedHash(`${key}|secondary-enabled`) % 100 < 35;
  return {
    firstName: pick(FIRST_NAMES, `${key}|first`),
    lastName: pick(LAST_NAMES, `${key}|last`),
    nationality: pick(NATIONS, `${key}|nation`),
    preferredFoot: pick(FEET, `${key}|foot`),
    personality: pick(PERSONALITIES, `${key}|personality`),
    secondaryPositions: hasSecondary
      ? [pick(secondaryCandidates, `${key}|secondary-position`)]
      : [],
  };
}
