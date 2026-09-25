import type { FootballPlayer, GameState } from "../types";
import { hashString } from "../rng";
import { clubReputation } from "../reputation";
import { footballLevelOfClub, footballLevelOfLeague, footballLevelOfUser } from "../footballLevel";
import {
  clubOverallProfile,
  generatedOverallForSlot,
  overallBandForLevel,
  PRACTICAL_PLAYER_OVERALL_MAX,
} from "../playerOverall";
import { isUserClubReference } from "../clubReference";
import { recruitmentPlayerValue, recruitmentWageForLevel } from "../recruitmentEconomy";
import type { Migration } from "./types";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
const unsignedHash = (value: string) => hashString(value) >>> 0;

function ageOf(state: GameState, player: FootballPlayer): number {
  return 2000 + state.season - 1 - player.dateOfBirth.year;
}

function refreshEconomy(state: GameState, player: FootballPlayer): void {
  const age = ageOf(state, player);
  const level = player.currentClubId
    ? isUserClubReference(state, player.currentClubId)
      ? footballLevelOfUser(state)
      : footballLevelOfClub(state, player.currentClubId)
    : state.leagues.reduce(
        (deepest, league) =>
          footballLevelOfLeague(league) > deepest ? footballLevelOfLeague(league) : deepest,
        1 as import("../footballLevel").FootballLevel,
      );
  const rep = player.currentClubId ? clubReputation(state, player.currentClubId) : 45;
  player.marketValue = recruitmentPlayerValue(
    player.currentAbility,
    player.potentialAbility,
    age,
    level,
  );
  player.wageExpectation = recruitmentWageForLevel(
    level,
    player.currentAbility,
    rep,
    age,
    player.potentialAbility,
  );
}

function recalibrateClub(state: GameState, clubRef: string, players: FootballPlayer[]): void {
  const profile = clubOverallProfile(state, clubRef);
  const ordered = [...players].sort(
    (a, b) => b.currentAbility - a.currentAbility || a.id.localeCompare(b.id),
  );
  ordered.forEach((player, index) => {
    const oldGap = Math.max(0, player.potentialAbility - player.currentAbility);
    const noise = (unsignedHash(`${state.saveSeed}|ovr-v21|${player.id}`) % 5) - 2;
    const next = generatedOverallForSlot(
      profile.average,
      profile.floor,
      profile.star,
      index,
      noise,
    );
    player.currentAbility = next;
    player.potentialAbility = clamp(
      next + Math.min(12, oldGap),
      next,
      PRACTICAL_PLAYER_OVERALL_MAX,
    );
    player.reputation = clamp(next * 0.86, 5, 98);
    refreshEconomy(state, player);
  });
}

function recalibrateFreeAgents(state: GameState, players: FootballPlayer[]): void {
  if (!players.length) return;
  const deepest = state.leagues.reduce(
    (level, league) => footballLevelOfLeague(league) > level ? footballLevelOfLeague(league) : level,
    1 as import("../footballLevel").FootballLevel,
  );
  const band = overallBandForLevel(deepest);
  const ordered = [...players].sort(
    (a, b) => b.currentAbility - a.currentAbility || a.id.localeCompare(b.id),
  );
  ordered.forEach((player, index) => {
    const oldGap = Math.max(0, player.potentialAbility - player.currentAbility);
    const noise = (unsignedHash(`${state.saveSeed}|fa-ovr-v21|${player.id}`) % 5) - 2;
    // Deep free-agent pools should contain useful finds, not stray Premier League stars.
    const next = generatedOverallForSlot(
      band.squadAverage - 2,
      Math.max(25, band.floor - 3),
      Math.min(65, band.starCeiling + 4),
      index % 22,
      noise,
    );
    player.currentAbility = next;
    player.potentialAbility = clamp(
      next + Math.min(12, oldGap),
      next,
      PRACTICAL_PLAYER_OVERALL_MAX,
    );
    player.reputation = clamp(next * 0.82, 5, 95);
    refreshEconomy(state, player);
  });
}

export function recalibratePlayerOverallScaleInPlace(state: GameState): void {
  const groups = new Map<string, FootballPlayer[]>();
  const freeAgents: FootballPlayer[] = [];
  for (const player of state.football?.players ?? []) {
    if (!player.currentClubId) {
      freeAgents.push(player);
      continue;
    }
    const group = groups.get(player.currentClubId) ?? [];
    group.push(player);
    groups.set(player.currentClubId, group);
  }

  for (const [clubRef, players] of groups) recalibrateClub(state, clubRef, players);
  recalibrateFreeAgents(state, freeAgents);

  // Compact world players use the same visible scale. Preserve their relative order.
  const compactGroups = new Map<string, Array<{
    playerId: string;
    currentAbility: number;
    potentialAbility: number;
    currentClubId: string;
    retired?: boolean;
    departed?: boolean;
  }>>();
  for (const player of Object.values(state.fringePlayers ?? {})) {
    if (player.retired || player.departed) continue;
    const group = compactGroups.get(player.currentClubId) ?? [];
    group.push(player);
    compactGroups.set(player.currentClubId, group);
  }
  for (const [clubRef, rawPlayers] of compactGroups) {
    const players = rawPlayers;
    const profile = clubOverallProfile(state, clubRef);
    players
      .sort((a, b) => b.currentAbility - a.currentAbility || a.playerId.localeCompare(b.playerId))
      .forEach((player, index) => {
        const oldGap = Math.max(0, player.potentialAbility - player.currentAbility);
        const noise = (unsignedHash(`${state.saveSeed}|compact-ovr-v21|${player.playerId}`) % 5) - 2;
        player.currentAbility = generatedOverallForSlot(
          profile.average,
          profile.floor,
          profile.star,
          index,
          noise,
        );
        player.potentialAbility = clamp(
          player.currentAbility + Math.min(12, oldGap),
          player.currentAbility,
          PRACTICAL_PLAYER_OVERALL_MAX,
        );
      });
  }

  const byId = new Map((state.football?.players ?? []).map((player) => [player.id, player]));
  for (const legacy of state.squad ?? []) {
    const canonical = byId.get(legacy.id);
    if (canonical) legacy.rating = canonical.currentAbility;
  }
}

export const PLAYER_OVERALL_MIGRATIONS: Migration[] = [
  {
    from: 20,
    to: 21,
    describe: "Recalibrate players onto the FC-style 20-99 overall scale",
    up(save) {
      recalibratePlayerOverallScaleInPlace(save as unknown as GameState);
    },
  },
];
