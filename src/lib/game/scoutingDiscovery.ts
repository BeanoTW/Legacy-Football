import type { FootballPlayer, GameState, Position } from "./types";
import { hashString } from "./rng";
import { absoluteWeek } from "./time";
import { ageOf, BASE_YEAR, valueForPlayer, wageForAbility } from "./recruitment";
import { ensureFringeWorldState } from "./fringe";
import {
  preserveKnownIdentityInPlace,
  preserveKnownPlayerInPlace,
  type KnownPlayerSeed,
} from "./playerLifecycle";

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

const WORLD_FIRST_NAMES = [
  "Adam",
  "Ben",
  "Callum",
  "Daniel",
  "Elliot",
  "Finlay",
  "Harry",
  "Jamie",
  "Lewis",
  "Nathan",
  "Owen",
  "Ryan",
  "Sam",
  "Theo",
  "Tom",
  "Aaron",
  "Dylan",
  "Jack",
  "Luke",
  "Max",
];
const WORLD_LAST_NAMES = [
  "Bennett",
  "Campbell",
  "Davies",
  "Evans",
  "Fraser",
  "Graham",
  "Hughes",
  "Kelly",
  "Martin",
  "McLean",
  "Murray",
  "Parker",
  "Reid",
  "Roberts",
  "Stewart",
  "Taylor",
  "Walker",
  "Ward",
  "Wilson",
  "Young",
];
const WORLD_NATIONS = ["England", "Scotland", "Wales", "Ireland"];
const WORLD_POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

function unsignedHash(value: string): number {
  return hashString(value) >>> 0;
}

function pick<T>(items: T[], key: string): T {
  return items[unsignedHash(key) % items.length];
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

/**
 * Generates a tiny identity-only sample from a compact Fringe club. These are
 * not full squad objects and they are not inserted into football.players. The
 * seed is stable for the save/club/position and becomes persistent only when
 * scouting actually discovers it.
 */
function fringeCandidates(state: GameState): FringeCandidate[] {
  const world = ensureFringeWorldState(state);
  const candidates: FringeCandidate[] = [];

  for (const club of Object.values(world).sort((a, b) => a.clubId.localeCompare(b.clubId))) {
    for (const position of WORLD_POSITIONS) {
      const key = `${state.saveSeed}|world-player|${club.clubId}|${position}`;
      const age = 17 + (unsignedHash(`${key}|age`) % 18);
      const abilityNoise = (unsignedHash(`${key}|ability`) % 15) - 7;
      const currentAbility = Math.max(35, Math.min(94, Math.round(club.strength + abilityNoise)));
      const potentialBoost = age < 24 ? 4 + (unsignedHash(`${key}|potential`) % 13) : 0;
      const potentialAbility = Math.max(
        currentAbility,
        Math.min(96, currentAbility + potentialBoost),
      );
      const id = `wp-${unsignedHash(key).toString(36)}`;
      const identity: KnownPlayerSeed = {
        playerId: id,
        firstName: pick(WORLD_FIRST_NAMES, `${key}|first`),
        lastName: pick(WORLD_LAST_NAMES, `${key}|last`),
        dateOfBirth: {
          year: BASE_YEAR + state.season - 1 - age,
          month: 1 + (unsignedHash(`${key}|month`) % 12),
          day: 1 + (unsignedHash(`${key}|day`) % 28),
        },
        nationality: pick(WORLD_NATIONS, `${key}|nation`),
        primaryPosition: position,
        currentClubId: club.clubId,
        createdSeason: state.season,
      };
      candidates.push({
        id,
        source: "fringe",
        identity,
        currentAbility,
        potentialAbility,
        marketValue: valueForPlayer(currentAbility, potentialAbility, age, club.tier),
        wageExpectation: wageForAbility(
          currentAbility,
          club.reputation,
          club.tier,
          age,
          potentialAbility,
        ),
        age,
        primaryPosition: position,
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
  if (candidate.source === "detailed" && candidate.player.currentClubId === state.clubName) {
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
  const candidateLimit = quality >= 75 ? 6 : quality >= 45 ? 5 : 4;
  const detailed = ranked(
    next,
    next.football.players.map((player) => detailedCandidate(next, player)),
    input,
  );
  const fringe = ranked(next, fringeCandidates(next), input);

  // Wide-world scouting must genuinely reach beyond the current Focus bubble.
  // Reserve a small share for eligible Fringe discoveries, then fill remaining
  // slots with the strongest deterministic results from either source.
  const fringeQuota = fringe.length ? Math.min(2, Math.max(1, Math.floor(candidateLimit / 3))) : 0;
  const selected: DiscoveryCandidate[] = fringe.slice(0, fringeQuota);
  const selectedIds = new Set(selected.map((candidate) => candidate.id));
  const remainder = [...detailed, ...fringe.slice(fringeQuota)]
    .filter((candidate) => !selectedIds.has(candidate.id))
    .sort((a, b) => {
      const difference = discoveryScore(next, b, input) - discoveryScore(next, a, input);
      return difference || a.id.localeCompare(b.id);
    });
  selected.push(...remainder.slice(0, Math.max(0, candidateLimit - selected.length)));

  const candidateIds: string[] = [];
  const candidateSources: Record<string, ScoutingCandidateSource> = {};
  const candidateProfiles: Record<string, ScoutingCandidateProfile> = {};
  for (const candidate of selected) {
    if (candidate.source === "detailed") {
      preserveKnownPlayerInPlace(next, candidate.player, ["scouted"]);
    } else {
      preserveKnownIdentityInPlace(next, candidate.identity, ["scouted"]);
    }
    candidateIds.push(candidate.id);
    candidateSources[candidate.id] = candidate.source;
    candidateProfiles[candidate.id] = {
      source: candidate.source,
      currentAbility: candidate.currentAbility,
      potentialAbility: candidate.potentialAbility,
      marketValue: candidate.marketValue,
      wageExpectation: candidate.wageExpectation,
    };
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

/** First persisted discovery profile for an identity. */
export function scoutingCandidateProfile(
  state: GameState,
  playerId: string,
): ScoutingCandidateProfile | null {
  for (const brief of state.football?.scoutingDiscovery?.briefs ?? []) {
    const profile = brief.candidateProfiles?.[playerId];
    if (profile) return profile;
  }
  return null;
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
