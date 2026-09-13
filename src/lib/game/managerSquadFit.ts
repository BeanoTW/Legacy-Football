import type { FootballPlayer, GameState, Position, Staff } from "./types";
import { managerFootballIdentity, type ManagerFormation } from "./managerIdentity";
import { userClubReference } from "./clubReference";

export type SquadFitBand = "Excellent" | "Good" | "Workable" | "Poor";

export interface ManagerSquadFit {
  score: number;
  band: SquadFitBand;
  formation: ManagerFormation;
  alternativeScore: number | null;
  strengths: string[];
  gaps: string[];
  summary: string;
}

type ShapeNeed = Record<Position, number>;
const SHAPE_NEEDS: Record<ManagerFormation, ShapeNeed> = {
  "4-4-2": { GK: 1, DEF: 4, MID: 4, FWD: 2 },
  "4-2-3-1": { GK: 1, DEF: 4, MID: 5, FWD: 1 },
  "4-3-3": { GK: 1, DEF: 4, MID: 3, FWD: 3 },
  "3-5-2": { GK: 1, DEF: 3, MID: 5, FWD: 2 },
  "5-3-2": { GK: 1, DEF: 5, MID: 3, FWD: 2 },
};

const LABEL: Record<Position, string> = { GK: "goalkeeper", DEF: "defenders", MID: "midfielders", FWD: "forwards" };
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function playersForUser(state: GameState): FootballPlayer[] {
  const user = userClubReference(state);
  return state.football.players.filter((p) => p.currentClubId === user);
}

function positionQuality(players: FootballPlayer[], position: Position, needed: number): { score: number; count: number; average: number } {
  const options = players.filter((p) => p.primaryPosition === position || p.secondaryPositions.includes(position));
  const best = options.map((p) => p.currentAbility).sort((a, b) => b - a).slice(0, needed);
  const average = best.length ? best.reduce((sum, n) => sum + n, 0) / best.length : 0;
  const coverage = Math.min(1, options.length / Math.max(1, needed));
  return { score: average * coverage, count: options.length, average };
}

function scoreFormation(players: FootballPlayer[], formation: ManagerFormation): { score: number; strengths: string[]; gaps: string[] } {
  const need = SHAPE_NEEDS[formation];
  const strengths: string[] = [];
  const gaps: string[] = [];
  const units = (Object.keys(need) as Position[]).map((position) => {
    const result = positionQuality(players, position, need[position]);
    if (result.count < need[position]) gaps.push(`Short of ${LABEL[position]} for ${formation}`);
    else if (result.average >= 68) strengths.push(`Strong ${LABEL[position]} group`);
    return result.score;
  });
  const firstTeamCoverage = Math.min(1, players.length / 11);
  return { score: clamp((units.reduce((a, b) => a + b, 0) / units.length) * firstTeamCoverage), strengths, gaps };
}

function band(score: number): SquadFitBand {
  if (score >= 72) return "Excellent";
  if (score >= 62) return "Good";
  if (score >= 50) return "Workable";
  return "Poor";
}

export function managerSquadFit(state: GameState, manager: Staff): ManagerSquadFit {
  const identity = managerFootballIdentity(manager);
  const players = playersForUser(state);
  const primary = scoreFormation(players, identity.preferredFormation);
  const alternatives = identity.alternativeFormations.map((formation) => ({ formation, ...scoreFormation(players, formation) })).sort((a, b) => b.score - a.score);
  const bestAlternative = alternatives[0] ?? null;
  const adaptabilityBonus = identity.adaptability === "High" && bestAlternative && bestAlternative.score > primary.score ? Math.min(6, (bestAlternative.score - primary.score) * 0.35) : 0;
  const score = clamp(primary.score + adaptabilityBonus);
  const fitBand = band(score);
  const strengths = primary.strengths.slice(0, 2);
  const gaps = primary.gaps.slice(0, 2);
  const alternativeText = bestAlternative && bestAlternative.score >= primary.score + 5 ? ` His ${bestAlternative.formation} alternative suits the current group better.` : "";
  const summary = players.length < 11
    ? `The squad is too thin to judge ${identity.preferredFormation} properly yet.`
    : `${fitBand} fit for the current squad in ${identity.preferredFormation}.${alternativeText}`;
  return { score, band: fitBand, formation: identity.preferredFormation, alternativeScore: bestAlternative?.score ?? null, strengths, gaps, summary };
}
