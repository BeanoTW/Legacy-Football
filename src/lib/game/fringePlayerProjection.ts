import type { FringeClubState, GameState, Position } from "./types";
import { hashString } from "./rng";
import { legacyTierToFootballLevel } from "./footballLevel";
import { recruitmentPlayerValue, recruitmentWageForLevel } from "./recruitmentEconomy";
import type { KnownPlayerSeed } from "./playerLifecycle";

const BASE_YEAR = 2000;
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

function unsignedHash(value: string): number {
  return hashString(value) >>> 0;
}

function pick<T>(items: T[], key: string): T {
  return items[unsignedHash(key) % items.length];
}

export interface FringePlayerProjection {
  id: string;
  identity: KnownPlayerSeed;
  currentAbility: number;
  potentialAbility: number;
  marketValue: number;
  wageExpectation: number;
  age: number;
  primaryPosition: Position;
}

/**
 * Project one implicit distant player from compact club/cohort state. Identity
 * remains stable while the cohort survives and changes when turnover creates a
 * new cohort. No FootballPlayer is persisted merely to answer this query.
 */
export function projectFringePlayer(
  state: GameState,
  club: FringeClubState,
  position: Position,
): FringePlayerProjection {
  const cohortSeason = club.cohortSeason ?? club.lastSimulatedSeason;
  const elapsed = Math.max(0, state.season - cohortSeason);
  const currentMeanAge = club.squadMeanAge ?? 25 + elapsed;
  const meanAgeAtCohortStart = Math.max(22, Math.min(29, currentMeanAge - elapsed));
  const key = `${state.saveSeed}|world-player|${club.clubId}|${position}|c${cohortSeason}`;
  const ageOffset = (unsignedHash(`${key}|age-offset`) % 9) - 4;
  const ageAtCohortStart = Math.max(17, Math.min(34, Math.round(meanAgeAtCohortStart + ageOffset)));
  const age = Math.max(17, Math.min(35, ageAtCohortStart + elapsed));
  const abilityNoise = (unsignedHash(`${key}|ability`) % 15) - 7;
  const currentAbility = Math.max(35, Math.min(94, Math.round(club.strength + abilityNoise)));
  const potentialBoost = age < 24 ? 4 + (unsignedHash(`${key}|potential`) % 13) : 0;
  const potentialAbility = Math.max(currentAbility, Math.min(96, currentAbility + potentialBoost));
  const id = `wp-${unsignedHash(key).toString(36)}`;
  const identity: KnownPlayerSeed = {
    playerId: id,
    firstName: pick(FIRST_NAMES, `${key}|first`),
    lastName: pick(LAST_NAMES, `${key}|last`),
    dateOfBirth: {
      year: BASE_YEAR + cohortSeason - 1 - ageAtCohortStart,
      month: 1 + (unsignedHash(`${key}|month`) % 12),
      day: 1 + (unsignedHash(`${key}|day`) % 28),
    },
    nationality: pick(NATIONS, `${key}|nation`),
    primaryPosition: position,
    currentClubId: club.clubId,
    createdSeason: cohortSeason,
  };
  const level = legacyTierToFootballLevel(club.tier);

  return {
    id,
    identity,
    currentAbility,
    potentialAbility,
    marketValue: recruitmentPlayerValue(currentAbility, potentialAbility, age, level),
    wageExpectation: recruitmentWageForLevel(
      level,
      currentAbility,
      club.reputation,
      age,
      potentialAbility,
    ),
    age,
    primaryPosition: position,
  };
}
