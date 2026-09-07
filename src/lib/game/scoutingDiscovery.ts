import type { FootballPlayer, GameState, Position } from "./types";
import { hashString } from "./rng";
import { absoluteWeek } from "./time";
import { ageOf, BASE_YEAR } from "./recruitment";
import { ensureFringeWorldState } from "./fringe";
import { projectFringePlayer } from "./fringePlayerProjection";
import {
  knownPlayerIdentity,
  preserveKnownIdentityInPlace,
  preserveKnownPlayerInPlace,
  type KnownPlayerSeed,
} from "./playerLifecycle";
import { isUserClubReference } from "./clubReference";

export type ScoutingBriefStatus = "complete";
export type ScoutingCandidateSource = "detailed" | "fringe";

/** Hidden simulation facts captured when a candidate is discovered. */
export interface ScoutingCandidateProfile {
  source: ScoutingCandidateSource;
  currentAbility: number;
  potentialAbility: number;
  marketValue: number;
  wageExpectation: number;
}

export interface DiscoveredCandidateView {
  playerId: string;
  name: string;
  position: Position;
  age: number;
  clubId: string | null;
  source: ScoutingCandidateSource;
  detailed: boolean;
}

export interface ScoutingBrief {
  id: string;
  position?: Position;
  maxAge?: number;
  maxMarketValue?: number;
  minCurrentAbility?: number;
  createdAtAbsoluteWeek: number;
  status: ScoutingBriefStatus;
  candidateIds: string[];
  /** Optional for backwards compatibility with briefs created before world discovery. */
  candidateSources?: Record<string, ScoutingCandidateSource>;
  /** Internal facts; chairman-facing reports reveal these progressively. */
  candidateProfiles?: Record<string, ScoutingCandidateProfile>;
}

export interface ScoutingDiscoveryState {
  briefs: ScoutingBrief[];
  /**
   * Candidate ids whose original brief has moved to cold history. This is a
   * compact compatibility ledger: current saves also retain a "scouted"
   * lifecycle reason, but older saves may not have written that reason.
   */
  historicalCandidateIds?: string[];
  /**
   * Persistent hidden report subjects for known players. This survives a
   * detailed player leaving the Focus bubble mid-assignment.
   */
  profiles?: Record<string, ScoutingCandidateProfile>;
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

interface CandidateBase {
  id: string;
  source: ScoutingCandidateSource;
  currentAbility: number;
  potentialAbility: number;
  marketValue: number;
  wageExpectation: number;
  age: number;
  primaryPosition: Position;
}

interface DetailedCandidate extends CandidateBase {
  source: "detailed";
  player: FootballPlayer;
}

interface FringeCandidate extends CandidateBase {
  source: "fringe";
  identity: KnownPlayerSeed;
}

type DiscoveryCandidate = DetailedCandidate | FringeCandidate;

const WORLD_POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

function unsignedHash(value: string): number {
  return hashString(value) >>> 0;
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

function detailedCandidate(state: GameState, player: FootballPlayer): DetailedCandidate {
  return {
    id: player.id,
    source: "detailed",
    player,
    currentAbility: player.currentAbility,
    potentialAbility: player.potentialAbility,
    marketValue: player.marketValue,
    wageExpectation: player.wageExpectation,
    age: ageOf(player, state.season),
    primaryPosition: player.primaryPosition,
  };
}

function profileOf(candidate: CandidateBase): ScoutingCandidateProfile {
  return {
    source: candidate.source,
    currentAbility: candidate.currentAbility,
    potentialAbility: candidate.potentialAbility,
    marketValue: candidate.marketValue,
    wageExpectation: candidate.wageExpectation,
  };
}

/** Persist hidden report facts without changing player fidelity. */
export function preserveScoutingCandidateProfileInPlace(
  state: GameState,
  player: FootballPlayer,
): void {
  if (!state.football) return;
  state.football.scoutingDiscovery ??= { briefs: [] };
  state.football.scoutingDiscovery.profiles ??= {};
  state.football.scoutingDiscovery.profiles[player.id] ??= {
    source: "detailed",
    currentAbility: player.currentAbility,
    potentialAbility: player.potentialAbility,
    marketValue: player.marketValue,
    wageExpectation: player.wageExpectation,
  };
}

/**
 * Generates a tiny identity-only sample from each compact Fringe club. The
 * implicit identity is cohort-backed: it ages while the compact cohort lives
 * and changes only when deterministic distant-squad turnover creates a new
 * cohort. Nothing is inserted into football.players merely for discovery.
 */
function fringeCandidates(state: GameState): FringeCandidate[] {
  const world = ensureFringeWorldState(state);
  const candidates: FringeCandidate[] = [];

  for (const club of Object.values(world).sort((a, b) => a.clubId.localeCompare(b.clubId))) {
    for (const position of WORLD_POSITIONS) {
      const projected = projectFringePlayer(state, club, position);
      candidates.push({
        id: projected.id,
        source: "fringe",
        identity: projected.identity,
        currentAbility: projected.currentAbility,
        potentialAbility: projected.potentialAbility,
        marketValue: projected.marketValue,
        wageExpectation: projected.wageExpectation,
        age: projected.age,
        primaryPosition: projected.primaryPosition,
      });
    }
  }

  return candidates;
}

function eligible(
  state: GameState,
  candidate: DiscoveryCandidate,
  input: ScoutingBriefInput,
): boolean {
  if (candidate.source === "detailed" && isUserClubReference(state, candidate.player.currentClubId)) {
    return false;
  }
  if (input.position && candidate.primaryPosition !== input.position) return false;
  if (input.maxAge !== undefined && candidate.age > input.maxAge) return false;
  if (input.maxMarketValue !== undefined && candidate.marketValue > input.maxMarketValue) return false;
  return true;
}

function discoveryScore(
  state: GameState,
  candidate: DiscoveryCandidate,
  input: ScoutingBriefInput,
): number {
  const quality = scoutingQuality(state);
  const fit =
    input.minCurrentAbility === undefined ? 0 : candidate.currentAbility - input.minCurrentAbility;
  const noise = (unsignedHash(`${state.saveSeed}|brief:${input.id}|${candidate.id}`) % 101) - 50;
  return fit * (0.35 + quality / 160) + noise * (1.15 - quality / 125);
}

function ranked(
  state: GameState,
  candidates: DiscoveryCandidate[],
  input: ScoutingBriefInput,
): DiscoveryCandidate[] {
  return candidates
    .filter((candidate) => eligible(state, candidate, input))
    .sort((a, b) => {
      const difference = discoveryScore(state, b, input) - discoveryScore(state, a, input);
      return difference || a.id.localeCompare(b.id);
    });
}

/**
 * Runs a deterministic scouting brief against both detailed players and the
 * compact football world. A brief returns only a handful of identities. Better
 * scouting changes discovery reliability; it never creates stronger players.
 */
export function createScoutingBrief(state: GameState, input: ScoutingBriefInput): GameState {
  const next = structuredClone(state);
  if (!next.football) return next;
  next.football.scoutingDiscovery ??= { briefs: [] };
  if (next.football.scoutingDiscovery.briefs.some((brief) => brief.id === input.id)) return next;

  const quality = scoutingQuality(next);
  // The underlying football world is already large; the previous 4–6 result
  // cap made that world feel tiny from the chairman's chair. A search now
  // exposes a genuinely useful market sample while scouting quality still
  // affects how broad and reliable the shortlist is.
  const candidateLimit = quality >= 75 ? 48 : quality >= 45 ? 40 : 32;
  const detailed = ranked(
    next,
    next.football.players.map((player) => detailedCandidate(next, player)),
    input,
  );
  const fringe = ranked(next, fringeCandidates(next), input);

  // Free agents should always form a meaningful part of an open market search,
  // especially at lower levels where they are a core recruitment route.
  const freeDetailed = detailed.filter(
    (candidate) => candidate.source === "detailed" && candidate.player.currentClubId === null,
  );
  const contractedDetailed = detailed.filter(
    (candidate) => candidate.source === "detailed" && candidate.player.currentClubId !== null,
  );
  const freeQuota = Math.min(
    freeDetailed.length,
    Math.max(8, Math.floor(candidateLimit * 0.3)),
  );
  const fringeQuota = fringe.length
    ? Math.min(fringe.length, Math.max(6, Math.floor(candidateLimit * 0.25)))
    : 0;

  const selected: DiscoveryCandidate[] = [
    ...freeDetailed.slice(0, freeQuota),
    ...fringe.slice(0, fringeQuota),
  ];
  const selectedIds = new Set(selected.map((candidate) => candidate.id));
  const remainder = [
    ...contractedDetailed,
    ...freeDetailed.slice(freeQuota),
    ...fringe.slice(fringeQuota),
  ]
    .filter((candidate) => !selectedIds.has(candidate.id))
    .sort((a, b) => {
      const difference = discoveryScore(next, b, input) - discoveryScore(next, a, input);
      return difference || a.id.localeCompare(b.id);
    });
  selected.push(...remainder.slice(0, Math.max(0, candidateLimit - selected.length)));

  next.football.scoutingDiscovery.profiles ??= {};
  const candidateIds: string[] = [];
  const candidateSources: Record<string, ScoutingCandidateSource> = {};
  const candidateProfiles: Record<string, ScoutingCandidateProfile> = {};
  for (const candidate of selected) {
    if (candidate.source === "detailed") {
      preserveKnownPlayerInPlace(next, candidate.player, ["scouted"]);
    } else {
      preserveKnownIdentityInPlace(next, candidate.identity, ["scouted"]);
    }
    const profile = profileOf(candidate);
    candidateIds.push(candidate.id);
    candidateSources[candidate.id] = candidate.source;
    candidateProfiles[candidate.id] = profile;
    next.football.scoutingDiscovery.profiles[candidate.id] ??= profile;
  }

  next.football.scoutingDiscovery.briefs.push({
    ...input,
    createdAtAbsoluteWeek: absoluteWeek(next.season, next.week),
    status: "complete",
    candidateIds,
    candidateSources,
    candidateProfiles,
  });
  return next;
}

export function scoutingBrief(state: GameState, briefId: string): ScoutingBrief | null {
  return state.football?.scoutingDiscovery?.briefs.find((brief) => brief.id === briefId) ?? null;
}

export function scoutingCandidateSource(
  state: GameState,
  briefId: string,
  playerId: string,
): ScoutingCandidateSource | null {
  return scoutingBrief(state, briefId)?.candidateSources?.[playerId] ?? null;
}

/** Persistent discovery profile for an identity, with old-brief fallback. */
export function scoutingCandidateProfile(
  state: GameState,
  playerId: string,
): ScoutingCandidateProfile | null {
  const persistent = state.football?.scoutingDiscovery?.profiles?.[playerId];
  if (persistent) return persistent;
  for (const brief of state.football?.scoutingDiscovery?.briefs ?? []) {
    const profile = brief.candidateProfiles?.[playerId];
    if (profile) return profile;
  }
  return null;
}

/** Chairman-safe display model: identity only, never hidden ability. */
export function discoveredCandidateViews(
  state: GameState,
  briefId: string,
): DiscoveredCandidateView[] {
  const brief = scoutingBrief(state, briefId);
  if (!brief) return [];
  return brief.candidateIds.flatMap((playerId) => {
    const detailed = state.football?.players.find((player) => player.id === playerId);
    const known = knownPlayerIdentity(state, playerId);
    if (!detailed && !known) return [];
    const dateOfBirth = detailed?.dateOfBirth ?? known!.dateOfBirth;
    const source = brief.candidateSources?.[playerId] ?? "detailed";
    return [
      {
        playerId,
        name: detailed
          ? `${detailed.firstName} ${detailed.lastName}`
          : `${known!.firstName} ${known!.lastName}`,
        position: detailed?.primaryPosition ?? known!.primaryPosition,
        age: BASE_YEAR + state.season - 1 - dateOfBirth.year,
        clubId: detailed?.currentClubId ?? known!.currentClubId,
        source,
        detailed: Boolean(detailed),
      },
    ];
  });
}

export function discoveredPlayerIds(state: GameState): Set<string> {
  const discovered = new Set<string>(
    state.football?.scoutingDiscovery?.historicalCandidateIds ?? [],
  );
  for (const brief of state.football?.scoutingDiscovery?.briefs ?? []) {
    for (const playerId of brief.candidateIds) discovered.add(playerId);
  }
  // Newer discovery writes an explicit lifecycle reason. Read it too so
  // chairman visibility no longer depends on retaining an old search payload.
  for (const known of state.football?.playerLifecycle?.knownPlayers ?? []) {
    if (known.reasons.includes("scouted")) discovered.add(known.playerId);
  }
  return discovered;
}

export function isPlayerDiscovered(state: GameState, playerId: string): boolean {
  const detailed = state.football?.players.find((player) => player.id === playerId);
  if (isUserClubReference(state, detailed?.currentClubId)) return true;
  return discoveredPlayerIds(state).has(playerId);
}
