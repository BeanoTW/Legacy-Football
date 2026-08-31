import type { GameState, Position } from "./types";
import { clubSimulationSeedKey } from "./clubIdentity";
import { sameClubReference } from "./clubReference";
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
  lastDevelopedSeason: number;
  retired?: boolean;
}

export type FringePlayerWorld = Record<string, CompactFringePlayer>;

declare module "./types" {
  interface GameState {
    fringePlayers?: FringePlayerWorld;
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

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
  const currentAbility = clamp(Math.round(strength + abilityNoise), 30, 95);
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
    lastDevelopedSeason: state.season,
  };
}

function playerAgeInSeason(player: CompactFringePlayer, season: number): number {
  return 2000 + season - 1 - player.dateOfBirth.year;
}

function seasonalAbilityDelta(state: GameState, player: CompactFringePlayer, season: number): number {
  const age = playerAgeInSeason(player, season);
  const variance = (unsignedHash(`${state.saveSeed}|fringe-development|${player.playerId}|s${season}`) % 3) - 1;
  if (age <= 20) return player.currentAbility < player.potentialAbility ? Math.max(0, 2 + variance) : 0;
  if (age <= 23) return player.currentAbility < player.potentialAbility ? Math.max(0, 1 + variance) : 0;
  if (age <= 28) return variance > 0 && player.currentAbility < player.potentialAbility ? 1 : 0;
  if (age <= 31) return variance < 0 ? -1 : 0;
  if (age <= 34) return -1 + Math.min(0, variance);
  return -2 + Math.min(0, variance);
}

function retiresInSeason(state: GameState, player: CompactFringePlayer, season: number): boolean {
  const age = playerAgeInSeason(player, season);
  if (age < 34) return false;
  if (age >= 39) return true;
  const threshold = (age - 33) * 14;
  return unsignedHash(`${state.saveSeed}|fringe-retirement|${player.playerId}|s${season}`) % 100 < threshold;
}

/** Cheap deterministic season-level development: no matches, training, morale or injuries. */
export function advancePersistentFringePlayersToSeason(state: GameState): FringePlayerWorld {
  const world = ensurePersistentFringePlayers(state);
  for (const player of Object.values(world)) {
    if (player.retired) continue;
    let season = player.lastDevelopedSeason ?? state.season;
    while (season < state.season) {
      season += 1;
      if (retiresInSeason(state, player, season)) {
        player.retired = true;
        player.lastDevelopedSeason = season;
        break;
      }
      player.currentAbility = clamp(
        player.currentAbility + seasonalAbilityDelta(state, player, season),
        20,
        player.potentialAbility,
      );
      player.lastDevelopedSeason = season;
    }
  }
  state.fringePlayers = world;
  return world;
}

/**
 * Seeds compact individuals once for clubs currently outside Focus. Existing
 * compact identities are deliberately retained when a club enters Focus: the
 * fidelity boundary must not destroy history. When that club later returns to
 * Fringe, these same identities are reused instead of generating a new squad.
 */
export function ensurePersistentFringePlayers(state: GameState): FringePlayerWorld {
  const world = state.fringePlayers ?? {};
  for (const club of Object.values(state.fringeWorld ?? {})) {
    const existing = Object.values(world).filter((player) =>
      sameClubReference(state, player.currentClubId, club.clubId),
    );
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
    .filter((player) => !player.retired && sameClubReference(state, player.currentClubId, clubId))
    .sort((a, b) => a.playerId.localeCompare(b.playerId));
}
