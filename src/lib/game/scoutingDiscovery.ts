import type { FootballPlayer, GameState, Position, TacticalPosition } from "./types";
import { hashString } from "./rng";
import { absoluteWeek } from "./time";
import { calendarDay } from "./calendar";
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
import { positionFamiliarity } from "./positions";

export type ScoutingBriefStatus = "active" | "complete";
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
  tacticalPosition?: TacticalPosition;
  minAge?: number;
  maxAge?: number;
  maxMarketValue?: number;
  maxWeeklyWage?: number;
  nationality?: string;
  clubStatus?: "free" | "contracted";
  minCurrentAbility?: number;
  createdAtAbsoluteWeek: number;
  /** Absolute presentation day when this search was dispatched. */
  createdAtDay?: number;
  /** Day on which the scouts return with the initial candidate batch. */
  dueAtDay?: number;
  /** Quality snapshot at dispatch; later staff changes do not rewrite the report. */
  scoutQuality?: number;
  /** Initial observation already completed when a candidate is returned. */
  initialKnowledgeDays?: number;
  /** Maximum number of candidates this search team can bring back. */
  candidateLimit?: number;
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
  tacticalPosition?: TacticalPosition;
  minAge?: number;
  maxAge?: number;
  maxMarketValue?: number;
  maxWeeklyWage?: number;
  nationality?: string;
  clubStatus?: "free" | "contracted";
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
  nationality: string;
  currentClubId: string | null;
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

export interface ScoutingSearchPlan {
  quality: number;
  searchDays: number;
  initialKnowledgeDays: number;
  candidateLimit: number;
}

export function scoutingQuality(state: GameState): number {
  const department = state.football?.department.recruitmentRating ?? 50;
  const chief = state.hiredStaff.find((staff) => staff.role === "Chief Scout");
  const scouts = state.hiredStaff.filter((staff) => staff.role === "Scout");
  const ratings = [department];
  if (chief) ratings.push(chief.stats.scouting);
  if (scouts.length) {
    ratings.push(scouts.reduce((sum, staff) => sum + staff.stats.scouting, 0) / scouts.length);
  }
  return Math.max(
    1,
    Math.min(100, Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length)),
  );
}

export function scoutingSearchPlan(state: GameState): ScoutingSearchPlan {
  const quality = scoutingQuality(state);
  const scoutCount = state.hiredStaff.filter(
    (staff) => staff.role === "Scout" || staff.role === "Chief Scout",
  ).length;
  const searchDays = quality >= 80 ? 2 : quality >= 55 ? 3 : 4;
  const initialKnowledgeDays = quality >= 80 ? 4 : quality >= 55 ? 3 : 2;
  const candidateLimit = Math.max(
    10,
    Math.min(32, 8 + Math.floor(quality / 6) + Math.min(8, scoutCount * 2)),
  );
  return { quality, searchDays, initialKnowledgeDays, candidateLimit };
}

function absoluteDay(state: GameState): number {
  return absoluteWeek(state.season, state.week) * 7 + calendarDay(state);
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
    nationality: player.nationality,
    currentClubId: player.currentClubId,
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
        nationality: projected.identity.nationality,
        currentClubId: projected.identity.currentClubId,
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
  if (
    input.tacticalPosition &&
    positionFamiliarity(candidate, input.tacticalPosition) === "Unfamiliar"
  ) return false;
  if (input.minAge !== undefined && candidate.age < input.minAge) return false;
  if (input.maxAge !== undefined && candidate.age > input.maxAge) return false;
  if (input.maxMarketValue !== undefined && candidate.marketValue > input.maxMarketValue) return false;
  if (input.maxWeeklyWage !== undefined && candidate.wageExpectation > input.maxWeeklyWage) return false;
  if (input.nationality && candidate.nationality.toLowerCase() !== input.nationality.toLowerCase()) return false;
  if (input.clubStatus === "free" && candidate.currentClubId !== null) return false;
  if (input.clubStatus === "contracted" && candidate.currentClubId === null) return false;
  return true;
}

function discoveryScore(
  state: GameState,
  candidate: DiscoveryCandidate,
  input: ScoutingBriefInput,
): number {
  const scoutQuality = scoutingQuality(state);
  const managerRating =
    state.hiredStaff.find((staff) => staff.role === "Manager")?.rating ??
    state.football?.department.recruitmentRating ??
    50;
  const decisionQuality = Math.round(scoutQuality * 0.75 + managerRating * 0.25);

  // Staff-led recruitment should surface players who make sense for this club,
  // not simply the strongest names in the world. The manager influences fit;
  // scouting quality influences how reliably the department finds those fits.
  const targetAbility = 32 + state.reputation * 0.62;
  const abilityFit =
    input.minCurrentAbility === undefined
      ? -Math.abs(candidate.currentAbility - targetAbility) +
        Math.max(0, candidate.currentAbility - targetAbility) * 0.45
      : candidate.currentAbility - input.minCurrentAbility;

  const affordableReference = Math.max(25_000, state.cash * 0.8);
  const affordability =
    candidate.currentClubId === null
      ? 6
      : candidate.marketValue <= affordableReference
        ? 5
        : -Math.min(
            28,
            Math.log2(Math.max(1, candidate.marketValue / affordableReference)) * 9,
          );
  const ageFit = candidate.age <= 24 ? 3 : candidate.age >= 32 ? -3 : 0;
  const noise =
    (unsignedHash(`${state.saveSeed}|brief:${input.id}|${candidate.id}`) % 101) - 50;

  return (
    abilityFit * (0.6 + decisionQuality / 120) +
    affordability +
    ageFit +
    noise * (1.05 - decisionQuality / 125)
  );
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
 * Select and persist candidates when the scouting team returns. Selection is
 * deterministic and never creates stronger players.
 */
function completeScoutingBriefInPlace(state: GameState, brief: ScoutingBrief): void {
  if (!state.football || brief.status === "complete") return;

  const input: ScoutingBriefInput = {
    id: brief.id,
    position: brief.position,
    tacticalPosition: brief.tacticalPosition,
    minAge: brief.minAge,
    maxAge: brief.maxAge,
    maxMarketValue: brief.maxMarketValue,
    maxWeeklyWage: brief.maxWeeklyWage,
    nationality: brief.nationality,
    clubStatus: brief.clubStatus,
    minCurrentAbility: brief.minCurrentAbility,
  };
  const candidateLimit = brief.candidateLimit ?? scoutingSearchPlan(state).candidateLimit;
  const detailed = ranked(
    state,
    state.football.players.map((player) => detailedCandidate(state, player)),
    input,
  );
  const fringe = ranked(state, fringeCandidates(state), input);

  const freeDetailed = detailed.filter(
    (candidate) => candidate.source === "detailed" && candidate.currentClubId === null,
  );
  const contractedDetailed = detailed.filter(
    (candidate) => candidate.source === "detailed" && candidate.currentClubId !== null,
  );
  const freeQuota = Math.min(freeDetailed.length, Math.max(4, Math.floor(candidateLimit * 0.3)));
  const fringeQuota = fringe.length
    ? Math.min(fringe.length, Math.max(3, Math.floor(candidateLimit * 0.25)))
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
      const difference = discoveryScore(state, b, input) - discoveryScore(state, a, input);
      return difference || a.id.localeCompare(b.id);
    });
  selected.push(...remainder.slice(0, Math.max(0, candidateLimit - selected.length)));

  state.football.scoutingDiscovery ??= { briefs: [] };
  state.football.scoutingDiscovery.profiles ??= {};
  const candidateIds: string[] = [];
  const candidateSources: Record<string, ScoutingCandidateSource> = {};
  const candidateProfiles: Record<string, ScoutingCandidateProfile> = {};
  for (const candidate of selected) {
    if (candidate.source === "detailed") {
      preserveKnownPlayerInPlace(state, candidate.player, ["scouted"]);
    } else {
      preserveKnownIdentityInPlace(state, candidate.identity, ["scouted"]);
    }
    const profile = profileOf(candidate);
    candidateIds.push(candidate.id);
    candidateSources[candidate.id] = candidate.source;
    candidateProfiles[candidate.id] = profile;
    state.football.scoutingDiscovery.profiles[candidate.id] ??= profile;
  }

  brief.candidateIds = candidateIds;
  brief.candidateSources = candidateSources;
  brief.candidateProfiles = candidateProfiles;
  brief.status = "complete";

  const eventKey = `scouting-search:${brief.id}:complete`;
  if (!state.inbox.some((item) => item.eventKey === eventKey)) {
    state.inbox.push({
      id: `inbox-${hashString(eventKey).toString(36)}`,
      generatorId: "scouting-search",
      eventKey,
      sender: state.football.department.headOfRecruitment || "Head Scout",
      department: "Head Scout",
      category: "transfers",
      subject: `Scouting search complete: ${candidateIds.length} players found`,
      body: `The scouting team has returned with ${candidateIds.length} candidates and an initial assessment on each. You can now ask for deeper scouting on individual players.`,
      priority: "normal",
      week: state.week,
      season: state.season,
      status: "unread",
    });
  }
}

/**
 * Dispatch a scouting brief. Results arrive after a quality-dependent number
 * of in-world days rather than appearing instantly.
 */
export function createScoutingBrief(state: GameState, input: ScoutingBriefInput): GameState {
  const next = structuredClone(state);
  if (!next.football) return next;
  next.football.scoutingDiscovery ??= { briefs: [] };
  if (next.football.scoutingDiscovery.briefs.some((brief) => brief.id === input.id)) return next;

  const plan = scoutingSearchPlan(next);
  const nowDay = absoluteDay(next);
  next.football.scoutingDiscovery.briefs.push({
    ...input,
    createdAtAbsoluteWeek: absoluteWeek(next.season, next.week),
    createdAtDay: nowDay,
    dueAtDay: nowDay + plan.searchDays,
    scoutQuality: plan.quality,
    initialKnowledgeDays: plan.initialKnowledgeDays,
    candidateLimit: plan.candidateLimit,
    status: "active",
    candidateIds: [],
    candidateSources: {},
    candidateProfiles: {},
  });
  return next;
}

/** Progress active search briefs to the visible day boundary. */
export function progressScoutingDiscoveryDayInPlace(state: GameState, targetDay: number): void {
  const briefs = state.football?.scoutingDiscovery?.briefs;
  if (!briefs) return;
  for (const brief of briefs) {
    if (brief.status !== "active") continue;
    const dueAtDay = brief.dueAtDay ?? (brief.createdAtAbsoluteWeek * 7 + 4);
    if (targetDay >= dueAtDay) completeScoutingBriefInPlace(state, brief);
  }
}

export function scoutingBriefDaysRemaining(state: GameState, briefId: string): number {
  const brief = scoutingBrief(state, briefId);
  if (!brief || brief.status === "complete") return 0;
  const dueAtDay = brief.dueAtDay ?? (brief.createdAtAbsoluteWeek * 7 + 4);
  return Math.max(0, dueAtDay - absoluteDay(state));
}

export function scoutingInitialKnowledge(
  state: GameState,
  playerId: string,
): { days: number; quality: number } {
  const briefs = (state.football?.scoutingDiscovery?.briefs ?? [])
    .filter((brief) => brief.status === "complete" && brief.candidateIds.includes(playerId))
    .sort(
      (a, b) =>
        (b.createdAtDay ?? b.createdAtAbsoluteWeek * 7) -
        (a.createdAtDay ?? a.createdAtAbsoluteWeek * 7),
    );
  const brief = briefs[0];
  if (!brief) return { days: 0, quality: 50 };
  return {
    days: Math.max(0, Math.min(4, brief.initialKnowledgeDays ?? 2)),
    quality: Math.max(1, Math.min(100, brief.scoutQuality ?? 50)),
  };
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
  if (!brief || brief.status !== "complete") return [];
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
    if (brief.status !== "complete") continue;
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
