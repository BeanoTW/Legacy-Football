import type { GameState, Position } from "./types";
import { clubSimulationSeedKey } from "./clubIdentity";
import { hashString } from "./rng";

export const FRINGE_SQUAD_SIZE = 20;
const POSITIONS: Position[] = ["GK", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"];

export interface CompactFringePlayer {
  playerId: string;
  dateOfBirth: { year: number; month: number; day: number };
  primaryPosition: Position;
  currentAbility: number;
  potentialAbility: number;
  currentClubId: string;
  contractExpirySeason: number;
}

export type FringePlayerWorld = Record<string, CompactFringePlayer>;

declare module "./types" {
  interface GameState {
    fringePlayers?: FringePlayerWorld;
  }
}

function unsignedHash(value: string): number {
  return hashString(value) >>> 0;
}

function positionForSlot(slot: number): Position {
  return POSITIONS[slot % POSITIONS.length];
}

function compactPlayerId(state: GameState, clubId: string, slot: number): string {
  const clubSeed = clubSimulationSeedKey(state, clubId);
  return `fp_${unsignedHash(`${state.saveSeed}|fringe-player|${clubSeed}|${slot}`).toString(36)}`;
}

function makeCompactPlayer(state: GameState, clubId: string, strength: number, slot: number): CompactFringePlayer {
  const clubSeed = clubSimulationSeedKey(state, clubId);
  const key = `${state.saveSeed}|fringe-player|${clubSeed}|${slot}`;
  const age = 18 + (unsignedHash(`${key}|age`) % 17);
  const abilityNoise = (unsignedHash(`${key}|ability`) % 15) - 7;
  const currentAbility = Math.max(30, Math.min(95, Math.round(strength + abilityNoise)));
  const potentialBoost = age < 24 ? 3 + (unsignedHash(`${key}|potential`) % 14) : 0;
  return {
    playerId: compactPlayerId(state, clubId, slot),
    dateOfBirth: {
      year: 2000 + state.season - 1 - age,
      month: 1 + (unsignedHash(`${key}|month`) % 12),
      day: 1 + (unsignedHash(`${key}|day`) % 28),
    },
    primaryPosition: positionForSlot(slot),
    currentAbility,
    potentialAbility: Math.max(currentAbility, Math.min(97, currentAbility + potentialBoost)),
    currentClubId: clubId,
    contractExpirySeason: state.season + 1 + (unsignedHash(`${key}|contract`) % 4),
  };
}

/**
 * Seeds compact individuals once for clubs currently outside Focus. Subsequent
 * reads retain those identities rather than regenerating a new cohort.
 */
export function ensurePersistentFringePlayers(state: GameState): FringePlayerWorld {
  const world = state.fringePlayers ?? {};
  for (const club of Object.values(state.fringeWorld ?? {})) {
    const existing = Object.values(world).filter((player) => player.currentClubId === club.clubId);
    if (existing.length >= FRINGE_SQUAD_SIZE) continue;
    const existingIds = new Set(existing.map((player) => player.playerId));
    for (let slot = 0; slot < FRINGE_SQUAD_SIZE; slot += 1) {
      const player = makeCompactPlayer(state, club.clubId, club.strength, slot);
      if (!existingIds.has(player.playerId)) world[player.playerId] = player;
    }
  }
  state.fringePlayers = world;
  return world;
}

export function fringePlayersForClub(state: GameState, clubId: string): CompactFringePlayer[] {
  return Object.values(ensurePersistentFringePlayers(state))
    .filter((player) => player.currentClubId === clubId)
    .sort((a, b) => a.playerId.localeCompare(b.playerId));
}
