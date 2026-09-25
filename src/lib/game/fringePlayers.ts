import type { GameState, Position } from "./types";
import { clubSimulationSeedKey } from "./clubIdentity";
import { canonicalClubReference, sameClubReference } from "./clubReference";
import { hashString } from "./rng";
import { clubOverallProfile, generatedOverallForSlot } from "./playerOverall";

export const FRINGE_SQUAD_SIZE = 20;
export const FRINGE_INACTIVE_RETENTION_SEASONS = 1;
const POSITIONS: Position[] = ["GK", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"];
const POSITION_TARGETS: Record<Position, number> = { GK: 2, DEF: 6, MID: 8, FWD: 4 };
const POSITION_ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];

export interface CompactFringePlayer {
  playerId: string;
  dateOfBirth: { year: number; month: number; day: number };
  primaryPosition: Position;
  currentAbility: number;
  potentialAbility: number;
  currentClubId: string;
  contractExpirySeason: number;
  lastDevelopedSeason: number;
  /** Season this persistent identity first entered the compact world. */
  createdSeason?: number;
  retired?: boolean;
  /** Historical identity retained after a non-retirement departure. */
  departed?: boolean;
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

function replacementPlayerId(
  state: GameState,
  clubId: string,
  entrySeason: number,
  ordinal: number,
): string {
  const clubSeed = clubSimulationSeedKey(state, clubId);
  return `fp_${unsignedHash(`${state.saveSeed}|fringe-player|${clubSeed}|replacement|s${entrySeason}|${ordinal}`).toString(36)}`;
}

function makeCompactPlayer(
  state: GameState,
  clubId: string,
  strength: number,
  slot: number,
  floor: number,
  starCeiling: number,
): CompactFringePlayer {
  const clubSeed = clubSimulationSeedKey(state, clubId);
  const key = `${state.saveSeed}|fringe-player|${clubSeed}|${slot}`;
  const age = 18 + (unsignedHash(`${key}|age`) % 17);
  const abilityNoise = (unsignedHash(`${key}|ability`) % 5) - 2;
  const currentAbility = generatedOverallForSlot(strength, floor, starCeiling, slot, abilityNoise);
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
    potentialAbility: Math.max(currentAbility, Math.min(95, currentAbility + potentialBoost)),
    currentClubId: clubId,
    contractExpirySeason: state.season + 1 + (unsignedHash(`${key}|contract`) % 4),
    lastDevelopedSeason: state.season,
    createdSeason: state.season,
  };
}

function makeReplacementCompactPlayer(
  state: GameState,
  clubId: string,
  strength: number,
  ordinal: number,
  position: Position,
  floor: number,
  starCeiling: number,
): CompactFringePlayer {
  const clubSeed = clubSimulationSeedKey(state, clubId);
  const key = `${state.saveSeed}|fringe-player|${clubSeed}|replacement|s${state.season}|${ordinal}`;
  const age = 18 + (unsignedHash(`${key}|age`) % 6);
  const abilityNoise = (unsignedHash(`${key}|ability`) % 5) - 2;
  const currentAbility = generatedOverallForSlot(strength, floor, starCeiling, ordinal, abilityNoise);
  const potentialBoost = age < 24 ? 3 + (unsignedHash(`${key}|potential`) % 14) : 0;
  return {
    playerId: replacementPlayerId(state, clubId, state.season, ordinal),
    dateOfBirth: {
      year: 2000 + state.season - 1 - age,
      month: 1 + (unsignedHash(`${key}|month`) % 12),
      day: 1 + (unsignedHash(`${key}|day`) % 28),
    },
    primaryPosition: position,
    currentAbility,
    potentialAbility: Math.max(currentAbility, Math.min(95, currentAbility + potentialBoost)),
    currentClubId: clubId,
    contractExpirySeason: state.season + 1 + (unsignedHash(`${key}|contract`) % 4),
    lastDevelopedSeason: state.season,
    createdSeason: state.season,
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

function isActive(player: CompactFringePlayer): boolean {
  return !player.retired && !player.departed;
}

function protectedCompactPlayerIds(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const known of state.football?.playerLifecycle?.knownPlayers ?? []) ids.add(known.playerId);
  for (const playerId of state.football?.shortlist ?? []) ids.add(playerId);
  for (const report of state.football?.scoutingReports ?? []) ids.add(report.playerId);
  for (const negotiation of state.football?.negotiations ?? []) ids.add(negotiation.playerId);
  for (const loan of state.football?.loans ?? []) {
    if (loan.status === "Active") ids.add(loan.playerId);
  }
  return ids;
}

/**
 * World-only retired/departed identities are short-lived cache rows, not an
 * ever-growing historical database. Chairman-relevant identities are retained;
 * their known-player ledger is the durable history contract.
 */
export function pruneInactiveFringePlayersInPlace(state: GameState): number {
  const world = state.fringePlayers;
  if (!world) return 0;
  const protectedIds = protectedCompactPlayerIds(state);
  let removed = 0;
  for (const [playerId, player] of Object.entries(world)) {
    if (isActive(player) || protectedIds.has(playerId)) continue;
    const inactiveSeason = player.lastDevelopedSeason ?? state.season;
    if (state.season - inactiveSeason < FRINGE_INACTIVE_RETENTION_SEASONS) continue;
    delete world[playerId];
    removed += 1;
  }
  return removed;
}

function nextVacantPosition(players: CompactFringePlayer[]): Position {
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const player of players) if (isActive(player)) counts[player.primaryPosition] += 1;
  return (
    POSITION_ORDER.find((position) => counts[position] < POSITION_TARGETS[position]) ?? "MID"
  );
}

/** Cheap deterministic season-level development: no matches, training, morale or injuries. */
export function advancePersistentFringePlayersToSeason(state: GameState): FringePlayerWorld {
  const world = ensurePersistentFringePlayers(state);
  for (const player of Object.values(world)) {
    if (!isActive(player)) continue;
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
  // Restore active squad capacity first, then garbage-collect stale world-only
  // inactive rows. This keeps continuity where the chairman has attention while
  // preventing retired/departed strangers from growing the hot save forever.
  ensurePersistentFringePlayers(state);
  pruneInactiveFringePlayersInPlace(state);
  return state.fringePlayers ?? {};
}

/**
 * Seeds compact individuals once for clubs currently outside Focus. Existing
 * active compact identities are deliberately retained when a club enters Focus:
 * the fidelity boundary must not destroy relevant people. When that club later
 * returns to Fringe, those same active identities are reused.
 */
export function ensurePersistentFringePlayers(state: GameState): FringePlayerWorld {
  const world = state.fringePlayers ?? {};
  const grouped = new Map<string, CompactFringePlayer[]>();
  for (const player of Object.values(world)) {
    const key = canonicalClubReference(state, player.currentClubId);
    const group = grouped.get(key) ?? [];
    group.push(player);
    grouped.set(key, group);
  }

  for (const club of Object.values(state.fringeWorld ?? {})) {
    const clubKey = canonicalClubReference(state, club.clubId);
    const existing = grouped.get(clubKey) ?? [];
    const existingIds = new Set(existing.map((player) => player.playerId));
    let activeCount = existing.filter(isActive).length;
    if (activeCount >= FRINGE_SQUAD_SIZE) continue;

    // A club with no compact identities is entering the persistent world for
    // the first time, so seed its canonical original slots. Once any identities
    // exist, vacancies use generation-specific replacements; this prevents a
    // pruned retired original slot from ever being resurrected later.
    const profile = clubOverallProfile(state, club.clubId);
    const seedStrength = existing.length === 0
      ? profile.average
      : clamp(club.strength, profile.floor, profile.star);
    if (existing.length === 0) {
      for (let slot = 0; slot < FRINGE_SQUAD_SIZE; slot += 1) {
        const player = makeCompactPlayer(
          state,
          club.clubId,
          seedStrength,
          slot,
          profile.floor,
          profile.star,
        );
        world[player.playerId] = player;
        existing.push(player);
        existingIds.add(player.playerId);
        activeCount += 1;
      }
    }

    let ordinal = 0;
    while (activeCount < FRINGE_SQUAD_SIZE) {
      const position = nextVacantPosition(existing);
      const player = makeReplacementCompactPlayer(
        state,
        club.clubId,
        seedStrength,
        ordinal,
        position,
        profile.floor,
        profile.star,
      );
      ordinal += 1;
      if (existingIds.has(player.playerId) || world[player.playerId]) continue;
      world[player.playerId] = player;
      existing.push(player);
      existingIds.add(player.playerId);
      activeCount += 1;
    }
    grouped.set(clubKey, existing);
  }
  state.fringePlayers = world;
  return world;
}

/**
 * Pure squad projection for a Fringe club whose compact individuals have not
 * been materialised into the save yet. It uses the exact same deterministic
 * ids and player generator as ensurePersistentFringePlayers(), so browsing a
 * club early cannot create a second/different squad later.
 */
export function previewFringePlayersForClub(
  state: GameState,
  clubId: string,
): CompactFringePlayer[] {
  const canonical = canonicalClubReference(state, clubId);
  const existing = Object.values(state.fringePlayers ?? {})
    .filter(
      (player) =>
        isActive(player) &&
        sameClubReference(state, player.currentClubId, canonical),
    )
    .sort((a, b) => a.playerId.localeCompare(b.playerId));
  if (existing.length > 0) return existing;

  const club = Object.values(state.fringeWorld ?? {}).find((candidate) =>
    sameClubReference(state, candidate.clubId, canonical),
  );
  if (!club) return [];

  const profile = clubOverallProfile(state, club.clubId);
  return Array.from({ length: FRINGE_SQUAD_SIZE }, (_, slot) =>
    makeCompactPlayer(
      state,
      club.clubId,
      profile.average,
      slot,
      profile.floor,
      profile.star,
    ),
  );
}

export function fringePlayersForClub(state: GameState, clubId: string): CompactFringePlayer[] {
  return Object.values(ensurePersistentFringePlayers(state))
    .filter((player) => isActive(player) && sameClubReference(state, player.currentClubId, clubId))
    .sort((a, b) => a.playerId.localeCompare(b.playerId));
}
