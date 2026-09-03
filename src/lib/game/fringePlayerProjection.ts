import type { FringeClubState, GameState, Position } from "./types";
import { hashString } from "./rng";
import { legacyTierToFootballLevel } from "./footballLevel";
import { recruitmentPlayerValue, recruitmentWageForLevel } from "./recruitmentEconomy";
import { fringePlayersForClub } from "./fringePlayers";
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
 * Project one actual persistent compact player for scouting. The projection is
 * presentation/economy only: identity, DOB, ability and club ownership come
 * directly from fringePlayers and no FootballPlayer is hydrated merely because
 * a scout discovered the player.
 */
export function projectFringePlayer(
  state: GameState,
  club: FringeClubState,
  position: Position,
): FringePlayerProjection {
  const player = fringePlayersForClub(state, club.clubId).find(
    (candidate) => candidate.primaryPosition === position,
  );
  if (!player) {
    throw new Error(`compact fringe squad ${club.clubId} has no active ${position}`);
  }

  const key = `${state.saveSeed}|fringe-player-presentation|${player.playerId}`;
  const age = Math.max(16, BASE_YEAR + state.season - 1 - player.dateOfBirth.year);
  const identity: KnownPlayerSeed = {
    playerId: player.playerId,
    firstName: pick(FIRST_NAMES, `${key}|first`),
    lastName: pick(LAST_NAMES, `${key}|last`),
    dateOfBirth: { ...player.dateOfBirth },
    nationality: pick(NATIONS, `${key}|nation`),
    primaryPosition: player.primaryPosition,
    currentClubId: player.currentClubId,
    createdSeason: player.createdSeason ?? state.season,
  };
  const level = legacyTierToFootballLevel(club.tier);

  return {
    id: player.playerId,
    identity,
    currentAbility: player.currentAbility,
    potentialAbility: player.potentialAbility,
    marketValue: recruitmentPlayerValue(
      player.currentAbility,
      player.potentialAbility,
      age,
      level,
    ),
    wageExpectation: recruitmentWageForLevel(
      level,
      player.currentAbility,
      club.reputation,
      age,
      player.potentialAbility,
    ),
    age,
    primaryPosition: player.primaryPosition,
  };
}
