import type { GameState, Position } from "./types";
import { canonicalClubReference, sameClubReference } from "./clubReference";
import { fringePlayerPresentation } from "./fringePlayerPresentation";
import { footballLevelOfClub } from "./footballLevel";
import { recruitmentPlayerValue, recruitmentWageForLevel } from "./recruitmentEconomy";
import { preserveKnownIdentityInPlace } from "./playerLifecycle";
import { previewFringePlayersForClub, type CompactFringePlayer } from "./fringePlayers";

const BASE_YEAR = 2000;

export interface BrowsableFringePlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  nationality: string;
  primaryPosition: Position;
  age: number;
  currentAbility: number;
  potentialAbility: number;
  marketValue: number;
  wageExpectation: number;
  currentClubId: string;
  createdSeason: number;
  dateOfBirth: CompactFringePlayer["dateOfBirth"];
}

function active(player: CompactFringePlayer): boolean {
  return !player.retired && !player.departed;
}

/**
 * Read-only projection of a compact club squad for the competitions browser.
 * This deliberately does not promote the whole squad into known-player state.
 */
export function browsableFringeSquad(state: GameState, clubId: string): BrowsableFringePlayer[] {
  const canonical = canonicalClubReference(state, clubId);
  const club = Object.values(state.fringeWorld ?? {}).find((item) =>
    sameClubReference(state, item.clubId, canonical),
  );
  if (!club) return [];

  const level = footballLevelOfClub(state, canonical);
  return previewFringePlayersForClub(state, canonical)
    .filter(active)
    .map((player) => {
      const presentation = fringePlayerPresentation(
        state.saveSeed,
        player.playerId,
        player.primaryPosition,
      );
      const age = Math.max(16, BASE_YEAR + state.season - 1 - player.dateOfBirth.year);
      return {
        playerId: player.playerId,
        firstName: presentation.firstName,
        lastName: presentation.lastName,
        nationality: presentation.nationality,
        primaryPosition: player.primaryPosition,
        age,
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
        currentClubId: player.currentClubId,
        createdSeason: player.createdSeason ?? state.season,
        dateOfBirth: { ...player.dateOfBirth },
      };
    });
}

/**
 * Persist only the one world player the chairman actually opens. The hidden
 * profile is stored so the existing player-profile/scouting stack can project
 * the same person without hydrating a detailed FootballPlayer or the club squad.
 */
export function preserveFringePlayerForProfile(
  state: GameState,
  player: BrowsableFringePlayer,
): GameState {
  const next = structuredClone(state);
  if (!next.football) return next;

  preserveKnownIdentityInPlace(
    next,
    {
      playerId: player.playerId,
      firstName: player.firstName,
      lastName: player.lastName,
      dateOfBirth: { ...player.dateOfBirth },
      nationality: player.nationality,
      primaryPosition: player.primaryPosition,
      currentClubId: player.currentClubId,
      createdSeason: player.createdSeason,
    },
    [],
  );

  next.football.scoutingDiscovery ??= { briefs: [] };
  next.football.scoutingDiscovery.profiles ??= {};
  next.football.scoutingDiscovery.profiles[player.playerId] ??= {
    source: "fringe",
    currentAbility: player.currentAbility,
    potentialAbility: player.potentialAbility,
    marketValue: player.marketValue,
    wageExpectation: player.wageExpectation,
  };

  return next;
}
