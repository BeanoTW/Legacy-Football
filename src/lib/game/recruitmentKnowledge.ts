import type { GameState } from "./types";
import {
  knownPlayerIdentity,
  playerLifecycleState,
  preserveKnownPlayerInPlace,
  setKnownPlayerReasonInPlace,
} from "./playerLifecycle";
import { scoutingReportById } from "./scouting";

/**
 * Chairman shortlist across both detailed and compact known-player fidelity.
 * The legacy recruitment shortlist remains the detailed-player compatibility
 * path; lifecycle reasons preserve compact targets even when fidelity
 * reconciliation prunes detailed-only ids.
 */
export function chairmanShortlistIds(state: GameState): string[] {
  const ids = new Set(state.football?.shortlist ?? []);
  for (const known of playerLifecycleState(state).knownPlayers) {
    if (known.reasons.includes("shortlisted")) ids.add(known.playerId);
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

export function isChairmanShortlisted(state: GameState, playerId: string): boolean {
  return chairmanShortlistIds(state).includes(playerId);
}

/**
 * Toggle a chairman-known target without requiring it to become detailed.
 * Detailed players also keep the legacy shortlist in sync for existing UI and
 * transfer flows; compact players persist through their lifecycle reason.
 */
export function toggleChairmanShortlist(state: GameState, playerId: string): GameState {
  const next = structuredClone(state);
  if (!next.football) return next;

  const detailed = next.football.players.find((player) => player.id === playerId);
  if (detailed) preserveKnownPlayerInPlace(next, detailed, []);
  const known = knownPlayerIdentity(next, playerId);
  if (!known) return next;

  const enabled = !isChairmanShortlisted(next, playerId);
  setKnownPlayerReasonInPlace(next, playerId, "shortlisted", enabled);

  next.football.shortlist ??= [];
  const legacyIndex = next.football.shortlist.indexOf(playerId);
  if (detailed && enabled && legacyIndex < 0) next.football.shortlist.push(playerId);
  if (legacyIndex >= 0 && !enabled) next.football.shortlist.splice(legacyIndex, 1);

  return next;
}


export interface ChairmanRecruitmentEstimate {
  valueRange?: [number, number];
  wageRange?: [number, number];
  openingFee: number;
  openingWeeklyWage: number;
  estimatedMaxFee: number;
  estimatedMaxWeeklyWage: number;
}

const OPENING_ESTIMATE_MIDPOINT_SHARE = 0.82;

function openingFromRange(range: [number, number] | undefined): number {
  if (!range) return 0;
  const [low, high] = range;
  const midpoint = (low + high) / 2;
  return Math.max(0, Math.round(Math.max(low, midpoint * OPENING_ESTIMATE_MIDPOINT_SHARE)));
}

/**
 * Chairman-safe terms for the first approach.
 *
 * The hidden seller/player thresholds remain simulation facts. The chairman
 * starts from what scouting currently knows: weak knowledge produces a cautious
 * but not absurdly low estimate; tighter reports naturally lift the credible
 * floor. This makes scouting useful without making it mandatory.
 */
export function chairmanRecruitmentEstimate(
  state: GameState,
  playerId: string,
): ChairmanRecruitmentEstimate | null {
  const known = knownPlayerIdentity(state, playerId);
  const report = scoutingReportById(state, playerId);
  if (!known || !report) return null;

  const valueRange = report.valueRange;
  const wageRange = report.wageRange;
  const freeAgent = known.currentClubId === null;

  return {
    valueRange,
    wageRange,
    openingFee: freeAgent ? 0 : openingFromRange(valueRange),
    openingWeeklyWage: openingFromRange(wageRange),
    estimatedMaxFee: freeAgent ? 0 : Math.max(0, valueRange?.[1] ?? 0),
    estimatedMaxWeeklyWage: Math.max(0, wageRange?.[1] ?? 0),
  };
}
