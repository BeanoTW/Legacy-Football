import type { FixtureResult, GameState, Staff } from "./types";
import { absoluteWeek } from "./time";
import { FOOTBALL_STRENGTH_MAX, FOOTBALL_STRENGTH_MIN } from "./footballStrength";
import { managerMatchPrep } from "./managerMatchPrep";

export const PLAYER_COHESION_DEFAULT = 50;
export const PLAYER_MORALE_DEFAULT = 50;
export const PLAYER_MANAGER_QUALITY_DEFAULT = 50;
export const PLAYER_PERFORMANCE_MAX_ADJUSTMENT = 5;

export interface PlayerClubPerformanceState {
  schemaVersion: 1;
  cohesion: number;
  morale: number;
  /** Stable sorted ids from the last processed weekly squad. */
  lastSquadSignature: string[];
  /** Guards weekly continuity/churn processing. */
  lastProcessedAbsoluteWeek: number;
  /** Guards replaying a match result into morale twice. */
  lastOutcomeAbsoluteWeek?: number;
}

declare module "./types" {
  interface GameState {
    playerClubPerformance?: PlayerClubPerformanceState;
  }
}

const clamp100 = (value: number) => Math.max(0, Math.min(100, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

function squadSignature(state: GameState): string[] {
  return [...new Set((state.squad ?? []).map((player) => player.id))].sort((a, b) => a.localeCompare(b));
}

function symmetricDifferenceSize(a: readonly string[], b: readonly string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  let changed = 0;
  for (const id of left) if (!right.has(id)) changed += 1;
  for (const id of right) if (!left.has(id)) changed += 1;
  return changed;
}

export function ensurePlayerClubPerformanceInPlace(state: GameState): PlayerClubPerformanceState {
  if (state.playerClubPerformance) return state.playerClubPerformance;
  const currentAbs = absoluteWeek(state.season, state.week);
  state.playerClubPerformance = {
    schemaVersion: 1,
    cohesion: PLAYER_COHESION_DEFAULT,
    morale: PLAYER_MORALE_DEFAULT,
    lastSquadSignature: squadSignature(state),
    // Treat the opening state as the continuity baseline. The first real weekly
    // tick may then apply exactly one period of continuity/churn.
    lastProcessedAbsoluteWeek: currentAbs - 1,
  };
  return state.playerClubPerformance;
}

/**
 * Manager quality is deliberately derived, not copied into another persisted
 * field. The staff system remains canonical; no hired Manager means a neutral
 * caretaker baseline rather than an invisible penalty.
 */
export function playerManagerQuality(state: GameState): number {
  const manager: Staff | undefined = (state.hiredStaff ?? []).find((staff) => staff.role === "Manager");
  if (!manager) return PLAYER_MANAGER_QUALITY_DEFAULT;
  return round2(
    clamp100(manager.rating * 0.5 + manager.stats.tactics * 0.3 + manager.stats.motivation * 0.2),
  );
}

/**
 * Weekly cohesion is mostly continuity. Normal stability builds slowly; squad
 * churn hurts immediately but is capped so one transfer window cannot destroy
 * a team. Morale also drifts gently back toward neutral between results.
 */
export function advancePlayerClubPerformanceWeekInPlace(state: GameState): PlayerClubPerformanceState {
  const performance = ensurePlayerClubPerformanceInPlace(state);
  const currentAbs = absoluteWeek(state.season, state.week);
  if (performance.lastProcessedAbsoluteWeek >= currentAbs) return performance;

  const signature = squadSignature(state);
  const changedPlayers = symmetricDifferenceSize(performance.lastSquadSignature, signature);
  const cohesionDelta = changedPlayers === 0 ? 0.25 : Math.max(-4, 0.25 - changedPlayers * 0.75);
  performance.cohesion = round2(clamp100(performance.cohesion + cohesionDelta));

  if (performance.morale > PLAYER_MORALE_DEFAULT) {
    performance.morale = round2(Math.max(PLAYER_MORALE_DEFAULT, performance.morale - 0.5));
  } else if (performance.morale < PLAYER_MORALE_DEFAULT) {
    performance.morale = round2(Math.min(PLAYER_MORALE_DEFAULT, performance.morale + 0.5));
  }

  performance.lastSquadSignature = signature;
  performance.lastProcessedAbsoluteWeek = currentAbs;
  return performance;
}

/** Apply one completed user result to the following match's morale state. */
export function applyPlayerClubMatchOutcomeInPlace(
  state: GameState,
  result: Pick<FixtureResult, "result">,
): PlayerClubPerformanceState {
  const performance = ensurePlayerClubPerformanceInPlace(state);
  const currentAbs = absoluteWeek(state.season, state.week);
  if (performance.lastOutcomeAbsoluteWeek === currentAbs) return performance;

  const delta = result.result === "W" ? 4 : result.result === "D" ? 0.5 : -4;
  performance.morale = round2(clamp100(performance.morale + delta));
  performance.lastOutcomeAbsoluteWeek = currentAbs;
  return performance;
}

/**
 * Small bounded realisation effect. Squad quality stays primary: cohesion,
 * morale, manager quality and tactical suitability can alter the way that
 * quality is realised, but the total management layer remains capped at five
 * points on the canonical football-strength scale.
 */
export function playerClubPerformanceAdjustment(state: GameState): number {
  const performance = state.playerClubPerformance ?? {
    cohesion: PLAYER_COHESION_DEFAULT,
    morale: PLAYER_MORALE_DEFAULT,
  };
  const manager = playerManagerQuality(state);
  const matchPrep = managerMatchPrep(state);
  const raw =
    (performance.cohesion - 50) * 0.025 +
    (performance.morale - 50) * 0.035 +
    (manager - 50) * 0.04 +
    matchPrep.strengthAdjustment;
  return round2(
    Math.max(-PLAYER_PERFORMANCE_MAX_ADJUSTMENT, Math.min(PLAYER_PERFORMANCE_MAX_ADJUSTMENT, raw)),
  );
}

export function realisedPlayerClubStrength(state: GameState, baseStrength: number): number {
  const realised = baseStrength + playerClubPerformanceAdjustment(state);
  return round2(Math.max(FOOTBALL_STRENGTH_MIN, Math.min(FOOTBALL_STRENGTH_MAX, realised)));
}
