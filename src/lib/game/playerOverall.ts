import type { FootballPlayer, GameState } from "./types";
import { clubDisplayName, isUserClubReference, sameClubReference } from "./clubReference";
import { clubPresentationName } from "./clubPresentation";
import { footballLevelOfClub, footballLevelOfUser, type FootballLevel } from "./footballLevel";
import { playerRecentForm } from "./playerForm";
import { clubReputation } from "./reputation";
import { playerFitness } from "./playerHealth";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const PLAYER_OVERALL_MIN = 20;
export const PLAYER_OVERALL_MAX = 99;
export const PRACTICAL_PLAYER_OVERALL_MAX = 95;

export interface OverallBand {
  level: FootballLevel;
  squadAverage: number;
  starCeiling: number;
  floor: number;
}

const LEVEL_BANDS: Record<FootballLevel, OverallBand> = {
  1: { level: 1, squadAverage: 79, starCeiling: 92, floor: 68 },
  2: { level: 2, squadAverage: 71, starCeiling: 79, floor: 61 },
  3: { level: 3, squadAverage: 65, starCeiling: 73, floor: 56 },
  4: { level: 4, squadAverage: 60, starCeiling: 68, floor: 51 },
  5: { level: 5, squadAverage: 55, starCeiling: 63, floor: 46 },
  6: { level: 6, squadAverage: 50, starCeiling: 59, floor: 41 },
  7: { level: 7, squadAverage: 45, starCeiling: 55, floor: 35 },
  8: { level: 8, squadAverage: 40, starCeiling: 52, floor: 30 },
};

type PremierProfile = { average: number; star: number };

/**
 * FC-style starting calibration for the top division. These are team rating
 * profiles, not copied player data: the world still creates original players.
 */
const PREMIER_PROFILES: Readonly<Record<string, PremierProfile>> = {
  "Arsenol": { average: 84, star: 89 },
  "Monchester City": { average: 83, star: 91 },
  "Liverpoul": { average: 82, star: 90 },
  "Chelsey": { average: 80, star: 88 },
  "Newcastle City": { average: 79, star: 86 },
  "Monchester United": { average: 79, star: 89 },
  "Tottenham Hotspurs": { average: 78, star: 87 },
  "Aston Viller": { average: 78, star: 86 },
  "Brighton & Hove Athletic": { average: 76, star: 83 },
  "Nottingham Wood": { average: 76, star: 83 },
  "Crystal Palais": { average: 76, star: 84 },
  "Brentford City": { average: 75, star: 82 },
  "Fulhem": { average: 75, star: 82 },
  "Evertoon": { average: 74, star: 81 },
  "AFC Bournemuth": { average: 74, star: 82 },
  "Leeds City": { average: 73, star: 80 },
  "Sunderland Town": { average: 73, star: 80 },
  "Westham United": { average: 73, star: 82 },
  "Ipswich City": { average: 72, star: 79 },
  "Hull United": { average: 71, star: 78 },
};

export function overallBandForLevel(level: FootballLevel): OverallBand {
  return LEVEL_BANDS[level];
}

/**
 * Player reputation is a fame/market-standing scale, not an ability clone.
 * The same OVR means very different public standing at Premier League and
 * regional level, so level prestige must be part of the value.
 */
export function playerReputationForAbility(
  ability: number,
  level: FootballLevel,
  noise = 0,
): number {
  const levelPrestige = (8 - level) * 4;
  return clamp(
    Math.round(ability - 20 + levelPrestige + clamp(noise, -8, 8)),
    5,
    98,
  );
}

export function clubOverallProfile(
  state: GameState,
  clubRef: string,
): { level: FootballLevel; average: number; star: number; floor: number } {
  const level = isUserClubReference(state, clubRef)
    ? footballLevelOfUser(state)
    : footballLevelOfClub(state, clubRef);
  const band = overallBandForLevel(level);
  const display = clubPresentationName(clubDisplayName(state, clubRef));
  const authored = level === 1 ? PREMIER_PROFILES[display] : undefined;

  if (authored) {
    return {
      level,
      average: authored.average,
      star: authored.star,
      floor: band.floor,
    };
  }

  // Clubs at the same level should not all regenerate to an identical squad.
  // Map the club's persisted reputation within its CURRENT division band onto
  // a narrow ±3 OVR spread around the level baseline. This deliberately allows
  // the strongest lower-level clubs to approach the weakest clubs above them
  // without erasing the step up between divisions.
  const league = (state.leagues ?? []).find((candidate) =>
    candidate.clubIds.some((club) => sameClubReference(state, club, clubRef)),
  );
  const [repLo, repHi] = league?.reputationRange ?? [0, 100];
  const rep = clubReputation(state, clubRef);
  const percentile = repHi > repLo ? clamp((rep - repLo) / (repHi - repLo), 0, 1) : 0.5;
  const reputationAdjustment = (percentile - 0.5) * 6;
  const average = clamp(
    Math.round((band.squadAverage + reputationAdjustment) * 10) / 10,
    band.floor + 2,
    band.starCeiling - 3,
  );

  return {
    level,
    average,
    star: band.starCeiling,
    floor: band.floor,
  };
}

const SQUAD_CURVE = [
  7, 6, 5, 4, 4,
  3, 3, 2, 2, 1, 1,
  0, 0, -1, -1, -2, -2,
  -3, -4, -5, -6, -7,
] as const;

export function generatedOverallForSlot(
  targetAverage: number,
  floor: number,
  starCeiling: number,
  slot: number,
  noise: number,
): number {
  const curve = SQUAD_CURVE[slot % SQUAD_CURVE.length] ?? 0;
  // Noise is deliberately small: club identity should matter more than RNG.
  return clamp(
    Math.round(targetAverage + curve + clamp(noise, -2, 2)),
    floor,
    Math.min(PRACTICAL_PLAYER_OVERALL_MAX, starCeiling),
  );
}

export interface DynamicOverall {
  base: number;
  effective: number;
  min: number;
  max: number;
  delta: number;
  formDelta: number;
  moraleDelta: number;
  fitnessDelta: number;
}

/**
 * FC-style dynamic overall. currentAbility remains the durable base OVR;
 * form, club morale and fitness alter match-day expression without rewriting it.
 */
export function dynamicOverall(state: GameState, player: FootballPlayer): DynamicOverall {
  const base = clamp(Math.round(player.currentAbility), PLAYER_OVERALL_MIN, PRACTICAL_PLAYER_OVERALL_MAX);
  const form = playerRecentForm(state, player.id);
  const formDelta =
    form.appearances >= 2
      ? clamp((form.averageRating - 6.45) * 1.35, -3, 3)
      : 0;
  const morale = isUserClubReference(state, player.currentClubId ?? "")
    ? (state.playerClubPerformance?.morale ?? 50)
    : 50;
  const moraleDelta = clamp((morale - 50) / 20, -2, 2);
  const fitness = playerFitness(player);
  const fitnessDelta = fitness >= 92 ? 0.5 : fitness >= 82 ? 0 : -clamp((82 - fitness) / 7, 0, 5);
  const min = Math.max(PLAYER_OVERALL_MIN, base - 6);
  const max = Math.min(PRACTICAL_PLAYER_OVERALL_MAX, base + 3);
  const effective = clamp(Math.round(base + formDelta + moraleDelta + fitnessDelta), min, max);
  return {
    base,
    effective,
    min,
    max,
    delta: effective - base,
    formDelta,
    moraleDelta,
    fitnessDelta,
  };
}
