import type {
  FootballPlayer,
  GameState,
  PlayerPersonality,
  PreferredFoot,
} from "./types";
import { hashString } from "./rng";
import { knownPlayerIdentity } from "./playerLifecycle";
import { scoutingCandidateProfile } from "./scoutingDiscovery";

const FEET: PreferredFoot[] = ["Right", "Left", "Both"];
const PERSONALITIES: PlayerPersonality[] = [
  "Balanced",
  "Ambitious",
  "Loyal",
  "Professional",
  "Mercenary",
  "Temperamental",
];
const clamp = (n: number, lo = 1, hi = 99) => Math.max(lo, Math.min(hi, Math.round(n)));
const unsignedHash = (value: string) => hashString(value) >>> 0;

/**
 * Reconstruct the same lightweight player detail whenever a known identity is
 * needed by a subsystem that normally consumes FootballPlayer.
 *
 * This is a pure projection. It never inserts the player into football.players
 * and therefore never changes the Focus/Fringe simulation boundary.
 */
export function knownPlayerDetail(state: GameState, playerId: string): FootballPlayer | null {
  const detailed = state.football?.players.find((player) => player.id === playerId);
  if (detailed) return detailed;

  const known = knownPlayerIdentity(state, playerId);
  const profile = scoutingCandidateProfile(state, playerId);
  if (!known || !profile) return null;

  return {
    id: known.playerId,
    firstName: known.firstName,
    lastName: known.lastName,
    dateOfBirth: { ...known.dateOfBirth },
    nationality: known.nationality,
    preferredFoot: FEET[unsignedHash(`${playerId}|foot`) % FEET.length],
    primaryPosition: known.primaryPosition,
    secondaryPositions: [],
    currentClubId: known.currentClubId,
    reputation: clamp(profile.currentAbility * 0.85, 5, 98),
    currentAbility: profile.currentAbility,
    potentialAbility: profile.potentialAbility,
    marketValue: profile.marketValue,
    wageExpectation: profile.wageExpectation,
    personality: PERSONALITIES[unsignedHash(`${playerId}|personality`) % PERSONALITIES.length],
    contractId: null,
    transferStatus: "unlisted",
    availability: "available",
    createdSeason: known.createdSeason,
  };
}
