import type { FootballPlayer, GameState, Position } from "./types";
import { hashString } from "./rng";
import { absoluteWeek } from "./time";
import { ageOf } from "./recruitment";
import { preserveKnownPlayerInPlace } from "./playerLifecycle";

export type ScoutingBriefStatus = "complete";

export interface ScoutingBrief {
  id: string;
  position?: Position;
  maxAge?: number;
  maxMarketValue?: number;
  minCurrentAbility?: number;
  createdAtAbsoluteWeek: number;
  status: ScoutingBriefStatus;
  candidateIds: string[];
}

export interface ScoutingDiscoveryState {
  briefs: ScoutingBrief[];
}

declare module "./types" {
  interface RecruitmentState {
    /** Chairman-facing discovery history. Optional for old saves. */
    scoutingDiscovery?: ScoutingDiscoveryState;
  }
}

export interface ScoutingBriefInput {
  id: string;
  position?: Position;
  maxAge?: number;
  maxMarketValue?: number;
  minCurrentAbility?: number;
}

function scoutingQuality(state: GameState): number {
  const department = state.football?.department.recruitmentRating ?? 50;
  const chief = state.hiredStaff.find((staff) => staff.role === "Chief Scout")?.stats.scouting ?? 0;
  const scouts = state.hiredStaff.filter((staff) => staff.role === "Scout");
  const averageScout = scouts.length
    ? scouts.reduce((sum, staff) => sum + staff.stats.scouting, 0) / scouts.length
    : 0;
  return Math.max(1, Math.min(100, Math.round((department + chief + averageScout) / 3)));
}

function eligible(state: GameState, player: FootballPlayer, input: ScoutingBriefInput): boolean {
  if (player.currentClubId === state.clubName) return false;
  if (input.position && player.primaryPosition !== input.position) return false;
  if (input.maxAge !== undefined && ageOf(player, state.season) > input.maxAge) return false;
  if (input.maxMarketValue !== undefined && player.marketValue > input.maxMarketValue) return false;
  return true;
}

function discoveryScore(state: GameState, player: FootballPlayer, input: ScoutingBriefInput): number {
  const quality = scoutingQuality(state);
  const fit = input.minCurrentAbility === undefined ? 0 : player.currentAbility - input.minCurrentAbility;
  const noise = (hashString(`${state.saveSeed}|brief:${input.id}|${player.id}`) % 101) - 50;
  return fit * (0.35 + quality / 160) + noise * (1.15 - quality / 125);
}

/**
 * Runs a deterministic scouting brief against the internally simulated market.
 * The result is a small chairman-visible candidate set. Scouting quality only
 * changes discovery reliability; it never alters player quality.
 */
export function createScoutingBrief(state: GameState, input: ScoutingBriefInput): GameState {
  const next = structuredClone(state);
  if (!next.football) return next;
  next.football.scoutingDiscovery ??= { briefs: [] };
  if (next.football.scoutingDiscovery.briefs.some((brief) => brief.id === input.id)) return next;

  const quality = scoutingQuality(next);
  const candidateLimit = quality >= 75 ? 6 : quality >= 45 ? 5 : 4;
  const candidates = next.football.players
    .filter((player) => eligible(next, player, input))
    .sort((a, b) => {
      const difference = discoveryScore(next, b, input) - discoveryScore(next, a, input);
      return difference || a.id.localeCompare(b.id);
    })
    .slice(0, candidateLimit);

  const candidateIds: string[] = [];
  for (const player of candidates) {
    preserveKnownPlayerInPlace(next, player, ["scouted"]);
    candidateIds.push(player.id);
  }

  next.football.scoutingDiscovery.briefs.push({
    ...input,
    createdAtAbsoluteWeek: absoluteWeek(next.season, next.week),
    status: "complete",
    candidateIds,
  });
  return next;
}

export function scoutingBrief(state: GameState, briefId: string): ScoutingBrief | null {
  return state.football?.scoutingDiscovery?.briefs.find((brief) => brief.id === briefId) ?? null;
}

export function discoveredPlayerIds(state: GameState): Set<string> {
  return new Set(
    (state.football?.scoutingDiscovery?.briefs ?? []).flatMap((brief) => brief.candidateIds),
  );
}

export function isPlayerDiscovered(state: GameState, playerId: string): boolean {
  const detailed = state.football?.players.find((player) => player.id === playerId);
  if (detailed?.currentClubId === state.clubName) return true;
  return discoveredPlayerIds(state).has(playerId);
}
