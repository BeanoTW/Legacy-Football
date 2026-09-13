import type { FootballPlayer, GameState, Position } from "./types";
import { ensureFringeWorldState } from "./fringe";
import { projectFringePlayer } from "./fringePlayerProjection";
import { isUserClubReference } from "./clubReference";
import {
  preserveKnownIdentityInPlace,
  preserveKnownPlayerInPlace,
  type KnownPlayerSeed,
} from "./playerLifecycle";
import {
  progressScoutingDiscoveryDayInPlace,
  type ScoutingBrief,
  type ScoutingCandidateProfile,
  type ScoutingCandidateSource,
} from "./scoutingDiscovery";
import type { ScoutingPlayerLevel } from "./chairmanScoutingBrief";
import { positionFamiliarity } from "./positions";

interface SemanticCandidate {
  id: string;
  source: ScoutingCandidateSource;
  currentAbility: number;
  potentialAbility: number;
  marketValue: number;
  wageExpectation: number;
  age: number;
  nationality: string;
  currentClubId: string | null;
  primaryPosition: Position;
  player?: FootballPlayer;
  identity?: KnownPlayerSeed;
}

const WORLD_POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

function squadBenchmark(state: GameState, level: ScoutingPlayerLevel): number {
  const abilities = (state.football?.players ?? [])
    .filter((player) => isUserClubReference(state, player.currentClubId))
    .map((player) => player.currentAbility)
    .sort((a, b) => b - a);
  const fallback = Math.max(35, Math.round(32 + state.reputation * 0.62));
  if (!abilities.length) return fallback;
  const at = (index: number) => abilities[Math.min(abilities.length - 1, Math.max(0, index))];
  switch (level) {
    case "star":
    case "starPotential":
      return at(2);
    case "startingXI":
      return at(10);
    case "firstTeam":
    case "firstTeamPotential":
      return at(15);
    case "backup":
      return at(20);
  }
}

function semanticFit(candidate: SemanticCandidate, level: ScoutingPlayerLevel, target: number): number {
  switch (level) {
    case "backup":
      return -Math.abs(candidate.currentAbility - target);
    case "firstTeam":
      return -Math.abs(candidate.currentAbility - target) + candidate.currentAbility * 0.08;
    case "startingXI":
      return -Math.abs(candidate.currentAbility - target) + candidate.currentAbility * 0.12;
    case "star":
      return candidate.currentAbility - Math.max(0, target - candidate.currentAbility) * 2;
    case "firstTeamPotential":
      return (
        candidate.potentialAbility -
        Math.abs(candidate.potentialAbility - target) * 0.35 -
        Math.max(0, candidate.currentAbility - target) * 0.15
      );
    case "starPotential":
      return (
        candidate.potentialAbility * 1.2 +
        candidate.currentAbility * 0.2 -
        Math.max(0, target - candidate.potentialAbility) * 2
      );
  }
}

function eligible(state: GameState, brief: ScoutingBrief, candidate: SemanticCandidate): boolean {
  if (isUserClubReference(state, candidate.currentClubId)) return false;
  if (brief.position && candidate.primaryPosition !== brief.position) return false;
  if (
    brief.tacticalPosition &&
    positionFamiliarity(candidate, brief.tacticalPosition) === "Unfamiliar"
  ) return false;
  if (brief.minAge !== undefined && candidate.age < brief.minAge) return false;
  if (brief.maxAge !== undefined && candidate.age > brief.maxAge) return false;
  if (brief.maxMarketValue !== undefined && candidate.marketValue > brief.maxMarketValue) return false;
  if (brief.maxWeeklyWage !== undefined && candidate.wageExpectation > brief.maxWeeklyWage) return false;
  if (brief.nationality && candidate.nationality.toLowerCase() !== brief.nationality.toLowerCase()) return false;
  if (brief.clubStatus === "free" && candidate.currentClubId !== null) return false;
  if (brief.clubStatus === "contracted" && candidate.currentClubId === null) return false;
  return true;
}

function detailedCandidates(state: GameState): SemanticCandidate[] {
  return (state.football?.players ?? []).map((player) => ({
    id: player.id,
    source: "detailed",
    currentAbility: player.currentAbility,
    potentialAbility: player.potentialAbility,
    marketValue: player.marketValue,
    wageExpectation: player.wageExpectation,
    age: Math.max(15, 2025 + state.season - 1 - player.dateOfBirth.year),
    nationality: player.nationality,
    currentClubId: player.currentClubId,
    primaryPosition: player.primaryPosition,
    player,
  }));
}

function fringeCandidates(state: GameState): SemanticCandidate[] {
  const world = ensureFringeWorldState(state);
  const candidates: SemanticCandidate[] = [];
  for (const club of Object.values(world).sort((a, b) => a.clubId.localeCompare(b.clubId))) {
    for (const position of WORLD_POSITIONS) {
      const projected = projectFringePlayer(state, club, position);
      candidates.push({
        id: projected.id,
        source: "fringe",
        currentAbility: projected.currentAbility,
        potentialAbility: projected.potentialAbility,
        marketValue: projected.marketValue,
        wageExpectation: projected.wageExpectation,
        age: projected.age,
        nationality: projected.identity.nationality,
        currentClubId: projected.identity.currentClubId,
        primaryPosition: projected.primaryPosition,
        identity: projected.identity,
      });
    }
  }
  return candidates;
}

function profile(candidate: SemanticCandidate): ScoutingCandidateProfile {
  return {
    source: candidate.source,
    currentAbility: candidate.currentAbility,
    potentialAbility: candidate.potentialAbility,
    marketValue: candidate.marketValue,
    wageExpectation: candidate.wageExpectation,
  };
}

function rewriteCompletedBrief(state: GameState, brief: ScoutingBrief & { playerLevel?: ScoutingPlayerLevel }): void {
  if (!state.football || !brief.playerLevel) return;
  const target = squadBenchmark(state, brief.playerLevel);
  const limit = brief.candidateLimit ?? 10;
  const ranked = [...detailedCandidates(state), ...fringeCandidates(state)]
    .filter((candidate) => eligible(state, brief, candidate))
    .sort((a, b) => {
      const fit = semanticFit(b, brief.playerLevel!, target) - semanticFit(a, brief.playerLevel!, target);
      if (fit) return fit;
      // Prefer cheaper players when football fit is effectively level.
      const affordability = a.marketValue - b.marketValue;
      return affordability || a.id.localeCompare(b.id);
    });

  // Keep a modest mix of free agents and compact-world options where available,
  // then fill the rest strictly by the chairman's football-level brief.
  const free = ranked.filter((candidate) => candidate.currentClubId === null);
  const fringe = ranked.filter((candidate) => candidate.source === "fringe");
  const freeQuota = Math.min(free.length, Math.max(2, Math.floor(limit * 0.2)));
  const fringeQuota = Math.min(fringe.length, Math.max(2, Math.floor(limit * 0.2)));
  const selected: SemanticCandidate[] = [...free.slice(0, freeQuota), ...fringe.slice(0, fringeQuota)];
  const selectedIds = new Set(selected.map((candidate) => candidate.id));
  selected.push(...ranked.filter((candidate) => !selectedIds.has(candidate.id)).slice(0, Math.max(0, limit - selected.length)));

  const candidateIds: string[] = [];
  const candidateSources: Record<string, ScoutingCandidateSource> = {};
  const candidateProfiles: Record<string, ScoutingCandidateProfile> = {};
  state.football.scoutingDiscovery ??= { briefs: [] };
  state.football.scoutingDiscovery.profiles ??= {};

  for (const candidate of selected) {
    if (candidate.player) preserveKnownPlayerInPlace(state, candidate.player, ["scouted"]);
    if (candidate.identity) preserveKnownIdentityInPlace(state, candidate.identity, ["scouted"]);
    const hidden = profile(candidate);
    candidateIds.push(candidate.id);
    candidateSources[candidate.id] = candidate.source;
    candidateProfiles[candidate.id] = hidden;
    state.football.scoutingDiscovery.profiles[candidate.id] ??= hidden;
  }

  brief.candidateIds = candidateIds;
  brief.candidateSources = candidateSources;
  brief.candidateProfiles = candidateProfiles;
}

/**
 * Canonical scouting progression plus chairman-level candidate selection.
 * This intentionally runs after the base discovery pass so old/non-chairman
 * briefs keep their existing behaviour unchanged.
 */
export function progressSemanticScoutingDiscoveryDayInPlace(state: GameState, targetDay: number): void {
  const before = new Set(
    (state.football?.scoutingDiscovery?.briefs ?? [])
      .filter((brief) => brief.status === "active")
      .map((brief) => brief.id),
  );
  progressScoutingDiscoveryDayInPlace(state, targetDay);
  for (const brief of state.football?.scoutingDiscovery?.briefs ?? []) {
    if (!before.has(brief.id) || brief.status !== "complete") continue;
    rewriteCompletedBrief(state, brief);
  }
}
